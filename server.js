const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { getDynamicFlag, getDynamicFlags } = require('./lib/server-flags');

const app = express();
const PORT = process.env.PORT || 10000;
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || '!@12!@#123!@#$1234aA';
const ADMIN_MASTER_KEY = process.env.ADMIN_MASTER_KEY || 'CYRAKSHA_ADMIN_2026';

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Lightweight Cookie Parser Middleware
app.use((req, res, next) => {
    req.cookies = {};
    const cookieHeader = req.headers.cookie;
    if (cookieHeader) {
        cookieHeader.split(';').forEach(c => {
            const parts = c.trim().split('=');
            if (parts.length >= 2) {
                req.cookies[parts[0].trim()] = decodeURIComponent(parts.slice(1).join('='));
            }
        });
    }
    next();
});

// Persistent Data Storage on Render
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'ctf_arena.json');

try {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
} catch (e) {}

// Cloud KV Sync (Upstash Redis / Vercel KV)
const KV_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

async function syncFromCloudKV() {
    if (!KV_URL || !KV_TOKEN) return;
    try {
        const response = await fetch(`${KV_URL.replace(/\/+$/, '')}/get/cyraksha_ctf_db`, {
            headers: { Authorization: `Bearer ${KV_TOKEN}` }
        });
        const result = await response.json();
        if (result && result.result) {
            const parsed = typeof result.result === 'string' ? JSON.parse(result.result) : result.result;
            if (parsed && parsed.participants) {
                db = parsed;
                try { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf8'); } catch (err) {}
            }
        }
    } catch (e) {}
}

async function syncToCloudKV(data) {
    if (!KV_URL || !KV_TOKEN) return;
    try {
        await fetch(`${KV_URL.replace(/\/+$/, '')}/set/cyraksha_ctf_db`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${KV_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify([JSON.stringify(data)])
        });
    } catch (e) {}
}

function loadDatabase() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const raw = fs.readFileSync(DATA_FILE, 'utf8');
            return JSON.parse(raw);
        }
    } catch (e) {}
    return {
        admins: [],
        participants: {},
        deletedTeams: {},
        adminSessions: {},
        solveEvents: [],
        investigatorReports: []
    };
}

function saveDatabase(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {}
    syncToCloudKV(data);
}

// Initial DB
let db = loadDatabase();
syncFromCloudKV();

// Server-side Challenge Registry (authoritative source of truth for scoring & flag validation)
// Static fallback flags are kept here as a secondary check alongside dynamic team-specific flags.
const SERVER_CHALLENGES = {
    ctf0: { basePoints: 200, staticFlags: ['flag{inspect_before_you_click}'] },
    ctf1: { basePoints: 200, staticFlags: ['flag{you_should_have_looked_closer}', 'flag{hidden_files_are_still_files}'] },
    ctf2: { basePoints: 200, staticFlags: ['CYRAKSHA{h1dd3n_1n_pl41n_51gh7_2026}'] },
    ctf3: { basePoints: 200, staticFlags: ['FLAG{clues_arent_always_given_as_explicit_instructions}'] },
    ctf4: { basePoints: 200, staticFlags: ['flag{you_looked_deeper}'] },
    ctf5: { basePoints: 500, staticFlags: ['CYRAKSHA{NEVER_TRUST_THE_CLIENT}'] },
    ctf6: { basePoints: 1000, staticFlags: ['CYRAKSHA{SPL1T_BR41N_PR0T0C0L_DUO_M4ST3R}'] },
    ctf7: { basePoints: 200, staticFlags: ['CTF{y0u_f0und_th3_v4ult}'] }
};

// Token & Session Management
const adminSessions = new Map();

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

function hashPassword(pass) {
    return crypto.createHash('sha256').update(pass + 'cyraksha_salt_2026').digest('hex');
}

function getAdminSession(token) {
    if (adminSessions.has(token)) return adminSessions.get(token);
    db = loadDatabase();
    if (db.adminSessions && db.adminSessions[token]) {
        return db.adminSessions[token];
    }
    return null;
}

function setAdminSession(token, adminData) {
    adminSessions.set(token, adminData);
    db = loadDatabase();
    if (!db.adminSessions) db.adminSessions = {};
    db.adminSessions[token] = { ...adminData, createdAt: new Date().toISOString() };
    saveDatabase(db);
}

// Middleware: Admin Authentication
function requireAdminAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
    const session = token ? getAdminSession(token) : null;
    
    if (!session) {
        return res.status(401).json({ success: false, message: 'Unauthorized: Invalid or expired admin session.' });
    }
    req.admin = session;
    next();
}

// ==========================================
// 1. ADMIN AUTHENTICATION ENDPOINTS
// ==========================================

// Login Admin (Single Master Account: admin / !@12!@#123!@#$1234aA)
app.post('/api/admin/login', (req, res) => {
    const { email, username, password } = req.body;
    const userIdentifier = (username || email || '').toLowerCase().trim();

    if (!userIdentifier || !password) {
        return res.status(400).json({ success: false, message: 'Username/Email and password are required.' });
    }

    const isValid = (
        userIdentifier === ADMIN_USER.toLowerCase() ||
        userIdentifier === 'admin' ||
        userIdentifier === 'admin@cyraksha.org' ||
        userIdentifier === 'admin@cyraksha.com'
    ) && password === ADMIN_PASS;

    if (!isValid) {
        return res.status(401).json({ success: false, message: 'Invalid administrator credentials.' });
    }

    const token = generateToken();
    const adminObj = {
        id: 'master_admin',
        name: 'Master Admin',
        email: 'admin',
        role: 'SUPER_ADMIN'
    };

    setAdminSession(token, adminObj);

    res.json({
        success: true,
        message: 'Admin authentication successful.',
        token,
        admin: adminObj
    });
});

// Admin Registration Disabled
app.post('/api/admin/register', (req, res) => {
    res.status(403).json({
        success: false,
        message: 'Public administrator registration is disabled. Please sign in with the master admin account.'
    });
});

// Admin Session Verification
app.get('/api/admin/me', requireAdminAuth, (req, res) => {
    res.json({ success: true, admin: req.admin });
});

// ==========================================
// 2. LEADERBOARD & TIE-BREAKER CALCULATION
// ==========================================

