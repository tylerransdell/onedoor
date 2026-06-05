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

// Helper: Generate/fix VAPID keys based on domain
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

// --- CONFIG LOAD ---
const CONFIG_PATH = process.env.CONFIG_PATH || '/app/onedoor.yaml';
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    console.error("❌ FATAL: JWT_SECRET environment variable is not set.");
    process.exit(1);
}

let config;
try {
    config = yaml.load(fs.readFileSync(CONFIG_PATH, 'utf8'));
    // Ensure nested objects exist to prevent crashes if YAML is malformed
    if (!config.global) config.global = {};
    if (!config.doors) config.doors = [];
    console.log("✅ Configuration loaded.");
} catch (e) {
    console.error("❌ FATAL: Config error:", e.message);
    process.exit(1);
}

// --- PUSH INIT ---
if (config.global?.domain) {
    try {
        vapidKeys = ensureVapidKeys(config.global.domain);
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
    const hasActiveSub = PUSH_ENABLED &&
                         subscriptions[user.username] &&
                         Object.keys(subscriptions[user.username]).length > 0;

    return {
        token,
        ws_token: WS_TOKEN,
        vapid_public_key: PUSH_ENABLED ? vapidKeys.publicKey : null,
        push_status: PUSH_ENABLED ? (hasActiveSub ? 'active' : 'missing') : 'disabled',

        pbx: {
            user_agent: config.global.pbx?.user_agent || 'OneDoor',
            username: user.pbx_username,
            password: user.pbx_password
        },

        doors: (config.doors || []).map(door => ({
            id: door.id,
            webrtc_name: door.webrtc_name,
            call_mode: door.call_mode,
            dial_extension: door.dial_extension,
            actions: (door.actions || []).map(action => {
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
        }))
    };
};

// --- API ROUTES ---
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = config.global.users?.find(u => u.username === username);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    const expiry = `${config.global.server?.token_expiry_days || 30}d`;
    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: expiry });
    console.log(`👤 Login: ${username} (expires ${expiry})`);
    res.json(getClientConfig(user, token));
});

