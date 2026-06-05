#!/bin/sh
set -e

echo "🚀 Starting OneDoor Appliance Provisioning..."
/app/keys.sh
python3 /app/parser.py

sleep 1

echo "🎥 Starting go2rtc Media Server..."
/usr/local/bin/go2rtc -config /config/go2rtc.yaml &

echo "🚪 Starting OneDoor Secure Backend..."
node server.js &

echo "📞 Starting Asterisk PBX..."
exec asterisk -f