// Helper to check active suspension
function getSuspensionInfo(p) {
    if (!p || !p.suspendedUntil) return { isSuspended: false };
    const untilMs = new Date(p.suspendedUntil).getTime();
    const now = Date.now();
    if (untilMs > now) {
        const remainingSec = Math.max(1, Math.round((untilMs - now) / 1000));
        return {
            isSuspended: true,
            suspendedUntil: p.suspendedUntil,
            suspendReason: p.suspendReason || 'Account suspended by contest arbiters.',
            remainingSeconds: remainingSec
        };
    }
    return { isSuspended: false };
}

function calculateLeaderboard() {
    db = loadDatabase();
    const deletedKeys = new Set(Object.keys(db.deletedTeams || {}));
    const rawList = Object.values(db.participants || {}).filter(p => {
        if (!p || !p.teamName) return false;
        const k = p.teamName.toLowerCase().trim();
        return !deletedKeys.has(k);
    });

    const list = rawList.map(p => {
        const solves = p.solved || {};
        const solveCount = Object.keys(solves).length;

        // Calculate total score
        let totalScore = 0;
        let lastSolveTimestamp = 0;
        let firstSolveTimestamp = Infinity;

        let startTimestamp = 0;
        if (p.startTime) {
            const t = new Date(p.startTime).getTime();
            if (!isNaN(t) && t > 0) startTimestamp = t;
        }
        if (!startTimestamp && p.registeredAt) {
            const t = new Date(p.registeredAt).getTime();
            if (!isNaN(t) && t > 0) startTimestamp = t;
        }

        Object.keys(solves).forEach(cid => {
            const solve = solves[cid];
            totalScore += solve.points || 0;
            let sTime = 0;
            if (solve.timestamp) {
                const parsed = new Date(solve.timestamp).getTime();
                if (!isNaN(parsed) && parsed > 0) sTime = parsed;
            }
            if (!sTime && p.lastSolveTime) {
                const parsed = new Date(p.lastSolveTime).getTime();
                if (!isNaN(parsed) && parsed > 0) sTime = parsed;
            }
            if (sTime > 0) {
                if (sTime > lastSolveTimestamp) lastSolveTimestamp = sTime;
                if (sTime < firstSolveTimestamp) firstSolveTimestamp = sTime;
            }
        });

        // Duration in seconds: only for teams with solves
        let durationSeconds = 0;
        if (totalScore > 0) {
            if (lastSolveTimestamp > startTimestamp) {
                durationSeconds = Math.max(1, Math.round((lastSolveTimestamp - startTimestamp) / 1000));
            } else if (lastSolveTimestamp > 0 && p.registeredAt) {
                const regT = new Date(p.registeredAt).getTime();
                if (lastSolveTimestamp > regT) {
                    durationSeconds = Math.max(1, Math.round((lastSolveTimestamp - regT) / 1000));
                } else {
                    durationSeconds = Math.max(1, solveCount * 45); // realistic estimated solve time
                }
            } else {
                durationSeconds = Math.max(1, solveCount * 45);
            }
        }

        const now = Date.now();
        const lastActiveTime = p.lastActive ? new Date(p.lastActive).getTime() : (p.registeredAt ? new Date(p.registeredAt).getTime() : 0);
        const isOnline = lastActiveTime > 0 && (now - lastActiveTime < 60000);
        const susp = getSuspensionInfo(p);

        return {
            teamName: p.teamName,
            mode: p.mode || 'team',
            registeredAt: p.registeredAt,
            startTime: p.startTime || p.registeredAt,
            lastActive: p.lastActive || p.registeredAt,
            isOnline,
            isSuspended: susp.isSuspended,
            suspendedUntil: susp.suspendedUntil || null,
            suspendReason: susp.suspendReason || null,
            remainingSeconds: susp.remainingSeconds || 0,
            hasGivenUp: !!p.hasGivenUp,
            concludedAt: p.concludedAt || null,
            totalScore,
            solveCount,
            solved: p.solved || {},
            hintsUnlocked: p.hintsUnlocked || { 1: false, 2: false, 3: false },
            lastSolveTime: lastSolveTimestamp > 0 ? new Date(lastSolveTimestamp).toISOString() : null,
            durationSeconds
        };
    });

    // Sort algorithm:
    // 1. Primary: Points (Descending)
    // 2. Secondary (Tie-Breaker): Total duration to solve (Ascending)
    // 3. Tertiary: Last solve timestamp (Ascending)
    list.sort((a, b) => {
        if (b.totalScore !== a.totalScore) {
            return b.totalScore - a.totalScore;
        }
        if (a.durationSeconds !== b.durationSeconds) {
            return a.durationSeconds - b.durationSeconds;
        }
        const timeA = a.lastSolveTime ? new Date(a.lastSolveTime).getTime() : Infinity;
        const timeB = b.lastSolveTime ? new Date(b.lastSolveTime).getTime() : Infinity;
        return timeA - timeB;
    });

    // Assign Rank & Tie-breaker flags
    return list.map((item, idx, arr) => {
        let rank = idx + 1;
        let hasTie = false;
        let tieBreakerAdvantage = null;

        // Check if tied with adjacent entries
        const prev = arr[idx - 1];
        const next = arr[idx + 1];

        if ((prev && prev.totalScore === item.totalScore) || (next && next.totalScore === item.totalScore)) {
            hasTie = true;
            if (prev && prev.totalScore === item.totalScore) {
                const diff = item.durationSeconds - prev.durationSeconds;
                if (diff > 0) {
                    tieBreakerAdvantage = `+${formatDuration(diff)} behind Rank #${idx}`;
                }
            } else if (next && next.totalScore === item.totalScore) {
                const diff = next.durationSeconds - item.durationSeconds;
                if (diff > 0) {
                    tieBreakerAdvantage = `⚡ Faster by ${formatDuration(diff)}`;
                }
            }
        }

        return {
            rank,
            ...item,
            formattedDuration: formatDuration(item.durationSeconds),
            hasTie,
            tieBreakerAdvantage
        };
    });
}

function formatDuration(seconds) {
    if (!seconds || seconds <= 0) return '00:00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return [
        hrs.toString().padStart(2, '0'),
        mins.toString().padStart(2, '0'),
        secs.toString().padStart(2, '0')
    ].join(':');
}

