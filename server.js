const yaml = require('js-yaml');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { createProxyMiddleware } = require('http-proxy-middleware');

// 1. INITIALIZATION & CONFIG MAPPING
const CONFIG_PATH = process.env.CONFIG_PATH || '/app/config.yaml';
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    console.error("❌ FATAL: JWT_SECRET environment variable is not set.");
    process.exit(1);
}

let config;
try {
    config = yaml.load(fs.readFileSync(CONFIG_PATH, 'utf8'));
    console.log("✅ Configuration loaded successfully.");
} catch (e) {
    console.error("❌ FATAL: Could not read config.yaml:", e.message);
    process.exit(1);
}

const app = express();
app.set('trust proxy', true);
app.use(express.json());

// 2. THE SECURITY GATE (go2rtc Authenticated Proxy)
// Intercepts /go2rtc calls, verifies JWT, then tunnels to the internal container
app.use('/go2rtc', (req, res, next) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return res.status(401).send('Unauthorized');
    
    try {
        jwt.verify(auth.slice(7), JWT_SECRET);
        next();
    } catch (e) { 
        res.status(401).send('Invalid or Expired Token'); 
    }
}, createProxyMiddleware({
    target: 'http://go2rtc:1984', // Internal Docker DNS
    pathRewrite: { '^/go2rtc': '' },
    ws: true, // Enables WebRTC/WebSocket signaling through the proxy
    logLevel: 'warn'
}));

// 3. STATIC ASSETS
app.use(express.static(path.join(__dirname, 'public')));

// 4. HELPER: GENERATE CLIENT PACKAGE
// This sends the frontend exactly what it needs and nothing more (security)
const getClientConfig = (user, token) => ({
    token,
    video: { 
        name: config.video.webrtc_name 
    },
    pbx: {
        dial_extension: config.pbx.dial_extension,
        user_agent: config.pbx.user_agent,
        username: user.pbx_username,
        password: user.pbx_password
    },
    // Only send action labels/icons to the UI; keep URLs hidden on backend
    actions: (config.actions || []).map(({ id, label, icon, type, payload }) => ({
        id, label, icon, type, payload
    }))
});

// 5. AUTHENTICATION ROUTES
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = config.users.find(u => u.username === username);

    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    const expiry = `${config.server.token_expiry_days || 30}d`;
    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: expiry });
    
    console.log(`👤 User logged in: ${username} (Expiry: ${expiry})`);
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
    } catch (e) { 
        res.status(401).send(); 
    }
});

// 6. ACTION DISPATCHER (IoT Hooks)
// Executes sensitive URLs (like opening a relay) purely from the backend
app.post('/api/action', async (req, res) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return res.status(401).send();

    try {
        jwt.verify(auth.slice(7), JWT_SECRET);
        const { actionId } = req.body;
        const action = config.actions.find(a => a.id === actionId);

        if (action && action.type === 'hook') {
            console.log(`🔌 Executing hook: ${action.label} (${action.url})`);
            
            // Background fetch to the local IoT device
            fetch(action.url, { method: 'POST' }).catch(err => {
                console.error(`❌ Hook failed: ${action.label}`, err.message);
            });

            return res.json({ success: true });
        }
        res.status(400).json({ error: 'Action not found or invalid type' });
    } catch (e) { 
        res.status(401).send(); 
    }
});

// 7. START SERVER
const PORT = config.server.listen_port || 8099;
http.createServer(app).listen(PORT, '0.0.0.0', () => {
    console.log(`--- OneDoor Secure Backend ---`);
    console.log(`🚀 Service running on port ${PORT}`);
    console.log(`🛡️ JWT Security active`);
    console.log(`🎥 Video proxy linked to go2rtc:1984`);
});
