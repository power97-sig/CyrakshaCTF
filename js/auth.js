// CTF Platform Authentication & State Management
(function () {
    const STORAGE_USERS_KEY = 'ctf_registered_users';
    const STORAGE_SESSION_KEY = 'ctf_active_session';

    function getStoredUsers() {
        try {
            const raw = localStorage.getItem(STORAGE_USERS_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                // Clean legacy dummy accounts if present
                delete parsed['cyraksha_team'];
                delete parsed['solo_hacker'];
                return parsed;
            }
        } catch (e) {}
        return {};
    }

    function saveUser(teamName, password, mode) {
        const users = getStoredUsers();
        users[teamName.toLowerCase()] = { teamName, password, mode };
        localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(users));
    }

    function setActiveSession(userObj) {
        localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify({
            teamName: userObj.teamName,
            mode: userObj.mode,
            loginTime: new Date().toISOString()
        }));
    }

    document.addEventListener('DOMContentLoaded', () => {
        const authForm = document.getElementById('auth-form');
        const teamNameInput = document.getElementById('team-name-input');
        const passwordInput = document.getElementById('password-input');
        const togglePasswordBtn = document.getElementById('toggle-password-btn');
        const eyeIcon = document.getElementById('eye-icon');
        const modeCards = document.querySelectorAll('.mode-card');
        const submitBtn = document.getElementById('auth-submit-btn');
        const submitText = document.getElementById('submit-btn-text');
        const toggleViewBtn = document.getElementById('toggle-view-btn');
        const cardTitle = document.getElementById('card-title');
        const cardSubtitle = document.getElementById('card-subtitle');
        const alertBox = document.getElementById('auth-alert');

        let isRegisterView = false;
        let selectedMode = 'team'; // default: TEAM (DUO)

        // Mode card selection
        modeCards.forEach(card => {
            card.addEventListener('click', () => {
                modeCards.forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                selectedMode = card.getAttribute('data-mode') || 'team';
            });
        });

        // Password visibility toggle
        if (togglePasswordBtn && passwordInput) {
            togglePasswordBtn.addEventListener('click', () => {
                const isPass = passwordInput.type === 'password';
                passwordInput.type = isPass ? 'text' : 'password';
                if (isPass) {
                    eyeIcon.innerHTML = `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>`;
                } else {
                    eyeIcon.innerHTML = `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>`;
                }
            });
        }

        // Toggle Login vs Register view
        if (toggleViewBtn) {
            toggleViewBtn.addEventListener('click', (e) => {
                e.preventDefault();
                isRegisterView = !isRegisterView;
                hideAlert();

                if (isRegisterView) {
                    cardTitle.innerHTML = `REGISTER TEAM <span class="red-star">*</span>`;
                    cardSubtitle.textContent = 'Create your credentials to join the hackathon.';
                    submitText.textContent = 'CREATE TEAM & ENTER';
                    toggleViewBtn.innerHTML = `
                        <svg class="reg-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
                        <span>BACK TO LOGIN</span>
                        <span class="reg-arrow">→</span>
                    `;
                } else {
                    cardTitle.innerHTML = `WELCOME BACK <span class="red-star">*</span>`;
                    cardSubtitle.textContent = 'Login to continue your journey.';
                    submitText.textContent = 'LOGIN';
                    toggleViewBtn.innerHTML = `
                        <svg class="reg-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>
                        <span>REGISTER YOUR TEAM</span>
                        <span class="reg-arrow">→</span>
                    `;
                }
            });
        }

        function showAlert(msg, type = 'error') {
            if (!alertBox) return;
            alertBox.className = `auth-alert ${type}`;
            alertBox.textContent = msg;
        }

        function hideAlert() {
            if (!alertBox) return;
            alertBox.className = 'auth-alert';
            alertBox.textContent = '';
        }

        // Form Submit
        function getSyncTargets() {
            const list = [window.location.origin];
            const adminDomain = 'https://cyraksha-ctf-admin.onrender.com';
            const arenaDomain = 'https://cyraksha-ctf-arena-1.onrender.com';
            if (!window.location.origin.includes('cyraksha-ctf-admin.onrender.com')) list.push(adminDomain);
            if (!window.location.origin.includes('cyraksha-ctf-arena-1.onrender.com')) list.push(arenaDomain);
            return list;
        }

        // Form Submit Handler
        if (authForm) {
            authForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                hideAlert();

                const teamName = teamNameInput.value.trim();
                const password = passwordInput.value.trim();

                if (!teamName || !password) {
                    showAlert('Please enter both team name and password.');
                    return;
                }

                const userKey = teamName.toLowerCase();
                const apiBase = window.location.origin;
                const targets = getSyncTargets();

                // UI loading state
                if (submitBtn) submitBtn.disabled = true;
                if (submitText) submitText.textContent = isRegisterView ? 'REGISTERING TEAM...' : 'AUTHENTICATING...';

                try {
                    if (isRegisterView) {
                        // 1. REGISTER FLOW
                        let registerSuccess = false;
                        let serverParticipant = null;
                        let serverErrorMsg = null;

                        // Try /api/auth/register across available targets
                        for (const base of targets) {
                            try {
                                const regRes = await fetch(`${base}/api/auth/register`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        teamName,
                                        password,
                                        mode: selectedMode,
                                        startTime: new Date().toISOString()
                                    })
                                });
                                const regData = await regRes.json().catch(() => ({}));

                                if (regRes.ok && regData.success) {
                                    registerSuccess = true;
                                    serverParticipant = regData.participant;
                                    break;
                                } else if (regRes.status === 400 && regData && regData.message) {
                                    serverErrorMsg = regData.message;
                                    break;
                                }
                            } catch (e) {}
                        }

                        // Fallback to /api/sync/register if /api/auth/register is starting up
                        if (!registerSuccess && !serverErrorMsg) {
                            for (const base of targets) {
                                try {
                                    const syncRes = await fetch(`${base}/api/sync/register`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            teamName,
                                            password,
                                            mode: selectedMode,
                                            startTime: new Date().toISOString()
                                        })
                                    });
                                    if (syncRes.ok) {
                                        registerSuccess = true;
                                        break;
                                    }
                                } catch (e) {}
                            }
                        }

                        if (!registerSuccess && serverErrorMsg) {
                            showAlert(serverErrorMsg);
                            return;
                        }

                        // Broadcast registration to secondary server instances
                        targets.forEach(base => {
                            fetch(`${base}/api/sync/register`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    teamName,
                                    password,
                                    mode: selectedMode,
                                    startTime: new Date().toISOString()
                                })
                            }).catch(() => {});
                        });

                        saveUser(teamName, password, selectedMode);
                        setActiveSession({ teamName, mode: selectedMode });

                        // Initialize local progress
                        try {
                            const allProg = JSON.parse(localStorage.getItem('ctf_teams_progress') || '{}');
                            allProg[userKey] = {
                                teamName: teamName,
                                mode: selectedMode,
                                startTime: (serverParticipant && serverParticipant.startTime) || new Date().toISOString(),
                                totalScore: 0,
                                solved: {},
                                hintsUnlocked: { 1: false, 2: false, 3: false },
                                hasGivenUp: false,
                                concludedAt: null
                            };
                            localStorage.setItem('ctf_teams_progress', JSON.stringify(allProg));
                        } catch (err) {}

                        showAlert('Team registered successfully! Redirecting to arena...', 'success');
                        setTimeout(() => {
                            window.location.href = 'dashboard.html';
                        }, 400);

                    } else {
                        // 2. MULTI-DEVICE LOGIN FLOW
                        let loginSuccess = false;
                        let serverParticipant = null;
                        let serverErrorMsg = null;

                        // Query server endpoints for participant credentials
                        for (const base of targets) {
                            try {
                                const logRes = await fetch(`${base}/api/auth/login`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ teamName, password })
                                });
                                const logData = await logRes.json().catch(() => ({}));

                                if (logRes.ok && logData.success && logData.participant) {
                                    loginSuccess = true;
                                    serverParticipant = logData.participant;
                                    break;
                                } else if (logData && logData.message) {
                                    serverErrorMsg = logData.message;
                                    if (logData.deleted) {
                                        showAlert('❌ ' + logData.message);
                                        return;
                                    }
                                    if (logRes.status === 401) {
                                        // Definite invalid credentials on server
                                        break;
                                    }
                                }
                            } catch (err) {}
                        }

                        if (loginSuccess && serverParticipant) {
                            // Restore full server progress on this device
                            try {
                                const allProg = JSON.parse(localStorage.getItem('ctf_teams_progress') || '{}');
                                allProg[userKey] = {
                                    teamName: serverParticipant.teamName,
                                    mode: serverParticipant.mode || selectedMode || 'team',
                                    startTime: serverParticipant.startTime || new Date().toISOString(),
                                    totalScore: serverParticipant.totalScore || 0,
                                    solved: serverParticipant.solved || {},
                                    hintsUnlocked: serverParticipant.hintsUnlocked || { 1: false, 2: false, 3: false },
                                    hasGivenUp: !!serverParticipant.hasGivenUp,
                                    concludedAt: serverParticipant.concludedAt || null
                                };
                                localStorage.setItem('ctf_teams_progress', JSON.stringify(allProg));
                            } catch (err) {}

                            // Save credentials and active session locally on this device
                            saveUser(serverParticipant.teamName, password, serverParticipant.mode || 'team');
                            setActiveSession({
                                teamName: serverParticipant.teamName,
                                mode: serverParticipant.mode || 'team'
                            });

                            showAlert('Access granted. Welcome back, hacker!', 'success');
                            setTimeout(() => {
                                window.location.href = 'dashboard.html';
                            }, 400);
                            return;
                        }

                        // Offline fallback check against local storage cache
                        const users = getStoredUsers();
                        const existingUser = users[userKey];
                        if (existingUser && existingUser.password === password) {
                            setActiveSession(existingUser);
                            showAlert('Access granted. Welcome back, hacker!', 'success');
                            setTimeout(() => {
                                window.location.href = 'dashboard.html';
                            }, 400);
                            return;
                        }

                        showAlert(serverErrorMsg || 'Invalid team name or password. Try registering if new.');
                    }
                } catch (generalErr) {
                    showAlert('Authentication error: ' + generalErr.message);
                } finally {
                    if (submitBtn) submitBtn.disabled = false;
                    if (submitText) submitText.textContent = isRegisterView ? 'CREATE TEAM & ENTER' : 'LOGIN';
                }
            });
        }
    });
})();
