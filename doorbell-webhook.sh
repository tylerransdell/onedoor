#!/bin/sh
# doorbell-webhook.sh
# Called by Asterisk: System(/path/to/doorbell-webhook.sh ${EXTEN})

EXTEN=${1:-0}

# Send ONLY the extension to the backend
curl -s -X POST http://127.0.0.1:8199/webhook \
  -H "Content-Type: application/json" \
  -d "{\"extension\":${EXTEN}}" \
  >/dev/null 2>&1 &