// ==========================================
// 3. ADMIN PORTAL DATA API
// ==========================================

// Get Leaderboard
app.get('/api/admin/leaderboard', requireAdminAuth, (req, res) => {
    const leaderboard = calculateLeaderboard();
    res.json({ success: true, leaderboard });
});

// Public Leaderboard endpoint for participants
app.get('/api/leaderboard', (req, res) => {
    db = loadDatabase();
    const leaderboard = calculateLeaderboard();
    res.json({ success: true, leaderboard, deletedTeams: db.deletedTeams || {} });
});

app.get('/api/public/leaderboard', (req, res) => {
    db = loadDatabase();
    const leaderboard = calculateLeaderboard();
    res.json({ success: true, leaderboard, deletedTeams: db.deletedTeams || {} });
});

// Overview Statistics
app.get('/api/admin/overview', requireAdminAuth, (req, res) => {
    const leaderboard = calculateLeaderboard();
    const totalTeams = leaderboard.length;
    let totalSolves = 0;
    let totalPointsAwarded = 0;

    leaderboard.forEach(t => {
        totalSolves += t.solveCount;
        totalPointsAwarded += t.totalScore;
    });

    const averageScore = totalTeams > 0 ? Math.round(totalPointsAwarded / totalTeams) : 0;
    const topTeam = leaderboard[0] || null;

    db = loadDatabase();
    const recentActivity = (db.solveEvents || []).slice(-15).reverse();

    res.json({
        success: true,
        stats: {
            totalTeams,
            totalSolves,
            totalPointsAwarded,
            averageScore,
            topTeam: topTeam ? { name: topTeam.teamName, score: topTeam.totalScore, time: topTeam.formattedDuration } : null,
            recentActivity
        }
    });
});

// Participants Full Details
app.get('/api/admin/participants', requireAdminAuth, (req, res) => {
    const leaderboard = calculateLeaderboard();
    res.json({ success: true, participants: leaderboard });
});

// Admin-only: Get expected dynamic flags for a team (for audit panel)
app.get('/api/admin/expected-flags', requireAdminAuth, (req, res) => {
    const teamName = req.query.team;
    const cid = req.query.cid;
    if (!teamName || !cid) {
        return res.status(400).json({ success: false, message: 'team and cid query params required' });
    }
    try {
        const flags = getDynamicFlags(teamName, cid);
        const staticFlags = (SERVER_CHALLENGES[cid] && SERVER_CHALLENGES[cid].staticFlags) || [];
        res.json({ success: true, dynamicFlags: flags, staticFlags });
    } catch (e) {
        res.json({ success: true, dynamicFlags: [], staticFlags: [] });
    }
});

