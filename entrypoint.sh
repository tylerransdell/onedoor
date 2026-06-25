#!/bin/sh
set -e

echo "Starting OneDoor v050 Appliance Provisioning..."
/app/keys.sh
python3 /app/parser.py

sleep 1

echo "Starting go2rtc Media Server..."
/usr/local/bin/go2rtc -config /config/go2rtc.yaml &
GO2RTC_PID=$!

echo "Starting Asterisk PBX..."
asterisk -f &
ASTERISK_PID=$!

# Wait for Asterisk to be ready
sleep 5

echo "Starting OneDoor Secure Backend..."
node server.js &
NODE_PID=$!

# Forward SIGTERM/SIGINT to all children, then wait for all
cleanup() {
    echo "Entrypoint received signal, forwarding to children..."
    kill -TERM "$NODE_PID" 2>/dev/null
    kill -TERM "$GO2RTC_PID" 2>/dev/null
    kill -TERM "$ASTERISK_PID" 2>/dev/null
    wait "$NODE_PID" 2>/dev/null
    wait "$GO2RTC_PID" 2>/dev/null
    wait "$ASTERISK_PID" 2>/dev/null
    echo "All processes stopped"
    exit 0
}
trap cleanup SIGTERM SIGINT

# Wait for any child to exit
wait -n "$NODE_PID" "$GO2RTC_PID" "$ASTERISK_PID"
