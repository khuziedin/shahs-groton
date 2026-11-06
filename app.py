#!/usr/bin/env python3
"""
Shah's Halal — Groton Time Clock
Self-contained time-clock kiosk for an Android tablet (Termux).
Python + Flask + SQLite. Everything is stored locally in data/timeclock.db.

Runs a local web server; open http://localhost:8080 in the tablet browser (kiosk).
No internet needed to clock in/out. Internet is used only to send the weekly email.
"""

import os, sys, subprocess, sqlite3, json, time, threading, csv, io, smtplib, ssl, shutil, secrets, hashlib
import urllib.request, urllib.error
from datetime import datetime, timedelta, date
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

try:
    from zoneinfo import ZoneInfo
except Exception:  # pragma: no cover
    ZoneInfo = None

from flask import (Flask, request, jsonify, send_from_directory,
                   render_template, g, abort)

# ----------------------------------------------------------------------------
BASE   = os.path.dirname(os.path.abspath(__file__))
DATA   = os.path.join(BASE, "data")
DB     = os.path.join(DATA, "timeclock.db")
BACKUP = os.path.join(DATA, "backups")
PHOTOS = os.path.join(DATA, "photos")
for d in (DATA, BACKUP, PHOTOS):
    os.makedirs(d, exist_ok=True)

TZNAME = "America/New_York"
def TZ():
    return ZoneInfo(TZNAME) if ZoneInfo else None

PORT = int(os.environ.get("PORT", "8080"))

def lan_ip():
    """Best-guess Wi-Fi/LAN address of this tablet, for access from other devices."""
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80)); ip = s.getsockname()[0]
    except Exception:
        ip = "127.0.0.1"
    finally:
        s.close()
    return ip

app = Flask(__name__, template_folder="templates", static_folder="static")

# ---- defaults --------------------------------------------------------------
DEFAULT_SETTINGS = {
    "store_name": "Shah's Halal — Groton",
    "admin_pin": "1234",
    "report_email": "",
    "report_day": "0",          # 0=Monday
    "report_hour": "7",
    "report_min": "50",
    "ot_threshold": "40",
    "auto_clockout_hours": "14", # a punch open longer than this gets auto-closed overnight
    "auto_clockout_run_hour": "3",
    "wages_placeholder": "1",
    "smtp_host": "smtp.gmail.com",
    "smtp_port": "587",
    "smtp_user": "",            # your gmail address (also the sender for the web-API method)
    "smtp_pass": "",            # gmail APP PASSWORD (not your login password)
    "email_method": "smtp",     # "smtp" (Gmail direct) or "brevo" (web API, for networks that block SMTP)
    "brevo_api_key": "",        # Brevo API key when email_method is "brevo"
    "photo_on_punch": "1",      # silently photograph each punch (in and out)
    "photo_keep_days": "60",    # prune punch photos older than this
    # owner weekly summary (whole team) — uses report_day/hour/min above
    "last_report_week": "",
    # owner daily digest — the next morning, covering the day before
    "daily_report": "1", "daily_report_hour": "7", "daily_report_min": "40",
    "last_daily_report": "",
    # per-employee weekly report on payroll day (Wednesday, for the week that ended Sunday)
    "employee_reports": "1", "payroll_day": "2", "payroll_hour": "8", "payroll_min": "5",
    "last_payroll_week": "",
}

# Generic samples, only used to seed a brand-new install so it isn't empty.
# Replace them in Manager -> Team. (An existing database is never re-seeded.)
SEED_EMPLOYEES = [
    ("Sample Employee A", "1001", 15.00, None, 40, 1),
    ("Sample Employee B", "1002", 15.00, None, 40, 2),
    ("Sample Employee C", "1003", 15.00, None, 40, 3),
]

# ---- db helpers ------------------------------------------------------------
def db():
    if "db" not in g:
        g.db = sqlite3.connect(DB)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys=ON")
    return g.db

@app.teardown_appcontext
def _close(e=None):
    d = g.pop("db", None)
    if d:
        d.close()

def init_db():
    con = sqlite3.connect(DB)
    con.executescript("""
    CREATE TABLE IF NOT EXISTS employees(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        pin TEXT NOT NULL,
        email TEXT DEFAULT '',
        rate REAL NOT NULL DEFAULT 0,
        ot_rate REAL,                 -- NULL = same as base rate (no premium)
        ot_threshold REAL NOT NULL DEFAULT 40,
        active INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS punches(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        emp_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        clock_in INTEGER NOT NULL,     -- epoch seconds
        clock_out INTEGER,             -- epoch seconds, NULL = still on the clock
        source TEXT NOT NULL DEFAULT 'kiosk',
        note TEXT DEFAULT '',
        edited INTEGER NOT NULL DEFAULT 0,
        auto_closed INTEGER NOT NULL DEFAULT 0,
        photo TEXT,                    -- photo taken at clock-in
        photo_out TEXT,                -- photo taken at clock-out
        created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_punch_emp ON punches(emp_id);
    CREATE INDEX IF NOT EXISTS idx_punch_in  ON punches(clock_in);
    CREATE TABLE IF NOT EXISTS settings(
        key TEXT PRIMARY KEY,
        value TEXT
    );
    CREATE TABLE IF NOT EXISTS audit(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        detail TEXT DEFAULT ''
    );
    """)
    # migrations for databases created by an earlier version
    def ensure_col(table, col, decl):
        cols = [r[1] for r in con.execute(f"PRAGMA table_info({table})").fetchall()]
        if col not in cols:
            con.execute(f"ALTER TABLE {table} ADD COLUMN {col} {decl}")
    ensure_col("employees", "email", "TEXT DEFAULT ''")
    ensure_col("punches", "photo_out", "TEXT")
    # seed settings
    for k, v in DEFAULT_SETTINGS.items():
        con.execute("INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)", (k, v))
    # seed employees once
    n = con.execute("SELECT COUNT(*) FROM employees").fetchone()[0]
    if n == 0:
        now = int(time.time())
        for name, pin, rate, otr, thr, order in SEED_EMPLOYEES:
            con.execute("""INSERT INTO employees(name,pin,rate,ot_rate,ot_threshold,active,sort_order,created_at)
                           VALUES(?,?,?,?,?,1,?,?)""", (name, pin, rate, otr, thr, order, now))
        con.execute("INSERT INTO audit(ts,actor,action,detail) VALUES(?,?,?,?)",
                    (now, "system", "seed", f"Seeded {len(SEED_EMPLOYEES)} employees"))
    con.commit()
    con.close()

