OneDoor: Deployment, Hardware, Notifications, Security, and Roadmap

OneDoor is a single‑container, ultra‑low‑latency door console that unifies SIP intercoms, RTSP cameras, notifications, and automation hooks into one clean interface. This guide covers recommended hardware, deployment, configuration, notifications, security model, and the project roadmap.

----------------------------------------------------------------------
1. Recommended Hardware
----------------------------------------------------------------------

1.1 Cameras (go2rtc)

OneDoor uses a speed-optimized go2rtc build for media routing. Good cameras can produce sub‑second startup on their own but all cameras benefit from v040's preload + GOP cache.

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
- User has not previously dismissed or snoozed registration

iOS users must install OneDoor as a Home Screen app.

3.5 Webhook Rate Limiting

OneDoor implements automatic rate limiting on the webhook endpoint (port 8199) as a security measure. This prevents abuse if the webhook port is accidentally exposed to the internet.

- snooze_all: suppresses all webhook-triggered notifications for a configurable duration after any webhook fires
- snooze_same: prevents identical webhook payloads from triggering duplicate notifications

Configuration (in config.yaml):
```yaml
onedoor:
  notifications:
    snooze_all: 120    # seconds to suppress all notifications after any webhook
    snooze_same: 120   # seconds before identical webhook can re-trigger
```

Notes:
- This is a server-side security feature, not user-controllable
- snooze_all applies globally across all doors
- snooze_same is per-payload (prevents duplicate alerts from the same event)
- Setting either value to 0 disables that rate limit

----------------------------------------------------------------------
4. Actions
----------------------------------------------------------------------

Each door can have action buttons. Actions are defined per-door in config.yaml under the `actions` list.

4.1 Hook Actions

Simple webhook trigger. Fires a POST request to a URL.

Configuration:
- type: "hook"
- url: Target URL
- headers: Optional HTTP headers (e.g., Authorization for Home Assistant)
- body: Optional JSON body

Example:
```yaml
- id: "porch_light"
  label: "Porch Light"
  type: "hook"
  url: "http://192.168.1.100:8123/api/services/light/turn_on"
  icon: "💡"
  headers:
    Authorization: "Bearer YOUR_LONG_LIVED_TOKEN"
  body:
    entity_id: "light.porch"
```

4.2 DTMF Actions

Sends a DTMF payload to the intercom (e.g., for door locks).

Configuration:
- type: "dtmf"
- payload: DTMF string to send

Example:
```yaml
- id: "front_lock"
  label: "Unlock"
  type: "dtmf"
  payload: "1234"
  icon: "🔒"
```

4.3 Link Actions

Opens a URL in a new tab.

Configuration:
- type: "link"
- url: Target URL

Example:
```yaml
- id: "front_link"
  label: "Front Door"
  type: "link"
  url: "https://yourdomain?door=front"
  icon: "🚪"
```

4.4 State-Aware Toggle Actions (v041+)

Toggle actions track the on/off state of a device by polling a status endpoint. The frontend only receives "on", "off", or "unknown" — all URL handling and state matching occurs server-side.

Configuration:
- type: "toggle"
- on_url: URL to call when turning device on (backend only)
- off_url: URL to call when turning device off (backend only)
- status_url: URL to poll for current state (backend only)
- on_values: Array of state values meaning "on" (e.g., ["open", "on"])
- off_values: Array of state values meaning "off" (e.g., ["closed", "off"])
- headers: Optional HTTP headers (e.g., Authorization for Home Assistant)
- body: Optional JSON body

Example (Home Assistant cover):
```yaml
- id: "garage_door"
  label: "Garage"
  type: "toggle"
  icon: "🚗"
  on_url: "http://192.168.1.100:8123/api/services/cover/open_cover"
  off_url: "http://192.168.1.100:8123/api/services/cover/close_cover"
  status_url: "http://192.168.1.100:8123/api/states/cover.garage"
  on_values: ["open"]
  off_values: ["closed"]
  headers:
    Authorization: "Bearer YOUR_LONG_LIVED_TOKEN"
  body:
    entity_id: "cover.garage"
```

How It Works:
- Backend polls status_url and compares the response to on_values/off_values
- Frontend only receives the simplified state: "on", "off", or "unknown"
- Frontend never sees the actual URLs or raw state values

State Polling:
- Client polls GET /api/action/status?doorId=X&actionId=Y
- Backend returns: { state: "on" | "off" | "unknown" }
- Button appearance updates based on state:
  - "on" or "off" — button is active and shows the current state
  - "unknown" — button becomes inactive (yellow) and cannot be toggled
- If status_url is omitted, state defaults to "unknown"

Sending Commands:
- POST /api/action with doorId, actionId, and command ("on" or "off")
- Backend calls the appropriate on_url or off_url
- Commands are rejected when state is "unknown" to prevent unintended actions

----------------------------------------------------------------------
5. Security Model
----------------------------------------------------------------------

OneDoor treats the browser as untrusted and keeps sensitive data server‑side.

5.1 Public → OneDoor
- TLS required
- All routes protected by JWT
- No media or UI loads without valid token

5.2 OneDoor → Internal Services
- WebSocket upgrades use a separate random token, never the JWT
- Webhooks are hidden; clients only receive a webhook ID
- Notification subsystem accepts local triggers only
- go2rtc API restricted to exec ffmpeg only (no arbitrary commands)

----------------------------------------------------------------------
6. Administration
----------------------------------------------------------------------

6.1 User Accounts

Usernames and password hashes are defined manually in `config.yaml`.  
To revoke all user sessions at once, change the `JWT_SECRET` value in `docker-compose.yml`.  
This invalidates every existing token and forces all users to log in again.

6.2 Notification Registrations

All WebPush registrations are stored in the `/vapid` directory.  
To clear every registered device (or reset the notification system entirely), delete the contents of `/vapid` and restart the container.  
New keys will be generated automatically.

6.3 Generated Runtime Configuration

After OneDoor fully initializes, final runtime configuration files are written to:

- `/app/onedoor.yaml`  
- `/config/go2rtc.yaml`  
- `/etc/asterisk/`  

These files reflect the merged and validated configuration used internally by the system and may be useful for troubleshooting.

It is technically possible to bind custom versions of these files into the container, but this is **not recommended** and will almost certainly break at some point.

----------------------------------------------------------------------
7. Roadmap
----------------------------------------------------------------------

7.1 Versions
- v031 — Baselines + documentation
- v032 — Added link actions (hook, dtmf, link)
- v034 — VAPID notifications; improved landscape layout
- v035–v036 — Performance + security improvements
- v040 — Multi‑Door Expansion
  - More doors
  - Non-SIP doors (generic, none)
  - Custom go2rtc build (very fast)
- v041 — State‑Aware Toggle Actions
  - Toggle actions with state polling
  - UI refinements for portrait/landscape
  - manager.py for SIP call cleanup
- v042+ — Upcoming
  - Additional UI improvements
  - Enhanced automation hooks

7.2 Multi‑Door Support
Each door has:
- Independent audio mode (sip/generic/none)
- Independent button routing
- Independent notifications
- Independent action sets
- Faster swipe transitions

----------------------------------------------------------------------
8. Contributions
----------------------------------------------------------------------

PRs are welcome if they:
- Improve functionality
- Maintain OneDoor's clean, low‑latency design
- Fit the project's philosophy
- Remain under MIT