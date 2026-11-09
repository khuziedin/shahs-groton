# Credentials & in-house Gmail sending — setup

This adds two things to the Shahs Groton app:
1. One place for all service logins: **`data/credentials.json`** (IMS, Restaurant Depot, PFG, Gmail).
2. Sending email as **shahsgroton@gmail.com via the Gmail API** (port 443) instead of Brevo.

---

## 0. Security rules (read first)

- The GitHub repo is **PUBLIC**. Real passwords and tokens must **never** be committed.
- The real secrets file is **`data/credentials.json`** on the tablet. The `data/` folder is already gitignored, so it never leaves the tablet.
- Only `credentials.example.json` (placeholders) lives in the repo.
- **Do not paste real passwords into chat** with Claude or anyone. Fill them in directly on the tablet.

Make sure `.gitignore` contains these lines (add them if missing):

```
data/
credentials.json
```

---

## 1. Create the real credentials file on the tablet

In Termux on the tablet:

```bash
cd ~/shahs-groton
cp credentials.example.json data/credentials.json
nano data/credentials.json      # fill in real values, save with Ctrl-O / Ctrl-X
```

Fill in what you have now (IMS login). Leave Restaurant Depot / PFG blank if you only buy there in person — we'll price those from receipts instead. Gmail gets filled in after step 2.

---

## 2. Turn on Gmail-API sending (one time)

Because the restaurant Wi-Fi blocks SMTP, we send through Google's HTTPS API using **your own** Gmail account — no Brevo.

### 2a. Make an OAuth client in Google Cloud (free)
1. Go to **console.cloud.google.com**, sign in as **shahsgroton@gmail.com**.
2. Create a project (e.g. "Shahs Groton").
3. **APIs & Services → Library →** search **Gmail API → Enable**.
4. **APIs & Services → OAuth consent screen:**
   - User type: **External**. App name: "Shahs Groton". Support + developer email: shahsgroton@gmail.com.
   - Add scope `.../auth/gmail.send`.
   - Add **shahsgroton@gmail.com** as a **Test user**.
   - **Publish the app** (Publishing status → **Publish → Confirm**). This matters: if it stays in "Testing," the refresh token expires every 7 days. Published = it keeps working. (Google may show an "unverified app" notice for your own account — that's fine for personal use.)
5. **APIs & Services → Credentials → Create credentials → OAuth client ID → Application type: Desktop app.** Create it, then copy the **Client ID** and **Client secret**.

### 2b. Get the refresh token (run on your LAPTOP, not the tablet)
On a computer with a browser:

```bash
pip install requests
python get_gmail_token.py
```

Paste the Client ID and Client secret when asked, approve in the browser as shahsgroton@gmail.com, and it prints a **refresh_token**.

### 2c. Put the three values into the tablet's credentials file
Edit `data/credentials.json` → `"gmail"` block:
```json
"gmail": {
  "sender": "shahsgroton@gmail.com",
  "client_id": "....apps.googleusercontent.com",
  "client_secret": "....",
  "refresh_token": "....(from step 2b)....",
  "owner_to": "shahsgroton@gmail.com"
}
```

### 2d. Test it
On the tablet:
```bash
cd ~/shahs-groton
python mailer_gmail.py
```
You should get a test email at shahsgroton@gmail.com within a few seconds.

---

## 3. Point the app's email at Gmail instead of Brevo

In the app, wherever email is sent, call:
```python
from mailer_gmail import send_gmail
send_gmail(to, subject, body_text, body_html)   # raises on failure
```
Or, to keep the existing `email_method` switch, add an `email_method = gmail_api` option that routes to `send_gmail(...)`. Brevo can stay as a fallback or be removed — your call. (Send me the current email section of app.py and I'll wire the switch in cleanly.)

---

## Files in this drop
| File | Goes in repo? | What it is |
|---|---|---|
| `credentials.example.json` | yes (placeholders) | template to copy into `data/` |
| `creds.py` | yes | loads `data/credentials.json`, no secrets inside |
| `mailer_gmail.py` | yes | sends email via Gmail API over 443 |
| `get_gmail_token.py` | yes | one-time tool to mint the refresh token (run on laptop) |
| `data/credentials.json` | **NO — never commit** | your real secrets, tablet only |