def get_setting(con, key, default=""):
    r = con.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
    return r[0] if r and r[0] is not None else default

def set_setting(con, key, value):
    con.execute("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=?",
                (key, str(value), str(value)))

def audit(con, actor, action, detail=""):
    con.execute("INSERT INTO audit(ts,actor,action,detail) VALUES(?,?,?,?)",
                (int(time.time()), actor, action, detail))

# ---- time / pay math -------------------------------------------------------
def local_dt(epoch):
    return datetime.fromtimestamp(epoch, TZ())

def week_monday(d):
    """Monday 00:00 (local) of the week containing date/datetime d."""
    if isinstance(d, datetime):
        d = d.date()
    monday = d - timedelta(days=d.weekday())
    return datetime(monday.year, monday.month, monday.day, 0, 0, 0, tzinfo=TZ())

def week_key(epoch):
    m = week_monday(local_dt(epoch))
    return m.strftime("%Y-%m-%d")

def week_bounds(week_key_str):
    y, mo, da = [int(x) for x in week_key_str.split("-")]
    start = datetime(y, mo, da, 0, 0, 0, tzinfo=TZ())
    end = start + timedelta(days=7)
    return int(start.timestamp()), int(end.timestamp())

def this_week_key():
    return week_monday(datetime.now(TZ())).strftime("%Y-%m-%d")

def shift_add_days(week_key_str, days):
    y, mo, da = [int(x) for x in week_key_str.split("-")]
    d = date(y, mo, da) + timedelta(days=days)
    return d.strftime("%Y-%m-%d")

def hours_of(p):
    if p["clock_out"] is None:
        return 0.0
    return max(0.0, (p["clock_out"] - p["clock_in"]) / 3600.0)

def compute_week(con, week_key_str):
    """Return list of per-employee totals for a week + grand totals."""
    start, end = week_bounds(week_key_str)
    emps = con.execute("SELECT * FROM employees ORDER BY sort_order, name").fetchall()
    # punches that START within the week
    punches = con.execute(
        "SELECT * FROM punches WHERE clock_in>=? AND clock_in<? ORDER BY clock_in", (start, end)).fetchall()
    by_emp = {}
    for p in punches:
        by_emp.setdefault(p["emp_id"], []).append(p)
    rows = []
    tot = {"reg": 0.0, "ot": 0.0, "hrs": 0.0, "pay": 0.0}
    for e in emps:
        plist = by_emp.get(e["id"], [])
        if not plist and not e["active"]:
            continue
        hrs = sum(hours_of(p) for p in plist)
        open_now = any(p["clock_out"] is None for p in plist)
        thr = e["ot_threshold"] or 40
        reg = min(hrs, thr)
        ot = max(0.0, hrs - thr)
        rate = e["rate"] or 0.0
        ot_rate = e["ot_rate"] if e["ot_rate"] is not None else rate
        pay = reg * rate + ot * ot_rate
        if hrs == 0 and not open_now and not e["active"]:
            continue
        rows.append({
            "id": e["id"], "name": e["name"], "rate": rate, "ot_rate": ot_rate,
            "reg": round(reg, 2), "ot": round(ot, 2), "hrs": round(hrs, 2),
            "pay": round(pay, 2), "open_now": open_now, "shifts": len(plist),
        })
        tot["reg"] += reg; tot["ot"] += ot; tot["hrs"] += hrs; tot["pay"] += pay
    for k in tot:
        tot[k] = round(tot[k], 2)
    return rows, tot

# ---- auth (admin) ----------------------------------------------------------
TOKENS = {}  # token -> expiry epoch
def new_token():
    t = secrets.token_urlsafe(24)
    TOKENS[t] = time.time() + 60 * 60 * 12  # 12h
    return t

def require_admin():
    auth = request.headers.get("Authorization", "")
    tok = auth[7:] if auth.startswith("Bearer ") else ""
    exp = TOKENS.get(tok)
    if not exp or exp < time.time():
        abort(401)
    TOKENS[tok] = time.time() + 60 * 60 * 12  # sliding

# ----------------------------------------------------------------------------
# PAGES
# ----------------------------------------------------------------------------
@app.route("/")
def kiosk_page():
    return render_template("kiosk.html")

@app.route("/admin")
def admin_page():
    return render_template("admin.html")

@app.route("/data/photos/<path:fn>")
def photo(fn):
    return send_from_directory(PHOTOS, fn)

@app.route("/static/manifest.webmanifest")
def manifest():
    return send_from_directory(os.path.join(BASE, "static"), "manifest.webmanifest",
                               mimetype="application/manifest+json")

# ----------------------------------------------------------------------------
# KIOSK API (no admin auth; never exposes PINs)
# ----------------------------------------------------------------------------
@app.route("/api/state")
def api_state():
    con = db()
    emps = con.execute("SELECT id,name FROM employees WHERE active=1 ORDER BY sort_order,name").fetchall()
    open_p = con.execute("""SELECT p.emp_id, p.clock_in, e.name FROM punches p
                            JOIN employees e ON e.id=p.emp_id
                            WHERE p.clock_out IS NULL ORDER BY p.clock_in""").fetchall()
    roster = [{"emp_id": r["emp_id"], "name": r["name"], "since": r["clock_in"]} for r in open_p]
    return jsonify({
        "store": get_setting(con, "store_name"),
        "now": int(time.time()),
        "employees": [{"id": e["id"], "name": e["name"]} for e in emps],
        "roster": roster,
        "photo_on_punch": get_setting(con, "photo_on_punch") == "1",
    })

