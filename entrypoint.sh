#!/bin/sh
set -e

echo "🚀 Starting OneDoor Appliance Provisioning..."
/app/keys.sh
python3 /app/parser.py

sleep 1

echo "🎥 Starting go2rtc Media Server..."
/usr/local/bin/go2rtc -config /config/go2rtc.yaml &
GO2RTC_PID=$!
echo "🔒 Starting OneDoor Secure Backend..."
node server.js &
NODE_PID=$!

# Wait for node to write the SIP flag file
for i in $(seq 1 10); do
    if [ -f /tmp/sip-enabled ]; then
        break
    fi
    sleep 0.5
done

if [ -f /tmp/sip-enabled ] && [ "$(cat /tmp/sip-enabled)" = "1" ]; then
    echo "📞 Starting Asterisk PBX (SIP doors detected)..."
    asterisk -f &
    ASTERISK_PID=$!
else
    echo "🔕 Asterisk: Skipped (no SIP doors configured)"
    ASTERISK_PID=""
fi

# Forward SIGTERM/SIGINT to all children, then wait for all
cleanup() {
    echo "🔙 Entrypoint received signal, forwarding to children..."
    kill -TERM "$NODE_PID" "$GO2RTC_PID" 2>/dev/null
    [ -n "$ASTERISK_PID" ] && kill -TERM "$ASTERISK_PID" 2>/dev/null
    wait "$NODE_PID" 2>/dev/null
    wait "$GO2RTC_PID" 2>/dev/null
    [ -n "$ASTERISK_PID" ] && wait "$ASTERISK_PID" 2>/dev/null
    echo "✅ All processes stopped"
    exit 0
}
trap cleanup SIGTERM SIGINT

# Wait for any child to exit
wait -n "$NODE_PID" "$GO2RTC_PID" ${ASTERISK_PID:+"$ASTERISK_PID"}
