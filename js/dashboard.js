// CTF Arena Participant Dashboard, Scoring Engine & Live Leaderboard
(function () {
    // Frame buster: Prevent dashboard from nesting inside iframe runner modals
    if (window.self !== window.top) {
        try {
            window.parent.postMessage({ action: 'close_runner_modal' }, '*');
        } catch (e) {}
        window.top.location.href = window.location.href;
        return;
    }

    const STORAGE_SESSION_KEY = 'ctf_active_session';
    const STORAGE_SCORES_KEY = 'ctf_teams_progress';

    // Verify session
    let currentSession = null;
    try {
        const raw = localStorage.getItem(STORAGE_SESSION_KEY);
        if (raw) currentSession = JSON.parse(raw);
    } catch (e) {}

    if (!currentSession || !currentSession.teamName) {
        window.location.href = 'index.html';
        return;
    }

    // Challenge Registry
    const CHALLENGES = {
        ctf0: {
            id: 'ctf0',
            name: 'The Liar Button',
            category: 'Web / DOM Inspection',
            basePoints: 200,
            flags: [],
            url: 'CTF0/flag.html',
            desc: 'A suspicious button claims to grant the flag, but looks can be deceiving. Inspect the underlying source code to find what is hidden.'
        },
        ctf1: {
            id: 'ctf1',
            name: 'Cyraksha CTF Challenge Hub',
            category: 'Web & Forensics',
            basePoints: 200,
            flags: [],
            url: 'CTF1/index.html',
            desc: 'Navigate the challenge hub. Audit hidden DOM attributes in "There is no flag here" or uncover hidden files inside the event zip archive.'
        },
        ctf2: {
            id: 'ctf2',
            name: 'CYRAKSHA Sign In',
            category: 'Web / Reconnaissance',
            basePoints: 200,
            flags: [],
            url: 'CTF2/index.html',
            desc: 'The login page claims the password is not a password. Inspect client-side elements to authenticate as admin and extract the key.'
        },
        ctf3: {
            id: 'ctf3',
            name: 'Gateway Auth Level 1',
            category: 'Web / Metadata Clues',
            basePoints: 200,
            flags: [],
            url: 'CTF3/index.html',
            desc: 'The system asks for the most common password, but true hackers look where others forget. Check metadata clues to unlock the gateway.'
        },
        ctf4: {
            id: 'ctf4',
            name: 'The Hidden Message',
            category: 'Steganography / Terminal',
            basePoints: 200,
            flags: [],
            url: 'CTF4/index.html',
            desc: 'Inspect an image carrier file using standard Linux steganography tools inside an interactive terminal workspace to extract the hidden payload.',
            hasHints: true,
            hints: [
                { id: 1, cost: 0, text: 'The picture may contain more than pixels.' },
                { id: 2, cost: 10, text: 'Search for tools used to hide information inside images.' },
                { id: 3, cost: 20, text: 'steghide might be worth investigating.' }
            ]
        },
        ctf5: {
            id: 'ctf5',
            name: 'Cyraksha Notes (Boss Box)',
            category: 'Web / Broken Access Control',
            basePoints: 500,
            flags: [],
            url: 'CTF5/public/index.html',
            desc: 'A private notes storage vault where access control is trusted blindly from client cookies. Manipulate authorization cookies to access root notes.'
        },
        ctf6: {
            id: 'ctf6',
            name: 'Split-Brain Protocol (Duo Box)',
            category: 'Duo Hybrid / Web + Reversing + Crypto',
            basePoints: 1000,
            flags: [],
            url: 'CTF6/index.html',
            desc: 'A high-intensity dual-workstream operation: Web heap memory dump via SSRF on Port 8000, Feistel cipher binary reversing on Port 9000, and a 15-second heartbeat race condition.'
        },
        ctf7: {
            id: 'ctf7',
            name: 'Shadow Vault',
            category: 'Web / Recon & Backup Analysis',
            basePoints: 200,
            flags: [],
            url: 'CTF7/public/index.html',
            desc: 'A restricted vault authentication service. Investigate crawler directives and decommissioned backup endpoints to uncover the access credentials.'
        }
    };

    function getTotalMaxPoints() {
        return Object.values(CHALLENGES).reduce((sum, ch) => sum + (ch.basePoints || 0), 0);
    }

    // Load or initialize progress
    function getProgressData() {
        let allProgress = {};
        try {
            const raw = localStorage.getItem(STORAGE_SCORES_KEY);
            if (raw) allProgress = JSON.parse(raw);
        } catch (e) {}

        const teamKey = currentSession.teamName.toLowerCase();
        if (!allProgress[teamKey]) {
            allProgress[teamKey] = {
                teamName: currentSession.teamName,
                mode: currentSession.mode || 'team',
                solved: {},
                hintsUnlocked: { 1: false, 2: false, 3: false },
                totalScore: 0,
                lastSolveTime: null
            };
        }
        return { allProgress, teamProgress: allProgress[teamKey] };
    }

    function saveProgress(allProgress) {
        localStorage.setItem(STORAGE_SCORES_KEY, JSON.stringify(allProgress));
    }

    // Audio SFX
    function playAudio(freq, type, duration) {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, ctx.currentTime);
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + duration);
        } catch (e) {}
    }

    function playSuccessFanfare() {
        playAudio(523.25, 'sine', 0.12);
        setTimeout(() => playAudio(659.25, 'sine', 0.12), 100);
        setTimeout(() => playAudio(783.99, 'sine', 0.15), 200);
        setTimeout(() => playAudio(1046.50, 'triangle', 0.4), 300);
    }

    function playErrorTone() {
        playAudio(150, 'sawtooth', 0.25);
    }

    // Confetti Animation
    function launchConfetti() {
        const canvas = document.getElementById('confetti-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const pieces = [];
        const colors = ['#d90429', '#ef233c', '#3b82f6', '#10b981', '#fbbf24', '#ffffff'];

        for (let i = 0; i < 90; i++) {
            pieces.push({
                x: canvas.width / 2,
                y: canvas.height / 2,
                vx: (Math.random() - 0.5) * 20,
                vy: (Math.random() - 0.7) * 20,
                size: Math.random() * 8 + 4,
                color: colors[Math.floor(Math.random() * colors.length)],
                rotation: Math.random() * 360,
                rotSpeed: (Math.random() - 0.5) * 10
            });
        }

        let frames = 0;
        function updateConfetti() {
            frames++;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            pieces.forEach(p => {
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.4;
                p.rotation += p.rotSpeed;

                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate((p.rotation * Math.PI) / 180);
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
                ctx.restore();
            });

            if (frames < 120) {
                requestAnimationFrame(updateConfetti);
            } else {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
        }
        updateConfetti();
    }

    // Calculate score
    function recalculateTotalScore(teamProgress) {
        let total = 0;
        Object.keys(CHALLENGES).forEach(cid => {
            if (teamProgress.solved && teamProgress.solved[cid]) {
                if (cid === 'ctf4') {
                    let ctf4Yield = CHALLENGES.ctf4.basePoints;
                    if (teamProgress.hintsUnlocked && teamProgress.hintsUnlocked[2]) ctf4Yield -= 10;
                    if (teamProgress.hintsUnlocked && teamProgress.hintsUnlocked[3]) ctf4Yield -= 20;
                    total += Math.max(0, ctf4Yield);
                } else {
                    total += CHALLENGES[cid].basePoints;
                }
            }
        });
        teamProgress.totalScore = total;
        return total;
    }

    // Escape HTML helper
    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // UI Initialization
    document.addEventListener('DOMContentLoaded', () => {
        const teamNameDisplay = document.getElementById('nav-team-name');
        const teamModeTag = document.getElementById('nav-team-mode');
        const scoreCounter = document.getElementById('live-score-digits');
        const logoutBtn = document.getElementById('btn-logout');
        const scorecardBtn = document.getElementById('btn-scorecard');
        const giveUpBtn = document.getElementById('btn-give-up');
        const giveUpBtnText = document.getElementById('give-up-btn-text');

        const tabBtnBoxes = document.getElementById('tab-btn-boxes');
        const tabBtnLeaderboard = document.getElementById('tab-btn-leaderboard');
        const tabPaneBoxes = document.getElementById('tab-pane-boxes');
        const tabPaneLeaderboard = document.getElementById('tab-pane-leaderboard');
        const leaderboardTbody = document.getElementById('leaderboard-tbody');

        const runnerModal = document.getElementById('runner-modal');
        const runnerIframe = document.getElementById('runner-iframe');
        const runnerTitle = document.getElementById('runner-modal-title');
        const runnerNewTab = document.getElementById('runner-newtab-btn');
        const closeRunnerBtn = document.getElementById('close-runner-modal');

        const scoreModal = document.getElementById('score-modal');
        const closeScoreBtn = document.getElementById('close-score-modal');

        const suspensionOverlay = document.getElementById('suspension-overlay');
        const suspensionReasonText = document.getElementById('suspension-reason-text');
        const suspensionCountdownTimer = document.getElementById('suspension-countdown-timer');

        let isCurrentlySuspended = false;
        let suspensionEndTime = 0;
        let countdownInterval = null;

        function formatCountdown(sec) {
            if (sec <= 0) return '00:00';
            const hrs = Math.floor(sec / 3600);
            const mins = Math.floor((sec % 3600) / 60);
            const secs = sec % 60;
            if (hrs > 0) {
                return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
            }
            return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        }

        function updateSuspensionLock(suspInfo) {
            if (!suspInfo) return;

            const isSuspendedOnServer = !!(suspInfo.isSuspended || suspInfo.suspended);
            const untilMs = suspInfo.suspendedUntil ? new Date(suspInfo.suspendedUntil).getTime() : 0;
            const now = Date.now();

            // 1. Server confirms active, unexpired suspension
            if (isSuspendedOnServer && untilMs > now) {
                isCurrentlySuspended = true;
                suspensionEndTime = untilMs;

                try {
                    localStorage.setItem('ctf_active_suspension', JSON.stringify({
                        isSuspended: true,
                        suspendedUntil: suspInfo.suspendedUntil,
                        suspendReason: suspInfo.suspendReason || 'Temporary suspension applied by contest arbiters.'
                    }));
                } catch (e) {}

                if (suspensionReasonText) {
                    suspensionReasonText.textContent = `"${suspInfo.suspendReason || 'Temporary suspension applied by contest arbiters.'}"`;
                }
                if (suspensionOverlay) {
                    suspensionOverlay.classList.add('open');
                }

                if (countdownInterval) clearInterval(countdownInterval);
                const tick = () => {
                    const remaining = Math.max(0, Math.round((suspensionEndTime - Date.now()) / 1000));
                    if (suspensionCountdownTimer) {
                        suspensionCountdownTimer.textContent = formatCountdown(remaining);
                    }
                    if (remaining <= 0) {
                        clearInterval(countdownInterval);
                        countdownInterval = null;
                        isCurrentlySuspended = false;
                        try { localStorage.removeItem('ctf_active_suspension'); } catch (e) {}
                        if (suspensionOverlay) suspensionOverlay.classList.remove('open');
                        alert('✓ Your temporary suspension has ended. Arena access and flag submissions are restored!');
                    }
                };
                tick();
                countdownInterval = setInterval(tick, 1000);
                return;
            }

            // 2. Server confirms NOT suspended, or suspension duration has expired
            if (!isSuspendedOnServer || (untilMs > 0 && untilMs <= now)) {
                if (isCurrentlySuspended || (suspensionOverlay && suspensionOverlay.classList.contains('open'))) {
                    isCurrentlySuspended = false;
                    suspensionEndTime = 0;
                    if (countdownInterval) {
                        clearInterval(countdownInterval);
                        countdownInterval = null;
                    }
                    try { localStorage.removeItem('ctf_active_suspension'); } catch (e) {}
                    if (suspensionOverlay) {
                        suspensionOverlay.classList.remove('open');
                    }
                    alert('✓ Suspension lifted by an administrator! Arena access is restored.');
                } else {
                    try { localStorage.removeItem('ctf_active_suspension'); } catch (e) {}
                }
            }
        }

        // Set user info
        if (teamNameDisplay) teamNameDisplay.textContent = currentSession.teamName;
        if (teamModeTag) teamModeTag.textContent = currentSession.mode === 'solo' ? 'SOLO' : 'TEAM';

        // Tab Switching
        function switchTab(targetTab) {
            if (targetTab === 'leaderboard') {
                tabBtnBoxes.classList.remove('active');
                tabBtnLeaderboard.classList.add('active');
                tabPaneBoxes.classList.remove('active');
                tabPaneLeaderboard.classList.add('active');
                fetchAndRenderLeaderboard();
            } else {
                tabBtnLeaderboard.classList.remove('active');
                tabBtnBoxes.classList.add('active');
                tabPaneLeaderboard.classList.remove('active');
                tabPaneBoxes.classList.add('active');
            }
        }

        if (tabBtnBoxes) tabBtnBoxes.addEventListener('click', () => switchTab('boxes'));
        if (tabBtnLeaderboard) tabBtnLeaderboard.addEventListener('click', () => switchTab('leaderboard'));

        // Refresh UI & Challenge Card States
        function refreshUI() {
            const { allProgress, teamProgress } = getProgressData();
            const total = recalculateTotalScore(teamProgress);
            saveProgress(allProgress);

            if (scoreCounter) scoreCounter.textContent = `${total} / ${getTotalMaxPoints()}`;

            const availableBoxesEl = document.getElementById('header-available-count');
            if (availableBoxesEl) {
                availableBoxesEl.textContent = String(Object.keys(CHALLENGES).length).padStart(2, '0');
            }

            const isGivenUp = !!teamProgress.hasGivenUp;
            if (giveUpBtn) {
                if (isGivenUp) {
                    giveUpBtn.classList.add('concluded');
                    giveUpBtn.title = 'View Official Scorecard';
                    if (giveUpBtnText) giveUpBtnText.textContent = 'Scorecard';
                } else {
                    giveUpBtn.classList.remove('concluded');
                    giveUpBtn.title = 'Give Up & Conclude Contest';
                    if (giveUpBtnText) giveUpBtnText.textContent = 'Give Up';
                }
            }

            // Update challenge cards
            Object.keys(CHALLENGES).forEach(cid => {
                const card = document.getElementById(`card-${cid}`);
                const input = document.getElementById(`flag-input-${cid}`);
                const btn = document.getElementById(`btn-submit-${cid}`);
                const msg = document.getElementById(`msg-${cid}`);
                const tagPts = document.getElementById(`tag-pts-${cid}`);

                if (teamProgress.solved && teamProgress.solved[cid]) {
                    if (card) {
                        card.classList.add('solved');
                        card.classList.remove('concluded-locked');
                    }
                    if (input) {
                        input.value = '✔ Solved & Verified';
                        input.disabled = true;
                    }
                    if (btn) {
                        btn.textContent = 'SOLVED';
                        btn.disabled = true;
                    }
                    if (msg) {
                        msg.className = 'flag-status-msg success';
                        msg.textContent = `Awarded +${teamProgress.solved[cid].points} PTS`;
                    }
                    if (tagPts) {
                        tagPts.textContent = `✔ +${teamProgress.solved[cid].points} PTS`;
                    }
                } else if (isGivenUp) {
                    if (card) {
                        card.classList.remove('solved');
                        card.classList.add('concluded-locked');
                    }
                    if (input) {
                        input.value = '— Surrendered —';
                        input.disabled = true;
                    }
                    if (btn) {
                        btn.textContent = 'LOCKED';
                        btn.disabled = true;
                    }
                    if (msg) {
                        msg.className = 'flag-status-msg';
                        msg.textContent = 'Challenge locked (Given Up)';
                        msg.style.display = 'block';
                    }
                    if (tagPts) {
                        tagPts.textContent = '🔒 LOCKED';
                    }
                } else {
                    if (card) {
                        card.classList.remove('solved');
                        card.classList.remove('concluded-locked');
                    }
                    if (input) {
                        input.disabled = false;
                        if (input.value.startsWith('—') || input.value.startsWith('✔')) input.value = '';
                    }
                    if (btn) {
                        btn.textContent = 'SUBMIT';
                        btn.disabled = false;
                    }
                }
            });

            // Update CTF4 hint buttons
            if (CHALLENGES.ctf4) {
                [1, 2, 3].forEach(hintNum => {
                    const hBtn = document.getElementById(`unlock-hint-btn-${hintNum}`);
                    const hText = document.getElementById(`hint-text-${hintNum}`);
                    if (teamProgress.hintsUnlocked && teamProgress.hintsUnlocked[hintNum]) {
                        if (hBtn) {
                            hBtn.classList.add('unlocked');
                        }
                        if (hText) {
                            hText.textContent = `Hint ${hintNum}: ${CHALLENGES.ctf4.hints[hintNum - 1].text}`;
                        }
                    }
                });
            }
        }

        function formatDuration(seconds) {
            if (!seconds || seconds <= 0) return '00:00:00';
            const hrs = Math.floor(seconds / 3600);
            const mins = Math.floor((seconds % 3600) / 60);
            const secs = Math.floor(seconds % 60);
            return [
                hrs.toString().padStart(2, '0'),
                mins.toString().padStart(2, '0'),
                secs.toString().padStart(2, '0')
            ].join(':');
        }

        function calculateLocalDuration(teamProg) {
            if (!teamProg) return '00:00:00';
            let startT = 0;
            if (teamProg.startTime) startT = new Date(teamProg.startTime).getTime();
            else if (currentSession && currentSession.loginTime) startT = new Date(currentSession.loginTime).getTime();

            let lastSolveT = 0;
            if (teamProg.solved) {
                Object.values(teamProg.solved).forEach(s => {
                    if (s && s.timestamp) {
                        const t = new Date(s.timestamp).getTime();
                        if (t > lastSolveT) lastSolveT = t;
                    }
                });
            }

            if (lastSolveT > 0 && startT > 0 && lastSolveT >= startT) {
                const sec = Math.max(1, Math.round((lastSolveT - startT) / 1000));
                return formatDuration(sec);
            }
            return '00:00:00';
        }

        // Fetch & Render Live Leaderboard
        async function fetchAndRenderLeaderboard() {
            try {
                let leaderboardData = [];
                let deletedTeamsMap = {};

                // Fetch from master admin server first, fallback to current origin
                const candidateEndpoints = [];
                if (!window.location.origin.includes('cyraksha-ctf-admin.onrender.com')) {
                    candidateEndpoints.push('https://cyraksha-ctf-admin.onrender.com/api/leaderboard');
                }
                candidateEndpoints.push(`${window.location.origin}/api/leaderboard`);

                for (const endpoint of candidateEndpoints) {
                    try {
                        const res = await fetch(endpoint).catch(() => null);
                        if (res && res.ok) {
                            const data = await res.json();
                            if (data && data.success && Array.isArray(data.leaderboard)) {
                                leaderboardData = data.leaderboard;
                                if (data.deletedTeams) {
                                    deletedTeamsMap = { ...deletedTeamsMap, ...data.deletedTeams };
                                }
                                break;
                            }
                        }
                    } catch (e) {}
                }

                // Scrub deleted teams from local storage immediately
                if (Object.keys(deletedTeamsMap).length > 0) {
                    const delKeys = Object.keys(deletedTeamsMap).map(k => k.toLowerCase().trim());
                    try {
                        const localScores = JSON.parse(localStorage.getItem(STORAGE_SCORES_KEY) || '{}');
                        const localUsers = JSON.parse(localStorage.getItem('ctf_registered_users') || '{}');
                        delKeys.forEach(k => {
                            delete localScores[k];
                            delete localUsers[k];
                        });
                        localStorage.setItem(STORAGE_SCORES_KEY, JSON.stringify(localScores));
                        localStorage.setItem('ctf_registered_users', JSON.stringify(localUsers));
                    } catch (e) {}
                }

                // Filter out any deleted teams from leaderboard data
                const delSet = new Set(Object.keys(deletedTeamsMap).map(k => k.toLowerCase().trim()));
                leaderboardData = leaderboardData.filter(t => t && t.teamName && !delSet.has(t.teamName.toLowerCase().trim()));

                // Fallback: If server leaderboard is empty, compute from local cache
                if (!leaderboardData || leaderboardData.length === 0) {
                    const raw = localStorage.getItem(STORAGE_SCORES_KEY);
                    if (raw) {
                        const allProgress = JSON.parse(raw);
                        leaderboardData = Object.values(allProgress)
                            .filter(p => p && p.teamName && !delSet.has(p.teamName.toLowerCase().trim()))
                            .map((p, idx) => ({
                                rank: idx + 1,
                                teamName: p.teamName,
                                mode: p.mode || 'team',
                                totalScore: p.totalScore || 0,
                                solved: p.solved || {},
                                isOnline: true,
                                formattedDuration: calculateLocalDuration(p)
                            })).sort((a, b) => b.totalScore - a.totalScore);
                    }
                }

                if (!leaderboardTbody) return;

                if (leaderboardData.length === 0) {
                    leaderboardTbody.innerHTML = `
                        <tr>
                            <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 32px;">
                                No participants on the leaderboard yet. Be the first to solve a box!
                            </td>
                        </tr>
                    `;
                    return;
                }

                leaderboardTbody.innerHTML = leaderboardData.map((team, idx) => {
                    const isSelf = team.teamName.toLowerCase() === currentSession.teamName.toLowerCase();
                    if (isSelf) {
                        updateSuspensionLock(team);
                        syncTeamProgressFromServer({ success: true, solved: team.solved, totalScore: team.totalScore, hasGivenUp: team.hasGivenUp });
                    }

                    const rankNum = idx + 1;
                    let rankClass = 'rank-default';
                    if (rankNum === 1) rankClass = 'rank-1';
                    else if (rankNum === 2) rankClass = 'rank-2';
                    else if (rankNum === 3) rankClass = 'rank-3';

                    const matrixPills = Object.keys(CHALLENGES).map(cid => {
                        const isSolved = team.solved && team.solved[cid];
                        return `<span class="matrix-pill ${isSolved ? 'solved' : ''}">#${cid.toUpperCase()}</span>`;
                    }).join('');

                    const isOnline = isSelf ? true : !!team.isOnline;
                    const durationText = team.totalScore > 0 
                        ? `⏱ ${team.formattedDuration && team.formattedDuration !== '00:00:00' ? team.formattedDuration : formatDuration(team.durationSeconds || 60)}` 
                        : '<span style="color:var(--text-muted);">—</span>';

                    let statusHtml = '';
                    if (team.isSuspended) {
                        statusHtml = `<span style="display:inline-flex; align-items:center; gap:4px; font-size:10.5px; font-family:var(--font-mono); color:#ff4d61; font-weight:700; background:rgba(255,34,56,0.1); padding:2px 6px; border-radius:3px; border:1px solid rgba(255,34,56,0.3);">⛔ SUSPENDED</span>`;
                    } else if (team.hasGivenUp) {
                        statusHtml = `
                            <span style="display:inline-flex; align-items:center; gap:4px; font-size:10.5px; font-family:var(--font-mono); color:#fb7185; font-weight:700; background:rgba(225,29,72,0.08); padding:2px 6px; border-radius:3px; border:1px solid rgba(225,29,72,0.25);">
                                🏳️ CONCLUDED
                            </span>
                        `;
                    } else if (isOnline) {
                        statusHtml = `
                            <span style="display:inline-flex; align-items:center; gap:5px; font-size:11px; font-family:var(--font-mono); color:#10b981;">
                                <span style="width:6px; height:6px; border-radius:50%; background:#10b981; box-shadow:0 0 6px #10b981;"></span> Online
                            </span>
                        `;
                    } else {
                        statusHtml = `
                            <span style="display:inline-flex; align-items:center; gap:5px; font-size:11px; font-family:var(--font-mono); color:#94a3b8;">
                                <span style="width:6px; height:6px; border-radius:50%; background:#64748b;"></span> Offline
                            </span>
                        `;
                    }

                    return `
                        <tr style="${isSelf ? 'background: rgba(217, 4, 41, 0.04);' : ''}">
                            <td>
                                <span class="rank-badge ${rankClass}">#${rankNum}</span>
                            </td>
                            <td class="team-name-cell">
                                <span>${escapeHtml(team.teamName)}</span>
                                ${isSelf ? '<span style="color: var(--brand-red); font-size: 11px; margin-left: 6px;">(You)</span>' : ''}
                            </td>
                            <td>
                                ${statusHtml}
                            </td>
                            <td>
                                <span class="division-pill">${(team.mode || 'team').toUpperCase()}</span>
                            </td>
                            <td>
                                <div class="matrix-pills-row">${matrixPills}</div>
                            </td>
                            <td class="score-cell">
                                ${team.totalScore} PTS
                            </td>
                            <td class="time-cell">
                                ${durationText}
                            </td>
                        </tr>
                    `;
                }).join('');

            } catch (err) {
                console.error('Error fetching leaderboard:', err);
            }
        }

        // Flag Submission Handlers
        Object.keys(CHALLENGES).forEach(cid => {
            const btn = document.getElementById(`btn-submit-${cid}`);
            const input = document.getElementById(`flag-input-${cid}`);
            const msg = document.getElementById(`msg-${cid}`);

            if (btn && input) {
                btn.addEventListener('click', () => {
                    if (isCurrentlySuspended) {
                        alert('⛔ Action blocked: Your account is currently suspended. Please wait until the timer expires.');
                        return;
                    }

                    const { allProgress, teamProgress } = getProgressData();
                    if (teamProgress.hasGivenUp) {
                        alert('🏁 Competition concluded: You surrendered and finalized your attempt. You can review your scorecard anytime.');
                        openScorecardModal();
                        return;
                    }

                    const submitted = input.value.trim();
                    if (!submitted) return;

                    // Disable button while validating server-side
                    btn.disabled = true;
                    btn.textContent = 'VERIFYING...';

                    // Server-side flag validation
                    const solveIsoTime = new Date().toISOString();
                    const syncTargets = getSyncTargets();
                    let validated = false;

                    (async () => {
                        for (const apiBase of syncTargets) {
                            if (validated) break;
                            try {
                                const resp = await fetch(`${apiBase}/api/sync/solve`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        teamName: currentSession.teamName,
                                        cid,
                                        flagSubmitted: submitted,
                                        hintsUnlocked: teamProgress.hintsUnlocked || {},
                                        timestamp: solveIsoTime
                                    })
                                });
                                const result = await resp.json();

                                if (result.success) {
                                    validated = true;
                                    const pts = result.points || CHALLENGES[cid].basePoints;

                                    if (!teamProgress.solved) teamProgress.solved = {};
                                    teamProgress.solved[cid] = {
                                        points: pts,
                                        flagSubmitted: submitted,
                                        timestamp: solveIsoTime
                                    };
                                    teamProgress.lastSolveTime = solveIsoTime;
                                    const currentTotal = recalculateTotalScore(teamProgress);
                                    saveProgress(allProgress);

                                    // Broadcast to remaining servers (fire-and-forget)
                                    syncTargets.forEach(otherBase => {
                                        if (otherBase === apiBase) return;
                                        fetch(`${otherBase}/api/sync/solve`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({
                                                teamName: currentSession.teamName,
                                                cid,
                                                flagSubmitted: submitted,
                                                hintsUnlocked: teamProgress.hintsUnlocked || {},
                                                timestamp: solveIsoTime
                                            })
                                        }).catch(() => {});
                                    });

                                    playSuccessFanfare();
                                    launchConfetti();
                                    refreshUI();

                                    if (Object.keys(teamProgress.solved).length === Object.keys(CHALLENGES).length) {
                                        setTimeout(() => {
                                            alert(`🎉 CONGRATULATIONS ${currentSession.teamName}! You have solved ALL ${Object.keys(CHALLENGES).length} CTF Challenges!\nYour final score: ${currentTotal} PTS.`);
                                            openScorecardModal();
                                        }, 600);
                                    }
                                } else if (result.suspended) {
                                    validated = true;
                                    alert('⛔ Account suspended. Flag submission locked.');
                                    btn.disabled = false;
                                    btn.textContent = 'SUBMIT';
                                } else {
                                    // Invalid flag response from server
                                    validated = true;
                                    playErrorTone();
                                    if (msg) {
                                        msg.className = 'flag-status-msg error';
                                        msg.textContent = '❌ Invalid flag. Try again!';
                                        msg.style.display = 'block';
                                        setTimeout(() => { msg.style.display = 'none'; }, 3000);
                                    }
                                    btn.disabled = false;
                                    btn.textContent = 'SUBMIT';
                                }
                            } catch (e) {
                                // Network error, try next server
                            }
                        }

                        if (!validated) {
                            // All servers unreachable
                            playErrorTone();
                            if (msg) {
                                msg.className = 'flag-status-msg error';
                                msg.textContent = '⚠️ Cannot reach server. Check your connection.';
                                msg.style.display = 'block';
                                setTimeout(() => { msg.style.display = 'none'; }, 4000);
                            }
                            btn.disabled = false;
                            btn.textContent = 'SUBMIT';
                        }
                    })();
                });

                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        btn.click();
                    }
                });
            }

            // Launch CTF directly in new tab (no modal)
            const launchBtn = document.getElementById(`btn-launch-${cid}`);
            if (launchBtn) {
                launchBtn.addEventListener('click', () => {
                    const ch = CHALLENGES[cid];
                    const teamParam = currentSession && currentSession.teamName ? encodeURIComponent(currentSession.teamName) : '';
                    const runnerUrl = `${ch.url}${ch.url.includes('?') ? '&' : '?'}team=${teamParam}`;
                    window.open(runnerUrl, '_blank');
                });
            }
        });

        // Hint unlock triggers for CTF4
        [1, 2, 3].forEach(hintNum => {
            const hBtn = document.getElementById(`unlock-hint-btn-${hintNum}`);
            if (hBtn) {
                hBtn.addEventListener('click', () => {
                    const { allProgress, teamProgress } = getProgressData();
                    if (!teamProgress.hintsUnlocked) teamProgress.hintsUnlocked = {};
                    if (teamProgress.hintsUnlocked[hintNum]) return;

                    const hintObj = CHALLENGES.ctf4.hints[hintNum - 1];
                    if (hintObj.cost > 0) {
                        const confirmUnlock = confirm(`Unlocking Hint ${hintNum} costs a ${hintObj.cost} points deduction from your CTF4 yield. Unlock?`);
                        if (!confirmUnlock) return;
                    }

                    teamProgress.hintsUnlocked[hintNum] = true;
                    saveProgress(allProgress);
                    playAudio(660, 'sine', 0.15);
                    refreshUI();
                });
            }
        });

        // Close runner modal
        function closeRunnerModal() {
            if (runnerModal) runnerModal.classList.remove('open');
            if (runnerIframe) runnerIframe.src = 'about:blank';
        }

        if (closeRunnerBtn) {
            closeRunnerBtn.addEventListener('click', closeRunnerModal);
        }

        // Listen for iframe requests to close runner modal
        window.addEventListener('message', (e) => {
            if (e.data && (e.data.action === 'close_runner_modal' || e.data.action === 'close_modal')) {
                closeRunnerModal();
            }
        });

        // Open Scorecard / Summary Modal
        function openScorecardModal() {
            const { teamProgress } = getProgressData();
            const total = recalculateTotalScore(teamProgress);
            const tableBody = document.getElementById('summary-table-body');
            const summaryTeamName = document.getElementById('summary-team-name');
            const summarySolvedCount = document.getElementById('summary-solved-count');
            const summaryTotalScore = document.getElementById('summary-total-score');
            const summaryDeductions = document.getElementById('summary-deductions');

            const solvedCount = Object.keys(teamProgress.solved || {}).length;

            if (summaryTeamName) summaryTeamName.textContent = currentSession.teamName;
            if (summarySolvedCount) summarySolvedCount.textContent = `${solvedCount} / ${Object.keys(CHALLENGES).length}`;
            if (summaryTotalScore) summaryTotalScore.textContent = `${total} / ${getTotalMaxPoints()} PTS`;

            let deductions = 0;
            if (teamProgress.hintsUnlocked && teamProgress.hintsUnlocked[2]) deductions += 10;
            if (teamProgress.hintsUnlocked && teamProgress.hintsUnlocked[3]) deductions += 20;
            if (summaryDeductions) summaryDeductions.textContent = `-${deductions} PTS`;

            if (tableBody) {
                tableBody.innerHTML = Object.keys(CHALLENGES).map(cid => {
                    const ch = CHALLENGES[cid];
                    const solveInfo = teamProgress.solved && teamProgress.solved[cid];
                    let statusLabel = `<span style="color:var(--text-muted);">Unsolved</span>`;
                    if (solveInfo) {
                        statusLabel = `<span style="color:var(--accent-green); font-weight:bold;">✔ Solved</span>`;
                    } else if (teamProgress.hasGivenUp) {
                        statusLabel = `<span style="color:var(--brand-red); font-weight:bold; font-family:var(--font-mono); font-size:11px;">🔒 SURRENDERED</span>`;
                    }

                    return `
                        <tr>
                            <td><strong>${ch.name}</strong></td>
                            <td>${ch.category}</td>
                            <td>${statusLabel}</td>
                            <td style="text-align: right; font-weight: 700; color: ${solveInfo ? 'var(--accent-green)' : 'var(--text-muted)'};">
                                ${solveInfo ? `+${solveInfo.points} PTS` : '0 PTS'}
                            </td>
                        </tr>
                    `;
                }).join('');
            }

            scoreModal.classList.add('open');
        }

        // Give Up / Conclude Contest Button Handler
        if (giveUpBtn) {
            giveUpBtn.addEventListener('click', () => {
                const { allProgress, teamProgress } = getProgressData();
                if (teamProgress.hasGivenUp) {
                    openScorecardModal();
                    return;
                }

                const solvedCount = Object.keys(teamProgress.solved || {}).length;
                const currentTotal = recalculateTotalScore(teamProgress);
                const maxPoints = getTotalMaxPoints();
                const totalChallenges = Object.keys(CHALLENGES).length;
                const confirmed = confirm(
                    `🏳️ GIVE UP & CONCLUDE COMPETITION?\n\n` +
                    `Are you sure you want to end your contest attempt now?\n\n` +
                    `• Solved Challenges: ${solvedCount} / ${totalChallenges}\n` +
                    `• Total Score: ${currentTotal} / ${maxPoints} PTS\n\n` +
                    `This will immediately finalize your score, lock all remaining unsolved boxes, and open your Official Scorecard.`
                );

                if (!confirmed) return;

                teamProgress.hasGivenUp = true;
                teamProgress.concludedAt = new Date().toISOString();
                saveProgress(allProgress);
                syncAllWithServer();
                refreshUI();
                openScorecardModal();
            });
        }

        if (scorecardBtn) {
            scorecardBtn.addEventListener('click', openScorecardModal);
        }

        if (closeScoreBtn) {
            closeScoreBtn.addEventListener('click', () => {
                scoreModal.classList.remove('open');
            });
        }

        // Logout
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                localStorage.removeItem(STORAGE_SESSION_KEY);
                window.location.href = 'index.html';
            });
        }

        function handleRemoteDeletion() {
            const key = (currentSession.teamName || '').toLowerCase();
            try {
                const users = JSON.parse(localStorage.getItem('ctf_registered_users') || '{}');
                delete users[key];
                localStorage.setItem('ctf_registered_users', JSON.stringify(users));
                const prog = JSON.parse(localStorage.getItem('ctf_teams_progress') || '{}');
                delete prog[key];
                localStorage.setItem('ctf_teams_progress', JSON.stringify(prog));
            } catch (e) {}
            localStorage.removeItem(STORAGE_SESSION_KEY);
            alert('⚠️ Your team account was permanently deleted by an administrator.');
            window.location.href = 'index.html';
        }

        function syncTeamProgressFromServer(remoteData) {
            if (!remoteData || !currentSession || !currentSession.teamName) return;
            const key = currentSession.teamName.toLowerCase().trim();
            const { allProgress, teamProgress } = getProgressData();

            let changed = false;

            // Sync solved challenges from server (solved by duo teammate on another device)
            if (remoteData.solved && typeof remoteData.solved === 'object') {
                if (!teamProgress.solved) teamProgress.solved = {};
                Object.keys(remoteData.solved).forEach(cid => {
                    const rSolve = remoteData.solved[cid];
                    if (rSolve && (!teamProgress.solved[cid] || !teamProgress.solved[cid].points)) {
                        teamProgress.solved[cid] = rSolve;
                        changed = true;
                    }
                });
            }

            // Sync giveUp / conclusion status
            if (remoteData.hasGivenUp && !teamProgress.hasGivenUp) {
                teamProgress.hasGivenUp = true;
                if (remoteData.concludedAt) teamProgress.concludedAt = remoteData.concludedAt;
                changed = true;
            }

            if (changed) {
                allProgress[key] = teamProgress;
                recalculateTotalScore(teamProgress);
                saveProgress(allProgress);
                refreshUI();
            }
        }

        async function pollLiveTeamStatus() {
            if (!currentSession || !currentSession.teamName) return;
            try {
                const targets = getSyncTargets();
                for (const apiBase of targets) {
                    try {
                        const res = await fetch(`${apiBase}/api/sync/status/${encodeURIComponent(currentSession.teamName)}`);
                        if (res.ok) {
                            const d = await res.json();
                            if (d && d.deleted) {
                                handleRemoteDeletion();
                                return;
                            } else if (d && d.success && d.solved) {
                                updateSuspensionLock(d);
                                syncTeamProgressFromServer(d);
                                return;
                            }
                        }
                    } catch (e) {}
                }
            } catch (e) {}
        }

        function getSyncTargets() {
            const list = [];
            if (window.location.origin) {
                list.push(window.location.origin);
            }
            const knownServers = [
                'https://cyraksha-ctf-admin.onrender.com',
                'https://cyraksha-ctf-arena-1.onrender.com'
            ];
            knownServers.forEach(srv => {
                if (!list.includes(srv)) {
                    list.push(srv);
                }
            });
            return list;
        }

        function syncAllWithServer() {
            try {
                const targets = getSyncTargets();
                let allProgress = {};
                try {
                    const raw = localStorage.getItem(STORAGE_SCORES_KEY);
                    if (raw) allProgress = JSON.parse(raw);
                } catch (e) {}

                let allUsers = {};
                try {
                    const rawU = localStorage.getItem('ctf_registered_users');
                    if (rawU) allUsers = JSON.parse(rawU);
                } catch (e) {}

                // Sync all known teams & their solves across targets
                Object.keys(allProgress).forEach(teamKey => {
                    const prog = allProgress[teamKey];
                    if (!prog || !prog.teamName) return;

                    const userMeta = allUsers[teamKey] || {};
                    const isCurrent = currentSession && currentSession.teamName && currentSession.teamName.toLowerCase() === teamKey;

                    targets.forEach(apiBase => {
                        fetch(`${apiBase}/api/sync/register`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                teamName: prog.teamName,
                                mode: prog.mode || userMeta.mode || 'team',
                                startTime: prog.startTime || (isCurrent ? currentSession.loginTime : null) || new Date().toISOString(),
                                hasGivenUp: !!prog.hasGivenUp,
                                concludedAt: prog.concludedAt || null
                            })
                        }).then(async (res) => {
                            const data = await res.json().catch(() => ({}));
                            if (data && data.deleted) {
                                if (isCurrent) handleRemoteDeletion();
                                else {
                                    delete allProgress[teamKey];
                                    delete allUsers[teamKey];
                                    localStorage.setItem(STORAGE_SCORES_KEY, JSON.stringify(allProgress));
                                    localStorage.setItem('ctf_registered_users', JSON.stringify(allUsers));
                                }
                                return;
                            }

                            if (data && (data.isSuspended || data.suspended) && isCurrent) {
                                updateSuspensionLock(data);
                            }

                            // Sync all solved challenges for this team
                            if (prog.solved) {
                                Object.keys(prog.solved).forEach(cid => {
                                    const solve = prog.solved[cid];
                                    fetch(`${apiBase}/api/sync/solve`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            teamName: prog.teamName,
                                            cid,
                                            points: solve.points,
                                            flagSubmitted: solve.flagSubmitted || 'VERIFIED',
                                            hintsUnlocked: prog.hintsUnlocked || {},
                                            timestamp: solve.timestamp || new Date().toISOString()
                                        })
                                    }).then(async sRes => {
                                        const sData = await sRes.json().catch(() => ({}));
                                        if (sData && sData.deleted && isCurrent) handleRemoteDeletion();
                                        if (sData && sData.suspended && isCurrent) updateSuspensionLock(sData);
                                    }).catch(() => {});
                                });
                            }
                        }).catch(() => {});
                    });
                });
            } catch (e) {}
        }

        // Auto-refresh when tab gains focus or localStorage updates
        window.addEventListener('focus', () => {
            refreshUI();
            syncAllWithServer();
            pollLiveTeamStatus();
            if (tabPaneLeaderboard && tabPaneLeaderboard.classList.contains('active')) {
                fetchAndRenderLeaderboard();
            }
        });
        window.addEventListener('storage', () => {
            refreshUI();
            syncAllWithServer();
            pollLiveTeamStatus();
            if (tabPaneLeaderboard && tabPaneLeaderboard.classList.contains('active')) {
                fetchAndRenderLeaderboard();
            }
        });

        // Initial UI Load, Server Synchronization & Live Status Poll
        refreshUI();
        syncAllWithServer();
        pollLiveTeamStatus();

        // 15s recurring leaderboard refresh & 2.5s real-time cross-device status sync
        setInterval(() => {
            if (tabPaneLeaderboard && tabPaneLeaderboard.classList.contains('active')) {
                fetchAndRenderLeaderboard();
            }
        }, 15000);

        setInterval(() => {
            pollLiveTeamStatus();
        }, 2500);
    });
})();