// Export Data (CSV / JSON)
app.get('/api/admin/export', requireAdminAuth, (req, res) => {
    const format = req.query.format || 'csv';
    const leaderboard = calculateLeaderboard();

    if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename="ctf_arena_results.json"');
        return res.send(JSON.stringify(leaderboard, null, 2));
    }

    // CSV format
    const headers = ['Rank', 'Team Name', 'Mode', 'Total Points', 'Solve Count', 'Time Taken (HH:MM:SS)', 'CTF0', 'CTF1', 'CTF2', 'CTF3', 'CTF4', 'CTF5', 'CTF6', 'CTF7', 'Last Solve Timestamp'];
    const rows = leaderboard.map(t => [
        t.rank,
        `"${t.teamName.replace(/"/g, '""')}"`,
        t.mode,
        t.totalScore,
        t.solveCount,
        t.formattedDuration,
        t.solved.ctf0 ? t.solved.ctf0.points : 0,
        t.solved.ctf1 ? t.solved.ctf1.points : 0,
        t.solved.ctf2 ? t.solved.ctf2.points : 0,
        t.solved.ctf3 ? t.solved.ctf3.points : 0,
        t.solved.ctf4 ? t.solved.ctf4.points : 0,
        t.solved.ctf5 ? t.solved.ctf5.points : 0,
        t.solved.ctf6 ? t.solved.ctf6.points : 0,
        t.solved.ctf7 ? t.solved.ctf7.points : 0,
        t.lastSolveTime || 'N/A'
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="ctf_arena_results.csv"');
    res.send(csvContent);
});

// Reset Database (Admin only)
app.post('/api/admin/reset-contest', requireAdminAuth, (req, res) => {
    db = loadDatabase();
    db.participants = {};
    db.solveEvents = [];
    db.deletedTeams = {};
    saveDatabase(db);
    res.json({ success: true, message: 'All contest scores and participant records have been reset.' });
});

// Permanently Delete a Participant Account
app.delete('/api/admin/participant/:teamName', requireAdminAuth, (req, res) => {
    const teamName = decodeURIComponent(req.params.teamName || '');
    if (!teamName) {
        return res.status(400).json({ success: false, message: 'teamName parameter required.' });
    }

    const key = teamName.toLowerCase().trim();
    db = loadDatabase();

    if (!db.deletedTeams) db.deletedTeams = {};
    
    // Mark as permanently deleted
    db.deletedTeams[key] = {
        teamName: teamName.trim(),
        deletedAt: new Date().toISOString()
    };

    // Delete participant record
    delete db.participants[key];

    // Remove from solve events
    if (db.solveEvents) {
        db.solveEvents = db.solveEvents.filter(ev => ev.teamName.toLowerCase().trim() !== key);
    }

    saveDatabase(db);

    res.json({
        success: true,
        message: `Participant "${teamName}" has been permanently deleted.`
    });
});

// Suspension Helpers
function applySuspension(teamName, durationMinutes, reason, customUntil) {
    const key = teamName.toLowerCase().trim();
    db = loadDatabase();

    if (!db.participants) db.participants = {};
    if (!db.participants[key]) {
        const nowIso = new Date().toISOString();
        db.participants[key] = {
            teamName: teamName.trim(),
            mode: 'team',
            registeredAt: nowIso,
            startTime: nowIso,
            lastActive: nowIso,
            solved: {},
            hintsUnlocked: { 1: false, 2: false, 3: false },
            totalScore: 0,
            lastSolveTime: null
        };
    }

    const mins = Math.max(1, parseInt(durationMinutes, 10) || 15);
    const suspendedUntil = customUntil || new Date(Date.now() + mins * 60 * 1000).toISOString();
    const suspendReason = (reason || '').trim() || 'Temporary suspension applied by contest arbiters.';

    db.participants[key].suspendedUntil = suspendedUntil;
    db.participants[key].suspendReason = suspendReason;
    saveDatabase(db);

    return {
        success: true,
        message: `Participant "${teamName}" suspended for ${mins} minutes.`,
        suspendedUntil,
        suspendReason,
        durationMinutes: mins
    };
}

function liftSuspension(teamName) {
    const key = teamName.toLowerCase().trim();
    db = loadDatabase();

    if (db.participants && db.participants[key]) {
        delete db.participants[key].suspendedUntil;
        delete db.participants[key].suspendReason;
        saveDatabase(db);
    }

    return {
        success: true,
        message: `Suspension lifted for participant "${teamName}".`
    };
}

// Suspend a Participant Account (Admin Authenticated)
app.post('/api/admin/suspend', requireAdminAuth, (req, res) => {
    const { teamName, durationMinutes, reason } = req.body;
    if (!teamName) {
        return res.status(400).json({ success: false, message: 'teamName parameter required.' });
    }
    const result = applySuspension(teamName, durationMinutes, reason);
    res.json(result);
});

// Cross-Server Sync Suspend Hook
app.post('/api/sync/suspend', (req, res) => {
    const { teamName, durationMinutes, reason, suspendedUntil } = req.body;
    if (!teamName) return res.status(400).json({ success: false, message: 'teamName required.' });
    const result = applySuspension(teamName, durationMinutes, reason, suspendedUntil);
    res.json(result);
});

// Unsuspend a Participant Account (Lift Suspension)
app.post('/api/admin/unsuspend', requireAdminAuth, (req, res) => {
    const { teamName } = req.body;
    if (!teamName) {
        return res.status(400).json({ success: false, message: 'teamName parameter required.' });
    }
    const result = liftSuspension(teamName);
    res.json(result);
});

// Cross-Server Sync Unsuspend Hook
app.post('/api/sync/unsuspend', (req, res) => {
    const { teamName } = req.body;
    if (!teamName) return res.status(400).json({ success: false, message: 'teamName required.' });
    const result = liftSuspension(teamName);
    res.json(result);
});

// Check Participant Status (Active, Suspended, or Deleted)
app.get('/api/sync/status/:teamName', (req, res) => {
    const teamName = decodeURIComponent(req.params.teamName || '');
    const key = teamName.toLowerCase().trim();
    db = loadDatabase();

    if (db.deletedTeams && db.deletedTeams[key]) {
        return res.json({ success: false, deleted: true, message: 'Account has been deleted by an administrator.' });
    }

    const p = db.participants ? db.participants[key] : null;
    const susp = getSuspensionInfo(p);

    res.json({
        success: true,
        deleted: false,
        exists: !!p,
        isSuspended: susp.isSuspended,
        suspendedUntil: susp.suspendedUntil || null,
        suspendReason: susp.suspendReason || null,
        remainingSeconds: susp.remainingSeconds || 0
    });
});

// ==========================================
// 4. PARTICIPANT AUTH & SYNC (Multi-Device Engine)
// ==========================================

// Participant Registration Endpoint
app.post('/api/auth/register', (req, res) => {
    const { teamName, password, mode, startTime } = req.body;
    if (!teamName || !password) {
        return res.status(400).json({ success: false, message: 'Team name and password are required.' });
    }

    const key = teamName.toLowerCase().trim();
    db = loadDatabase();

    // If the team was previously marked as deleted, clear the deletion tombstone so they can register fresh
    if (db.deletedTeams && db.deletedTeams[key]) {
        delete db.deletedTeams[key];
    }

    const nowIso = new Date().toISOString();
    if (!db.participants) db.participants = {};

    const existing = db.participants[key];
    if (existing) {
        // If existing participant was created without a password or has the same password, bind and succeed
        if (!existing.password || existing.password === password.trim()) {
            existing.password = password.trim();
            if (mode) existing.mode = mode;
            existing.lastActive = nowIso;
            saveDatabase(db);
            return res.json({
                success: true,
                message: 'Team registered successfully.',
                participant: {
                    teamName: existing.teamName,
                    mode: existing.mode,
                    startTime: existing.startTime || nowIso,
                    totalScore: existing.totalScore || 0,
                    solved: existing.solved || {},
                    hintsUnlocked: existing.hintsUnlocked || { 1: false, 2: false, 3: false },
                    hasGivenUp: !!existing.hasGivenUp,
                    concludedAt: existing.concludedAt || null
                }
            });
        }

        return res.status(400).json({
            success: false,
            message: 'Team name already registered. If this is your team, please switch to LOGIN.'
        });
    }

    db.participants[key] = {
        teamName: teamName.trim(),
        password: password.trim(),
        mode: mode || 'team',
        registeredAt: nowIso,
        startTime: startTime || nowIso,
        lastActive: nowIso,
        solved: {},
        hintsUnlocked: { 1: false, 2: false, 3: false },
        totalScore: 0,
        lastSolveTime: null,
        hasGivenUp: false,
        concludedAt: null
    };

    saveDatabase(db);

    res.json({
        success: true,
        message: 'Team registered successfully.',
        participant: {
            teamName: db.participants[key].teamName,
            mode: db.participants[key].mode,
            startTime: db.participants[key].startTime,
            totalScore: 0,
            solved: {},
            hintsUnlocked: { 1: false, 2: false, 3: false },
            hasGivenUp: false,
            concludedAt: null
        }
    });
});

// Participant Login Endpoint (Multi-Device Authentication)
app.post('/api/auth/login', (req, res) => {
    const { teamName, password } = req.body;
    if (!teamName || !password) {
        return res.status(400).json({ success: false, message: 'Team name and password are required.' });
    }

    const key = teamName.toLowerCase().trim();
    db = loadDatabase();

    if (db.deletedTeams && db.deletedTeams[key]) {
        return res.status(403).json({
            success: false,
            deleted: true,
            message: 'This account has been deleted by an administrator.'
        });
    }

    const p = db.participants ? db.participants[key] : null;
    if (!p) {
        return res.status(401).json({
            success: false,
            message: 'Invalid team name or password. Try registering if new.'
        });
    }

    // Password validation (handles legacy passwordless accounts by binding password)
    if (p.password) {
        if (p.password !== password.trim()) {
            return res.status(401).json({
                success: false,
                message: 'Invalid password. Please check your credentials.'
            });
        }
    } else {
        p.password = password.trim();
    }

    p.lastActive = new Date().toISOString();
    saveDatabase(db);

    const susp = getSuspensionInfo(p);

    res.json({
        success: true,
        message: 'Login successful.',
        participant: {
            teamName: p.teamName,
            mode: p.mode || 'team',
            startTime: p.startTime || p.registeredAt,
            totalScore: p.totalScore || 0,
            solved: p.solved || {},
            hintsUnlocked: p.hintsUnlocked || { 1: false, 2: false, 3: false },
            hasGivenUp: !!p.hasGivenUp,
            concludedAt: p.concludedAt || null,
            isSuspended: susp.isSuspended,
            suspendedUntil: susp.suspendedUntil || null,
            suspendReason: susp.suspendReason || null,
            remainingSeconds: susp.remainingSeconds || 0
        }
    });
});

// Sync Team Registration / Heartbeat
app.post('/api/sync/register', (req, res) => {
    const { teamName, password, mode, startTime, isOnline, hasGivenUp, concludedAt } = req.body;
    if (!teamName) {
        return res.status(400).json({ success: false, message: 'teamName required.' });
    }

    const key = teamName.toLowerCase().trim();
    db = loadDatabase();

    // Reject if account was deleted by admin
    if (db.deletedTeams && db.deletedTeams[key]) {
        return res.status(403).json({
            success: false,
            deleted: true,
            message: 'This account was deleted by an administrator.'
        });
    }

    const nowIso = new Date().toISOString();

    if (!db.participants[key]) {
        db.participants[key] = {
            teamName: teamName.trim(),
            password: password ? password.trim() : null,
            mode: mode || 'team',
            registeredAt: nowIso,
            startTime: startTime || nowIso,
            lastActive: nowIso,
            solved: {},
            hintsUnlocked: { 1: false, 2: false, 3: false },
            totalScore: 0,
            lastSolveTime: null,
            hasGivenUp: !!hasGivenUp,
            concludedAt: concludedAt || null
        };
    } else {
        db.participants[key].lastActive = nowIso;
        if (password) db.participants[key].password = password.trim();
        if (mode) db.participants[key].mode = mode;
        if (hasGivenUp !== undefined) db.participants[key].hasGivenUp = !!hasGivenUp;
        if (concludedAt) db.participants[key].concludedAt = concludedAt;
    }
    saveDatabase(db);

    const susp = getSuspensionInfo(db.participants[key]);

    res.json({
        success: true,
        message: 'Team registered/synced successfully.',
        isSuspended: susp.isSuspended,
        suspendedUntil: susp.suspendedUntil || null,
        suspendReason: susp.suspendReason || null,
        remainingSeconds: susp.remainingSeconds || 0
    });
});

// Heartbeat endpoint
app.post('/api/sync/heartbeat', (req, res) => {
    const { teamName } = req.body;
    if (teamName) {
        const key = teamName.toLowerCase().trim();
        db = loadDatabase();

        if (db.deletedTeams && db.deletedTeams[key]) {
            return res.status(403).json({ success: false, deleted: true });
        }

        if (db.participants && db.participants[key]) {
            const p = db.participants[key];
            p.lastActive = new Date().toISOString();
            saveDatabase(db);

            const susp = getSuspensionInfo(p);
            if (susp.isSuspended) {
                return res.json({
                    success: true,
                    isSuspended: true,
                    suspendedUntil: susp.suspendedUntil,
                    suspendReason: susp.suspendReason,
                    remainingSeconds: susp.remainingSeconds
                });
            }
        }
    }
    res.json({ success: true, isSuspended: false });
});

// Sync Solve Event — SERVER-SIDE FLAG VALIDATION
app.post('/api/sync/solve', (req, res) => {
    const { teamName, cid, flagSubmitted, hintsUnlocked, timestamp } = req.body;

    if (!teamName || !cid) {
        return res.status(400).json({ success: false, message: 'teamName and cid are required.' });
    }

    if (!flagSubmitted || typeof flagSubmitted !== 'string' || !flagSubmitted.trim()) {
        return res.status(400).json({ success: false, message: 'flagSubmitted is required.' });
    }

    // Validate challenge ID exists
    const challenge = SERVER_CHALLENGES[cid];
    if (!challenge) {
        return res.status(400).json({ success: false, message: `Unknown challenge: ${cid}` });
    }

    const key = teamName.toLowerCase().trim();
    db = loadDatabase();

    if (db.deletedTeams && db.deletedTeams[key]) {
        return res.status(403).json({ success: false, deleted: true, message: 'Account deleted.' });
    }

    // Reject solve if participant is currently suspended
    if (db.participants && db.participants[key]) {
        const susp = getSuspensionInfo(db.participants[key]);
        if (susp.isSuspended) {
            return res.status(403).json({
                success: false,
                suspended: true,
                message: `Account is suspended. Flag submission locked.`,
                suspendedUntil: susp.suspendedUntil,
                suspendReason: susp.suspendReason,
                remainingSeconds: susp.remainingSeconds
            });
        }
    }

    // If already solved, return success without re-awarding
    if (db.participants[key] && db.participants[key].solved && db.participants[key].solved[cid]) {
        return res.json({
            success: true,
            alreadySolved: true,
            message: 'Challenge already solved.',
            points: db.participants[key].solved[cid].points,
            totalScore: db.participants[key].totalScore
        });
    }

    // --- SERVER-SIDE FLAG VALIDATION ---
    const submittedFlag = flagSubmitted.trim();

    // 1. Check dynamic team-specific flags
    let dynamicFlags = [];
    try {
        dynamicFlags = getDynamicFlags(teamName, cid);
    } catch (e) {}

    // 2. Check static fallback flags
    const staticFlags = challenge.staticFlags || [];

    // 3. Combine all valid flags
    const allValidFlags = [...dynamicFlags, ...staticFlags];

    const isValid = allValidFlags.includes(submittedFlag);
    if (!isValid) {
        return res.status(403).json({
            success: false,
            message: 'Invalid flag. The submitted flag does not match.'
        });
    }

    // --- FLAG IS VALID — Record the solve ---
    // Server determines the points (client cannot inject arbitrary scores)
    let pts = challenge.basePoints;
    if (cid === 'ctf4') {
        // Apply hint deductions for CTF4
        const existingHints = (db.participants[key] && db.participants[key].hintsUnlocked) || {};
        const mergedHints = { ...existingHints, ...(hintsUnlocked || {}) };
        if (mergedHints[2] || mergedHints['2']) pts -= 10;
        if (mergedHints[3] || mergedHints['3']) pts -= 20;
        pts = Math.max(0, pts);
    }

    if (!db.participants[key]) {
        db.participants[key] = {
            teamName: teamName.trim(),
            mode: 'team',
            registeredAt: new Date().toISOString(),
            startTime: new Date().toISOString(),
            solved: {},
            hintsUnlocked: { 1: false, 2: false, 3: false },
            totalScore: 0,
            lastSolveTime: null
        };
    }

    const participant = db.participants[key];
    const solveTime = timestamp || new Date().toISOString();

    participant.solved[cid] = {
        points: pts,
        flagSubmitted: submittedFlag,
        timestamp: solveTime
    };

    if (hintsUnlocked) {
        participant.hintsUnlocked = { ...participant.hintsUnlocked, ...hintsUnlocked };
    }

    participant.lastSolveTime = solveTime;

    // Recalculate participant total from server-determined points
    let total = 0;
    Object.keys(participant.solved).forEach(id => {
        total += participant.solved[id].points || 0;
    });
    participant.totalScore = total;

    // Add to activity stream
    if (!db.solveEvents) db.solveEvents = [];
    db.solveEvents.push({
        id: 'ev_' + Date.now(),
        teamName: participant.teamName,
        cid,
        points: pts,
        timestamp: solveTime
    });

    saveDatabase(db);

    res.json({ success: true, message: 'Flag verified! Solve recorded.', points: pts, totalScore: participant.totalScore });
});

// Sync Status & Live Solves Endpoint (Cross-device real-time sync)
app.get('/api/sync/status/:teamName?', (req, res) => {
    const teamName = req.params.teamName || req.query.team || req.query.teamName;
    if (!teamName) return res.status(400).json({ success: false, message: 'teamName required' });
    const key = teamName.toLowerCase().trim();
    db = loadDatabase();

    if (db.deletedTeams && db.deletedTeams[key]) {
        return res.json({ success: false, deleted: true });
    }

    const p = db.participants && db.participants[key];
    if (!p) {
        return res.json({ success: true, exists: false });
    }

    const susp = getSuspensionInfo(p);
    res.json({
        success: true,
        teamName: p.teamName,
        totalScore: p.totalScore || 0,
        solved: p.solved || {},
        hasGivenUp: !!p.hasGivenUp,
        concludedAt: p.concludedAt || null,
        isSuspended: susp.isSuspended,
        suspendedUntil: susp.suspendedUntil || null,
        suspendReason: susp.suspendReason || null,
        remainingSeconds: susp.remainingSeconds || 0
    });
});

// ==========================================
// CTF 6: SPLIT-BRAIN PROTOCOL DUO RELAY
// ==========================================
const ctf6DuoSessions = {};

// Start TCP session on Port 9000 (Player 2)
app.post('/api/ctf6/session/start', (req, res) => {
    const { teamName } = req.body;
    if (!teamName) return res.status(400).json({ success: false, message: 'teamName required' });
    const key = teamName.toLowerCase().trim();
    ctf6DuoSessions[key] = {
        active: true,
        startedAt: Date.now(),
        lastHeartbeat: Date.now()
    };
    res.json({ success: true, message: 'CTF6 session registered', session: ctf6DuoSessions[key] });
});

// Send Keepalive Beacon from Web Microservice (Player 1)
app.post('/api/ctf6/keepalive', (req, res) => {
    const { teamName, secret } = req.body;
    if (!teamName) return res.status(400).json({ success: false, message: 'teamName required' });
    const key = teamName.toLowerCase().trim();
    const session = ctf6DuoSessions[key];

    if (!session || !session.active || (Date.now() - session.lastHeartbeat > 35000)) {
        ctf6DuoSessions[key] = {
            active: true,
            startedAt: Date.now(),
            lastHeartbeat: Date.now()
        };
    } else {
        session.lastHeartbeat = Date.now();
        session.active = true;
    }

    res.json({ success: true, message: 'Heartbeat signal relayed to Port 9000 daemon', lastHeartbeat: ctf6DuoSessions[key].lastHeartbeat });
});

// Check Session Status & Poll Heartbeats (Player 2)
app.get('/api/ctf6/status', (req, res) => {
    const teamName = req.query.team || req.query.teamName;
    if (!teamName) return res.status(400).json({ success: false, message: 'team parameter required' });
    const key = teamName.toLowerCase().trim();
    const session = ctf6DuoSessions[key];

    if (!session || !session.active) {
        return res.json({ success: true, active: false });
    }

    const elapsed = Date.now() - session.lastHeartbeat;
    res.json({
        success: true,
        active: elapsed < 35000,
        lastHeartbeat: session.lastHeartbeat,
        elapsedMs: elapsed
    });
});

// End / Timeout Session
app.post('/api/ctf6/session/end', (req, res) => {
    const { teamName } = req.body;
    if (teamName) {
        const key = teamName.toLowerCase().trim();
        delete ctf6DuoSessions[key];
    }
    res.json({ success: true });
});

// ==========================================
// 5. CTF 5 (CYRAKSHA NOTES - IDOR CHALLENGE)
// ==========================================

const ctf5Users = {
  'student': { password: 'password123', role: 'user' },
  'alice': { password: 'alicepassword', role: 'user' }
};

const ctf5NotesStore = {
  'student': [
    { id: 1, title: 'Web Security 101', content: 'Remember to study cookie-based authentication and session storage security.', date: '2026-08-28' },
    { id: 2, title: 'Project Checklist', content: 'Complete the lab writeup and submit the report before the weekend.', date: '2026-08-29' }
  ],
  'admin': [
    { id: 101, title: 'Server Audit Log', content: 'Notice: Critical advisory on client-side role validation.', date: '2026-08-30' },
    { id: 102, title: 'Confidential Root Credentials', content: 'FLAG: CYRAKSHA{NEVER_TRUST_THE_CLIENT}', date: '2026-08-30' }
  ]
};

let ctf5NextNoteId = 200;

app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password are required' });
  }
  const cleanUser = username.trim();
  if (ctf5Users[cleanUser]) {
    return res.status(400).json({ success: false, message: 'User already exists' });
  }
  ctf5Users[cleanUser] = { password, role: 'user' };
  ctf5NotesStore[cleanUser] = [
    { id: ctf5NextNoteId++, title: 'My First Note', content: 'Welcome to your private Cyraksha Notes vault.', date: new Date().toISOString().split('T')[0] }
  ];
  res.setHeader('Set-Cookie', ['user=' + encodeURIComponent(cleanUser) + '; Path=/', 'role=user; Path=/']);
  return res.json({ success: true, message: 'Registration successful', username: cleanUser, role: 'user' });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password are required' });
  }
  const cleanUser = username.trim();
  const account = ctf5Users[cleanUser];
  if (!account || account.password !== password) {
    return res.status(401).json({ success: false, message: 'Invalid username or password' });
  }
  res.setHeader('Set-Cookie', ['user=' + encodeURIComponent(cleanUser) + '; Path=/', 'role=user; Path=/']);
  return res.json({ success: true, message: 'Login successful', username: cleanUser, role: 'user' });
});