app.get('/api/verify', (req, res) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return res.status(401).send();
    try {
        const payload = jwt.verify(auth.slice(7), JWT_SECRET);
        const user = config.global.users?.find(u => u.username === payload.username);
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
        const { doorId, actionId } = req.body;

        if (!doorId || !actionId) {
            return res.status(400).json({ error: 'Missing doorId or actionId' });
        }

        const door = (config.doors || []).find(d => d.id === doorId);
        if (!door) {
            return res.status(404).json({ error: 'Door not found' });
        }

        const action = (door.actions || []).find(a => a.id === actionId);

        if (action?.type === 'hook') {
            console.log(`🔌 Hook: [${doorId}] ${action.label}`);
            fetch(action.url, { method: 'POST' }).catch(err => console.error('Hook failed:', err.message));
            return res.json({ success: true });
        }

        res.status(400).json({ error: 'Action not found or not a backend hook' });

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

// --- PUSH DISPATCHER ---
notifier.on('send-push', async ({ target, message }) => {
    if (!PUSH_ENABLED) {
        console.warn('⚠️ Push disabled: cannot send');
        return;
    }

    const targets = target === 'all' ? Object.keys(subscriptions) : [target];
    console.log(`🔔 Dispatching to ${targets.length} target(s): ${targets.join(', ')}`);

    for (const user of targets) {
        if (!subscriptions[user]) {
            console.warn(`⚠️ No subscriptions for user: ${user}`);
            continue;
        }

        const subsArray = Object.values(subscriptions[user] || {});
        if (subsArray.length === 0) {
            console.warn(`⚠️ No active subscriptions for user: ${user}`);
            continue;
        }

        let success = 0, failed = 0;

        const results = await Promise.all(subsArray.map(async (sub) => {
            try {
                await webPush.sendNotification(sub, message);
                success++;
                console.log(`✅ Push sent: ${user} → ${sub.endpoint.substring(0, 40)}...`);
                return sub;
            } catch (e) {
                failed++;

                if ([400, 403, 404, 410].includes(e.statusCode)) {
                    console.warn(`❌ Push failed: ${user} → ${e.statusCode}`);
                    console.warn(`   Endpoint: ${sub.endpoint.substring(0, 60)}...`);
                    console.warn(`   Payload size: ${message.length} bytes`);
                    if (e.body) console.warn(`   Response: ${e.body}`);
                }

                if (e.statusCode === 404 || e.statusCode === 410 ||
                    (e.statusCode === 400 && e.body?.includes('VapidPkHashMismatch'))) {
                    // Fixed typo: e.statusCod -> e.statusCode
                    console.log(`🗑️ Pruned invalid endpoint: ${user} → ${e.statusCode} ${e.body?.includes('VapidPkHashMismatch') ? '(VAPID mismatch)' : ''}`);
                    return null;
                }

                return sub;
            }
        }));

        const validSubs = results.filter(Boolean);
        if (validSubs.length === 0) {
            delete subscriptions[user];
            console.log(`🗑️ Removed user ${user}: no valid subscriptions`);
        } else if (validSubs.length < subsArray.length) {
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

    saveSubs();
});

// --- SNOOZE STATE ---
const snooze = { allUntil: 0, sameLast: new Map() };
setInterval(() => {
    const threshold = Date.now()/1000 - ((config.global.notifications?.snooze_same || 60) * 2);
    for (const [key, ts] of snooze.sameLast) { if (ts < threshold) snooze.sameLast.delete(key); }
}, 5 * 60 * 1000);

// --- WEBHOOK SERVER (8199) ---
const hookApp = require('express')();
hookApp.use(require('express').json());

const sanitizePayload = (payload, domain) => {
    const clean = { ...payload };

    if (clean.url) {
        if (!clean.url.startsWith('https://')) {
            clean.url = `https://${domain}${clean.url.startsWith('/') ? clean.url : '/' + clean.url}`;
        }
        clean.url = clean.url.split('#')[0];
    }

    if (clean.icon && !clean.icon.startsWith('http')) {
        clean.icon = `https://${domain}${clean.icon.startsWith('/') ? clean.icon : '/' + clean.icon}`;
    }
    if (clean.badge && !clean.badge.startsWith('http')) {
        clean.badge = `https://${domain}${clean.badge.startsWith('/') ? clean.badge : '/' + clean.badge}`;
    }

    if (clean.body && clean.body.length > 500) {
        clean.body = clean.body.substring(0, 497) + '...';
    }

    if (!clean.title) clean.title = 'OneDoor';

    return clean;
};

// --- 🆕 SMART WEBHOOK ROUTE ---
hookApp.post('/webhook', (req, res) => {
    // Extract door/extension first to determine if it's a doorbell event
    const { extension, door } = req.body;
    
    let {
        target = 'all',
        payload = {}, // Start empty, we will build it dynamically if it's a doorbell
        snooze_all = config.global.notifications?.snooze_all || 30,
        snooze_same = config.global.notifications?.snooze_same || 30
    } = req.body;

    let doorConfig = null;

    // --- DOORBELL LOGIC (Extension or Door ID provided) ---
    if (extension !== undefined || door !== undefined) {
        // 1. Find the door in onedoor.yaml
        if (extension !== undefined) {
            doorConfig = (config.doors || []).find(d => d.dial_extension == extension);
        } else if (door !== undefined) {
            doorConfig = (config.doors || []).find(d => d.id === door);
        }

        // 2. Build the payload dynamically based on the door config
        if (doorConfig) {
            payload.title = payload.title || `${doorConfig.id.charAt(0).toUpperCase() + doorConfig.id.slice(1)} Doorbell`;
            payload.body = payload.body || 'Someone is at the door';
            payload.icon = payload.icon || `https://default/icons/${doorConfig.id}.png`;
            payload.url = `https://default?door=${doorConfig.id}`; // Auto deep-link!
            console.log(`🎣 Doorbell: Ext ${extension || 'N/A'} -> Door ${doorConfig.id}`);
        } else {
            // Fallback if extension isn't found in config
            payload.title = payload.title || 'Doorbell';
            payload.body = payload.body || 'Someone is at the door';
            console.log(`⚠️ Doorbell: Ext ${extension || door} not found in config!`);
        }
    } 
    // --- GENERIC WEBHOOK LOGIC (No extension/door provided) ---
    else {
        if (!payload.body) payload.body = 'Door event';
        payload.title = payload.title || 'Notification';
        console.log(`🎣 Generic Webhook: ${target} → ${JSON.stringify(payload)}`);
    }

    // --- SNOOZE & SANITIZE LOGIC ---
    const domain = config.global.domain || 'localhost';
    if (payload.url?.includes('://default')) {
        payload.url = payload.url.replace('default', domain);
    }
    if (payload.icon?.includes('://default')) {
        payload.icon = payload.icon.replace('default', domain);
    }

    const now = Date.now() / 1000;

    if (snooze_all > 0 && now < snooze.allUntil) {
        console.log(`🔕 Snoozed All: ${target} (until ${new Date(snooze.allUntil*1000).toISOString()})`);
        return res.status(200).send('Snoozed All');
    }

    // Include door ID in the dedupe key so Front doesn't snooze Side
    const doorId = doorConfig?.id || 'generic';
    const key = `${target}:${doorId}:${JSON.stringify(payload)}`;
    
    if (snooze_same > 0 && snooze.sameLast.has(key) && now < (snooze.sameLast.get(key) + snooze_same)) {
        console.log(`🔕 Snoozed Same: ${key}`);
        return res.status(200).send('Snoozed Same');
    }

    if (snooze_all > 0) snooze.allUntil = now + snooze_all;
    if (snooze_same > 0) snooze.sameLast.set(key, now);

    const cleanPayload = sanitizePayload(payload, domain);
    const message = JSON.stringify(cleanPayload);

    console.log(`🎣 Webhook: [${doorId}] ${target} → ${JSON.stringify(cleanPayload)}`);

    notifier.emit('send-push', { target, message });
    res.sendStatus(202);
});

hookApp.listen(8199, '0.0.0.0', () => console.log('🎣 Webhook: 0.0.0.0:8199'));

// --- START MAIN SERVER ---
const PORT = config.global.server?.listen_port || 8099;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`--- OneDoor Backend ---`);
    console.log(`🚀 Port: ${PORT}`);
    console.log(`🛡️ JWT: active`);
    console.log(`🎥 go2rtc: /go2rtc → 127.0.0.1:1984`);
    console.log(`📞 Asterisk WS: /ws → 127.0.0.1:8088`);
});
