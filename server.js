const yaml = require('js-yaml');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const http = require('http');

// 1. LOAD CONFIG
const CONFIG_PATH = process.env.CONFIG_PATH || '/app/config.yaml';
let config;
try {
    config = yaml.load(fs.readFileSync(CONFIG_PATH, 'utf8'));
    console.log("✅ Config Loaded Successfully");
} catch (e) {
    console.error("❌ Config Load Error:", e.message);
    process.exit(1);
}

const app = express();
app.set('trust proxy', true);
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error("❌ JWT_SECRET Env Var Missing");
    process.exit(1);
}

// 2. PORTABLE CLIENT CONFIG DATA
// We map the config to a sanitized version for the phone
const getClientConfig = (user) => ({
    video: { name: config.video.webrtc_name },
    pbx: {
        dial_extension: config.pbx.dial_extension,
        user_agent: config.pbx.user_agent,
        username: user.pbx_username,
        password: user.pbx_password
    },
    // Slice to 2 max, and remove the 'url' property for security
    actions: (config.actions || []).slice(0, 2).map(({ url, ...safeAction }) => safeAction)
});

// 3. AUTH ROUTES
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = config.users.find(u => u.username === username);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, ...getClientConfig(user) });
});

app.get('/api/verify', (req, res) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return res.status(401).send();
    try {
        const payload = jwt.verify(auth.slice(7), JWT_SECRET);
        const user = config.users.find(u => u.username === payload.username);
        res.json({ valid: true, ...getClientConfig(user) });
    } catch (e) { res.status(401).send(); }
});

// 4. THE ACTION PROXY (The "Free Range" Engine)
app.post('/api/action', async (req, res) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return res.status(401).send();

    try {
        jwt.verify(auth.slice(7), JWT_SECRET);
        const { actionId } = req.body;
        
        // Find action in the original config (which contains the URL)
        const action = config.actions.find(a => a.id === actionId);

        if (action && action.type === 'hook') {
            console.log(`🚀 [ACTION] ${action.label} -> Triggering ${action.url}`);
            
            // Execute the webhook from the server environment
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

            fetch(action.url, { 
                method: 'POST', 
                signal: controller.signal 
            }).catch(err => console.error(`⚠️ Hook failed: ${err.message}`));

            return res.json({ success: true });
        }
        res.status(400).json({ error: 'Invalid Action ID or Type' });
    } catch (e) { res.status(401).send(); }
});

// 5. START SERVER
http.createServer(app).listen(config.server.listen_port, '0.0.0.0', () => {
    console.log(`🚀 OneDoor Portable Backend: Port ${config.server.listen_port}`);
});
