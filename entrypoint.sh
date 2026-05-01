#!/bin/bash
set -e

echo "🚀 Starting OneDoor Provisioning..."

# 1. Generate DTLS Keys (Only if missing)
/app/keys.sh

# 2. Run Python Parser
# This creates /app/onedoor.yaml, /config/go2rtc.yaml, and /etc/asterisk/pjsip.conf
python3 /app/parser.py

# 3. Start Asterisk in the background
# -f foreground (so we can see logs), -p high priority
echo "📞 Starting Asterisk PBX..."
asterisk -f &

# 4. Start go2rtc in the background
# It will automatically pick up /config/go2rtc.yaml
echo "🎥 Starting go2rtc Media Server..."
/usr/local/bin/go2rtc -config /config/go2rtc.yaml &

# 5. Start OneDoor (Foreground)
# This keeps the container alive and serves the UI/Proxy
echo "🚪 Starting OneDoor Secure Backend..."
exec node server.js
