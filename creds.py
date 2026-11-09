"""
creds.py — single place to load secrets for the Shahs Groton app.

Real secrets live ONLY in data/credentials.json on the tablet (gitignored).
Never commit data/credentials.json. Never hardcode a password in any .py file.
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
CRED_PATH = os.path.join(HERE, "data", "credentials.json")


def load_credentials():
    """Return the whole credentials dict, or raise a clear error if missing."""
    if not os.path.exists(CRED_PATH):
        raise FileNotFoundError(
            "Missing " + CRED_PATH + "\n"
            "Create it on the tablet by copying credentials.example.json into data/ "
            "and filling in the real values. Do NOT commit it."
        )
    with open(CRED_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def get(service, default=None):
    """Return one service block, e.g. get('gmail') or get('ims')."""
    try:
        return load_credentials().get(service, default or {})
    except FileNotFoundError:
        return default or {}


def has(service):
    """True if the service block exists and looks filled in (no REPLACE_ placeholders)."""
    block = get(service)
    if not block:
        return False
    for v in block.values():
        if isinstance(v, str) and v.startswith("REPLACE_"):
            return False
    return True