@app.route("/api/punch", methods=["POST"])
def api_punch():
    data = request.get_json(force=True, silent=True) or {}
    pin = str(data.get("pin", "")).strip()
    con = db()
    emp = con.execute("SELECT * FROM employees WHERE pin=? AND active=1", (pin,)).fetchone()
    if not emp:
        return jsonify({"ok": False, "error": "PIN not recognized"}), 404
    now = int(time.time())
    open_p = con.execute("SELECT * FROM punches WHERE emp_id=? AND clock_out IS NULL ORDER BY clock_in DESC",
                         (emp["id"],)).fetchone()
    photo_name = None
    photo_b64 = data.get("photo")
    if photo_b64 and get_setting(con, "photo_on_punch") == "1":
        photo_name = save_photo(emp["id"], photo_b64)
    if open_p:  # clock OUT
        con.execute("UPDATE punches SET clock_out=?, photo_out=? WHERE id=?", (now, photo_name, open_p["id"]))
        audit(con, emp["name"], "clock_out", f"punch {open_p['id']}")
        con.commit()
        action = "out"
    else:       # clock IN
        con.execute("""INSERT INTO punches(emp_id,clock_in,clock_out,source,note,photo,created_at)
                       VALUES(?,?,?,?,?,?,?)""", (emp["id"], now, None, "kiosk", "", photo_name, now))
        audit(con, emp["name"], "clock_in", "")
        con.commit()
        action = "in"
    return jsonify({"ok": True, "action": action, "name": emp["name"], "time": now})

def save_photo(emp_id, b64):
    try:
        import base64
        head, _, body = b64.partition(",")
        raw = base64.b64decode(body or head)
        fn = f"{emp_id}_{int(time.time())}.jpg"
        with open(os.path.join(PHOTOS, fn), "wb") as f:
            f.write(raw)
        return fn
    except Exception:
        return None

# ----------------------------------------------------------------------------
# ADMIN API
# ----------------------------------------------------------------------------
@app.route("/api/admin/login", methods=["POST"])
def admin_login():
    data = request.get_json(force=True, silent=True) or {}
    con = db()
    if str(data.get("pin", "")) == get_setting(con, "admin_pin", "1234"):
        audit(con, "admin", "login", ""); con.commit()
        return jsonify({"ok": True, "token": new_token(),
                        "store": get_setting(con, "store_name")})
    return jsonify({"ok": False, "error": "Incorrect manager PIN"}), 401

@app.route("/api/admin/dashboard")
def admin_dashboard():
    require_admin()
    con = db()
    wk = this_week_key()
    rows, tot = compute_week(con, wk)
    # who's on now + today hours + today labor $
    open_p = con.execute("""SELECT p.*, e.name, e.rate FROM punches p JOIN employees e ON e.id=p.emp_id
                            WHERE p.clock_out IS NULL ORDER BY p.clock_in""").fetchall()
    now = int(time.time())
    today_start = int(datetime.now(TZ()).replace(hour=0, minute=0, second=0, microsecond=0).timestamp())
    today_punches = con.execute("SELECT * FROM punches WHERE clock_in>=?", (today_start,)).fetchall()
    today_hours = sum(((p["clock_out"] or now) - p["clock_in"]) / 3600.0 for p in today_punches)
    on_now = [{"name": r["name"], "since": r["clock_in"],
               "elapsed_h": round((now - r["clock_in"]) / 3600.0, 2)} for r in open_p]
    # OT warnings: anyone within 5h of their threshold or over
    warn = [r for r in rows if r["ot"] > 0 or (r["hrs"] >= 0.85 * (
             (con.execute("SELECT ot_threshold FROM employees WHERE id=?", (r["id"],)).fetchone()[0]) or 40))]
    return jsonify({
        "week": wk, "rows": rows, "totals": tot,
        "on_now": on_now,
        "today_hours": round(today_hours, 2),
        "ot_warnings": [{"name": r["name"], "hrs": r["hrs"], "ot": r["ot"]} for r in warn],
        "wages_placeholder": get_setting(con, "wages_placeholder") == "1",
    })

@app.route("/api/admin/report")
def admin_report():
    require_admin()
    con = db()
    wk = request.args.get("week") or this_week_key()
    rows, tot = compute_week(con, wk)
    s, e = week_bounds(wk)
    return jsonify({"week": wk, "rows": rows, "totals": tot,
                    "range": [s, e], "this_week": wk == this_week_key(),
                    "wages_placeholder": get_setting(con, "wages_placeholder") == "1"})

@app.route("/api/admin/report.csv")
def admin_report_csv():
    require_admin()
    con = db()
    wk = request.args.get("week") or this_week_key()
    rows, tot = compute_week(con, wk)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow([get_setting(con, "store_name"), "Week of", wk])
    w.writerow(["Employee", "Reg hrs", "OT hrs", "Total hrs", "Rate", "OT rate", "Gross pay"])
    for r in rows:
        w.writerow([r["name"], r["reg"], r["ot"], r["hrs"],
                    f'{r["rate"]:.2f}', f'{r["ot_rate"]:.2f}', f'{r["pay"]:.2f}'])
    w.writerow(["TOTAL", tot["reg"], tot["ot"], tot["hrs"], "", "", f'{tot["pay"]:.2f}'])
    out = buf.getvalue()
    return app.response_class(out, mimetype="text/csv",
        headers={"Content-Disposition": f'attachment; filename="hours_{wk}.csv"'})

@app.route("/api/admin/timesheet")
def admin_timesheet():
    require_admin()
    con = db()
    wk = request.args.get("week") or this_week_key()
    start, end = week_bounds(wk)
    emps = con.execute("SELECT * FROM employees ORDER BY sort_order,name").fetchall()
    out = []
    for e in emps:
        ps = con.execute("SELECT * FROM punches WHERE emp_id=? AND clock_in>=? AND clock_in<? ORDER BY clock_in",
                         (e["id"], start, end)).fetchall()
        if not ps and not e["active"]:
            continue
        shifts = [{"id": p["id"], "clock_in": p["clock_in"], "clock_out": p["clock_out"],
                   "edited": p["edited"], "auto_closed": p["auto_closed"], "note": p["note"],
                   "hours": round(hours_of(p), 2)} for p in ps]
        out.append({"emp_id": e["id"], "name": e["name"],
                    "hours": round(sum(hours_of(p) for p in ps), 2), "shifts": shifts})
    return jsonify({"week": wk, "employees": out, "this_week": wk == this_week_key()})

