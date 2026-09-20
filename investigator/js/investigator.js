(function() {
    const API_BASE = window.location.origin;

    const investigatorForm = document.getElementById('investigator-form');
    const investigatorNameInput = document.getElementById('investigator-name');
    const suspectTeamInput = document.getElementById('suspect-team');
    const incidentMessageInput = document.getElementById('incident-message');
    const selectedCategoryInput = document.getElementById('selected-category');
    const categoryPills = document.querySelectorAll('.cat-pill');
    const formAlert = document.getElementById('form-alert');
    const btnSubmit = document.getElementById('btn-submit-report');
    const teamsDatalist = document.getElementById('teams-datalist');
    const feedList = document.getElementById('feed-list');
    const btnRefreshFeed = document.getElementById('btn-refresh-feed');

    // Restore investigator identifier if saved
    const savedName = localStorage.getItem('ctf_investigator_name');
    if (savedName && investigatorNameInput) {
        investigatorNameInput.value = savedName;
    }

    // Category Pill Toggle
    categoryPills.forEach(pill => {
        pill.addEventListener('click', () => {
            categoryPills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            if (selectedCategoryInput) {
                selectedCategoryInput.value = pill.dataset.cat;
            }
        });
    });

    function getSyncTargets() {
        const list = [API_BASE];
        const adminDomain = 'https://cyraksha-ctf-admin.onrender.com';
        const arenaDomain = 'https://cyraksha-ctf-arena-1.onrender.com';
        if (!API_BASE.includes('cyraksha-ctf-admin.onrender.com')) list.push(adminDomain);
        if (!API_BASE.includes('cyraksha-ctf-arena-1.onrender.com')) list.push(arenaDomain);
        return list;
    }

    // Load Active Teams into Datalist
    async function loadActiveTeams() {
        try {
            const targets = getSyncTargets();
            for (const base of targets) {
                try {
                    const res = await fetch(`${base}/api/leaderboard`);
                    const data = await res.json();
                    if (data && data.leaderboard && data.leaderboard.length > 0) {
                        if (teamsDatalist) {
                            teamsDatalist.innerHTML = data.leaderboard.map(t => `<option value="${escapeHtml(t.teamName)}">`).join('');
                        }
                        break;
                    }
                } catch (e) {}
            }
        } catch (err) {}
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function showAlert(msg, type = 'error') {
        if (!formAlert) return;
        formAlert.className = `form-alert ${type}`;
        formAlert.textContent = msg;
        formAlert.style.display = 'block';
        if (type === 'success') {
            setTimeout(() => {
                formAlert.style.display = 'none';
            }, 5000);
        }
    }

    // Fetch and Render Public Dispatched Feed
    async function fetchDispatchedFeed() {
        try {
            const targets = getSyncTargets();
            let reports = [];

            for (const base of targets) {
                try {
                    const res = await fetch(`${base}/api/investigator/reports/public`);
                    const data = await res.json();
                    if (data && data.success && Array.isArray(data.reports)) {
                        reports = data.reports;
                        break;
                    }
                } catch (e) {}
            }

            if (!feedList) return;

            if (reports.length === 0) {
                feedList.innerHTML = `<div class="feed-loading">No incident reports filed yet. All sectors clear.</div>`;
                return;
            }

            feedList.innerHTML = reports.map(r => {
                let timeStr = 'Just now';
                if (r.timestamp) {
                    try {
                        const d = new Date(r.timestamp);
                        timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    } catch (e) {}
                }

                let statusClass = 'status-pending';
                let statusText = '🟡 Pending Review';
                if (r.status === 'action_taken') {
                    statusClass = 'status-action_taken';
                    statusText = '⛔ Action Taken (Suspended)';
                } else if (r.status === 'resolved') {
                    statusClass = 'status-resolved';
                    statusText = '🟢 Resolved';
                } else if (r.status === 'dismissed') {
                    statusClass = 'status-dismissed';
                    statusText = '⚪ Dismissed';
                }

                const urgency = (r.urgency || 'Normal').toLowerCase();

                return `
                    <div class="feed-item">
                        <div class="feed-item-header">
                            <div class="feed-meta-row">
                                <span class="feed-id-tag">#${escapeHtml(r.id)}</span>
                                <span class="urgency-badge ${urgency}">${escapeHtml(r.urgency || 'Normal')}</span>
                            </div>
                            <span class="feed-time">⏱ ${timeStr}</span>
                        </div>

                        <div class="feed-meta-row" style="margin-top: 2px;">
                            <span class="feed-suspect-badge">${escapeHtml(r.teamName)}</span>
                            <span class="feed-category-tag">${escapeHtml(r.category)}</span>
                        </div>

                        <div class="feed-item-header" style="margin-top: 4px;">
                            <span class="feed-investigator">By: <strong>${escapeHtml(r.investigatorName)}</strong></span>
                            <span class="status-pill ${statusClass}">${statusText}</span>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (err) {
            console.error('Error fetching feed:', err);
        }
    }

    // Submit Report Handler
    if (investigatorForm) {
        investigatorForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const investigatorName = investigatorNameInput ? investigatorNameInput.value.trim() : '';
            const teamName = suspectTeamInput ? suspectTeamInput.value.trim() : '';
            const category = selectedCategoryInput ? selectedCategoryInput.value.trim() : 'Flag Sharing / Collusion';
            const message = incidentMessageInput ? incidentMessageInput.value.trim() : '';
            const urgencyInput = document.querySelector('input[name="urgency"]:checked');
            const urgency = urgencyInput ? urgencyInput.value : 'Normal';

            if (!investigatorName || !teamName || !message) {
                showAlert('Please fill in all required fields.');
                return;
            }

            // Save investigator handle for convenience
            localStorage.setItem('ctf_investigator_name', investigatorName);

            btnSubmit.disabled = true;
            btnSubmit.innerHTML = `<span>DISPATCHING INTEL...</span>`;

            try {
                const targets = getSyncTargets();
                let savedReport = null;

                // 1. Dispatch to primary API
                try {
                    const res = await fetch(`${API_BASE}/api/investigator/report`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ investigatorName, teamName, category, message, urgency })
                    });
                    const data = await res.json();
                    if (data && data.report) savedReport = data.report;
                } catch (e) {}

                // 2. Broadcast to secondary instances
                for (const base of targets) {
                    if (base !== API_BASE && savedReport) {
                        fetch(`${base}/api/sync/investigator-report`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(savedReport)
                        }).catch(() => {});
                    }
                }

                showAlert('✓ Incident report dispatched successfully! Contest admins have been alerted.', 'success');
                
                // Clear fields (retain investigator handle)
                if (suspectTeamInput) suspectTeamInput.value = '';
                if (incidentMessageInput) incidentMessageInput.value = '';

                fetchDispatchedFeed();
            } catch (err) {
                showAlert('Error submitting report: ' + err.message);
            } finally {
                btnSubmit.disabled = false;
                btnSubmit.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                    <span>DISPATCH INTEL TO ADMIN COMMAND</span>
                `;
            }
        });
    }

    if (btnRefreshFeed) {
        btnRefreshFeed.addEventListener('click', fetchDispatchedFeed);
    }

    // Initial load & 10s auto-refresh
    loadActiveTeams();
    fetchDispatchedFeed();
    setInterval(fetchDispatchedFeed, 10000);
})();