app.post('/api/logout', (req, res) => {
  res.setHeader('Set-Cookie', ['user=; Max-Age=0; Path=/', 'role=; Max-Age=0; Path=/']);
  return res.json({ success: true, message: 'Logged out successfully' });
});

function getCtf5Team(req) {
  return req.query.team || req.headers['x-team-name'] || req.cookies.team_name || req.cookies.teamName || req.cookies.user || 'anonymous';
}

app.get('/api/session', (req, res) => {
  const user = req.cookies.user;
  const role = req.cookies.role;

  if (!user && !role) {
    return res.json({ authenticated: false });
  }

  const isAdmin = role === 'admin';
  const effectiveUser = isAdmin ? (user || 'administrator') : (user || 'student');
  const effectiveRole = role || 'user';
  const team = getCtf5Team(req);
  const flag = isAdmin ? getDynamicFlag(team, 'ctf5') : null;

  return res.json({
    authenticated: true,
    username: effectiveUser,
    role: effectiveRole,
    isAdmin: isAdmin,
    flag: flag
  });
});

app.get('/api/notes', (req, res) => {
  const user = req.cookies.user || 'student';
  const role = req.cookies.role || 'user';

  if (role === 'admin') {
    const team = getCtf5Team(req);
    const dynamicFlag = getDynamicFlag(team, 'ctf5');
    const adminNotes = [
      { id: 101, title: 'Server Audit Log', content: 'Notice: Critical advisory on client-side role validation.', date: '2026-08-30' },
      { id: 102, title: 'Confidential Root Credentials', content: `FLAG: ${dynamicFlag}`, date: '2026-08-30' }
    ];
    const userNotes = ctf5NotesStore[user] || [];
    return res.json({
      success: true,
      role: 'admin',
      notes: [...adminNotes, ...userNotes]
    });
  }

  const userNotes = ctf5NotesStore[user] || [];
  return res.json({
    success: true,
    role: role,
    notes: userNotes
  });
});

