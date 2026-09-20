// Admin Dashboard & Real-Time Leaderboard Controller
(function () {
    const API_BASE = window.location.origin;
    const STORAGE_ADMIN_TOKEN = 'ctf_admin_token';
    const STORAGE_ADMIN_INFO = 'ctf_admin_info';

    let currentLeaderboard = [];
    let currentParticipants = [];
    let currentOverview = null;
    let pollInterval = null;

    // Verify token
    const token = localStorage.getItem(STORAGE_ADMIN_TOKEN);
    if (!token) {
        window.location.href = '/admin/index.html';
        return;
    }

    const CHALLENGES_META = {
        ctf0: { name: 'CTF 0: The Liar Button', maxPts: 200 },
        ctf1: { name: 'CTF 1: Cyraksha Challenge Hub', maxPts: 200 },
        ctf2: { name: 'CTF 2: CYRAKSHA Sign In', maxPts: 200 },
        ctf3: { name: 'CTF 3: Gateway Auth Level 1', maxPts: 200 },
        ctf4: { name: 'CTF 4: The Hidden Message', maxPts: 200 },
        ctf5: { name: 'CTF 5: Cyraksha Notes', maxPts: 500 },
        ctf6: { name: 'CTF 6: Split-Brain Protocol', maxPts: 1000 },
        ctf7: { name: 'CTF 7: Shadow Vault', maxPts: 200 }
    };

    document.addEventListener('DOMContentLoaded', async () => {
        // UI Elements
        const adminNameEl = document.getElementById('admin-display-name');
        const kpiTeamsEl = document.getElementById('kpi-total-teams');
        const kpiSolvesEl = document.getElementById('kpi-total-solves');
        const kpiTopTeamEl = document.getElementById('kpi-top-team');
        const kpiTopScoreEl = document.getElementById('kpi-top-score');
        const kpiAvgScoreEl = document.getElementById('kpi-avg-score');

        const leaderboardTbody = document.getElementById('leaderboard-tbody');
        const participantsTbody = document.getElementById('participants-tbody');
        const activityList = document.getElementById('activity-feed-list');
        const searchInput = document.getElementById('filter-search-input');

        const subtabBtns = document.querySelectorAll('.nav-tab-btn');
        const tabPanes = document.querySelectorAll('.admin-tab-pane');

        const exportBtn = document.getElementById('btn-export-csv');
        const refreshBtn = document.getElementById('btn-manual-refresh');
        const logoutBtn = document.getElementById('btn-admin-logout');

        const auditModal = document.getElementById('audit-modal');
        const closeAuditBtn = document.getElementById('btn-close-audit');
        const auditModalTitle = document.getElementById('modal-team-title');
        const auditModalMeta = document.getElementById('modal-team-meta');
        const auditModalBody = document.getElementById('audit-modal-body');

        // Investigator Intelligence Selectors & State
        let currentInvestigatorReports = [];
        let activeReportIdForSuspend = null;
        const investigatorTbody = document.getElementById('investigator-tbody');
        const investigatorFilterStatus = document.getElementById('investigator-filter-status');
        const investigatorUnreadBadge = document.getElementById('investigator-unread-badge');
        const refreshInvestigatorBtn = document.getElementById('btn-refresh-investigator-reports');

        // Set Admin Profile Name
        try {
            const rawAdmin = localStorage.getItem(STORAGE_ADMIN_INFO);
            if (rawAdmin) {
                const info = JSON.parse(rawAdmin);
                if (info.name) adminNameEl.textContent = info.name;
            }
        } catch (e) {}

        // Tab Switching
        subtabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                subtabBtns.forEach(b => b.classList.remove('active'));
                tabPanes.forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                const target = document.getElementById(btn.getAttribute('data-target'));
                if (target) target.classList.add('active');
            });
        });

        // Fetch Overview & Stats
        async function fetchOverview() {
            try {
                const res = await fetch(`${API_BASE}/api/admin/overview`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.status === 401) {
                    localStorage.removeItem(STORAGE_ADMIN_TOKEN);
                    window.location.href = '/admin/index.html';
                    return;
                }
                const data = await res.json();
                if (data.success) {
                    currentOverview = data.stats;
                    renderOverview(data.stats);
                }
            } catch (e) {
                console.error('Error fetching overview:', e);
            }
        }

        // Fetch Leaderboard
        async function fetchLeaderboard() {
            try {
                const res = await fetch(`${API_BASE}/api/admin/leaderboard`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();
                if (data.success) {
                    currentLeaderboard = data.leaderboard;
                    currentParticipants = data.leaderboard;
                    renderLeaderboard(filterData(currentLeaderboard));
                    renderParticipants(filterData(currentParticipants));
                }
            } catch (e) {
                console.error('Error fetching leaderboard:', e);
            }
        }

        function renderOverview(stats) {
            kpiTeamsEl.textContent = stats.totalTeams;
            kpiSolvesEl.textContent = stats.totalSolves;
            kpiAvgScoreEl.textContent = `${stats.averageScore} PTS`;

            if (stats.topTeam) {
                kpiTopTeamEl.textContent = stats.topTeam.name;
                kpiTopScoreEl.textContent = `${stats.topTeam.score} PTS (Time: ${stats.topTeam.time})`;
            } else {
                kpiTopTeamEl.textContent = '—';
                kpiTopScoreEl.textContent = '0 PTS';
            }

            // Render Activity Stream
            if (stats.recentActivity && stats.recentActivity.length > 0) {
                activityList.innerHTML = stats.recentActivity.map(ev => {
                    const chName = CHALLENGES_META[ev.cid] ? CHALLENGES_META[ev.cid].name : ev.cid.toUpperCase();
                    let timeStr = 'Just now';
                    try {
                        const d = new Date(ev.timestamp);
                        if (!isNaN(d.getTime())) {
                            timeStr = d.toLocaleTimeString();
                        } else if (typeof ev.timestamp === 'string') {
                            timeStr = ev.timestamp;
                        }
                    } catch (e) {}
                    return `
                        <div class="timeline-item">
                            <div class="timeline-left">
                                <div class="timeline-icon">🎯</div>
                                <div class="timeline-text">
                                    <strong>${ev.teamName}</strong> solved <strong>${chName}</strong>
                                </div>
                            </div>
                            <div style="display: flex; align-items: center; gap: 14px;">
                                <span class="timeline-points">+${ev.points} PTS</span>
                                <span class="timeline-time">${timeStr}</span>
                            </div>
                        </div>
                    `;
                }).join('');
            } else {
                activityList.innerHTML = `<div class="timeline-empty" style="color:#64748b; padding: 24px; text-align: center;">No solves logged yet. Waiting for participant activity...</div>`;
            }
        }

        function renderLeaderboard(list) {
            if (!list || list.length === 0) {
                leaderboardTbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #64748b; padding: 32px;">No participants found.</td></tr>`;
                return;
            }

            leaderboardTbody.innerHTML = list.map(t => {
                let rankBadgeClass = 'rank-default';
                if (t.rank === 1) rankBadgeClass = 'rank-gold';
                else if (t.rank === 2) rankBadgeClass = 'rank-silver';
                else if (t.rank === 3) rankBadgeClass = 'rank-bronze';

                // Challenge Matrix Pills
                const matrixPills = ['ctf0', 'ctf1', 'ctf2', 'ctf3', 'ctf4', 'ctf5', 'ctf6', 'ctf7'].map(cid => {
                    const isSolved = t.solved && t.solved[cid];
                    const pts = isSolved ? t.solved[cid].points : 0;
                    return `<span class="matrix-pill ${isSolved ? 'solved' : ''}" title="${cid.toUpperCase()}: ${isSolved ? pts + ' PTS' : 'Unsolved'}">${cid.toUpperCase()}</span>`;
                }).join('');

                // Tie breaker tag
                let tieBreakerHtml = `<span class="tie-neutral">—</span>`;
                if (t.tieBreakerAdvantage) {
                    tieBreakerHtml = `<span class="tie-badge ${t.tieBreakerAdvantage.startsWith('⚡') ? 'tie-advantage' : 'tie-behind'}">${t.tieBreakerAdvantage}</span>`;
                }

                const suspendedBadge = t.isSuspended
                    ? `<span class="status-pill-suspended" style="margin-left: 8px;">⛔ SUSPENDED (${Math.ceil((t.remainingSeconds || 0) / 60)}m left)</span>`
                    : (t.hasGivenUp ? `<span style="display:inline-flex; align-items:center; gap:3px; font-size:10px; font-family:var(--font-mono); font-weight:700; color:#fb7185; background:rgba(225,29,72,0.12); padding:1px 6px; border-radius:3px; border:1px solid rgba(225,29,72,0.3); margin-left:6px;">🏳️ CONCLUDED</span>` : '');

                const suspendBtnHtml = t.isSuspended
                    ? `<button class="btn-action-unsuspend" onclick="window.unsuspendTeam('${escapeHtml(t.teamName)}')">Unsuspend</button>`
                    : `<button class="btn-action-suspend" onclick="window.openSuspendModal('${escapeHtml(t.teamName)}')">Suspend</button>`;

                return `
                    <tr class="${t.isSuspended ? 'row-suspended' : ''}">
                        <td>
                            <div class="rank-badge ${rankBadgeClass}">#${t.rank}</div>
                        </td>
                        <td>
                            <div class="team-name-cell">
                                <span class="team-title">${escapeHtml(t.teamName)}</span>
                                ${suspendedBadge}
                            </div>
                        </td>
                        <td>
                            <span class="team-mode-tag">${t.mode === 'solo' ? 'SOLO' : 'TEAM'}</span>
                        </td>
                        <td>
                            <div class="ctf-matrix">${matrixPills}</div>
                        </td>
                        <td>
                            <div class="score-display">${t.totalScore} PTS</div>
                        </td>
                        <td>
                            <div class="time-display">${t.totalScore > 0 ? (t.formattedDuration && t.formattedDuration !== '00:00:00' ? `⏱ ${t.formattedDuration}` : '⏱ 00:01:00') : '<span style="color:#64748b;">—</span>'}</div>
                        </td>
                        <td>
                            ${tieBreakerHtml}
                        </td>
                        <td style="text-align: right;">
                            <div style="display: flex; justify-content: flex-end; gap: 6px; align-items: center;">
                                ${suspendBtnHtml}
                                <button class="btn-audit" onclick="window.openTeamAudit('${escapeHtml(t.teamName)}')">Audit</button>
                                <button class="btn-delete" title="Permanently Delete Team" onclick="window.deleteParticipant('${escapeHtml(t.teamName)}')">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
        }

        function renderParticipants(list) {
            if (!list || list.length === 0) {
                participantsTbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #64748b; padding: 32px;">No participants found.</td></tr>`;
                return;
            }

            participantsTbody.innerHTML = list.map(t => {
                let regDate = '—';
                if (t.registeredAt) {
                    try {
                        const d = new Date(t.registeredAt);
                        regDate = !isNaN(d.getTime()) ? d.toLocaleString() : t.registeredAt;
                    } catch (e) {
                        regDate = t.registeredAt;
                    }
                }
                let lastSolve = '—';
                if (t.lastSolveTime) {
                    try {
                        const d = new Date(t.lastSolveTime);
                        lastSolve = !isNaN(d.getTime()) ? d.toLocaleTimeString() : t.lastSolveTime;
                    } catch (e) {
                        lastSolve = t.lastSolveTime;
                    }
                }

                let presenceHtml = '';
                if (t.isSuspended) {
                    presenceHtml = `<span class="status-pill-suspended">⛔ SUSPENDED (${Math.ceil((t.remainingSeconds || 0) / 60)}m left)</span>`;
                } else if (t.isOnline) {
                    presenceHtml = `<span class="status-pill-online"><span class="pulse-dot-sm"></span> ONLINE</span>`;
                } else {
                    presenceHtml = `<span class="status-pill-offline">OFFLINE</span>`;
                }

                const suspendBtnHtml = t.isSuspended
                    ? `<button class="btn-action-unsuspend" onclick="window.unsuspendTeam('${escapeHtml(t.teamName)}')">Lift Ban</button>`
                    : `<button class="btn-action-suspend" onclick="window.openSuspendModal('${escapeHtml(t.teamName)}')">Suspend</button>`;

                return `
                    <tr class="${t.isSuspended ? 'row-suspended' : ''}">
                        <td>
                            <strong>${escapeHtml(t.teamName)}</strong>
                            ${t.hasGivenUp ? `<span style="display:inline-flex; align-items:center; gap:3px; font-size:10px; font-family:var(--font-mono); font-weight:700; color:#fb7185; background:rgba(225,29,72,0.12); padding:1px 6px; border-radius:3px; border:1px solid rgba(225,29,72,0.3); margin-left:6px;">🏳️ CONCLUDED</span>` : ''}
                        </td>
                        <td>${presenceHtml}</td>
                        <td><span class="team-mode-tag">${t.mode === 'solo' ? 'SOLO' : 'TEAM'}</span></td>
                        <td><span style="font-family: var(--font-mono); font-size: 11.5px; color: var(--text-muted);">${regDate}</span></td>
                        <td><span style="font-weight: 700; color: #fff;">${t.solveCount} / ${Object.keys(CHALLENGES_META).length}</span></td>
                        <td><span style="font-family: var(--font-heading); font-size: 20px; color: var(--brand-red-light);">${t.totalScore} PTS</span></td>
                        <td><span style="font-family: var(--font-mono); font-size: 12px; color: #e2e8f0;">${lastSolve}</span></td>
                        <td style="text-align: right;">
                            <div style="display: flex; justify-content: flex-end; gap: 6px; align-items: center;">
                                ${suspendBtnHtml}
                                <button class="btn-audit" onclick="window.openTeamAudit('${escapeHtml(t.teamName)}')">Audit Log</button>
                                <button class="btn-delete" title="Permanently Delete Team" onclick="window.deleteParticipant('${escapeHtml(t.teamName)}')">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                    <span>Delete</span>
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
        }

        function filterData(list) {
            const q = (searchInput.value || '').trim().toLowerCase();
            if (!q) return list;
            return list.filter(item => item.teamName.toLowerCase().includes(q));
        }

        searchInput.addEventListener('input', () => {
            renderLeaderboard(filterData(currentLeaderboard));
            renderParticipants(filterData(currentParticipants));
            renderInvestigatorReports(currentInvestigatorReports);
        });

        // Fetch Investigator Reports
        async function fetchInvestigatorReports() {
            try {
                const res = await fetch(`${API_BASE}/api/admin/investigator-reports`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();
                if (data && data.success && Array.isArray(data.reports)) {
                    currentInvestigatorReports = data.reports;
                    const pendingCount = currentInvestigatorReports.filter(r => r.status === 'pending').length;
                    if (investigatorUnreadBadge) {
                        if (pendingCount > 0) {
                            investigatorUnreadBadge.textContent = pendingCount;
                            investigatorUnreadBadge.style.display = 'inline-flex';
                        } else {
                            investigatorUnreadBadge.style.display = 'none';
                        }
                    }
                    renderInvestigatorReports(currentInvestigatorReports);
                }
            } catch (err) {
                console.error('Error fetching investigator reports:', err);
            }
        }

        // Render Investigator Reports Table
        function renderInvestigatorReports(reports) {
            if (!investigatorTbody) return;
            if (!reports || reports.length === 0) {
                investigatorTbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #64748b; padding: 32px;">No investigator intelligence reports logged yet.</td></tr>`;
                return;
            }

            const filterStatus = investigatorFilterStatus ? investigatorFilterStatus.value : 'all';
            const searchQ = (searchInput && searchInput.value ? searchInput.value.trim().toLowerCase() : '');

            let filtered = reports;
            if (filterStatus !== 'all') {
                filtered = filtered.filter(r => r.status === filterStatus);
            }
            if (searchQ) {
                filtered = filtered.filter(r => 
                    (r.teamName && r.teamName.toLowerCase().includes(searchQ)) ||
                    (r.investigatorName && r.investigatorName.toLowerCase().includes(searchQ)) ||
                    (r.category && r.category.toLowerCase().includes(searchQ)) ||
                    (r.message && r.message.toLowerCase().includes(searchQ))
                );
            }

            if (filtered.length === 0) {
                investigatorTbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #64748b; padding: 32px;">No reports matching the selected filter.</td></tr>`;
                return;
            }

            investigatorTbody.innerHTML = filtered.map(r => {
                let timeStr = '—';
                if (r.timestamp) {
                    try {
                        const d = new Date(r.timestamp);
                        timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    } catch (e) {}
                }

                let statusClass = 'status-pending';
                let statusLabel = '🟡 PENDING';
                if (r.status === 'action_taken') {
                    statusClass = 'status-action_taken';
                    statusLabel = '⛔ SUSPENDED';
                } else if (r.status === 'resolved') {
                    statusClass = 'status-resolved';
                    statusLabel = '🟢 RESOLVED';
                } else if (r.status === 'dismissed') {
                    statusClass = 'status-dismissed';
                    statusLabel = '⚪ DISMISSED';
                }

                const urgency = (r.urgency || 'Normal').toLowerCase();

                return `
                    <tr class="${r.status === 'pending' ? 'row-pending-report' : ''}">
                        <td>
                            <div style="font-family: var(--font-mono); font-size: 11.5px; color: #cbd5e1;">⏱ ${timeStr}</div>
                            <span class="urgency-badge ${urgency}" style="margin-top: 4px; display: inline-block;">${escapeHtml(r.urgency || 'Normal')}</span>
                        </td>
                        <td>
                            <strong style="color: #fff; font-family: var(--font-mono); font-size: 12px;">${escapeHtml(r.investigatorName)}</strong>
                            <div style="font-family: var(--font-mono); font-size: 10px; color: #64748b;">ID: #${escapeHtml(r.id)}</div>
                        </td>
                        <td>
                            <span style="font-family: var(--font-mono); font-size: 12.5px; font-weight: 800; color: var(--brand-red-light); background: rgba(217,4,41,0.1); padding: 2px 6px; border-radius: 3px; border: 1px solid rgba(217,4,41,0.25);">
                                ${escapeHtml(r.teamName)}
                            </span>
                        </td>
                        <td>
                            <span style="font-size: 12px; color: #e2e8f0;">${escapeHtml(r.category)}</span>
                        </td>
                        <td>
                            <div class="report-evidence-text">${escapeHtml(r.message)}</div>
                            ${r.actionTaken ? `<div style="font-size: 11px; color: #34d399; margin-top: 4px; font-family: var(--font-mono);">⚡ Note: ${escapeHtml(r.actionTaken)}</div>` : ''}
                        </td>
                        <td style="text-align: center;">
                            <span class="status-pill ${statusClass}">${statusLabel}</span>
                        </td>
                        <td style="text-align: right;">
                            <div style="display: flex; justify-content: flex-end; gap: 6px; align-items: center; flex-wrap: wrap;">
                                <button class="btn-action-suspend" title="Suspend Participant" onclick="window.openSuspendModalWithReason('${escapeHtml(r.teamName)}', '${escapeHtml(r.message).replace(/'/g, "\\'")}', '${escapeHtml(r.id)}')">Suspend</button>
                                <button class="btn-audit" title="Audit Participant" onclick="window.openTeamAudit('${escapeHtml(r.teamName)}')">Audit</button>
                                ${r.status === 'pending' ? `
                                    <button class="btn-action-resolve" title="Mark as Resolved" onclick="window.updateReportStatus('${escapeHtml(r.id)}', 'resolved')">Resolve</button>
                                    <button class="btn-action-dismiss" title="Dismiss Report" onclick="window.updateReportStatus('${escapeHtml(r.id)}', 'dismissed')">Dismiss</button>
                                ` : ''}
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
        }

        if (investigatorFilterStatus) {
            investigatorFilterStatus.addEventListener('change', () => {
                renderInvestigatorReports(currentInvestigatorReports);
            });
        }

        if (refreshInvestigatorBtn) {
            refreshInvestigatorBtn.addEventListener('click', fetchInvestigatorReports);
        }

        // Update Report Status
        window.updateReportStatus = async function(reportId, newStatus, actionTaken = '') {
            if (!reportId || !newStatus) return;
            try {
                const body = { reportId, status: newStatus, actionTaken };
                await fetch(`${API_BASE}/api/admin/investigator-report/update-status`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(body)
                });

                const targets = [API_BASE];
                const arenaDomain = 'https://cyraksha-ctf-arena-1.onrender.com';
                if (!API_BASE.includes('cyraksha-ctf-arena-1.onrender.com')) targets.push(arenaDomain);
                const adminDomain = 'https://cyraksha-ctf-admin.onrender.com';
                if (!API_BASE.includes('cyraksha-ctf-admin.onrender.com') && !targets.includes(adminDomain)) targets.push(adminDomain);

                for (const base of targets) {
                    if (base !== API_BASE) {
                        fetch(`${base}/api/sync/investigator-report/update-status`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(body)
                        }).catch(() => {});
                    }
                }

                fetchInvestigatorReports();
            } catch (e) {
                alert('Error updating report: ' + e.message);
            }
        };

        window.openSuspendModalWithReason = function(teamName, defaultReason, reportId) {
            activeReportIdForSuspend = reportId;
            window.openSuspendModal(teamName);
            if (suspendReasonInput) {
                suspendReasonInput.value = `[Investigator Report #${reportId}] ${defaultReason}`;
            }
        };

        // Suspend Modal Controls
        const suspendModal = document.getElementById('suspend-modal');
        const closeSuspendBtn = document.getElementById('btn-close-suspend');
        const cancelSuspendBtn = document.getElementById('btn-cancel-suspend');
        const submitSuspendBtn = document.getElementById('btn-submit-suspend');
        const suspendTargetTeamInput = document.getElementById('suspend-target-team');
        const suspendTargetNameDisplay = document.getElementById('suspend-target-name');
        const suspendReasonInput = document.getElementById('suspend-reason-input');
        const suspendCustomMinsInput = document.getElementById('suspend-custom-mins');
        const durationPills = document.querySelectorAll('.duration-pill');

        let selectedMins = 15;

        durationPills.forEach(pill => {
            pill.addEventListener('click', () => {
                durationPills.forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                selectedMins = parseInt(pill.dataset.mins, 10) || 15;
                if (suspendCustomMinsInput) suspendCustomMinsInput.value = '';
            });
        });

        if (suspendCustomMinsInput) {
            suspendCustomMinsInput.addEventListener('input', () => {
                const val = parseInt(suspendCustomMinsInput.value, 10);
                if (val && val > 0) {
                    durationPills.forEach(p => p.classList.remove('active'));
                    selectedMins = val;
                }
            });
        }

        function closeSuspendModal() {
            if (suspendModal) suspendModal.classList.remove('open');
            if (suspendReasonInput) suspendReasonInput.value = '';
            if (suspendCustomMinsInput) suspendCustomMinsInput.value = '';
            activeReportIdForSuspend = null;
        }

        if (closeSuspendBtn) closeSuspendBtn.addEventListener('click', closeSuspendModal);
        if (cancelSuspendBtn) cancelSuspendBtn.addEventListener('click', closeSuspendModal);

        window.openSuspendModal = function(teamName) {
            if (!teamName) return;
            if (suspendTargetTeamInput) suspendTargetTeamInput.value = teamName;
            if (suspendTargetNameDisplay) suspendTargetNameDisplay.textContent = teamName.toUpperCase();
            if (suspendReasonInput && !activeReportIdForSuspend) suspendReasonInput.value = '';
            selectedMins = 15;
            durationPills.forEach(p => {
                if (p.dataset.mins === '15') p.classList.add('active');
                else p.classList.remove('active');
            });
            if (suspendModal) suspendModal.classList.add('open');
        };

        if (submitSuspendBtn) {
            submitSuspendBtn.addEventListener('click', async () => {
                const teamName = suspendTargetTeamInput.value.trim();
                if (!teamName) return;

                const reason = (suspendReasonInput ? suspendReasonInput.value.trim() : '') || 'Temporary suspension applied by contest arbiters.';
                const mins = selectedMins || 15;

                try {
                    let suspendedUntil = null;

                    // 1. Execute on current Admin API
                    try {
                        const res = await fetch(`${API_BASE}/api/admin/suspend`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                            },
                            body: JSON.stringify({ teamName, durationMinutes: mins, reason })
                        });
                        const data = await res.json().catch(() => ({}));
                        if (data && data.suspendedUntil) {
                            suspendedUntil = data.suspendedUntil;
                        }
                    } catch (err) {}

                    // 2. Broadcast across all server endpoints
                    const targets = [API_BASE];
                    const arenaDomain = 'https://cyraksha-ctf-arena-1.onrender.com';
                    if (!API_BASE.includes('cyraksha-ctf-arena-1.onrender.com')) {
                        targets.push(arenaDomain);
                    }
                    const adminDomain = 'https://cyraksha-ctf-admin.onrender.com';
                    if (!API_BASE.includes('cyraksha-ctf-admin.onrender.com') && !targets.includes(adminDomain)) {
                        targets.push(adminDomain);
                    }

                    for (const base of targets) {
                        fetch(`${base}/api/sync/suspend`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ teamName, durationMinutes: mins, reason, suspendedUntil })
                        }).catch(() => {});
                    }

                    if (activeReportIdForSuspend) {
                        window.updateReportStatus(activeReportIdForSuspend, 'action_taken', `Admin suspended participant for ${mins}m.`);
                        activeReportIdForSuspend = null;
                    }

                    closeSuspendModal();
                    alert(`✓ Participant "${teamName}" has been suspended for ${mins} minutes.`);
                    fetchOverview();
                    fetchLeaderboard();
                    fetchInvestigatorReports();
                } catch (e) {
                    alert('Error applying suspension: ' + e.message);
                }
            });
        }

        window.unsuspendTeam = async function(teamName) {
            if (!teamName) return;
            const confirmed = confirm(`Lift suspension for "${teamName}"?\n\nThis will immediately restore their full arena access and flag submissions.`);
            if (!confirmed) return;

            try {
                // 1. Execute on current Admin API
                try {
                    await fetch(`${API_BASE}/api/admin/unsuspend`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ teamName })
                    });
                } catch (err) {}

                // 2. Broadcast unsuspend across all connected servers
                const targets = [API_BASE];
                const arenaDomain = 'https://cyraksha-ctf-arena-1.onrender.com';
                if (!API_BASE.includes('cyraksha-ctf-arena-1.onrender.com')) {
                    targets.push(arenaDomain);
                }
                const adminDomain = 'https://cyraksha-ctf-admin.onrender.com';
                if (!API_BASE.includes('cyraksha-ctf-admin.onrender.com') && !targets.includes(adminDomain)) {
                    targets.push(adminDomain);
                }

                for (const base of targets) {
                    fetch(`${base}/api/sync/unsuspend`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ teamName })
                    }).catch(() => {});
                }

                alert(`✓ Suspension lifted for "${teamName}".`);
                fetchOverview();
                fetchLeaderboard();
            } catch (e) {
                alert('Error lifting suspension: ' + e.message);
            }
        };

        // Delete Participant Action
        window.deleteParticipant = async function(teamName) {
            if (!teamName) return;
            const confirmed = confirm(`⚠️ PERMANENTLY DELETE PARTICIPANT?\n\nAre you sure you want to permanently delete "${teamName}"?\n\nThis will completely wipe their account, score, solve records, and ranking from the contest.`);
            if (!confirmed) return;

            try {
                const targets = [API_BASE];
                const arenaDomain = 'https://cyraksha-ctf-arena-1.onrender.com';
                if (!API_BASE.includes('cyraksha-ctf-arena-1.onrender.com')) {
                    targets.push(arenaDomain);
                }
                const adminDomain = 'https://cyraksha-ctf-admin.onrender.com';
                if (!API_BASE.includes('cyraksha-ctf-admin.onrender.com') && !targets.includes(adminDomain)) {
                    targets.push(adminDomain);
                }

                // Delete from local cache immediately
                try {
                    const k = teamName.toLowerCase().trim();
                    const prog = JSON.parse(localStorage.getItem('ctf_teams_progress') || '{}');
                    delete prog[k];
                    localStorage.setItem('ctf_teams_progress', JSON.stringify(prog));
                    const users = JSON.parse(localStorage.getItem('ctf_registered_users') || '{}');
                    delete users[k];
                    localStorage.setItem('ctf_registered_users', JSON.stringify(users));
                } catch (e) {}

                for (const base of targets) {
                    await fetch(`${base}/api/admin/participant/${encodeURIComponent(teamName)}`, {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bearer ${token}` }
                    }).catch(() => {});
                }

                if (auditModal) auditModal.classList.remove('open');
                alert(`✓ Participant "${teamName}" has been permanently deleted.`);
                fetchOverview();
                fetchLeaderboard();
            } catch (e) {
                alert('Error deleting participant: ' + e.message);
            }
        };

        // Audit Drill-down Modal
        window.openTeamAudit = function (teamName) {
            const team = currentLeaderboard.find(t => t.teamName.toLowerCase() === teamName.toLowerCase());
            if (!team) return;

            auditModalTitle.textContent = `AUDIT: ${team.teamName.toUpperCase()}`;
            auditModalMeta.textContent = `Division: ${team.mode.toUpperCase()} • Total Score: ${team.totalScore} PTS • Elapsed Time: ${team.formattedDuration}`;

            const rows = Object.keys(CHALLENGES_META).map(cid => {
                const meta = CHALLENGES_META[cid];
                const solve = team.solved && team.solved[cid];
                const isSolved = !!solve;

                let extraInfo = '';
                if (cid === 'ctf4' && team.hintsUnlocked) {
                    const hUsed = [];
                    if (team.hintsUnlocked[1]) hUsed.push('Hint 1 (Free)');
                    if (team.hintsUnlocked[2]) hUsed.push('Hint 2 (-10 PTS)');
                    if (team.hintsUnlocked[3]) hUsed.push('Hint 3 (-20 PTS)');
                    if (hUsed.length > 0) extraInfo = ` • Hints: ${hUsed.join(', ')}`;
                }

                return `
                    <div class="audit-row ${isSolved ? 'solved' : 'unsolved'}">
                        <div style="flex: 1;">
                            <div style="font-weight: 700; color: #fff;">${meta.name}</div>
                            <div style="font-size: 11px; color: #94a3b8; font-family: var(--font-mono); margin-top: 2px;">
                                ${isSolved ? `✓ Solved: ${new Date(solve.timestamp).toLocaleTimeString()}${extraInfo}` : '⏳ Not yet solved'}
                            </div>
                            <div style="font-size: 10.5px; color: #38bdf8; font-family: var(--font-mono); margin-top: 4px; word-break: break-all;">
                                Expected Flag: <span id="expected-flag-${cid}" style="background: rgba(56,189,248,0.1); padding: 1px 4px; border-radius: 3px;">Loading...</span>
                            </div>
                            ${solve && solve.flagSubmitted ? `
                            <div style="font-size: 10.5px; color: #34d399; font-family: var(--font-mono); margin-top: 2px; word-break: break-all;">
                                Submitted Flag: <span style="background: rgba(52,211,153,0.1); padding: 1px 4px; border-radius: 3px;">${escapeHtml(solve.flagSubmitted)}</span>
                            </div>` : ''}
                        </div>
                        <div style="margin-left: 16px;">
                            <span style="font-family: var(--font-heading); font-size: 22px; color: ${isSolved ? 'var(--accent-green)' : 'var(--text-muted)'};">
                                ${isSolved ? '+' + solve.points : '0'} PTS
                            </span>
                        </div>
                    </div>
                `;
            }).join('');

            auditModalBody.innerHTML = `
                <div class="audit-list">
                    ${rows}
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border-dim);">
                    <span style="font-size: 11.5px; color: var(--text-muted);">Manage participant account:</span>
                    <button class="btn-delete" style="padding: 7px 14px;" onclick="window.deleteParticipant('${escapeHtml(team.teamName)}')">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        <span>Delete This Participant</span>
                    </button>
                </div>
            `;

            // Async: fetch expected flags from server for each challenge
            Object.keys(CHALLENGES_META).forEach(cid => {
                const flagSpan = document.getElementById(`expected-flag-${cid}`);
                if (!flagSpan) return;
                adminFetch(`/api/admin/expected-flags?team=${encodeURIComponent(team.teamName)}&cid=${encodeURIComponent(cid)}`)
                    .then(r => r.json())
                    .then(data => {
                        if (data.success) {
                            const allFlags = [...(data.dynamicFlags || []), ...(data.staticFlags || [])];
                            flagSpan.textContent = allFlags.length > 0 ? allFlags.join(' OR ') : 'N/A';
                        } else {
                            flagSpan.textContent = 'Error';
                        }
                    })
                    .catch(() => { flagSpan.textContent = 'Fetch error'; });
            });

            auditModal.classList.add('open');
        };

        if (closeAuditBtn) {
            closeAuditBtn.addEventListener('click', () => {
                auditModal.classList.remove('open');
            });
        }

        if (auditModal) {
            auditModal.addEventListener('click', (e) => {
                if (e.target === auditModal) auditModal.classList.remove('open');
            });
        }

        // Export CSV Handler
        exportBtn.addEventListener('click', () => {
            window.location.href = `${API_BASE}/api/admin/export?format=csv`;
        });

        // Manual Refresh Handler
        refreshBtn.addEventListener('click', () => {
            fetchOverview();
            fetchLeaderboard();
        });

        // Reset Data Handler
        const resetBtn = document.getElementById('btn-reset-scores');
        if (resetBtn) {
            resetBtn.addEventListener('click', async () => {
                const confirmed = confirm('⚠️ Reset Contest Data?\n\nThis will clear all participant scores, solves, and activity so you can start a 100% clean contest. Admin accounts will be preserved.');
                if (confirmed) {
                    try {
                        const res = await fetch(`${API_BASE}/api/admin/reset-contest`, {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        const data = await res.json();
                        if (data.success) {
                            try {
                                localStorage.removeItem('ctf_teams_progress');
                                localStorage.removeItem('ctf_registered_users');
                            } catch (err) {}
                            alert('✓ Leaderboard and participants data cleared successfully.');
                            fetchOverview();
                            fetchLeaderboard();
                        }
                    } catch (e) {
                        alert('Error resetting data: ' + e.message);
                    }
                }
            });
        }

        // Sign Out Handler
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem(STORAGE_ADMIN_TOKEN);
            localStorage.removeItem(STORAGE_ADMIN_INFO);
            window.location.href = '/admin/index.html';
        });

        function escapeHtml(str) {
            return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }

        // Initial Load & 5-Second Real-Time Polling Loop
        fetchOverview();
        fetchLeaderboard();
        fetchInvestigatorReports();
        pollInterval = setInterval(() => {
            fetchOverview();
            fetchLeaderboard();
            fetchInvestigatorReports();
        }, 5000);
    });
})();
