# OneDoor 🚪  
(now with more doors and audio options - see "moredoors" branch for pre-release)

NVRs are great at recording, tracking, and reviewing events — even several at once.

OneDoor is something completely different.

OneDoor is built for **tactical‑speed door awareness**: the fastest possible video, the fastest possible audio, and instant control of your entryway. It’s the perfect real‑time notification target.

Tap a notification and you’re at your door in under a second, with **instant WebRTC video** and **full‑duplex SIP audio**. If the app ever loses scope of the scene, your next step (another door, your NVR, or any external system) is always one button away.

It plays beautifully with NVRs, home automation systems, and professional SIP door stations — without forcing you to learn telecom internals.

Build 030 introduced a single unified container that assembles the entire intercom system for you: Asterisk, go2rtc, WebRTC, SIP, DTLS, websocket routing, backend, frontend, and all key generation — fused into one appliance‑grade package.

You provide only:

- Camera URL
- Domain / IP
- Username + password hash

…and OneDoor builds the whole stack automatically.

The goal: a clean, ultra‑fast door application that works seamlessly with your NVR and automation stack. Modern, reliable, and tuned to outperform anything in its class.


---

## 📸 Interface Preview

| Mobile PWA | Desktop Widget |
| :---: | :---: |
| ![Mobile View](screenshots/mobile_view.png) | ![Widget View](screenshots/widget_view.png) |

---

## 🚀 Key Features

- **Unified container** — Complete intercom system in one step.
- **Ultra‑low latency** — Full‑duplex SIP audio + go2rtc WebRTC video tuned for sub‑second response.
- **Perfect notification target** — Tap → live video + audio in under a second.
- **Next‑step actions** — Instantly jump to your NVR, another door, or any external system.
- **Secure by design** — Split‑token signaling, isolated webhooks, no secrets in the browser, no cloud, no telemetry.
- **Zero‑knowledge setup** — No PBX, SIP, RTP, SRTP, or dialplan expertise required.
- **Automatic key + credential generation** — Strong defaults, no manual crypto handling.
- **PWA + desktop widget** — Fast, minimal UI optimized for door response.
- **Action system** — DTMF commands, backend webhooks, or frontend links for NVR jumps and automations.
- **Ecosystem‑friendly** — Works cleanly alongside Home Assistant, Frigate, NVRs, and existing SIP hardware.
- **Appliance‑grade reliability** — Designed to run unattended, behind NAT, VPNs, and complex networks.
- **Fast Notifications** — Pure WebPush straight to Apple/Google. No Firebase. No app. Custom hooks included.
---

## ❤️ Why OneDoor Exists

Take control of your door. Tactical‑speed door communication and control shouldn’t require telecom experience or fighting through some weird, locked‑down, enterprise‑grade maze designed to keep you dependent on their ecosystem.

OneDoor exists to make **professional‑grade door communication simple, fast, private, and modern** — while staying fully local, fully open, and fully in your control.

It’s built for people who want the speed of a dedicated intercom, the flexibility of open ecosystems, and the confidence of running everything on their own hardware.
