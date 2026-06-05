# OneDoor: Architecture, Security, and Deployment Guide

This guide outlines OneDoor’s security model, token handling, deployment steps, and recommended hardware. The goal: an ultra‑fast, clean door app that works seamlessly with your NVR and automation stack.

---

# 1. Security Model

## 1.1 Public → OneDoor
- App requires **TLS**
- All app routes and API endpoints sit **behind a JWT auth token**
- Nothing loads or streams without a valid JWT

## 1.2 Clients → Internal Services
- WebSocket upgrades never expose the JWT; OneDoor uses a **separate random upgrade token** for Asterisk
- If the Asterisk token leaks, it only reaches an already‑secured internal endpoint
- Webhooks often contain secrets, so clients only receive a **webhook ID** — the real webhook URL stays **100% local**
- Notification subsystem only accepts **local webhook triggers**; users cannot access the notification endpoint
- go2rtc API now only allows **ffmpeg** as an executable target (no arbitrary commands)

---

## 2. Deployment

OneDoor ships as a single container bundling telephony, media routing, signaling, and the frontend.

### 2.1 Requirements

- Docker + Docker Compose
- Valid FQDN with TLS via reverse proxy
- Static or reserved local IP for the Docker host
- Ability to forward required UDP media and SIP ports

### 2.2 Directory Setup

`mkdir onedoor && cd onedoor`
Place all deployment files here.

### 2.3 Configuration

- Edit `config.yaml` (domain, Docker host IP, camera address).
- Run `makepass.example` to generate password hashes.
- Review `docker-compose.yml`. Enter random JWT_SECRET. Changing it invalidates all tokens and forces new logins.


### 2.4 Network Requirements

- Reverse proxy → forward your OneDoor domain to port **8099**
- HTTPS + WSS required
- Forward WebRTC media ports
- Forward SIP signaling ports
- Allow inbound/outbound UDP for media

### 2.5 Start the Service

`docker compose up -d`

On startup, OneDoor initializes Asterisk, generates crypto keys, provisions SIP endpoints, and configures go2rtc.

###2.6 Notes — Call Modes

New field: call_mode

Supported values:
  sip      - Preferred and most supported. Full SIP signaling and two‑way audio.
  generic  - No SIP registration. Audio sourced from the video channel. UI exposes a mic toggle.
  none     - No mic path. Video‑only. Still supports notifications and deep links.

Notes:
  - generic and none both rely on the video channel for audio (if present).
  - sip remains the recommended mode for devices that support it.
  - advantage of generic or none is audio plays immediately. 
  - advantage of SIP is audio is actually good.

---

## 3. Hardware & Media

### 3.1 Camera (go2rtc)

Recommended: Dahua, Axis, or similar IP camera with clean RTSP sub‑streams. See go2rtc for more info.

Suggested sub‑stream profile for sub-second response:

- Orientation: Portrait
- Resolution: D1 or 720p
- Codec: H.264
- Bitrate: CBR
- Keyframe interval: 1 FPS (GOP = FPS)

- moredoors branch now buffers streams so even some lower quality cameras can get a realtime experience but not all of them.

IMPORTANT for faster feeling video, use #gop=1 tag:
```
camera:
  - "ffmpeg:rtsp://admin:password@192.168.1.108:554/cam/realmonitor?channel=1&subtype=2#gop=1"
```
Then bind this additional media port /udp in compose.

### 3.2 SIP Endpoints

Preferred: Fanvil and Grandstream SIP stations.
Edge‑case validated: Aiphone IX‑SS‑2G.

Required SIP configuration:

- SIP Server: Docker host IP
- Password: one2345door
- Aiphone may require relay wiring for auto‑answer

Multi‑Door SIP Assignments (v040+)

SIP Username / Extension:
  Door 1 → 105
  Door 2 → 106
  Door 3 → 107
  Door 4 → 108
  Door 5 → 109
  Door 6 → 110

Button Press → Dial Extensions:
  Door 1 → 700
  Door 2 → 702
  Door 3 → 704
  Door 4 → 706
  Door 5 → 708
  Door 6 → 710

Notes:
  - These numbers correspond to the door index in config.yaml.
  - They apply even if call_mode is generic or none.
  - Intercoms must auto‑answer calls from their assigned dialing extension.

---

## 4. Roadmap

### 4.1 Versions

- v031 — Baselines + documentation
- v032 — Added frontend link actions (`hook`, `dtmf`, `link`)
- v034 — VAPID push notifications for physical button presses, lanscape real estate improved but buttons still messy.
- v036+ - manager.py to help keep confbridge clean. UI improvements.

v040+ — Multi‑Door Expansion
  - Added support for more doors
  - Added support for non-SIP doors in cluding generic and no 2-way at all.
  - super fast custom go2rtc build

### 4.2 Multi‑Door Support

Multi‑door support is now fully implemented.

Each door has:
  - Independent SIP or non‑SIP audio mode (sip, generic, none)
  - Independent button‑press routing
  - Independent notification deep links
  - Independent action sets
  - Now even lower latency so even swiping feels fast.
---

# 5. Notifications
OneDoor supports **instant WebPush notifications** for doorbell presses and custom automation events. No apps, no Firebase — just direct delivery to Apple and Google.

### 5.1 Enabling Notifications
Bind the `/vapid` directory in `docker-compose.yml`:

volumes:
  - ./vapid:/vapid

If `/vapid` exists, OneDoor loads or generates VAPID keys and enables the notification system.

### 5.2 How It Works
When the intercom (extension **105**) dials **700**, OneDoor treats it as a doorbell event and sends notifications to all registered devices.
The intercom is hung up immediately — no bridge, no media.

Button presses are now filtered by endpoint in the dialplan.
Each door triggers a notification tied to its door index.

Deep links now include the door ID:
  https://yourdomain/door?door=<door_id>

### 5.3 Custom Hooks
OneDoor includes an internal listener on **port 8199** for custom events.
You can POST your own notifications (all users or a specific user).

notification.example is now the canonical example file.
doorbell-webhook.sh is a separate automation hook and not the example.

Add ?door=<door_id> to URLs for deep linking.

### 5.4 User Registration
Users are prompted to enable notifications only if:
- they are logged in
- they are not already registered on that specific device
- their keys are missing or expired
- **they have not previously asked to be left alone**

If they accept, the browser provides the push keys and notifications activate immediately.

**iOS users must install OneDoor as a Home Screen app** for notifications to work.

### 5.5 Delivery
OneDoor sends WebPush directly to:
- **APNs** (Apple)
- **Google WebPush** (Chrome/Android)

Fast, clean, and no app churn.

# 6. Contributions
PRs are welcome if they improve functionality, keep OneDoor clean and low‑latency, and remain under MIT.