@app.route("/api/admin/punch", methods=["POST"])
def admin_edit_punch():
    require_admin()
    con = db()
    d = request.get_json(force=True, silent=True) or {}
    pid = d.get("id")
    ci, co = d.get("clock_in"), d.get("clock_out")
    if co is not None and ci is not None and co < ci:
        return jsonify({"ok": False, "error": "Clock-out is before clock-in"}), 400
    if pid:  # edit
        con.execute("UPDATE punches SET clock_in=?,clock_out=?,edited=1,note=? WHERE id=?",
                    (ci, co, d.get("note", ""), pid))
        audit(con, "admin", "edit_punch", f"punch {pid}")
    else:    # add
        emp = con.execute("SELECT * FROM employees WHERE id=?", (d.get("emp_id"),)).fetchone()
        if not emp:
            return jsonify({"ok": False, "error": "Unknown employee"}), 400
        con.execute("""INSERT INTO punches(emp_id,clock_in,clock_out,source,note,edited,created_at)
                       VALUES(?,?,?,?,?,1,?)""",
                    (emp["id"], ci, co, "admin", d.get("note", ""), int(time.time())))
        audit(con, "admin", "add_punch", f'{emp["name"]}')
    con.commit()
    return jsonify({"ok": True})

@app.route("/api/admin/punch/<int:pid>", methods=["DELETE"])
def admin_delete_punch(pid):
    require_admin()
    con = db()
    con.execute("DELETE FROM punches WHERE id=?", (pid,))
    audit(con, "admin", "delete_punch", f"punch {pid}")
    con.commit()
    return jsonify({"ok": True})

@app.route("/api/admin/employees", methods=["GET", "POST"])
def admin_employees():
    require_admin()
    con = db()
    if request.method == "GET":
        emps = con.execute("SELECT * FROM employees ORDER BY sort_order,name").fetchall()
        return jsonify([dict(e) for e in emps])
    d = request.get_json(force=True, silent=True) or {}
    pin = str(d.get("pin", "")).strip()
    eid = d.get("id")
    # unique active pin
    if pin:
        clash = con.execute("SELECT name FROM employees WHERE pin=? AND active=1 AND id IS NOT ?",
                            (pin, eid or -1)).fetchone()
        if clash:
            return jsonify({"ok": False, "error": f'PIN already used by {clash["name"]}'}), 400
    ot_rate = d.get("ot_rate")
    ot_rate = None if ot_rate in (None, "", "null") else float(ot_rate)
    email = (d.get("email") or "").strip()
    if eid:
        con.execute("""UPDATE employees SET name=?,pin=?,email=?,rate=?,ot_rate=?,ot_threshold=?,active=? WHERE id=?""",
                    (d.get("name"), pin, email, float(d.get("rate") or 0), ot_rate,
                     float(d.get("ot_threshold") or 40), 1 if d.get("active", True) else 0, eid))
        audit(con, "admin", "edit_employee", d.get("name", ""))
    else:
        mx = con.execute("SELECT COALESCE(MAX(sort_order),0) FROM employees").fetchone()[0]
        con.execute("""INSERT INTO employees(name,pin,email,rate,ot_rate,ot_threshold,active,sort_order,created_at)
                       VALUES(?,?,?,?,?,?,1,?,?)""",
                    (d.get("name", "New employee"), pin, email, float(d.get("rate") or 0), ot_rate,
                     float(d.get("ot_threshold") or 40), mx + 1, int(time.time())))
        audit(con, "admin", "add_employee", d.get("name", ""))
    con.commit()
    return jsonify({"ok": True})

@app.route("/api/admin/photos")
def admin_photos():
    require_admin()
    con = db()
    rows = con.execute("""SELECT p.clock_in, p.clock_out, p.photo, p.photo_out, e.name
                          FROM punches p JOIN employees e ON e.id=p.emp_id
                          WHERE p.photo IS NOT NULL OR p.photo_out IS NOT NULL
                          ORDER BY p.clock_in DESC LIMIT 80""").fetchall()
    out = []
    for p in rows:
        if p["photo"]:
            out.append({"name": p["name"], "ts": p["clock_in"], "dir": "in", "file": p["photo"]})
        if p["photo_out"]:
            out.append({"name": p["name"], "ts": p["clock_out"] or p["clock_in"], "dir": "out", "file": p["photo_out"]})
    out.sort(key=lambda x: x["ts"], reverse=True)
    return jsonify(out[:100])

@app.route("/api/admin/audit")
def admin_audit():
    require_admin()
    con = db()
    rows = con.execute("SELECT * FROM audit ORDER BY ts DESC LIMIT 300").fetchall()
    return jsonify([dict(r) for r in rows])

@app.route("/api/admin/settings", methods=["GET", "POST"])
def admin_settings():
    require_admin()
    con = db()
    if request.method == "GET":
        rows = con.execute("SELECT key,value FROM settings").fetchall()
        s = {r["key"]: r["value"] for r in rows}
        s.pop("smtp_pass", None)  # never send the password back
        s["smtp_pass_set"] = "1" if get_setting(con, "smtp_pass") else "0"
        s.pop("brevo_api_key", None)  # never send the API key back
        s["brevo_key_set"] = "1" if get_setting(con, "brevo_api_key") else "0"
        s["lan_ip"] = lan_ip()
        s["port"] = str(PORT)
        return jsonify(s)
    d = request.get_json(force=True, silent=True) or {}
    for k, v in d.items():
        if k in ("smtp_pass", "brevo_api_key") and v == "":   # blank = keep existing
            continue
        if k in DEFAULT_SETTINGS:
            set_setting(con, k, v)
    audit(con, "admin", "settings", ",".join(d.keys()))
    con.commit()
    return jsonify({"ok": True})

@app.route("/api/admin/send_test", methods=["POST"])
def admin_send_test():
    require_admin()
    con = db()
    kind = (request.get_json(force=True, silent=True) or {}).get("kind", "weekly")
    if kind == "daily":
        y = (datetime.now(TZ()).date() - timedelta(days=1))
        ok, msg = send_daily_email(con, y, test=True)
    elif kind == "employee":
        prev = shift_add_days(this_week_key(), -7)
        ok, msg = send_employee_weekly(con, prev, test=True, only_to=get_setting(con, "report_email"))
    else:
        ok, msg = send_weekly_email(con, this_week_key(), test=True)
    return jsonify({"ok": ok, "msg": msg})

@app.route("/api/admin/backup", methods=["POST"])
def admin_backup():
    require_admin()
    path = make_backup()
    return jsonify({"ok": True, "path": os.path.basename(path)})

# ---- one-click software update (git pull + safe restart) ----
def _git(args, timeout=120):
    return subprocess.run(["git", "-C", BASE] + args, capture_output=True, text=True, timeout=timeout)