app.post('/api/notes', (req, res) => {
  const user = req.cookies.user || 'student';
  const { title, content } = req.body;
  if (!title || !content) {
    return res.status(400).json({ success: false, message: 'Title and content are required' });
  }
  if (!ctf5NotesStore[user]) {
    ctf5NotesStore[user] = [];
  }
  const newNote = {
    id: ctf5NextNoteId++,
    title: title.trim(),
    content: content.trim(),
    date: new Date().toISOString().split('T')[0]
  };
  ctf5NotesStore[user].unshift(newNote);
  return res.json({ success: true, note: newNote });
});

app.delete('/api/notes/:id', (req, res) => {
  const user = req.cookies.user || 'student';
  const noteId = parseInt(req.params.id, 10);
  if (ctf5NotesStore[user]) {
    ctf5NotesStore[user] = ctf5NotesStore[user].filter(n => n.id !== noteId);
  }
  return res.json({ success: true });
});

// ==========================================
// 6. INVESTIGATOR INCIDENT INTELLIGENCE API
// ==========================================

// Helper: Save/Add investigator report
function addInvestigatorReport(report) {
    db = loadDatabase();
    if (!db.investigatorReports) db.investigatorReports = [];

    const newReport = {
        id: report.id || `RPT-${Math.floor(100000 + Math.random() * 900000)}`,
        timestamp: report.timestamp || new Date().toISOString(),
        investigatorName: (report.investigatorName || 'Anonymous Proctor').trim(),
        teamName: (report.teamName || 'Unknown Team').trim(),
        category: (report.category || 'General Malpractice').trim(),
        message: (report.message || '').trim(),
        urgency: report.urgency || 'Normal',
        status: report.status || 'pending', // 'pending' | 'action_taken' | 'resolved' | 'dismissed'
        actionTaken: report.actionTaken || null,
        resolvedAt: report.resolvedAt || null
    };

    const existingIndex = db.investigatorReports.findIndex(r => r.id === newReport.id);
    if (existingIndex >= 0) {
        db.investigatorReports[existingIndex] = { ...db.investigatorReports[existingIndex], ...newReport };
    } else {
        db.investigatorReports.unshift(newReport);
    }

    if (db.investigatorReports.length > 200) {
        db.investigatorReports = db.investigatorReports.slice(0, 200);
    }

    saveDatabase(db);
    return newReport;
}

