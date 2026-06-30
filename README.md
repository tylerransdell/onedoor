# OneDoor 🚪

**Real-time communication and control over your property.**

OneDoor captures the critical seconds that matter, giving you the instant ability to communicate and act—never just be a bystander.

## What is OneDoor?

Originally a hyper-focused, SIP-first PWA for a single door, OneDoor has evolved into a multi-door communication and control surface, benefiting even non-SIP devices.

OneDoor is primarily a Node server built around a modified go2rtc build and a lightweight Asterisk build using Alpine Linux. 

It combines:
- Optimizations for:
  - Unprivileged container deployment
  - Secure bridge networking
  - Complex NAT traversal
  - Low latency and load times
- Authentication
- Secure media routing
- Key and secret generation
- Notifications (built-in and custom)
- Actions (DTMF, state-aware toggles, webhooks, and links)
- Configurable CSS
- Server-side SIP configuration

While designed primarily as a **mobile notification target**, it also functions well as:
- **A desktop widget** for quick visual confirmation and controlled access.
- **An automation dashboard** with real-time visual confirmation and human reaction.

## Why use OneDoor?
Everyone
- OneDoor is the fastest way to get to your door.
- Get your important, real-time actions right at your fingertips.

SIP and pro camera users:
- No need to set up PBX, just configure your devices.
- Integrate to actions and non-SIP devices on one surface.

Retail camera users:
- Preload and GOP cache significantly reduce load times.
- Access to your doorbell is faster than any other app.
- Give doorbells and 2-way cameras features like multi-caller conferencing that don't exist elsewhere.

---

## 📖 Documentation

Full deployment and configuration guide → **[docs/README.md](docs/README.md)**

- [1. Recommended Hardware](docs/README.md#1-recommended-hardware) — Server requirements, cameras, SIP intercoms
- [2. Deployment](docs/README.md#2-deployment) — Docker setup, network, call modes
- [3. Notifications](docs/README.md#3-notifications) — WebPush, custom hooks, rate limiting
- [4. Actions](docs/README.md#4-actions) — Hooks, toggles, DTMF, links, auth
- [5. Video Fit Configuration](docs/README.md#5-video-fit-configuration-v045) — `dynamic`, `zoom`, `full`
- [6. Keyboard Shortcuts](docs/README.md#6-keyboard-shortcuts-dashboard-mode) — Dashboard mode controls
- [7. Security Model](docs/README.md#7-security-model) — Tokens, isolation, server-side secrets
- [8. Administration](docs/README.md#8-administration) — Users, notifications, runtime config
- [9. Roadmap](docs/README.md#9-roadmap) — Version history and future plans
- [10. Contributions](docs/README.md#10-contributions) — How to contribute

---

## 📸 Interface Preview

OneDoor's interface is intentionally minimal: a single stream.
Only **one** client stream is ever active at a time, keeping CPU/GPU usage extremely low.
Speed comes from **server‑side preload + GOP caching** and rewriting timestamps.

### Mobile App
<img src="screenshots/mobile_view.png" height="380">

### Desktop Widget (Video Preview)

https://github.com/user-attachments/assets/e144d909-67e6-4505-a220-b46c3598fe59

---

## 🚀 Key Features

- **Multi‑door support** — Add as many doors/cameras as you want and swipe between them instantly.
- **Multiple audio modes** —
  - `sip` for the best pure UDP experience
  - `generic` for most doorbells and cameras that can integrate to go2rtc
  - `none` for video‑channel audio without 2‑way talk
- **Per‑door action sets** — Configurable DTMF payloads, private backend webhooks, frontend links, and state‑aware toggle actions for locks, lights, and automations.
- **Deep‑linked notifications** — Alerts take you directly to the door that was pressed.
- **Unified multi‑door config** — Powerful, simple, and self‑explanatory. Legacy SIP‑only configs remain valid.
- **Ultra‑low latency** — Full‑duplex SIP audio + go2rtc WebRTC video tuned for sub‑second response.
- **Perfect notification target** — Tap → live video + audio in under a second.
- **Next‑step actions** — Instantly jump to your NVR, another door, or any external system.
- **Secure by design** — Split‑token signaling, isolated webhooks, no secrets in the browser, no cloud, no telemetry.
- **Zero‑knowledge setup** — No PBX, SIP, RTP, SRTP, or dialplan expertise required.
- **Automatic key + credential generation** — Strong defaults.
- **PWA + desktop widget** — Fast, minimal UI optimized for door response. Also keyboard support.
- **Ecosystem‑friendly** — Works cleanly alongside Home Assistant, Frigate NVR, and existing SIP hardware.
- **Appliance-like design** — Designed to run unattended, accessible to clients behind CGNAT, VPNs, and complex networks.
- **Fast Notifications** — Pure WebPush straight to Apple/Google. No Firebase. No app. Custom hooks accepted.

---

## ⚡ Quick Start

OneDoor docs are optimized with examples for quick deployment using free tier AI agents. Deepseek v4 flash via Cline agent can configure an extensive 40-action OneDoor config in under 5 minutes for about $0.06 with varaibles for tokens and secrets referencing /docs/README.md.

Manually:
1. Copy `docker-compose.yml` and `config.yaml`. Use `makepass.example` to generate your password hash.
2. Modify the files as per the [documentation](docs/README.md).
3. Add OneDoor port `8099` to your reverse proxy with **WebSocket support** and **TLS** enabled.
4. Forward P2P media ports on your gateway.
5. Start the service: `docker compose up -d`

### Minimum Configuration

```yaml
domain:  # "door.yourdomain.com"
docker_host: # "192.168.1.26"

onedoor:
  users:
    - username: #"first_user"
      password_hash: #use makepass.example

moredoors:
  - id: #"front"
    call_mode: #"sip" - sip, generic, or none.
    camera: #"rtsp://admin:password@192.168.1.10:554/cam/realmonitor?channel=1&subtype=1#rtsp_transport=udp#gop=1" string or list
```

---

## ❤️ Why OneDoor Exists
OneDoor started with one goal: take back the seconds that matter by building around the hardware best suited for the task. It naturally evolved to support related hardware in the best ways possible.

OneDoor exists to put you directly inside the critical seconds where hospitality, communication, and safety actually happen.
