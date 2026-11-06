# Shah's Halal — Groton Time Clock

A complete employee time clock that runs **entirely on your Android tablet**. Python + a local
SQLite database. No internet needed to clock in and out — the only time it goes online is to
send your weekly email. Everything (every punch, edit, and change) is stored and logged locally.

- **Kiosk screen** (`http://localhost:8080`) — staff tap a PIN to clock in/out; live "on the clock" list.
- **Manager console** (`http://localhost:8080/admin`) — PIN-protected: dashboard, weekly report with
  pay, editable timesheet, team & wages, full activity log, settings.
- **Automatic emails:** a daily morning digest of yesterday's hours, a weekly team summary to you, and an
  individual weekly pay-stub to each employee who has an email (on payroll day — Wednesday by default).
- **Automatic housekeeping:** nightly auto-clock-out for forgotten punches, nightly backups, old-photo cleanup.
- **Silent punch photos:** a front-camera photo is taken on every clock in and clock out — no shutter sound,
  no preview, nothing on screen. For catching buddy-punching. (Toggle in Manager → Settings.)

**Default manager PIN: `1234`** — change it first (Manager → Settings).
A fresh install seeds a few generic sample employees (PINs 1001–1003) — replace them with your
real team in Manager → Team, and set each person's PIN, wage, and OT rate there.

---

