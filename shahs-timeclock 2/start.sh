#!/data/data/com.termux/files/usr/bin/bash
# Starts the Shah's Groton time clock and keeps the tablet from sleeping.
cd "$(dirname "$0")"
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock   # keep CPU awake
export PORT=8080
echo "Starting Shah's Time Clock on http://localhost:8080 ..."
python app.py
