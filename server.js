// server.js
const yaml = require('js-yaml');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto'); // ← ADD: for WS_TOKEN generation
const { createProxyMiddleware } = require('http-proxy-middleware');

// Generate or load WS token silently — NEVER logged
const WS_TOKEN = process.env.WS_TOKEN || crypto.randomBytes(16).toString('hex'); // ← ADD

// 1. CONFIG & SECRETS
const CONFIG_PATH = process.env.CONFIG_PATH || '/app/onedoor.yaml';
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    console.error("❌ FATAL: JWT_SECRET environment variable is not set.");
    process.exit(1);
}

let config;
try {
    config = yaml.load(fs.readFileSync(CONFIG_PATH, 'utf8'));
    console.log("✅ Configuration loaded.");
} catch (e) {
    console.error("❌ FATAL: Config error:", e.message);
    process.exit(1);
}

// 2. EXPRESS SETUP
const app = express();
app.set('trust proxy', true);
app.use(express.json());

// JWT Helper
const authenticateJWT = (req, res, next) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return res.status(401).send('Unauthorized');
    try {
        jwt.verify(auth.slice(7), JWT_SECRET);
        next();
    } catch {
        res.status(401).send('Invalid token');
    }
};

// 3. PROXIES (ws: false — we handle upgrades manually)
const go2rtcProxy = createProxyMiddleware({
    target: 'http://127.0.0.1:1984',
    pathRewrite: { '^/go2rtc': '' },
    ws: false,
    changeOrigin: true,
    logLevel: 'warn'
});

const asteriskProxy = createProxyMiddleware({
    target: 'http://127.0.0.1:8088',
    ws: false,
    changeOrigin: true,
    logLevel: 'warn'
});

// Mount HTTP fallbacks (won't be used for WS, but required by middleware)
app.use('/go2rtc', authenticateJWT, go2rtcProxy);
app.use('/ws', asteriskProxy); // No auth here — handled in upgrade

// 4. STATIC + API ROUTES
app.use(express.static(path.join(__dirname, 'public')));

const getClientConfig = (user, token) => ({
    token,
    ws_token: WS_TOKEN, // ← ADD: return WS token to frontend
    video: { name: config.video.webrtc_name },
    pbx: {
        dial_extension: config.pbx.dial_extension,
        user_agent: config.pbx.user_agent,
        username: user.pbx_username,
        password: user.pbx_password
    },
    actions: (config.actions || []).map(({ id, label, icon, type, payload }) => ({
        id, label, icon, type, payload
    }))
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = config.users.find(u => u.username === username);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    const expiry = `${config.server.token_expiry_days || 30}d`;
    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: expiry });
    console.log(`👤 Login: ${username} (expires ${expiry})`);
    res.json(getClientConfig(user, token));
});

app.get('/api/verify', (req, res) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return res.status(401).send();
    try {
        const payload = jwt.verify(auth.slice(7), JWT_SECRET);
        const user = config.users.find(u => u.username === payload.username);
        if (!user) throw new Error('User not found');
        res.json({ valid: true, ...getClientConfig(user, auth.slice(7)) });
    } catch {
        res.status(401).send();
    }
});

app.post('/api/action', async (req, res) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return res.status(401).send();
    try {
        jwt.verify(auth.slice(7), JWT_SECRET);
        const { actionId } = req.body;
        const action = config.actions.find(a => a.id === actionId);
        if (action?.type === 'hook') {
            console.log(`🔌 Hook: ${action.label}`);
            fetch(action.url, { method: 'POST' }).catch(err => console.error('Hook failed:', err.message));
            return res.json({ success: true });
        }
        res.status(400).json({ error: 'Action not found' });
    } catch {
        res.status(401).send();
    }
});

// 5. WEBSOCKET UPGRADE HANDLER
const server = http.createServer(app);

server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    // go2rtc: /go2rtc/* — JWT via Authorization header (unchanged)
    if (url.pathname.startsWith('/go2rtc')) {
        const auth = req.headers.authorization;
        if (!auth?.startsWith('Bearer ') || !jwt.verify(auth.slice(7), JWT_SECRET)) {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
        }
        go2rtcProxy.upgrade(req, socket, head);
        return;
    }

    // Asterisk: /ws — WS_TOKEN via query param ?ws_token= (CHANGED)
    if (url.pathname === '/ws') {
        const wsToken = url.searchParams.get('ws_token'); // ← CHANGED: ws_token param
        if (!wsToken || wsToken !== WS_TOKEN) { // ← CHANGED: compare to WS_TOKEN
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
        }
        asteriskProxy.upgrade(req, socket, head);
        return;
    }

    // Unknown path
    socket.destroy();
});

// 6. START
const PORT = config.server.listen_port || 8099;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`--- OneDoor Backend ---`);
    console.log(`🚀 Port: ${PORT}`);
    console.log(`🛡️ JWT: active`);
    console.log(`🎥 go2rtc: /go2rtc → 127.0.0.1:1984`);
    console.log(`📞 Asterisk WS: /ws → 127.0.0.1:8088`);
    // Intentionally NO console.log(WS_TOKEN)
});
