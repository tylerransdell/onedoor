OneDoor: Deployment, Hardware, Notifications, Security, and Roadmap

OneDoor is a single‑container, ultra‑low‑latency door console that unifies SIP intercoms, RTSP cameras, notifications, and automation hooks into one clean interface. This guide covers recommended hardware, deployment, configuration, notifications, security model, and the project roadmap.

----------------------------------------------------------------------
1. Recommended Hardware
----------------------------------------------------------------------

1.1 Cameras (go2rtc)

OneDoor uses a speed-optimized go2rtc build for media routing. Good cameras can produce sub‑second startup on their own but all cameras benefit from v040’s preload + GOP cache.

Recommended brands:
- Dahua (N45EJ62 is the primary development reference)
- Axis

Compatible with:
- Almost anything
- See https://github.com/AlexxIT/go2rtc

Suggested sub‑stream profile:
- Orientation: Portrait
- Resolution: D1 or 720p
- Codec: H.264
- Bitrate: CBR
- Keyframe interval: 1 FPS (GOP = FPS)

Enable gop=1 for fastest startup and swipes:
```
camera:
  - "ffmpeg:rtsp://admin:password@192.168.1.108:554/cam/realmonitor?channel=1&subtype=2#gop=1"
```
Use backend UDP for closest-to-real-time video:
```
camera: "rtsp://admin:password@192.168.1.10:554/cam/realmonitor?channel=1&subtype=1#rtsp_transport=udp#gop=1"
```

1.2 SIP Intercoms

Maximum compatibility:
- Fanvil
- Grandstream

Best conversational audio:
- Aiphone (IX-SS-2G is the primary development reference)

Best for loud / industrial environments:
- Zenitel
- Axis

Required on-device SIP settings:
- SIP Server: Docker host IP
- Username: see door mapping
- Password: one2345door
- Dial extension: see door mapping
- Auto‑answer must be enabled
- Aiphone requires relay wiring for auto‑answer

Multi‑Door SIP Assignments (v040+)

SIP Usernames / Extensions:
- Door 1 → 105
- Door 2 → 106
- Door 3 → 107
- Door 4 → 108
- Door 5 → 109
- Door 6 → 110

Button Press → Dial Extensions:
- Door 1 → 700
- Door 2 → 702
- Door 3 → 704
- Door 4 → 706
- Door 5 → 708
- Door 6 → 710

Notes:
- Intercoms must auto‑answer calls from their assigned extension.
- SIP devices must appear within the first 6 doors in config.
- Door numbering is positional; even if Door 1/2 are non‑SIP, Door 3 is still 107/704.

----------------------------------------------------------------------
2. Deployment
----------------------------------------------------------------------

OneDoor ships as a single container bundling telephony, media routing, signaling, and the frontend.

2.1 Requirements
- Docker + Docker Compose
- Valid FQDN with TLS via reverse proxy
- Static/reserved IP for Docker host
- Ability to forward SIP + WebRTC UDP ports

2.2 Directory Setup
```
mkdir onedoor && cd onedoor
```
2.3 Configuration
- Edit config.yaml (domain, host IP, camera URLs).
- Run makepass.example to generate password hashes.
- Review docker-compose.yml and set a random JWT_SECRET.

2.4 Network Requirements
- Reverse proxy → forward your domain → port 8099
- HTTPS + WSS required
- Forward WebRTC media ports
- Forward SIP signaling ports

2.5 Start the Service
```
docker compose up -d
```
On startup, OneDoor initializes Asterisk, provisions SIP endpoints, generates crypto keys, and configures go2rtc.

2.6 Call Modes (v040+)

call_mode:
- sip      — Full SIP signaling completely detached from video (recommended)
- generic  — No SIP registration; two-way audio sourced from video stream
- none     — No mic/call button; frees UI space for more actions

Notes:
- generic and none both use the video channel for audio (if present).
- sip provides the best audio quality and multi‑user mic access.

----------------------------------------------------------------------
3. Notifications
----------------------------------------------------------------------

OneDoor supports instant WebPush notifications for doorbell presses and custom events. No apps. No Firebase. Direct APNs + Google WebPush.

3.1 Enabling Notifications
Bind /vapid in docker-compose.yml:
```
volumes:
  - ./vapid:/vapid
```
3.2 How It Works
- Intercom dials its assigned extension
- OneDoor treats this as a doorbell event
- Call is immediately hung up
- Notifications are sent to all registered devices
- Deep link opens the correct door: https://yourdomain?door=<door_id>

3.3 Custom Hooks
OneDoor exposes a local listener on port 8199.
POST custom events to notify all users or a specific user.

3.4 User Registration
Users are prompted only when:
- Logged in
- Not already registered on that device
- Keys are invalid or expired

iOS users must install OneDoor as a Home Screen app.

----------------------------------------------------------------------
4. Security Model
----------------------------------------------------------------------

OneDoor treats the browser as untrusted and keeps sensitive data server‑side.

4.1 Public → OneDoor
- TLS required
- All routes protected by JWT
- No media or UI loads without valid token

4.2 OneDoor → Internal Services
- WebSocket upgrades use a separate random token, never the JWT
- Webhooks are hidden; clients only receive a webhook ID
- Notification subsystem accepts local triggers only
- go2rtc API restricted to exec ffmpeg only (no arbitrary commands)

----------------------------------------------------------------------
5. Roadmap
----------------------------------------------------------------------

5.1 Versions
- v031 — Baselines + documentation
- v032 — Added link actions (hook, dtmf, link)
- v034 — VAPID notifications; improved landscape layout
- v035–v036 — Performance + security improvements
- v040 — Multi‑Door Expansion
  - More doors
  - Non-SIP doors (generic, none)
  - Custom go2rtc build (very fast)
- v041+ — Upcoming
  - State‑aware toggle actions
  - UI refinements for portrait/landscape
  - manager.py for SIP call cleanup

5.2 Multi‑Door Support
Each door has:
- Independent audio mode (sip/generic/none)
- Independent button routing
- Independent notifications
- Independent action sets
- Faster swipe transitions

----------------------------------------------------------------------
6. Contributions
----------------------------------------------------------------------

PRs are welcome if they:
- Improve functionality
- Maintain OneDoor’s clean, low‑latency design
- Fit the project’s philosophy
- Remain under MIT
