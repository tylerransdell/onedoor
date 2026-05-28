// server.js
const yaml = require('js-yaml');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { createProxyMiddleware } = require('http-proxy-middleware');

// --- NOTIFY ---
const EventEmitter = require('events');
const webPush = require('web-push');
const notifier = new EventEmitter();

// --- PUSH CONFIG (Declarations Only) ---
const VAPID_PATH = '/vapid/vapid-keys.json';
const SUBS_PATH  = '/vapid/push-subs.json';
let vapidKeys = { publicKey: null, privateKey: null, subject: '' };
let PUSH_ENABLED = false;
let subscriptions = {};

// Helper: Generate/fix VAPID keys based on domain (defined early, called later)
function ensureVapidKeys(domain) {
    if (fs.existsSync(VAPID_PATH)) {
        try {
            const existing = JSON.parse(fs.readFileSync(VAPID_PATH, 'utf8'));
            const expectedSubject = `mailto:admin@${domain}`;
            if (existing.subject !== expectedSubject) {
                console.log(`🔑 Updating VAPID subject: ${existing.subject} → ${expectedSubject}`);
                existing.subject = expectedSubject;
                fs.writeFileSync(VAPID_PATH, JSON.stringify(existing, null, 2));
            }
            return existing;
        } catch(e) { console.warn('⚠️ Failed to load VAPID keys, will regenerate'); }
    }
    
    console.log(`🔑 Generating VAPID keys for domain: ${domain}`);
    const keys = webPush.generateVAPIDKeys();
    const newKeys = {
        publicKey: keys.publicKey,
        privateKey: keys.privateKey,
        subject: `mailto:admin@${domain}`
    };
    
    try {
        fs.writeFileSync(VAPID_PATH, JSON.stringify(newKeys, null, 2));
        console.log('✅ VAPID keys saved');
    } catch(e) { console.warn('⚠️ Could not save VAPID keys'); }
    return newKeys;
}

// --- WS TOKEN ---
const WS_TOKEN = process.env.WS_TOKEN || crypto.randomBytes(16).toString('hex');

// --- CONFIG LOAD (Must happen BEFORE using config) ---
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

// --- PUSH INIT (NOW SAFE: config is loaded) ---
if (config?.domain) {
    try {
        vapidKeys = ensureVapidKeys(config.domain);
        webPush.setVapidDetails(vapidKeys.subject, vapidKeys.publicKey, vapidKeys.privateKey);
        PUSH_ENABLED = !!(vapidKeys.publicKey && vapidKeys.privateKey);
        if (PUSH_ENABLED) console.log(`🔔 Push: Enabled (subject: ${vapidKeys.subject})`);
    } catch(e) { console.warn('⚠️ Push: Failed to initialize VAPID:', e.message); }
}

// Load subscriptions cache
if (fs.existsSync(SUBS_PATH)) {
    try { subscriptions = JSON.parse(fs.readFileSync(SUBS_PATH, 'utf8')); } catch{}
}

// Debounced save
let saveTimeout;
const saveSubs = () => {
    if (!PUSH_ENABLED) return;
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        try { fs.writeFileSync(SUBS_PATH, JSON.stringify(subscriptions)); } catch{}
    }, 500);
};
// --- END PUSH INIT ---

// --- EXPRESS SETUP ---
const app = express();
app.set('trust proxy', true);
app.use(express.json());

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

// --- PROXIES ---
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

app.use('/go2rtc', authenticateJWT, go2rtcProxy);
app.use('/ws', asteriskProxy);
app.use(express.static(path.join(__dirname, 'public')));

// --- CLIENT CONFIG ---
const getClientConfig = (user, token) => {
    // ✅ Check if this user has active push subscriptions on the server
    const hasActiveSub = PUSH_ENABLED && 
                         subscriptions[user.username] && 
                         Object.keys(subscriptions[user.username]).length > 0;

    return {
        token,
        ws_token: WS_TOKEN,
        vapid_public_key: PUSH_ENABLED ? vapidKeys.publicKey : null,

        // ✅ Send push status to frontend for mismatch detection
        push_status: PUSH_ENABLED ? (hasActiveSub ? 'active' : 'missing') : 'disabled',

        video: { name: config.video.webrtc_name },
        pbx: {
            dial_extension: config.pbx.dial_extension,
            user_agent: config.pbx.user_agent,
            username: user.pbx_username,
            password: user.pbx_password
        },
        actions: (config.actions || []).map(action => {
            const clientAction = { 
                id: action.id, 
                label: action.label, 
                icon: action.icon, 
                type: action.type 
            };
            if (action.type === 'dtmf') clientAction.payload = action.payload;
            if (action.type === 'link') clientAction.url = action.url;
            return clientAction;
        })
    };
};

