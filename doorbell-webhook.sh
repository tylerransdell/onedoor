#!/bin/sh
# doorbell-webhook.sh
# Called by Asterisk: System(/path/to/doorbell-webhook.sh ${EXTEN})

EXTEN=${1:-0}

# Send to the local backend (OneDoor webhook server on port 8199)
curl -s -X POST http://127.0.0.1:8199/webhook \
  -H "Content-Type: application/json" \
  -d "{\"extension\":${EXTEN}}" \
  >/dev/null 2>&1 &

# Fire identical webhook to docker_host chime relay (port 8799)
# fire-and-forget — errors are silently discarded
DOCKER_HOST=$(grep -oP '^docker_host:\s*"\K[^"]+' /app/config.yaml 2>/dev/null)
curl -s -X POST "http://${DOCKER_HOST}:8799/webhook" \
  -H "Content-Type: application/json" \
  -d "{\"extension\":${EXTEN}}" \
  >/dev/null 2>&1 &
