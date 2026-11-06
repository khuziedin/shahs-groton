#!/data/data/com.termux/files/usr/bin/bash
# One-time setup inside Termux on the Android tablet.
set -e
echo "== Updating Termux packages =="
yes N | pkg update -y || true
yes N | pkg upgrade -y || true
echo "== Installing Python + helpers =="
pkg install -y python termux-api
echo "== Installing app dependencies =="
cd "$(dirname "$0")"
# NOTE: do NOT run "pip install --upgrade pip" on Termux — it is blocked on purpose.
pip install flask waitress tzdata
echo "== Setting up autostart on boot (optional) =="
mkdir -p ~/.termux/boot
cat > ~/.termux/boot/start-timeclock <<EOF
#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock
cd "$(pwd)"
python app.py
EOF
chmod +x ~/.termux/boot/start-timeclock
chmod +x start.sh
echo ""
echo "DONE. Start the clock now with:   ./start.sh"
echo "Then open  http://localhost:8080  in the tablet browser."