def _git_info():
    try:
        if not os.path.isdir(os.path.join(BASE, ".git")):
            return {"git": False}
        commit = _git(["rev-parse", "--short", "HEAD"]).stdout.strip()
        date = _git(["log", "-1", "--date=format:%b %-d, %Y %-I:%M %p", "--format=%cd"]).stdout.strip()
        msg = _git(["log", "-1", "--format=%s"]).stdout.strip()
        return {"git": True, "commit": commit, "date": date, "message": msg}
    except Exception as ex:
        return {"git": False, "error": str(ex)[:120]}

@app.route("/api/admin/version")
def admin_version():
    require_admin()
    return jsonify(_git_info())

@app.route("/api/admin/update", methods=["POST"])
def admin_update():
    require_admin()
    con = db()
    if not os.path.isdir(os.path.join(BASE, ".git")):
        return jsonify({"ok": False, "error": "This install isn't set up for one-click updates. "
                        "It runs from a plain folder, not a connected GitHub copy."})
    try:
        old = _git(["rev-parse", "HEAD"]).stdout.strip()
        _git(["fetch", "origin", "main"], timeout=120)
        pull = _git(["pull", "--ff-only", "origin", "main"], timeout=120)
        out = (pull.stdout + "\n" + pull.stderr).strip()
        if pull.returncode != 0:
            return jsonify({"ok": False, "error": "Couldn't fetch the update: " + out[-200:]})
        if "Already up to date" in out or "Already up-to-date" in out:
            return jsonify({"ok": True, "updated": False, "msg": "You're already on the latest version."})
        # safety: make sure the new code even parses before we switch to it
        chk = subprocess.run([sys.executable, "-m", "py_compile", os.path.join(BASE, "app.py")],
                             capture_output=True, text=True)
        if chk.returncode != 0:
            _git(["reset", "--hard", old])
            audit(con, "system", "update_rollback", chk.stderr[:160]); con.commit()
            return jsonify({"ok": False, "error": "Update was rolled back — the new version failed a safety check, "
                            "so your clock keeps running the current version."})
        new = _git(["rev-parse", "--short", "HEAD"]).stdout.strip()
        audit(con, "admin", "update", f"{old[:7]} -> {new}"); con.commit()
        # re-exec into the new code a moment after this response is sent
        def _restart():
            time.sleep(1.3)
            try:
                os.execv(sys.executable, [sys.executable, os.path.join(BASE, "app.py")])
            except Exception:
                os._exit(3)
        threading.Thread(target=_restart, daemon=True).start()
        return jsonify({"ok": True, "updated": True, "commit": new, "msg": "Updated — restarting now."})
    except Exception as ex:
        return jsonify({"ok": False, "error": f"Update failed: {ex}"})

# ----------------------------------------------------------------------------
# EMAIL
# ----------------------------------------------------------------------------
from email.mime.image import MIMEImage
LOGO_EMAIL = os.path.join(BASE, "static", "logo_email.png")

TH  = 'style="text-align:left;padding:8px 10px;border-bottom:2px solid #333;font:12px Arial;text-transform:uppercase;color:#555"'
THR = 'style="text-align:right;padding:8px 10px;border-bottom:2px solid #333;font:12px Arial;text-transform:uppercase;color:#555"'
TD  = 'style="padding:8px 10px;border-bottom:1px solid #eee;font:14px Arial"'
TDR = 'style="padding:8px 10px;border-bottom:1px solid #eee;font:14px Arial;text-align:right"'

def week_range_label(wk):
    s, e = week_bounds(wk)
    return f'{local_dt(s).strftime("%b %-d")} – {local_dt(e-1).strftime("%b %-d, %Y")}'

def email_wrap(con, subtitle, inner):
    """Full HTML email with the logo header."""
    store = get_setting(con, "store_name")
    return (
        '<div style="max-width:680px;margin:0 auto;padding:18px;font-family:Arial,Helvetica,sans-serif">'
        '<table style="border-collapse:collapse"><tr>'
        '<td style="vertical-align:middle;padding-right:12px"><img src="cid:logo" width="44" alt="" style="display:block"></td>'
        f'<td style="vertical-align:middle"><div style="font:700 19px Arial;color:#1a1206">{store}</div>'
        f'<div style="color:#b06d10;font:600 13px Arial;letter-spacing:.04em;text-transform:uppercase">{subtitle}</div></td>'
        '</tr></table>'
        f'<div style="margin-top:16px">{inner}</div>'
        '<div style="color:#999;font:12px Arial;margin-top:18px">Sent automatically by your Groton time clock.</div>'
        '</div>'
    )

