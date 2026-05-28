#!/bin/sh
curl -s -X POST http://127.0.0.1:8199/webhook \
  -H "Content-Type: application/json" \
  -d '{"target":"all","payload":{"title":"Doorbell","body":"Someone is at the door","url":"https://default","icon":"https://default/icons/icon-192.png"}}' \
  >/dev/null 2>&1 &