## What you need
- The Amazon 10" Android tablet.
- A charger + stand (keep it plugged in — it's a kiosk).
- Your Wi-Fi.
- About 15 minutes, once.

---

## Setup — do this once

### 1. Install Termux (this is what runs Python on Android)
Install Termux from **F-Droid**, not the Play Store (the Play Store version is outdated and breaks).
1. On the tablet, open a browser and go to **https://f-droid.org** → download and install the F-Droid app
   (you may need to allow "install from unknown sources" when prompted).
2. Open F-Droid, search **Termux**, install it.
3. Also install **Termux:Boot** (lets the clock auto-start when the tablet powers on).

### 2. Copy this folder onto the tablet
Put the whole `shahs-timeclock` folder somewhere easy, e.g. the tablet's **Download** folder.
(Transfer by USB cable, Google Drive, or email the zip to yourself and extract it.)

Then give Termux access to storage — open Termux and run:
```
termux-setup-storage
```
(tap Allow). Your Download folder is now at `~/storage/downloads`.

### 3. Install and start
In Termux:
```
cd ~/storage/downloads/shahs-timeclock
bash install-termux.sh
./start.sh
```
You'll see: `Shah's Time Clock running → http://localhost:8080`.

### 4. Open the clock
Open **Chrome** on the tablet and go to:  **http://localhost:8080**
Add it to the home screen (Chrome menu → "Add to Home screen") so it opens full-screen with one tap.

---

## Keep the screen on and locked to the clock

**Screen stays on (Android setting):**
Settings → About tablet → tap **Build number** 7 times (unlocks Developer options) →
back → System → **Developer options** → turn on **Stay awake** (screen never sleeps while charging).

**Lock it to just this app (recommended) — Fully Kiosk Browser:**
Install **Fully Kiosk Browser** (Play Store, free). Set **Start URL** to `http://localhost:8080`,
turn on **Keep screen on** and **Kiosk mode**. Now the tablet shows only the clock and staff can't
wander off into other apps. (The clock also asks Android to keep the screen awake on its own as a backup.)

**Auto-start when the tablet reboots:** the installer already set this up via Termux:Boot. After a
power-cut the clock comes back on its own. (Open Termux:Boot once from the app drawer to arm it.)

---

## Set up the Monday email (5 minutes)
The tablet emails you the week's hours and pay every Monday at 7:50am. Gmail needs an **App Password**
(a special 16-character password for apps — not your normal Gmail password):

1. On any computer, go to **https://myaccount.google.com/apppasswords** (you need 2-Step Verification on).
2. Create an app password named "Time Clock" and copy the 16 characters.
3. In the clock: **Manager → Settings → Weekly email report**:
   - Send report to: your email
   - Gmail address: your Gmail
   - Gmail App Password: paste the 16 characters
   - Save, then tap **Send test email now** — check your inbox.

That's it. One Gmail app password powers all three report types.

### The three automatic reports (Manager → Settings)
- **Daily digest (to you)** — every morning, a short list of the previous day's hours per person. Default 7:40am.
- **Weekly team summary (to you)** — your whole team's hours and pay for the week that just ended.
- **Employee pay stubs** — on payroll day (**Wednesday** by default), each employee who has an email gets
  their own hours and gross pay for the week that ended Sunday. Add employee emails in **Manager → Team**.

Each has a **Send test** button so you can confirm it before relying on it.

### Punch photos (anti buddy-punch)
On by default. A front-camera photo is taken silently on every clock in and out. The **first time** the kiosk
opens, Android asks once for camera permission — tap Allow. In Fully Kiosk Browser, enable camera access in its
settings. Photos are stored on the tablet in `data/photos/` and auto-deleted after 60 days. Turn it off anytime
in Manager → Settings.

---

## See it from your laptop or phone
The tablet runs the clock for the whole network, so any device **on the same Wi-Fi** can open it live.

1. On the tablet, look at the Termux startup message (or Manager → Settings → "Open from your laptop or phone")
   — it shows an address like `http://192.168.1.50:8080`.
2. On your laptop, open that address in any browser for the kiosk, or add `/admin` for the manager console
   (still PIN-protected). Bookmark it. Changes are live — a punch on the tablet shows on your laptop within seconds.

**From outside the restaurant** (home, on the road): the easiest secure way is **Tailscale** (free).
Install the Tailscale app on both the tablet and your laptop, sign in to the same account on both, and then
use the tablet's Tailscale address instead of the Wi-Fi one. No port-forwarding, no exposing anything to the
open internet. Ask and this can be walked through step by step.

## Daily use
- **Staff:** tap PIN → big green **Clock In** / amber **Clock Out** → done. The right side shows who's on now.
- **You:** tap the gear (top-right) → enter manager PIN.
  - **Dashboard** — who's working, hours today, hours and labor cost this week, overtime watch.
  - **Report** — any week's hours, OT, and gross pay; "Download CSV" for your records or payroll.
  - **Timesheet** — fix a missed punch (someone forgot to clock out): edit the time, Save. Add/delete shifts.
  - **Team** — add people, set PINs, hourly rate, OT rate, OT threshold; deactivate people who leave.
  - **Activity log** — every punch and edit, timestamped.
  - **Settings** — manager PIN, email, auto clock-out, backups, photo-on-punch, store name.

## Overtime & pay
Hours past each person's threshold (40 by default) are paid at their OT rate. Leave OT rate blank for
no premium; set it (e.g. $15) for the cash-OT arrangement.

## Your data & backups
Everything lives in `data/timeclock.db` on the tablet. The app makes a nightly copy in `data/backups/`
(keeps 30 days) and you can tap **Back up now** in Settings anytime. To save a copy off the tablet,
copy the `data/` folder to a USB stick or your Drive now and then.

## Troubleshooting
- **"Can't reach the time clock service"** in the browser → Termux isn't running. Open Termux and run
  `./start.sh` from the folder (or reboot the tablet; it auto-starts).
- **Clock resets / Termux closes** → make sure you ran `termux-wake-lock` (start.sh does this) and that
  battery optimization is OFF for Termux (Android Settings → Apps → Termux → Battery → Unrestricted).
- **Email didn't send** → re-check the App Password (not your login password); tap Send test email for the exact error.
- **Forgot the manager PIN** → in Termux: `cd` to the folder, run
  `python -c "import app,sqlite3;c=sqlite3.connect(app.DB);c.execute('UPDATE settings SET value=\"1234\" WHERE key=\"admin_pin\"');c.commit()"` to reset it to 1234.

## Optional extras (ask and these can be turned on)
Photo-on-punch (front camera, already in Settings), paid-break tracking, daily-sales entry to show
labor cost %, scheduled-shift vs actual, and a one-tap export straight into Gusto payroll.