def _send_brevo(con, to, subject, inner_html, text, tag=""):
    """Send over HTTPS (port 443) via Brevo's API — works even when SMTP ports are blocked."""
    key = get_setting(con, "brevo_api_key")
    sender = get_setting(con, "smtp_user") or get_setting(con, "report_email")
    store = get_setting(con, "store_name") or "Time Clock"
    if not key:
        return False, "No email-service API key set (Manager → Settings → Email)."
    if not sender:
        return False, "No sender email set."
    html = ('<div style="max-width:680px;margin:0 auto;padding:18px;font-family:Arial,Helvetica,sans-serif">'
            f'<div style="font:700 19px Arial;color:#1a1206">{store}</div>'
            f'<div style="color:#b06d10;font:600 13px Arial;letter-spacing:.04em;text-transform:uppercase">{subject}</div>'
            f'<div style="margin-top:16px">{inner_html}</div>'
            '<div style="color:#999;font:12px Arial;margin-top:18px">Sent automatically by your Groton time clock.</div></div>')
    payload = json.dumps({
        "sender": {"email": sender, "name": store},
        "to": [{"email": to}],
        "subject": subject,
        "htmlContent": html,
        "textContent": text or " ",
    }).encode()
    req = urllib.request.Request("https://api.brevo.com/v3/smtp/email", data=payload,
        headers={"api-key": key, "content-type": "application/json", "accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            r.read()
        audit(con, "system", "email_sent", f'{tag} -> {to} (api)'); con.commit()
        return True, f"Sent to {to}"
    except urllib.error.HTTPError as e:
        body = ""
        try: body = e.read().decode()[:180]
        except Exception: pass
        audit(con, "system", "email_error", f'api {e.code}: {body}'); con.commit()
        if e.code in (401, 403):
            return False, "The email service rejected the API key — double-check it was copied fully."
        return False, f"Email service error ({e.code}): {body}"
    except Exception as ex:
        audit(con, "system", "email_error", f'api: {str(ex)[:120]}'); con.commit()
        return False, f"Could not reach the email service: {ex}"

def _send(con, to, subject, inner_html, text, tag=""):
    if not to:
        return False, "No recipient address."
    # Web-API method (port 443) — use this when the network blocks SMTP ports.
    if get_setting(con, "email_method", "smtp") == "brevo":
        return _send_brevo(con, to, subject, inner_html, text, tag)
    host = get_setting(con, "smtp_host"); port = int(get_setting(con, "smtp_port") or 587)
    user = get_setting(con, "smtp_user"); pw = get_setting(con, "smtp_pass")
    if not (user and pw):
        return False, "No Gmail address / app password set (Manager → Settings → Email)."
    root = MIMEMultipart("related")
    root["Subject"] = subject; root["From"] = user; root["To"] = to
    alt = MIMEMultipart("alternative")
    alt.attach(MIMEText(text, "plain")); alt.attach(MIMEText(email_wrap(con, subject, inner_html), "html"))
    root.attach(alt)
    try:
        with open(LOGO_EMAIL, "rb") as f:
            img = MIMEImage(f.read()); img.add_header("Content-ID", "<logo>")
            img.add_header("Content-Disposition", "inline", filename="logo.png"); root.attach(img)
    except Exception:
        pass
    raw = root.as_string()
    # Try the configured port, then fall back to the other Gmail port/method.
    # 587 = STARTTLS, 465 = implicit SSL. Some networks block one but allow the other.
    order = [port, 465 if port != 465 else 587]
    errors = []
    for p in order:
        try:
            if int(p) == 465:
                ctx = ssl.create_default_context()
                sv = smtplib.SMTP_SSL(host, 465, timeout=45, context=ctx)
            else:
                sv = smtplib.SMTP(host, p, timeout=45)
                sv.ehlo(); sv.starttls(context=ssl.create_default_context()); sv.ehlo()
            try:
                sv.login(user, pw)
                sv.sendmail(user, [to], raw)
            finally:
                try: sv.quit()
                except Exception: pass
            audit(con, "system", "email_sent", f'{tag} -> {to} (port {p})'); con.commit()
            return True, f"Sent to {to}"
        except smtplib.SMTPAuthenticationError:
            audit(con, "system", "email_error", f'{tag}: auth rejected'); con.commit()
            return False, ("Gmail rejected the login. Double-check the App Password (16 letters, no spaces) "
                           "and that it was made on this exact Gmail address.")
        except Exception as ex:
            errors.append(f"port {p}: {str(ex)[:80]}")
            continue
    audit(con, "system", "email_error", f'{tag}: {"; ".join(errors)[:160]}'); con.commit()
    return False, "Could not reach Gmail on this network (tried ports 587 and 465). " + " | ".join(errors)

# ---- team weekly (owner) ----
def team_table_html(con, rows, tot):
    t = ['<table style="border-collapse:collapse;width:100%">']
    t.append(f'<tr><th {TH}>Employee</th><th {THR}>Reg</th><th {THR}>OT</th><th {THR}>Total</th>'
             f'<th {THR}>Rate</th><th {THR}>OT rate</th><th {THR}>Gross pay</th></tr>')
    for r in rows:
        nm = r["name"] + (' <span style="color:#1f9d57">● on now</span>' if r["open_now"] else '')
        t.append(f'<tr><td {TD}>{nm}</td><td {TDR}>{r["reg"]:.2f}</td><td {TDR}>{r["ot"]:.2f}</td>'
                 f'<td {TDR}><b>{r["hrs"]:.2f}</b></td><td {TDR}>${r["rate"]:.2f}</td>'
                 f'<td {TDR}>${r["ot_rate"]:.2f}</td><td {TDR}><b>${r["pay"]:.2f}</b></td></tr>')
    t.append(f'<tr><td style="padding:10px;font:bold 14px Arial;border-top:2px solid #333">TOTAL</td>'
             f'<td {TDR}><b>{tot["reg"]:.2f}</b></td><td {TDR}><b>{tot["ot"]:.2f}</b></td>'
             f'<td {TDR}><b>{tot["hrs"]:.2f}</b></td><td></td><td></td><td {TDR}><b>${tot["pay"]:.2f}</b></td></tr></table>')
    return "".join(t)

def send_weekly_email(con, wk, test=False):
    rows, tot = compute_week(con, wk)
    rng = week_range_label(wk)
    inner = []
    still = [r["name"] for r in rows if r["open_now"]]
    if still:
        inner.append('<div style="background:#fff4e0;border:1px solid #f0c060;padding:8px 12px;border-radius:6px;'
                     f'font:13px Arial;margin-bottom:12px">Still clocked in (not counted): <b>{", ".join(still)}</b> — fix in the app Timesheet if needed.</div>')
    if get_setting(con, "wages_placeholder") == "1":
        inner.append('<div style="background:#fdecea;border:1px solid #e2a19a;padding:8px 12px;border-radius:6px;'
                     'font:13px Arial;margin-bottom:12px">Wage rates are placeholders — set real rates in the app (Manager → Team).</div>')
    inner.append('<h3 style="font:700 16px Arial;margin:4px 0 8px;color:#1a1206">Hours &amp; pay</h3>')
    inner.append(team_table_html(con, rows, tot))
    # Overtime breakdown — OT hours x OT rate = OT pay, its own section
    ot_rows = [r for r in rows if r["ot"] > 0]
    if ot_rows:
        tot_ot_pay = round(sum(r["ot"] * r["ot_rate"] for r in ot_rows), 2)
        ot = ['<h3 style="font:700 16px Arial;margin:26px 0 8px;color:#1a1206">Overtime breakdown</h3>',
              '<table style="border-collapse:collapse;width:100%">',
              f'<tr><th {TH}>Employee</th><th {THR}>OT hours</th><th {THR}>OT rate</th><th {THR}>OT pay</th></tr>']
        for r in ot_rows:
            otpay = round(r["ot"] * r["ot_rate"], 2)
            ot.append(f'<tr><td {TD}>{r["name"]}</td><td {TDR}>{r["ot"]:.2f}</td>'
                      f'<td {TDR}>${r["ot_rate"]:.2f}</td><td {TDR}><b>${otpay:.2f}</b></td></tr>')
        ot.append(f'<tr><td style="padding:10px;font:bold 14px Arial;border-top:2px solid #333">TOTAL OVERTIME</td>'
                  f'<td></td><td></td><td {TDR}><b>${tot_ot_pay:.2f}</b></td></tr></table>')
        inner.append("".join(ot))
    text = [f'{get_setting(con,"store_name")} — hours {rng}', "",
            "HOURS & PAY",
            f'{"Employee":<14}{"Reg":>7}{"OT":>7}{"Total":>8}{"Gross":>11}']
    for r in rows:
        text.append(f'{r["name"][:14]:<14}{r["reg"]:>7.2f}{r["ot"]:>7.2f}{r["hrs"]:>8.2f}{"$"+format(r["pay"],".2f"):>11}')
    text.append(f'{"TOTAL":<14}{tot["reg"]:>7.2f}{tot["ot"]:>7.2f}{tot["hrs"]:>8.2f}{"$"+format(tot["pay"],".2f"):>11}')
    if ot_rows:
        text.append("")
        text.append("OVERTIME BREAKDOWN")
        text.append(f'{"Employee":<14}{"OT hrs":>8}{"OT rate":>9}{"OT pay":>11}')
        for r in ot_rows:
            text.append(f'{r["name"][:14]:<14}{r["ot"]:>8.2f}{"$"+format(r["ot_rate"],".2f"):>9}{"$"+format(round(r["ot"]*r["ot_rate"],2),".2f"):>11}')
        text.append(f'{"TOTAL OT":<14}{"":>8}{"":>9}{"$"+format(tot_ot_pay,".2f"):>11}')
    subject = f'{"[TEST] " if test else ""}Weekly hours — {rng}'
    return _send(con, get_setting(con, "report_email"), subject, "".join(inner), "\n".join(text), tag=("test " if test else "")+"weekly "+wk)

# ---- daily digest (owner) ----
def compute_day(con, d):
    """Per-employee hours for one local calendar date d (a date)."""
    start = int(datetime(d.year, d.month, d.day, 0, 0, 0, tzinfo=TZ()).timestamp())
    end = start + 86400
    punches = con.execute("SELECT * FROM punches WHERE clock_in>=? AND clock_in<? ORDER BY clock_in", (start, end)).fetchall()
    by = {}
    for p in punches:
        by.setdefault(p["emp_id"], []).append(p)
    rows = []; total = 0.0
    for eid, plist in by.items():
        e = con.execute("SELECT name FROM employees WHERE id=?", (eid,)).fetchone()
        hrs = sum(hours_of(p) for p in plist)
        open_now = any(p["clock_out"] is None for p in plist)
        rows.append({"name": e["name"] if e else "?", "hrs": round(hrs, 2),
                     "shifts": len(plist), "open_now": open_now,
                     "first": min(p["clock_in"] for p in plist),
                     "last": max((p["clock_out"] or 0) for p in plist)})
        total += hrs
    rows.sort(key=lambda r: r["name"])
    return rows, round(total, 2)

def send_daily_email(con, day, test=False):
    rows, total = compute_day(con, day)
    label = day.strftime("%A, %b %-d")
    if rows:
        t = ['<table style="border-collapse:collapse;width:100%">',
             f'<tr><th {TH}>Employee</th><th {THR}>In</th><th {THR}>Out</th><th {THR}>Hours</th></tr>']
        for r in rows:
            out = ('<span style="color:#1f9d57">still in</span>' if r["open_now"]
                   else local_dt(r["last"]).strftime("%-I:%M %p"))
            t.append(f'<tr><td {TD}>{r["name"]}</td><td {TDR}>{local_dt(r["first"]).strftime("%-I:%M %p")}</td>'
                     f'<td {TDR}>{out}</td><td {TDR}><b>{r["hrs"]:.2f}</b></td></tr>')
        t.append(f'<tr><td style="padding:10px;font:bold 14px Arial;border-top:2px solid #333">TOTAL</td>'
                 f'<td></td><td></td><td {TDR}><b>{total:.2f}</b></td></tr></table>')
        inner = "".join(t)
        txt = [f'Hours for {label}', ""] + [f'{r["name"][:16]:<16}{r["hrs"]:>7.2f}' for r in rows] + [f'{"TOTAL":<16}{total:>7.2f}']
    else:
        inner = '<div style="font:14px Arial;color:#555">No one clocked in on this day.</div>'
        txt = [f'Hours for {label}', "", "No punches recorded."]
    subject = f'{"[TEST] " if test else ""}Daily hours — {label}'
    return _send(con, get_setting(con, "report_email"), subject, inner, "\n".join(txt),
                 tag=("test " if test else "")+"daily "+day.isoformat())

# ---- per-employee weekly (sent to each employee) ----
def send_employee_weekly(con, wk, test=False, only_to=None):
    rows, _ = compute_week(con, wk)
    rng = week_range_label(wk)
    by_id = {r["id"]: r for r in rows}
    emps = con.execute("SELECT * FROM employees WHERE active=1 AND email<>'' ORDER BY sort_order,name").fetchall()
    sent = 0; errors = []
    for e in emps:
        r = by_id.get(e["id"])
        reg = r["reg"] if r else 0.0; ot = r["ot"] if r else 0.0
        hrs = r["hrs"] if r else 0.0; pay = r["pay"] if r else 0.0
        rate = e["rate"] or 0.0; otr = e["ot_rate"] if e["ot_rate"] is not None else rate
        inner = (
            f'<div style="font:15px Arial;color:#333">Hi {e["name"].split(" ")[0]}, here are your hours for <b>{rng}</b>.</div>'
            '<table style="border-collapse:collapse;margin-top:14px">'
            f'<tr><td {TD}>Regular hours</td><td {TDR}><b>{reg:.2f}</b></td></tr>'
            f'<tr><td {TD}>Overtime hours</td><td {TDR}><b>{ot:.2f}</b></td></tr>'
            f'<tr><td {TD}>Total hours</td><td {TDR}><b>{hrs:.2f}</b></td></tr>'
            f'<tr><td {TD}>Rate</td><td {TDR}>${rate:.2f}/hr{(" · OT $"+format(otr,".2f")) if ot>0 else ""}</td></tr>'
            f'<tr><td {TD}><b>Gross pay</b></td><td {TDR}><b>${pay:.2f}</b></td></tr>'
            '</table>'
            '<div style="color:#888;font:12px Arial;margin-top:14px">Questions about your hours? Talk to your manager.</div>'
        )
        txt = (f'Hi {e["name"].split(" ")[0]}, your hours for {rng}:\n'
               f'Regular {reg:.2f} | Overtime {ot:.2f} | Total {hrs:.2f}\nGross pay ${pay:.2f}')
        to = only_to or e["email"]
        ok, msg = _send(con, to, f'{"[TEST] " if test else ""}Your hours — {rng}', inner, txt,
                        tag=("test " if test else "")+"emp-weekly "+e["name"])
        if ok: sent += 1
        else: errors.append(f'{e["name"]}: {msg}')
        if only_to: break   # test: just send one preview
    if not emps:
        return False, "No active employees have an email address set (Manager → Team)."
    if errors:
        return sent > 0, f"Sent {sent}; issues: " + "; ".join(errors[:3])
    return True, f"Sent to {sent} employee(s)."

# ----------------------------------------------------------------------------
# BACKGROUND SCHEDULER (pure stdlib thread; survives on Termux)
# ----------------------------------------------------------------------------
def make_backup():
    stamp = datetime.now(TZ()).strftime("%Y%m%d_%H%M%S")
    dst = os.path.join(BACKUP, f"timeclock_{stamp}.db")
    try:
        src = sqlite3.connect(DB); dst_con = sqlite3.connect(dst)
        src.backup(dst_con); dst_con.close(); src.close()
    except Exception:
        shutil.copy2(DB, dst)
    # keep last 30
    backups = sorted(os.listdir(BACKUP))
    for old in backups[:-30]:
        try: os.remove(os.path.join(BACKUP, old))
        except Exception: pass
    return dst

def auto_clockout(con):
    """Close punches left open too long, so one forgotten punch can't bill 24h."""
    max_h = float(get_setting(con, "auto_clockout_hours") or 14)
    now = int(time.time())
    open_p = con.execute("SELECT * FROM punches WHERE clock_out IS NULL").fetchall()
    n = 0
    for p in open_p:
        if (now - p["clock_in"]) / 3600.0 > max_h:
            close = p["clock_in"] + int(max_h * 3600)
            con.execute("UPDATE punches SET clock_out=?,auto_closed=1,note=? WHERE id=?",
                        (close, "auto-closed: forgotten punch — review", p["id"]))
            emp = con.execute("SELECT name FROM employees WHERE id=?", (p["emp_id"],)).fetchone()
            audit(con, "system", "auto_clockout", f'{emp["name"] if emp else p["emp_id"]} punch {p["id"]}')
            n += 1
    if n: con.commit()
    return n

def prune_photos(con):
    """Delete punch photos older than photo_keep_days to protect tablet storage."""
    days = int(get_setting(con, "photo_keep_days") or 60)
    cutoff = time.time() - days * 86400
    removed = 0
    for fn in os.listdir(PHOTOS):
        fp = os.path.join(PHOTOS, fn)
        try:
            if os.path.isfile(fp) and os.path.getmtime(fp) < cutoff:
                os.remove(fp); removed += 1
        except Exception:
            pass
    return removed

def _due(now_min, sched_min, window=180):
    """True inside a catch-up window starting at the scheduled time (handles a late wake)."""
    return sched_min <= now_min < sched_min + window

def scheduler_loop():
    """Checks every 30s: nightly maintenance, daily digest, owner weekly, employee weekly.
       Uses a catch-up window + 'already sent' guards so a brief tablet sleep won't skip a report."""
    while True:
        try:
            con = sqlite3.connect(DB); con.row_factory = sqlite3.Row
            now = datetime.now(TZ())
            now_min = now.hour * 60 + now.minute
            gi = lambda k, d: int(get_setting(con, k) or d)

            # nightly maintenance (auto clock-out, backup, photo prune)
            if _due(now_min, gi("auto_clockout_run_hour", 3) * 60, window=120):
                tag = now.date().isoformat()
                if get_setting(con, "last_maint") != tag:
                    auto_clockout(con); make_backup(); prune_photos(con)
                    set_setting(con, "last_maint", tag); con.commit()

            # daily digest — next morning, covering yesterday
            if get_setting(con, "daily_report") == "1" and _due(now_min, gi("daily_report_hour", 7) * 60 + gi("daily_report_min", 40)):
                yesterday = (now.date() - timedelta(days=1))
                if get_setting(con, "last_daily_report") != yesterday.isoformat():
                    ok, _ = send_daily_email(con, yesterday)
                    if ok:
                        set_setting(con, "last_daily_report", yesterday.isoformat()); con.commit()

            # owner weekly — on report_day, for the week that just ended
            if now.weekday() == gi("report_day", 0) and _due(now_min, gi("report_hour", 7) * 60 + gi("report_min", 50)):
                last_wk = shift_add_days(this_week_key(), -7)
                if get_setting(con, "last_report_week") != last_wk:
                    ok, _ = send_weekly_email(con, last_wk)
                    if ok:
                        set_setting(con, "last_report_week", last_wk); con.commit()

            # per-employee weekly — on payroll day (Wednesday), for the week that ended Sunday
            if get_setting(con, "employee_reports") == "1" and now.weekday() == gi("payroll_day", 2) and _due(now_min, gi("payroll_hour", 8) * 60 + gi("payroll_min", 5)):
                last_wk = shift_add_days(this_week_key(), -7)
                if get_setting(con, "last_payroll_week") != last_wk:
                    ok, _ = send_employee_weekly(con, last_wk)
                    if ok:
                        set_setting(con, "last_payroll_week", last_wk); con.commit()

            con.close()
        except Exception:
            pass
        time.sleep(30)

def start_scheduler():
    t = threading.Thread(target=scheduler_loop, daemon=True)
    t.start()

# ----------------------------------------------------------------------------
if __name__ == "__main__":
    init_db()
    start_scheduler()
    ip = lan_ip()
    print("=" * 52)
    print("  Shah's Time Clock is running.")
    print(f"  On THIS tablet:      http://localhost:{PORT}")
    print(f"  From your laptop/phone on the same Wi-Fi:")
    print(f"     Kiosk:   http://{ip}:{PORT}")
    print(f"     Manager: http://{ip}:{PORT}/admin")
    print("=" * 52)
    try:
        from waitress import serve
        serve(app, host="0.0.0.0", port=PORT, threads=8)
    except ImportError:
        print(f"[dev] waitress not installed; using Flask dev server on {PORT}")
        app.run(host="0.0.0.0", port=PORT)
