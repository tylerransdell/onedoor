# OneDoor: Architecture, Security, and Deployment Guide

This guide outlines OneDoor’s security model, token handling, deployment steps, and recommended hardware. The goal: an ultra‑fast, clean door app that works seamlessly with your NVR and automation stack.

---

## 1. Security Architecture

OneDoor treats the browser as untrusted. Sensitive data stays server‑side, and the frontend receives only what it needs. This ensures the client JWT never appears in URLs, browser storage, WebSocket query strings, or any common logging surface.

### 1.1 Webhook Secret Isolation

- `parser.py` loads `config.yaml` and maps actions into `onedoor.yaml`.
- Webhook destinations and secrets are removed before anything reaches the UI.
- The frontend receives only a minimal action descriptor, for example:
  `{ "id": 1, "label": "Gate Trigger", "type": "hook", "icon": "0" }`
- When triggered, the client sends only `actionId` to `/api/action`.
- The backend resolves the ID and performs the outbound request internally.

### 1.2 Split‑Token WebSocket Signaling

- The backend issues two tokens:
  - API JWT for REST
  - ws_token for WebSocket upgrades
- The API JWT never enters logs, URLs, or browser‑visible surfaces.
- The ws_token is limited‑scope and valid only for SIP signaling with both auth and containment.

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

### 3.2 SIP Endpoints

Preferred: Fanvil and Grandstream SIP stations.
Edge‑case validated: Aiphone IX‑SS‑2G.

Required SIP configuration:

- SIP Server: Docker host IP
- Extension / Username: 105
- Password: one2345door
- Button press → dial 700
- Must auto‑answer calls from 700
- Aiphone may require relay wiring for auto‑answer

---

## 4. Roadmap

### 4.1 Versions

- v031 — Baselines + documentation
- v032 — Added frontend link actions (`hook`, `dtmf`, `link`)
- v034 — VAPID push notifications for physical button presses
- v035+ - manager.py to help keep confbridge clean. UI improvements.

### 4.2 Ongoing Work

- Dialplan still needs cleanup.
- Rare case: a user may remain in a call group if their WebSocket drops mid‑call - may require manager.py.
- Common case: intercom call will push to group - will be fixed with notification logic.
- Neither case seems to break any functionality but both are messy.

### 4.3 Multi‑Door Support

Planned after the single‑door experience is fully polished.

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

### 5.3 Custom Hooks
OneDoor includes an internal listener on **port 8199** for custom events.
You can POST your own notifications (all users or a specific user).
See `doorbell-webhook.sh` for an example of how to trigger OneDoor from external systems. This is the actual hook executed with a button press. Leave domain as "default"

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