// Submit a new Incident Report (from Investigator Portal)
app.post('/api/investigator/report', (req, res) => {
    const { investigatorName, teamName, category, message, urgency } = req.body;
    if (!teamName || !message) {
        return res.status(400).json({ success: false, message: 'Team Name and Report Message are required.' });
    }

    const saved = addInvestigatorReport({
        investigatorName,
        teamName,
        category,
        message,
        urgency
    });

    res.json({
        success: true,
        message: 'Incident intelligence report dispatched successfully to contest administrators.',
        report: saved
    });
});

// Cross-Server Sync Hook for Investigator Reports
app.post('/api/sync/investigator-report', (req, res) => {
    const report = req.body;
    if (!report || !report.teamName) {
        return res.status(400).json({ success: false });
    }
    const saved = addInvestigatorReport(report);
    res.json({ success: true, report: saved });
});

// Get Public Recent Reports (for Investigator Portal live feed)
app.get('/api/investigator/reports/public', (req, res) => {
    db = loadDatabase();
    const list = (db.investigatorReports || []).slice(0, 25).map(r => ({
        id: r.id,
        timestamp: r.timestamp,
        investigatorName: r.investigatorName,
        teamName: r.teamName,
        category: r.category,
        urgency: r.urgency,
        status: r.status
    }));
    res.json({ success: true, reports: list });
});

