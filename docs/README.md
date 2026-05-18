# OneDoor: Architecture, Security, and Deployment Guide

This document details the underlying security model, cryptographic isolation, network prerequisites, and optimal hardware configurations for the OneDoor appliance stack.

---

## 1. Security Architecture & Token Isolation

OneDoor operates under a zero-trust model regarding the client browser. Because frontend assets run on edge devices susceptible to local logging or physical compromise, the system maintains strict isolation between client-facing data and infrastructure secrets.

### 1.1 Webhook Secret Obfuscation
Automation webhooks frequently utilize sensitive IP spaces or plaintext bearer tokens. 

* Mechanism: During initialization, parser.py consumes config.yaml and maps actions to onedoor.yaml. Webhook endpoints are stripped of their destination properties and registered on the backend alongside an abstract identifier (action.id).
* Frontend Payload: The backend server (server.js) dynamically filters the configuration schema before delivery. The frontend receives only an unprivileged map, for example: { "id": 1, "label": "Gate Trigger", "type": "hook", "icon": "0" }.
* Execution Path: When a user triggers a webhook, the client issues an authenticated POST request containing only the actionId to /api/action. The backend resolves the ID against its isolated in-memory configuration and executes the outbound HTTP request from the host network, keeping keys completely out of the browser's DOM and network history.

### 1.2 Split-Token WebSocket Proxying
Establishing an active WebRTC session requires a persistent WebSocket (/ws) connection to the internal Asterisk signaling layer. Passing a master JWT via URI query strings introduces a risk of token exposure.

* Dual-Token Topology: Upon authentication, the backend issues a primary API JWT for REST endpoints and a high-entropy, secondary ws_token generated dynamically on startup.
* Blast Radius Containment: The frontend utilizes the ws_token exclusively to upgrade the signaling socket. If a client device is compromised, this token grants zero capability to hit backend management APIs or mutate configurations. Its utility is strictly bound to initiating SIP over WebSocket signaling inside a sandboxed context.

---

2. DEPLOYMENT & INSTALLATION

OneDoor compiles the entire telephony, media routing, and frontend distribution layer into a single, unified container appliance.

2.1 System Requirements
Before initiating deployment, verify your hosting environment satisfies the following baselines:
- Container Runtime: Docker and Docker Compose installed on the host engine.
- External Network Identity: A valid Fully Qualified Domain Name (FQDN) configured with valid TLS certificates via a reverse proxy. WebRTC audio/video signaling requires secure contexts (HTTPS/WSS) to grant camera and microphone permissions in modern browsers.
- Network Routing Control: The ability to explicitly forward and route WAN-side UDP media ports down to your container host.

2.2 Directory Setup
Create a dedicated working directory and place the deployment assets inside:
  mkdir onedoor && cd onedoor

2.3 Configuration and Initialization
1. Open config.yaml and complete the variables embedded in the file (including the targeted external domain, local docker host IP, and your camera parameters).
2. Ensure you run makepass.example to generate the required password hashes before starting the engine.
3. Do the same for docker-compose.yml

2.4 Network Requirements & Topology Validation
- Web Traffic & Signaling: Set up your reverse proxy to forward your OneDoor domain to port 8099 on the docker host. Websocket support and TLS must be enabled.
- Media Pipelines: Ensure your defined WebRTC media ports and external SIP signaling ports are explicitly allowed and forwarded to prevent symmetric NAT/STUN connection failures.
- NAT & Routing Network Testing: OneDoor's signaling and media translation paths are built and hardened for complex routing topologies. The core engine is actively validated running behind Gateway NAT and Docker network NAT layers, while the client frontend interface is continuously tested and verified functional across Carrier-Grade NAT (CGNAT), local subnets, Apple Private Relay, and active Mullvad VPN tunnels.

2.5 Service Lifecycle
Bring the container up in detached mode:
  docker compose up -d

On startup, the container initializes the embedded Asterisk dialplan, creates local crypto keys, provisions internal SIP endpoints, and wires up the go2rtc pipelines.

---

## 3. Hardware & Encoding Specifications

### 3.1 Camera Configuration (go2rtc Pipeline)
The system passes video directly through go2rtc. Refer to the go2rtc Reference: [https://github.com/AlexxIT/go2rtc#camera-experience](https://github.com/AlexxIT/go2rtc#camera-experience)

* Hardware Preference: Dahua IP cameras provide the most compliant, low-overhead RTSP sub-streams.
* Stream Profiles: For sub-second UI rendering, configure your door camera's sub-stream to the following targets:

- Orientation: Portrait
- Resolution: D1 (704x480 / 704x576)
- Video Codec: AVC / H.264
- Bitrate Control: CBR (Constant Bit Rate)
- Keyframe Interval: 1 FPS (GOP = FPS```)

### 3.2 Audio & SIP Endpoint Hardware
* Native Endpoints: Native SIP stations from Fanvil and Grandstream yield the cleanest architectural behavior.
* Edge-Case Validation: Core stability is tested against the Aiphone IX-SS-2G.

---

## 4. DEVELOPMENT ROADMAP & FUTURE WORK

The absolute goal is keeping latency as low as possible and deployment/registration as easy as possible without blooming the UI. We use a fire-and-forget architecture to keep internal dialplans running smoothly.

### 4.1 Version Milestones
- v031: Compliance baselines and system documentation.
- v032: Added frontend "link" actions. While webhooks execute securely from the backend, link actions launch straight from the frontend. To make OneDoor the ideal notification target for door alerts, this allows you to immediately jump to a URL (like your DVR/NVR) if you need to follow a person walking away from the door station. Action types are now explicitly: "hook", "dtmf", or "link".
- v033+: VAPID push notifications for intercom physical button-press events. Super easy registration with zero effect on UI and little to no backend config.

### 4.2 Ongoing Development Needs
There is still work to do hardening the default dialplan. The current quirks work themselves out without breaking functionality, but a user can occasionally get left in a call group if their websocket connection drops out before hanging up. Fixing this cleanly will likely require an internal manager process. Outside help here is greatly appreciated.

### 4.3 More Doors
As OneDoor moved from a prototype to a full-on appliance container, it became apparent that support for more than one door was warranted by the weight of the application. This expansion will come, but only after the core single-door experience is fully mature.

---

## 5. CONTRIBUTION GUIDELINES

PRs will be reviewed and merged if they improve functionality and strictly match the OneDoor mission: A clean, simple, low latency, and powerful door app with minimal config required—the perfect door notification target. 

Any submitted code shall adopt the original MIT license.
