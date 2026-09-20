document.addEventListener('DOMContentLoaded', () => {
    // --- Elements ---
    const tabWeb = document.getElementById('tab-web');
    const tabReversing = document.getElementById('tab-reversing');
    const tabConvergence = document.getElementById('tab-convergence');

    const panelWeb = document.getElementById('panel-web');
    const panelReversing = document.getElementById('panel-reversing');
    const panelConvergence = document.getElementById('panel-convergence');

    // Web Track Elements
    const invoiceUrlInput = document.getElementById('invoice-url-input');
    const btnRenderInvoice = document.getElementById('btn-render-invoice');
    const btnDumpHeap = document.getElementById('btn-dump-heap');
    const webConsole = document.getElementById('web-console');
    const extractedSecretDisplay = document.getElementById('extracted-secret-display');
    const btnKeepalive = document.getElementById('btn-keepalive');
    const keepaliveStatus = document.getElementById('keepalive-status');

    // Reversing Track Elements
    const secretInput = document.getElementById('secret-input');
    const commandInput = document.getElementById('command-input');
    const btnCraftPacket = document.getElementById('btn-craft-packet');
    const packetHexOutput = document.getElementById('packet-hex-output');
    const btnSendToDaemon = document.getElementById('btn-send-to-daemon');

    // Convergence Track Elements
    const socketConsole = document.getElementById('socket-console');
    const cmdSocketInput = document.getElementById('cmd-socket-input');
    const btnSendCmd = document.getElementById('btn-send-cmd');
    const raceTimerDisplay = document.getElementById('race-timer-display');
    const heartbeatBar = document.getElementById('heartbeat-bar');
    const convergenceNotice = document.getElementById('convergence-notice');
    const flagCaptureCard = document.getElementById('flag-capture-card');
    const rootFlagDisplay = document.getElementById('root-flag-display');
    const btnCopyFlag = document.getElementById('btn-copy-flag');
    const toast = document.getElementById('toast');

    // --- Team Session & Auth Parameters
    let teamName = 'anonymous_team';
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const qTeam = urlParams.get('team');
        if (qTeam && qTeam.trim()) {
            teamName = qTeam.trim();
        } else if (window.CTF_FLAGS && window.CTF_FLAGS.getActiveTeamName) {
            teamName = window.CTF_FLAGS.getActiveTeamName();
        }
    } catch (e) {}

    function generateSessionSecret(team) {
        let hash = 0x811c9dc5;
        const str = team + "_split_brain_2026_salt";
        for (let i = 0; i < str.length; i++) {
            hash ^= str.charCodeAt(i);
            hash = (hash * 0x01000193) >>> 0;
        }
        const hex1 = hash.toString(16).padStart(8, '0');
        const hex2 = ((hash ^ 0xdeadbeef) >>> 0).toString(16).padStart(8, '0');
        const hex3 = ((hash ^ 0x1337c0de) >>> 0).toString(16).padStart(8, '0');
        const hex4 = ((hash ^ 0xcafebabe) >>> 0).toString(16).padStart(8, '0');
        return `${hex1}${hex2}${hex3}${hex4}`;
    }

    const LIVE_SESSION_SECRET = generateSessionSecret(teamName);
    const MAGIC_HEADER = "53504C54"; // "SPLT"
    let currentExtractedSecret = "";
    let isSessionAuthenticated = false;
    let alarmRemainingMs = 15000;
    let alarmInterval = null;
    let isAlarmActive = false;

    // --- Cross-Tab / Cross-Window Duo Synchronization ---
    let duoChannel = null;
    try {
        if (typeof BroadcastChannel !== 'undefined') {
            duoChannel = new BroadcastChannel(`ctf6_duo_sync_${teamName}`);
            duoChannel.onmessage = (e) => {
                handleDuoSync(e.data);
            };
        }
    } catch (e) {}

    window.addEventListener('storage', (e) => {
        if (e.key === `ctf6_keepalive_ping_${teamName}`) {
            handleDuoSync({ type: 'keepalive', team: teamName });
        } else if (e.key === `ctf6_active_session_${teamName}`) {
            if (e.newValue) handleDuoSync({ type: 'session_start', team: teamName });
            else handleDuoSync({ type: 'session_end', team: teamName });
        }
    });

    function handleDuoSync(data) {
        if (!data || data.team !== teamName) return;
        if (data.type === 'keepalive') {
            if (isAlarmActive) {
                alarmRemainingMs = 15000;
                updateTimerDisplay();
                logSocket(`[✓] KEEPALIVE BEACON RECEIVED from Web API (Player 1): Anti-tamper alarm extended +15.0s!`);
                showToast('📡 Keepalive beacon received from Player 1! Timer reset to 15s.');
            }
        }
    }

    // --- Cross-Device Cloud Relay Synchronization ---
    function getApiEndpoints(path) {
        const endpoints = [];
        endpoints.push(`https://cyraksha-ctf-admin.onrender.com${path}`);
        if (window.location.origin && !window.location.origin.includes('cyraksha-ctf-admin.onrender.com')) {
            endpoints.push(`${window.location.origin}${path}`);
        }
        return endpoints;
    }

    async function broadcastRemoteKeepalive() {
        const endpoints = getApiEndpoints('/api/ctf6/keepalive');
        for (const ep of endpoints) {
            try {
                fetch(ep, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ teamName, secret: currentExtractedSecret || LIVE_SESSION_SECRET })
                }).catch(() => {});
            } catch (e) {}
        }
    }

    async function broadcastRemoteSessionStart() {
        const endpoints = getApiEndpoints('/api/ctf6/session/start');
        for (const ep of endpoints) {
            try {
                fetch(ep, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ teamName })
                }).catch(() => {});
            } catch (e) {}
        }
    }

    async function broadcastRemoteSessionEnd() {
        const endpoints = getApiEndpoints('/api/ctf6/session/end');
        for (const ep of endpoints) {
            try {
                fetch(ep, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ teamName })
                }).catch(() => {});
            } catch (e) {}
        }
    }

    let pollServerHeartbeatInterval = null;
    let lastKnownServerHeartbeat = Date.now();

    function startRemoteHeartbeatPolling() {
        if (pollServerHeartbeatInterval) clearInterval(pollServerHeartbeatInterval);
        lastKnownServerHeartbeat = Date.now();

        pollServerHeartbeatInterval = setInterval(async () => {
            if (!isAlarmActive) {
                clearInterval(pollServerHeartbeatInterval);
                return;
            }

            const endpoints = getApiEndpoints(`/api/ctf6/status?team=${encodeURIComponent(teamName)}`);
            for (const ep of endpoints) {
                try {
                    const res = await fetch(ep);
                    if (res.ok) {
                        const data = await res.json();
                        if (data && data.success && data.lastHeartbeat) {
                            if (data.lastHeartbeat > lastKnownServerHeartbeat) {
                                lastKnownServerHeartbeat = data.lastHeartbeat;
                                alarmRemainingMs = 15000;
                                updateTimerDisplay();
                                logSocket(`[✓] KEEPALIVE BEACON RECEIVED from Web API (Player 1 Remote Device): Anti-tamper alarm extended +15.0s!`);
                                showToast('📡 Keepalive beacon received from Player 1! Timer reset.');
                            }
                            break;
                        }
                    }
                } catch (e) {}
            }
        }, 1100);
    }

    // --- Dynamic Flag Resolver ---
    function getRootFlag() {
        try {
            if (window.CTF_FLAGS && window.CTF_FLAGS.getDynamicFlag) {
                return window.CTF_FLAGS.getDynamicFlag(teamName, 'ctf6');
            }
            if (window.CTF_FLAGS && window.CTF_FLAGS.getTeamToken) {
                const tok = window.CTF_FLAGS.getTeamToken(teamName, 'ctf6');
                return `CYRAKSHA{SPL1T_BR41N_PR0T0C0L_DUO_M4ST3R_${tok}}`;
            }
        } catch (e) {}
        return `CYRAKSHA{SPL1T_BR41N_PR0T0C0L_DUO_M4ST3R_${teamName.toLowerCase().replace(/[^a-z0-9]/g, '')}}`;
    }

    function showToast(msg) {
        if (!toast) return;
        toast.textContent = msg;
        toast.classList.remove('hidden');
        setTimeout(() => toast.classList.add('hidden'), 3200);
    }

    // --- Tab Navigation ---
    function setActiveTab(tab) {
        [tabWeb, tabReversing, tabConvergence].forEach(t => t.classList.remove('active'));
        [panelWeb, panelReversing, panelConvergence].forEach(p => p.classList.add('hidden'));

        if (tab === 'web') {
            tabWeb.classList.add('active');
            panelWeb.classList.remove('hidden');
        } else if (tab === 'reversing') {
            tabReversing.classList.add('active');
            panelReversing.classList.remove('hidden');
        } else if (tab === 'convergence') {
            tabConvergence.classList.add('active');
            panelConvergence.classList.remove('hidden');
        }
    }

    tabWeb?.addEventListener('click', () => setActiveTab('web'));
    tabReversing?.addEventListener('click', () => setActiveTab('reversing'));
    tabConvergence?.addEventListener('click', () => setActiveTab('convergence'));

    // ===================================================
    // TRACK 1: Web Exploitation (Invoice SSRF / Heap Dump)
    // ===================================================
    function logWeb(msg, isError = false) {
        const time = new Date().toLocaleTimeString();
        const prefix = isError ? '[!] ERROR' : '[*] INFO';
        webConsole.textContent += `[${time}] ${prefix}: ${msg}\n`;
        webConsole.scrollTop = webConsole.scrollHeight;
    }

    btnRenderInvoice?.addEventListener('click', () => {
        const target = (invoiceUrlInput.value || '').trim();
        if (!target) {
            logWeb('Invoice render URL or file path required.', true);
            return;
        }

        logWeb(`Dispatching Headless PDF Renderer to: "${target}"`);

        // Check for blacklist filter
        const lower = target.toLowerCase();
        if (lower.includes('127.0.0.1') || lower.includes('localhost')) {
            setTimeout(() => {
                logWeb(`[SSRF FIREWALL] Security Exception: Access to loopback "${target}" is blocked by regex policy: ^(127\\.0\\.0\\.1|localhost)`, true);
                logWeb(`HTTP/1.1 403 Forbidden - Security Policy Violation`, true);
            }, 300);
            return;
        }

        // Check if targeting file system via LFI
        const isFileLfi = lower.startsWith('file://') || lower.includes('/proc/self') || lower.includes('proc/self/mem');
        if (isFileLfi) {
            if (lower.includes('mem') || lower.includes('maps') || lower.includes('environ')) {
                setTimeout(() => {
                    logWeb(`[LFI SUCCESS] Local File Inclusion on Linux ProcFS: "${target}"`);
                    logWeb(`Dumping process memory map from /proc/self/mem...`);
                    dumpProcessHeap();
                }, 400);
            } else {
                setTimeout(() => {
                    logWeb(`[LFI ERROR] File "${target}" accessed, but does not contain runtime session memory.`);
                }, 350);
            }
            return;
        }

        // Loopback IP bypasses (0.0.0.0, 2130706433, 0x7f000001, 127.1, [::], etc.)
        const isLoopbackHost = lower.includes('0.0.0.0') || lower.includes('2130706433') || lower.includes('0x7f000001') || lower.includes('127.1') || lower.includes('[::]');

        if (isLoopbackHost) {
            // Check port: MUST be port 8000!
            const portMatch = target.match(/:(\d+)/);
            const port = portMatch ? parseInt(portMatch[1]) : 80;

            if (port === 8000) {
                setTimeout(() => {
                    logWeb(`[SSRF BYPASS SUCCESS] Connected to internal loopback service on Port 8000.`);
                    if (lower.includes('dump-heap') || lower.includes('debug')) {
                        logWeb(`Extracting internal memory segment and runtime heap...`);
                        dumpProcessHeap();
                    } else {
                        logWeb(`[PORT 8000 ROUTER] Available Internal Endpoints:`);
                        logWeb(`  • POST /api/v1/invoice/render`);
                        logWeb(`  • POST /api/v1/keepalive (Convergence Watchdog)`);
                        logWeb(`  • GET  /api/internal/debug/dump-heap (Diagnostic Memory Heap Dump)`);
                        logWeb(`Targeting /api/internal/debug/dump-heap...`);
                        dumpProcessHeap();
                    }
                }, 400);
            } else {
                setTimeout(() => {
                    logWeb(`[!] NET::ERR_CONNECTION_REFUSED: Failed to connect to ${target}`, true);
                    logWeb(`[!] No HTTP service listening on port ${port}. (Web Microservice is running on Port 8000).`, true);
                }, 350);
            }
            return;
        }

        // Normal external template
        setTimeout(() => {
            logWeb(`[*] Rendered invoice template from external host. No internal data leaked.`);
        }, 350);
    });

    function dumpProcessHeap() {
        currentExtractedSecret = LIVE_SESSION_SECRET;
        if (extractedSecretDisplay) {
            extractedSecretDisplay.textContent = currentExtractedSecret;
        }

        setTimeout(() => {
            logWeb(`[✓] MEMORY HEAP EXTRACTION COMPLETE (/proc/self/mem @ 0x7fff5bc00000):`);
            logWeb(`----------------------------------------------------------------------`);
            logWeb(`0x7fff5bc01000: 45 50 48 45 4d 45 52 41 4c 5f 53 45 43 52 45 54  | EPHEMERAL_SECRET`);
            logWeb(`0x7fff5bc01010: ${currentExtractedSecret.match(/.{1,2}/g).join(' ')}  | [LIVE SESSION KEY]`);
            logWeb(`0x7fff5bc01030: 50 4f 52 54 3a 20 39 30 30 30 00 00 00 00 00 00  | PORT: 9000......`);
            logWeb(`----------------------------------------------------------------------`);
            logWeb(`[★] EXTRACTED LIVE SESSION KEY: ${currentExtractedSecret}`);
            logWeb(`Pass this 32-byte secret key to your Reversing Teammate (Player 2)!`);
            showToast('✓ Memory Key Extracted! Ready for Reversing Track');
        }, 500);
    }

    // Keepalive Ping Button (Player 1)
    btnKeepalive?.addEventListener('click', () => {
        // Reset local timer if in same window
        if (isAlarmActive) {
            alarmRemainingMs = 15000;
            updateTimerDisplay();
            logSocket(`[✓] KEEPALIVE BEACON RECEIVED from Web API: Anti-tamper alarm extended +15.0s!`);
        }

        // Broadcast to other tabs/windows on the same machine
        try {
            localStorage.setItem(`ctf6_keepalive_ping_${teamName}`, String(Date.now()));
        } catch (e) {}
        if (duoChannel) duoChannel.postMessage({ type: 'keepalive', team: teamName });

        // Broadcast to remote backend for cross-device support anywhere in the world!
        broadcastRemoteKeepalive();

        logWeb(`[✓] HTTP POST /api/v1/keepalive (Auth: ${currentExtractedSecret || LIVE_SESSION_SECRET}) -> 200 OK (Heartbeat reset to 15.0s)`);
        showToast('✓ Heartbeat extended +15s on Port 9000!');
    });

    // ====================================================================
    // TRACK 2: Binary Reverse Engineering (Feistel Cipher & Packet Lab)
    // ====================================================================
    function feistelEncrypt(payloadStr, secretHex, ivHex) {
        // 4-Round Feistel symmetric block cipher
        let blocks = [];
        for (let i = 0; i < payloadStr.length; i++) {
            blocks.push(payloadStr.charCodeAt(i));
        }
        while (blocks.length % 8 !== 0) {
            blocks.push(0x20); // space padding
        }

        let keyBytes = [];
        for (let i = 0; i < secretHex.length; i += 2) {
            keyBytes.push(parseInt(secretHex.substr(i, 2), 16) || 0);
        }

        let encrypted = [];
        for (let b = 0; b < blocks.length; b += 8) {
            let L = (blocks[b] << 24) | (blocks[b+1] << 16) | (blocks[b+2] << 8) | blocks[b+3];
            let R = (blocks[b+4] << 24) | (blocks[b+5] << 16) | (blocks[b+6] << 8) | blocks[b+7];

            for (let round = 0; round < 4; round++) {
                const k = (keyBytes[(round * 4) % keyBytes.length] << 24) |
                          (keyBytes[(round * 4 + 1) % keyBytes.length] << 16) |
                          (keyBytes[(round * 4 + 2) % keyBytes.length] << 8) |
                          keyBytes[(round * 4 + 3) % keyBytes.length];

                const F = ((((R << 3) | (R >>> 29)) ^ k ^ 0x5a5a5a5a) >>> 0);
                const nextR = (L ^ F) >>> 0;
                L = R;
                R = nextR;
            }

            encrypted.push((L >>> 24) & 0xff, (L >>> 16) & 0xff, (L >>> 8) & 0xff, L & 0xff);
            encrypted.push((R >>> 24) & 0xff, (R >>> 16) & 0xff, (R >>> 8) & 0xff, R & 0xff);
        }

        return encrypted.map(x => x.toString(16).padStart(2, '0')).join('');
    }

    function feistelDecrypt(cipherHex, secretHex) {
        let cipherBytes = [];
        for (let i = 0; i < cipherHex.length; i += 2) {
            cipherBytes.push(parseInt(cipherHex.substr(i, 2), 16) || 0);
        }

        let keyBytes = [];
        for (let i = 0; i < secretHex.length; i += 2) {
            keyBytes.push(parseInt(secretHex.substr(i, 2), 16) || 0);
        }

        let decryptedBytes = [];
        for (let b = 0; b < cipherBytes.length; b += 8) {
            if (b + 8 > cipherBytes.length) break;
            let L = (cipherBytes[b] << 24) | (cipherBytes[b+1] << 16) | (cipherBytes[b+2] << 8) | cipherBytes[b+3];
            let R = (cipherBytes[b+4] << 24) | (cipherBytes[b+5] << 16) | (cipherBytes[b+6] << 8) | cipherBytes[b+7];

            for (let round = 3; round >= 0; round--) {
                const k = (keyBytes[(round * 4) % keyBytes.length] << 24) |
                          (keyBytes[(round * 4 + 1) % keyBytes.length] << 16) |
                          (keyBytes[(round * 4 + 2) % keyBytes.length] << 8) |
                          keyBytes[(round * 4 + 3) % keyBytes.length];

                const F = ((((L << 3) | (L >>> 29)) ^ k ^ 0x5a5a5a5a) >>> 0);
                const prevL = (R ^ F) >>> 0;
                R = L;
                L = prevL;
            }

            decryptedBytes.push((L >>> 24) & 0xff, (L >>> 16) & 0xff, (L >>> 8) & 0xff, L & 0xff);
            decryptedBytes.push((R >>> 24) & 0xff, (R >>> 16) & 0xff, (R >>> 8) & 0xff, R & 0xff);
        }

        return String.fromCharCode.apply(null, decryptedBytes);
    }

    btnCraftPacket?.addEventListener('click', () => {
        const secret = (secretInput.value || '').trim();
        const cmd = (commandInput.value || 'AUTH_ROOT_DEBUG').trim();

        if (!secret) {
            alert('Please provide the 32-byte Session Secret extracted by Player 1 in Track 1.');
            return;
        }

        const ivHex = "a1b2c3d4e5f60718293a4b5c6d7e8f90";
        const tsHex = Math.floor(Date.now() / 1000).toString(16).padStart(8, '0');
        const payloadHex = feistelEncrypt(cmd + ":" + secret, secret, ivHex);

        const packet = `${MAGIC_HEADER}${ivHex}${tsHex}${payloadHex}`;
        packetHexOutput.value = packet;
        showToast('✓ Binary Packet Assembled!');
    });

    btnSendToDaemon?.addEventListener('click', () => {
        const packet = (packetHexOutput.value || '').trim();
        if (!packet) {
            alert('Please craft an authenticated packet first.');
            return;
        }

        setActiveTab('convergence');
        connectDaemon(packet);
    });

    // ====================================================================
    // PHASE 3: Convergence Stage (Port 9000 TCP Socket & Heartbeat Alarm)
    // ====================================================================
    function logSocket(msg, isSystem = true) {
        const prefix = isSystem ? '[DAEMON]' : 'root@splitbrain:~#';
        socketConsole.textContent += `${prefix} ${msg}\n`;
        socketConsole.scrollTop = socketConsole.scrollHeight;
    }

    function startHeartbeatTimer() {
        if (alarmInterval) clearInterval(alarmInterval);
        alarmRemainingMs = 15000;
        isAlarmActive = true;

        // Broadcast session start to local storage, broadcast channel, and cloud backend
        try {
            localStorage.setItem(`ctf6_active_session_${teamName}`, JSON.stringify({ active: true, time: Date.now() }));
        } catch (e) {}
        if (duoChannel) duoChannel.postMessage({ type: 'session_start', team: teamName });
        broadcastRemoteSessionStart();
        startRemoteHeartbeatPolling();

        alarmInterval = setInterval(() => {
            alarmRemainingMs -= 100;
            if (alarmRemainingMs <= 0) {
                alarmRemainingMs = 0;
                clearInterval(alarmInterval);
                if (pollServerHeartbeatInterval) clearInterval(pollServerHeartbeatInterval);
                isAlarmActive = false;
                triggerAlarmTimeout();
            }
            updateTimerDisplay();
        }, 100);
    }

    function updateTimerDisplay() {
        const seconds = (alarmRemainingMs / 1000).toFixed(1);
        if (raceTimerDisplay) {
            raceTimerDisplay.textContent = `${seconds}s`;
        }
        if (heartbeatBar) {
            const pct = Math.max(0, Math.min(100, (alarmRemainingMs / 15000) * 100));
            heartbeatBar.style.width = `${pct}%`;
            if (pct < 30) {
                heartbeatBar.style.background = '#ff2a40';
            } else if (pct < 60) {
                heartbeatBar.style.background = '#ffb800';
            } else {
                heartbeatBar.style.background = '#00ff9d';
            }
        }
    }

    function triggerAlarmTimeout() {
        logSocket(`[!] ALARM(15) SIGNAL TRIGGERED! Keepalive beacon timeout.`);
        logSocket(`[!] Session terminated by kernel watchdog. Connection closed by foreign host.`);
        logSocket(`[!] Memory key has been randomized. Re-extract key from Track 1.`);
        isSessionAuthenticated = false;
        if (convergenceNotice) {
            convergenceNotice.textContent = '⛔ SESSION TERMINATED: 15s Heartbeat expired without keepalive ping.';
            convergenceNotice.style.color = 'var(--neon-red)';
        }

        if (pollServerHeartbeatInterval) clearInterval(pollServerHeartbeatInterval);

        // Broadcast session end to local storage, broadcast channel, and cloud backend
        try {
            localStorage.removeItem(`ctf6_active_session_${teamName}`);
        } catch (e) {}
        if (duoChannel) duoChannel.postMessage({ type: 'session_end', team: teamName });
        broadcastRemoteSessionEnd();

        showToast('❌ Keepalive timeout! Re-authenticate session.');
    }

    function connectDaemon(packetHex) {
        logSocket(`Connecting to protocol_bridge on tcp://0.0.0.0:9000...`);
        logSocket(`Transmitting packet (${packetHex.length / 2} bytes): ${packetHex}`);

        setTimeout(() => {
            if (!packetHex.startsWith(MAGIC_HEADER)) {
                logSocket(`[!] REJECTED: Bad magic header. Expected 0x53504C54 ('SPLT').`);
                return;
            }

            // Packet format: MAGIC (8 hex) + IV (32 hex) + TS (8 hex) + PAYLOAD (rest hex)
            const payloadHex = packetHex.substring(48);
            const decrypted = feistelDecrypt(payloadHex, LIVE_SESSION_SECRET);

            if (!decrypted.includes('AUTH_ROOT_DEBUG')) {
                logSocket(`[!] CIPHER MISMATCH: Decrypted payload contains invalid session authentication key.`);
                return;
            }

            isSessionAuthenticated = true;
            logSocket(`[✓] MAGIC VERIFIED: "SPLT" (0x53504C54)`);
            logSocket(`[✓] FEISTEL CIPHER DECRYPTED: Command "AUTH_ROOT_DEBUG" authenticated!`);
            logSocket(`[✓] FORKING UNPRIVILEGED DEBUG WORKER (PID: 31337)...`);
            logSocket(`------------------------------------------------------------`);
            logSocket(`=== CYRAKSHA SPLIT-BRAIN PROTOCOL BRIDGE ROOT CONSOLE ===`);
            logSocket(`WARNING: Anti-tamper watchdog active. alarm(15) initiated.`);
            logSocket(`Keep session alive via Track 1 POST /api/v1/keepalive beacon!`);
            logSocket(`Type 'cat /root/flag.txt' or 'help' to inspect system.`);
            logSocket(`------------------------------------------------------------`);

            if (convergenceNotice) {
                convergenceNotice.textContent = '🟢 LIVE CONVERGENCE CONSOLE OPEN (15s Watchdog Active)';
                convergenceNotice.style.color = 'var(--neon-emerald)';
            }

            startHeartbeatTimer();
            showToast('✓ TCP Debug Console Unlocked!');
        }, 500);
    }

    // Socket Terminal Input
    btnSendCmd?.addEventListener('click', handleSocketCommand);
    cmdSocketInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleSocketCommand();
    });

    function handleSocketCommand() {
        const cmd = (cmdSocketInput.value || '').trim();
        if (!cmd) return;
        cmdSocketInput.value = '';

        if (!isSessionAuthenticated) {
            logSocket(cmd, false);
            logSocket(`[!] ERROR: Not connected to daemon. Replay authenticated packet from Track 2.`);
            return;
        }

        logSocket(cmd, false);

        if (cmd === 'cat /root/flag.txt' || cmd === 'cat flag.txt' || cmd === 'flag') {
            const rootFlag = getRootFlag();
            logSocket(`[ROOT CAPTURE SUCCESS] Reading /root/flag.txt...`);
            logSocket(`\n${rootFlag}\n`);

            if (flagCaptureCard) {
                flagCaptureCard.classList.remove('hidden');
            }
            if (rootFlagDisplay) {
                rootFlagDisplay.textContent = rootFlag;
            }
            showToast('🎉 CONGRATULATIONS! Root Flag Captured!');
        } else if (cmd === 'help') {
            logSocket(`Available diagnostic commands:`);
            logSocket(`  cat /root/flag.txt   - Display root system victory flag`);
            logSocket(`  uname -a             - Print Linux kernel architecture`);
            logSocket(`  id                   - Print current user privileges (uid=0 root)`);
            logSocket(`  ps aux               - List active container daemons`);
        } else if (cmd === 'id') {
            logSocket(`uid=0(root) gid=0(root) groups=0(root)`);
        } else if (cmd === 'uname -a') {
            logSocket(`Linux split-brain-node 5.15.0-cyraksha x86_64 GNU/Linux`);
        } else if (cmd === 'ps aux') {
            logSocket(`PID   USER     COMMAND`);
            logSocket(`1     root     /usr/bin/supervisord`);
            logSocket(`8     daemon   /usr/local/bin/protocol_bridge --port 9000`);
            logSocket(`14    www-data python3 /app/server.py --port 8000`);
        } else {
            logSocket(`bash: ${cmd}: command not found. Try 'cat /root/flag.txt'`);
        }
    }

    btnCopyFlag?.addEventListener('click', () => {
        if (rootFlagDisplay) {
            navigator.clipboard.writeText(rootFlagDisplay.textContent);
            showToast('✓ Flag copied to clipboard!');
        }
    });
});