// Admin: Get all detailed Investigator Reports
app.get('/api/admin/investigator-reports', requireAdminAuth, (req, res) => {
    db = loadDatabase();
    res.json({ success: true, reports: db.investigatorReports || [] });
});

// Admin: Update Status of an Investigator Report
app.post('/api/admin/investigator-report/update-status', requireAdminAuth, (req, res) => {
    const { reportId, status, actionTaken } = req.body;
    if (!reportId || !status) {
        return res.status(400).json({ success: false, message: 'reportId and status are required.' });
    }

    db = loadDatabase();
    if (!db.investigatorReports) db.investigatorReports = [];

    const item = db.investigatorReports.find(r => r.id === reportId);
    if (!item) {
        return res.status(404).json({ success: false, message: 'Report not found.' });
    }

    item.status = status;
    if (actionTaken) item.actionTaken = actionTaken;
    if (status === 'resolved' || status === 'dismissed' || status === 'action_taken') {
        item.resolvedAt = new Date().toISOString();
    }

    saveDatabase(db);
    res.json({ success: true, message: 'Report status updated.', report: item });
});

// Cross-Server Sync Hook for Report Status Update
app.post('/api/sync/investigator-report/update-status', (req, res) => {
    const { reportId, status, actionTaken } = req.body;
    if (!reportId || !status) return res.status(400).json({ success: false });

    db = loadDatabase();
    if (!db.investigatorReports) db.investigatorReports = [];
    const item = db.investigatorReports.find(r => r.id === reportId);
    if (item) {
        item.status = status;
        if (actionTaken) item.actionTaken = actionTaken;
        if (status === 'resolved' || status === 'dismissed' || status === 'action_taken') {
            item.resolvedAt = new Date().toISOString();
        }
        saveDatabase(db);
    }
    res.json({ success: true });
});

// ==========================================
// 8. CLIENT & ADMIN ROUTING
// ==========================================

// 1. Root Smart Router (Auto-detects admin domain)
app.get('/', (req, res) => {
    const host = (req.headers.host || '').toLowerCase();
    if (host.includes('admin')) {
        return res.redirect('/admin/');
    }
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.get('/dashboard.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// 2. Admin Portal Routes
app.get('/admin', (req, res) => {
    const urlPath = req.originalUrl.split('?')[0];
    if (urlPath === '/admin') {
        const query = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
        return res.redirect(301, '/admin/' + query);
    }
    res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});

app.get('/admin/', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});

app.get('/admin/index.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});

app.get('/admin/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'dashboard.html'));
});

app.get('/admin/dashboard.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'dashboard.html'));
});

// 3. Investigator Portal Routes
app.get('/investigator', (req, res) => {
    res.sendFile(path.join(__dirname, 'investigator', 'index.html'));
});

app.get('/investigator/', (req, res) => {
    res.sendFile(path.join(__dirname, 'investigator', 'index.html'));
});

app.get('/investigator/index.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'investigator', 'index.html'));
});

// CTF 7: Shadow Vault Verification & Aliases
app.post(['/api/verify', '/CTF7/api/verify'], (req, res) => {
    const { key, teamName } = req.body;
    if (key && key.trim() === 'shadow-4729') {
        const team = teamName || req.query.team || 'anonymous_team';
        let flag = 'CTF{y0u_f0und_th3_v4ult}';
        try {
            const dynamicFlags = getDynamicFlags(team, 'ctf7');
            if (dynamicFlags && dynamicFlags[0]) flag = dynamicFlags[0];
        } catch (e) {}
        return res.json({
            success: true,
            flag: flag
        });
    }
    res.status(403).json({
        success: false,
        message: 'Invalid access key'
    });
});

app.get(['/backup', '/CTF7/backup'], (req, res) => {
    res.sendFile(path.join(__dirname, 'CTF7', 'public', 'backup.html'));
});

app.get(['/robots.txt', '/CTF7/robots.txt'], (req, res) => {
    res.sendFile(path.join(__dirname, 'CTF7', 'public', 'robots.txt'));
});

// 4. Deny direct access to sensitive server files & directories
app.use((req, res, next) => {
    const p = req.path.toLowerCase();
    if (
        p.startsWith('/lib') ||
        p.startsWith('/data') ||
        p.startsWith('/.git') ||
        p === '/server.js' ||
        p === '/package.json' ||
        p === '/package-lock.json' ||
        p === '/render.yaml' ||
        p === '/dockerfile' ||
        p.endsWith('.key') ||
        p.endsWith('.env')
    ) {
        return res.status(403).send('Forbidden');
    }
    next();
});

// 5. Admin, Investigator & Static Assets
app.use('/admin', express.static(path.join(__dirname, 'admin')));
app.use('/investigator', express.static(path.join(__dirname, 'investigator')));
app.use(express.static(path.join(__dirname)));

// ==========================================
// 10. SERVER INITIALIZATION (RENDER ENGINE)
// ==========================================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`=================================================`);
    console.log(`🔥 CYRAKSHA CTF ARENA & ADMIN SERVER ONLINE`);
    console.log(`🌐 Main Arena (Participants): http://localhost:${PORT}/`);
    console.log(`🛡️ Admin Command Center: http://localhost:${PORT}/admin/`);
    console.log(`🔑 Master Admin Credentials: admin / !@12!@#123!@#$1234aA`);
    console.log(`=================================================`);
});

module.exports = app;
