# OneDoor 🚪 (Build 011- Pre Release)

Thank you for checking out **OneDoor**. This is a hyper-focused SPA/PWA phone app and desktop widget (frontend + backend) focusing on being the best single door app on earth.

OneDoor is built with a **PBX-first** philosophy. It provides ultra low latency, full duplex audio through a dedicated SIP stack, paired with a high-performance video stream that doesn't hold back the audio.

It’s the perfect ap (or dashboard) to point your Home Assistant door notifications to. Tap the alert and you’re instantly at the door with near‑zero delay and full control.

## 📸 Interface Preview

| Mobile PWA View | Desktop Widget View |
| :---: | :---: |
| ![Mobile View](screenshots/mobile_view.png) | ![Widget View](screenshots/widget_view.png) |

## 🚀 Key Features

* PBX-First Design: Direct integration with Asterisk/FreePBX/Aiphone.
* Ultra-Low Latency: Optimized WebRTC and SIP (JsSIP).
* Full-Duplex Audio: Crystal clear, real-time communication unlike anything in the retail market.
* Action Buttons: Support for 2x configurable actions (DTMF via SIP or local Webhooks).
* Privacy-Centric: Webhooks stay local—secrets, not exposed to the client.
* Form Factor: Optimized as a mobile-first PWA or a slim-width desktop widget.

## 📋 System Requirements

* PBX Server: Local Asterisk or FreePBX instance configured for WebRTC/SRTP.
* Web Security: Domain name with SSL (HTTPS/WSS required for microphone access).
* Network: Port forwarding for UDP RTP range and go2rtc WebRTC ports.
* Docker: Machine running Docker + Docker Compose.
* Media: RTSP camera source and a valid SIP extension, or go2rtc compatable AV device.

## 🛠 Quick Start (How to Install)

1. **Deployment:**
   Copy `docker-compose.yml`, fill `JWT_SECRET` (32+ chars).
   Run: `docker compose up -d`
   If I still don't have docker repo up, clone and run 'docker compose up -d --build'

2. **Generate Password:**
   Run: `docker exec -it onedoor node -e "console.log(require('bcryptjs').hashSync('YOUR_PASSWORD', 10))"`

3. **Configuration:**
   - `docker compose down`
   - Edit `config.yaml`: Paste your hash, set SIP and Webhook details.
   - Edit `go2rtc.yaml`: Add your camera's RTSP source.
   - `docker compose up -d`

4. **Reverse Proxy:**
   Set up Nginx or NPM as per nginx.example.

## 🗺 Roadmap

* Non-PBX Mode: Possible support for users without PBX.
* Landscape View: go2rtc's ffmpeg for now. Optimize later.
* Better Logging: Audit trails and hardware acceleration indicators.

## Updates
* Day one: pre release had an unauthentaced privacy concern fix. Please sync updates.
* Day two: small updates with docs and some TLS and DTLS-SRTP hardening.
* Non-PBX feature research: performance may not meet the OneDoor standard.
* Big things are coming. Nobody should be forced to learn PBX and infra to have a great intercom. v020 will be one single container handling almost everything for the user: asterisk config, keygens, ws routing, etc. Config parser will still allow for more advanced yaml config to any subsystem including connecting external PBX via dialplan. User will only need name, pass, and camera in config. Their NPM instance will need zero advanced settings, just websockets and SSL.