// --- API ROUTES ---
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

app.post('/api/register-notification', authenticateJWT, (req, res) => {
    if (!PUSH_ENABLED) return res.status(503).json({ error: 'Push not configured' });
    const { subscription } = req.body;
    if (!subscription?.endpoint) return res.status(400).json({ error: 'Invalid subscription' });

    let username;
    try { username = jwt.verify(req.headers.authorization.slice(7), JWT_SECRET).username; }
    catch { return res.status(401).send('Invalid token'); }

    const hash = crypto.createHash('md5').update(subscription.endpoint + (req.headers['user-agent'] || '')).digest('hex').slice(0, 8);
    const userSubs = subscriptions[username] || {};
    let deviceId = Object.entries(userSubs).find(([, s]) => s.hash === hash)?.[0];
    if (!deviceId) { let i = 1; deviceId = `${username}-${i}`; while (userSubs[deviceId]) { i++; deviceId = `${username}-${i}`; } }

    userSubs[deviceId] = { endpoint: subscription.endpoint, keys: subscription.keys, hash, active: true, last_seen: new Date().toISOString() };
    subscriptions[username] = userSubs;
    saveSubs();
    console.log(`🔔 Registered: ${username}/${deviceId}`);
    res.json({ success: true, deviceId });
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

// --- WEBSOCKET UPGRADE ---
const server = http.createServer(app);

server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
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
    if (url.pathname === '/ws') {
        const wsToken = url.searchParams.get('ws_token');
        if (!wsToken || wsToken !== WS_TOKEN) {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
        }
        asteriskProxy.upgrade(req, socket, head);
        return;
    }
    socket.destroy();
});

// --- PUSH DISPATCHER (Listens to internal events) ---
notifier.on('send-push', async ({ target, message }) => {
    if (!PUSH_ENABLED) {
        console.warn('⚠️ Push disabled: cannot send');
        return;
    }

    // Resolve targets: "all" = every registered username
    const targets = target === 'all' ? Object.keys(subscriptions) : [target];
    console.log(`🔔 Dispatching to ${targets.length} target(s): ${targets.join(', ')}`);

    for (const user of targets) {
        // Skip if user has no subscriptions
        if (!subscriptions[user]) {
            console.warn(`⚠️ No subscriptions for user: ${user}`);
            continue;
        }

        // Convert object values to array for iteration
        const subsArray = Object.values(subscriptions[user] || {});
        if (subsArray.length === 0) {
            console.warn(`⚠️ No active subscriptions for user: ${user}`);
            continue;
        }

        let success = 0, failed = 0;

        // Process each subscription in parallel
        const results = await Promise.all(subsArray.map(async (sub) => {
            try {
                await webPush.sendNotification(sub, message);
                success++;
                console.log(`✅ Push sent: ${user} → ${sub.endpoint.substring(0, 40)}...`);
                return sub; // Keep valid subscription
            } catch (e) {
                failed++;

                // Log details for debugging 4xx errors
                if ([400, 403, 404, 410].includes(e.statusCode)) {
                    console.warn(`❌ Push failed: ${user} → ${e.statusCode}`);
                    console.warn(`   Endpoint: ${sub.endpoint.substring(0, 60)}...`);
                    console.warn(`   Payload size: ${message.length} bytes`);
                    if (e.body) console.warn(`   Response: ${e.body}`);
                }

                // ✅ AUTO-PRUNE: Delete subscription on VAPID mismatch or dead endpoint
                // VapidPkHashMismatch (400) means keys changed → subscription is permanently invalid
                if (e.statusCode === 404 || e.statusCode === 410 || 
                    (e.statusCode === 400 && e.body?.includes('VapidPkHashMismatch'))) {
                    console.log(`🗑️ Pruned invalid endpoint: ${user} → ${e.statusCode} ${e.body?.includes('VapidPkHashMismatch') ? '(VAPID mismatch)' : ''}`);
                    return null; // Mark for removal
                }

                // Keep subscription for retry on transient errors (5xx, network issues)
                return sub;
            }
        }));

        // Filter out nulls (pruned endpoints) and rebuild the user's subscription object
        const validSubs = results.filter(Boolean);
        if (validSubs.length === 0) {
            // No valid subs left → remove user entirely
            delete subscriptions[user];
            console.log(`🗑️ Removed user ${user}: no valid subscriptions`);
        } else if (validSubs.length < subsArray.length) {
            // Some subs were pruned → rebuild object preserving deviceId keys
            const rebuilt = {};
            for (const [devId, sub] of Object.entries(subscriptions[user])) {
                if (validSubs.includes(sub)) {
                    rebuilt[devId] = sub;
                }
            }
            subscriptions[user] = rebuilt;
            console.log(`🔄 Updated ${user}: ${subsArray.length - validSubs.length} pruned, ${validSubs.length} remaining`);
        }

        console.log(`📊 ${user}: ${success} sent, ${failed} failed`);
    }

    // Debounced write to disk
    saveSubs();
});
// --- END PUSH DISPATCHER ---

