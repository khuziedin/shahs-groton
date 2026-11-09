"""
get_gmail_token.py — one-time helper to authorize shahsgroton@gmail.com and get a refresh_token.

RUN THIS ONCE, on a computer that has a web browser (your laptop — NOT the tablet).
It opens Google, you sign in as shahsgroton@gmail.com and approve, and it prints a refresh_token.
Copy that token into the tablet's data/credentials.json under gmail.refresh_token.

Prereq: a Google Cloud OAuth "Desktop app" client (see CREDENTIALS_SETUP.md).
No pip installs needed — uses only the Python standard library.
"""
import http.server
import json
import sys
import urllib.parse
import urllib.request
import urllib.error
import webbrowser

SCOPE = "https://www.googleapis.com/auth/gmail.send"
AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
PORT = 8765
REDIRECT = "http://127.0.0.1:%d" % PORT

_result = {}


class _Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        params = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        _result["code"] = params.get("code", [None])[0]
        _result["error"] = params.get("error", [None])[0]
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(b"<h2>Done. Close this tab and return to the terminal.</h2>")

    def log_message(self, *args):
        pass


def main():
    print("Gmail token setup for Shahs Groton\n")
    client_id = input("Paste OAuth client_id: ").strip()
    client_secret = input("Paste OAuth client_secret: ").strip()
    if not client_id or not client_secret:
        print("client_id and client_secret are required.")
        sys.exit(1)

    auth = AUTH_URL + "?" + urllib.parse.urlencode({
        "client_id": client_id,
        "redirect_uri": REDIRECT,
        "response_type": "code",
        "scope": SCOPE,
        "access_type": "offline",
        "prompt": "consent",
    })

    print("\nOpening your browser. Sign in as shahsgroton@gmail.com and approve.")
    print("If it does not open, paste this URL into your browser:\n\n" + auth + "\n")
    try:
        webbrowser.open(auth)
    except Exception:
        pass

    srv = http.server.HTTPServer(("127.0.0.1", PORT), _Handler)
    srv.handle_request()  # handle the single redirect, then stop

    if _result.get("error"):
        print("Authorization error:", _result["error"])
        sys.exit(1)
    code = _result.get("code")
    if not code:
        print("No authorization code received.")
        sys.exit(1)

    data = urllib.parse.urlencode({
        "code": code,
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": REDIRECT,
        "grant_type": "authorization_code",
    }).encode()
    req = urllib.request.Request(TOKEN_URL, data=data,
                                 headers={"content-type": "application/x-www-form-urlencoded"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            resp = json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        print("Token exchange failed:", e.read().decode()[:300])
        sys.exit(1)

    refresh_token = resp.get("refresh_token")
    if not refresh_token:
        print("No refresh_token returned. Re-run and make sure you approved the consent screen.")
        print("Full response:", resp)
        sys.exit(1)

    print("\n=== SUCCESS ===")
    print("refresh_token:\n")
    print(refresh_token)
    print("\nPaste the token above into data/credentials.json on the tablet:")
    print('  "gmail": { ... "refresh_token": "<paste here>" ... }')


if __name__ == "__main__":
    main()
