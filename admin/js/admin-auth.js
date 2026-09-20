// Admin Authentication Client
(function () {
    const API_BASE = window.location.origin;
    const STORAGE_ADMIN_TOKEN = 'ctf_admin_token';
    const STORAGE_ADMIN_INFO = 'ctf_admin_info';

    document.addEventListener('DOMContentLoaded', () => {
        const loginForm = document.getElementById('admin-login-form');
        const alertBox = document.getElementById('auth-alert');

        // Check if already authenticated
        const existingToken = localStorage.getItem(STORAGE_ADMIN_TOKEN);
        if (existingToken) {
            fetch(`${API_BASE}/api/admin/me`, {
                headers: { 'Authorization': `Bearer ${existingToken}` }
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    window.location.href = '/admin/dashboard.html';
                }
            })
            .catch(() => {});
        }

        function showAlert(msg, type = 'error') {
            alertBox.textContent = msg;
            alertBox.className = `admin-alert ${type}`;
            alertBox.classList.remove('hidden');
        }

        function hideAlert() {
            alertBox.classList.add('hidden');
        }

        // Handle Login Submission
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            hideAlert();

            const username = document.getElementById('login-username').value.trim();
            const password = document.getElementById('login-password').value;
            const btn = document.getElementById('btn-login-submit');

            btn.disabled = true;
            btn.innerHTML = `<span>VERIFYING CREDENTIALS...</span>`;

            try {
                const res = await fetch(`${API_BASE}/api/admin/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                const data = await res.json();
                if (data.success) {
                    localStorage.setItem(STORAGE_ADMIN_TOKEN, data.token);
                    localStorage.setItem(STORAGE_ADMIN_INFO, JSON.stringify(data.admin));
                    showAlert('Authentication verified. Accessing Command Center...', 'success');
                    setTimeout(() => {
                        window.location.href = '/admin/dashboard.html';
                    }, 400);
                } else {
                    showAlert(data.message || 'Invalid administrator credentials.');
                    btn.disabled = false;
                    btn.innerHTML = `<span>ACCESS COMMAND CENTER</span>`;
                }
            } catch (err) {
                showAlert('Network error connecting to Admin Server: ' + err.message);
                btn.disabled = false;
                btn.innerHTML = `<span>ACCESS COMMAND CENTER</span>`;
            }
        });
    });
})();