// --- SNOOZE STATE ---
const snooze = { allUntil: 0, sameLast: new Map() };
setInterval(() => {
    const threshold = Date.now()/1000 - ((config.notifications?.snooze_same || 60) * 2);
    for (const [key, ts] of snooze.sameLast) { if (ts < threshold) snooze.sameLast.delete(key); }
}, 5 * 60 * 1000);

// --- WEBHOOK SERVER (8199) ---
const hookApp = require('express')();
hookApp.use(require('express').json());

// --- SANITIZE PAYLOAD FOR IOS/ANDROID COMPATIBILITY ---
const sanitizePayload = (payload, domain) => {
    const clean = { ...payload };

    // Ensure URL is absolute HTTPS
    if (clean.url) {
        if (!clean.url.startsWith('https://')) {
            clean.url = `https://${domain}${clean.url.startsWith('/') ? clean.url : '/' + clean.url}`;
        }
        // Remove fragments/hash for iOS compatibility
        clean.url = clean.url.split('#')[0];
    }

    // Ensure icon/badge are absolute URLs
    if (clean.icon && !clean.icon.startsWith('http')) {
        clean.icon = `https://${domain}${clean.icon.startsWith('/') ? clean.icon : '/' + clean.icon}`;
    }
    if (clean.badge && !clean.badge.startsWith('http')) {
        clean.badge = `https://${domain}${clean.badge.startsWith('/') ? clean.badge : '/' + clean.badge}`;
    }

    // Trim body to avoid Apple 4KB limit
    if (clean.body && clean.body.length > 500) {
        clean.body = clean.body.substring(0, 497) + '...';
    }

    // Ensure title exists (iOS requires it)
    if (!clean.title) clean.title = 'OneDoor';

    return clean;
};

// --- WEBHOOK HANDLER (Port 8199) ---
hookApp.post('/webhook', (req, res) => {
    let {
        target = 'all',
        payload = { body: 'Door event' },
        snooze_all = config.notifications?.snooze_all || 30,
        snooze_same = config.notifications?.snooze_same || 30
    } = req.body;

    // ✅ Resolve 'default' placeholder for BOTH URL & Icon (iOS requires absolute HTTPS)
    const domain = config.domain || 'localhost';
    if (payload.url?.includes('://default')) {
        payload.url = payload.url.replace('default', domain);
    }
    if (payload.icon?.includes('://default')) {
        payload.icon = payload.icon.replace('default', domain);
    }

    const now = Date.now() / 1000;

    // Policy: Global cooldown
    if (snooze_all > 0 && now < snooze.allUntil) {
        console.log(`🔕 Snoozed All: ${target} (until ${new Date(snooze.allUntil*1000).toISOString()})`);
        return res.status(200).send('Snoozed All');
    }

    // Policy: Dedupe identical payloads
    const key = `${target}:${JSON.stringify(payload)}`;
    if (snooze_same > 0 && snooze.sameLast.has(key) && now < (snooze.sameLast.get(key) + snooze_same)) {
        console.log(`🔕 Snoozed Same: ${key}`);
        return res.status(200).send('Snoozed Same');
    }

    // Update state
    if (snooze_all > 0) snooze.allUntil = now + snooze_all;
    if (snooze_same > 0) snooze.sameLast.set(key, now);

    // Sanitize payload for cross-platform compatibility (trims, ensures absolute URLs, etc.)
    const cleanPayload = sanitizePayload(payload, domain);
    const message = JSON.stringify(cleanPayload);

    console.log(`🎣 Webhook: ${target} → ${JSON.stringify(cleanPayload)}`);

    // Emit to dispatcher (defined elsewhere in server.js)
    notifier.emit('send-push', { target, message });
    res.sendStatus(202);
});

hookApp.listen(8199, '0.0.0.0', () => console.log('🎣 Webhook: 0.0.0.0:8199'));

// --- START MAIN SERVER ---
const PORT = config.server.listen_port || 8099;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`--- OneDoor Backend ---`);
    console.log(`🚀 Port: ${PORT}`);
    console.log(`🛡️ JWT: active`);
    console.log(`🎥 go2rtc: /go2rtc → 127.0.0.1:1984`);
    console.log(`📞 Asterisk WS: /ws → 127.0.0.1:8088`);
});
