/**
 * CYRAKSHA CTF ARENA — CHALLENGE 08: SHADOW VAULT CONTROLLER
 * Dynamic Flag Resolver & Vault Access Verification
 */
(function () {
    const keyInput = document.getElementById("key");
    const unlockBtn = document.getElementById("unlock");
    const resultBox = document.getElementById("result");

    function getTeam() {
        try {
            if (window.CTF_FLAGS && window.CTF_FLAGS.getActiveTeamName) {
                return window.CTF_FLAGS.getActiveTeamName();
            }
        } catch (e) {}
        try {
            const params = new URLSearchParams(window.location.search);
            const q = params.get('team');
            if (q) return q.trim();
        } catch (e) {}
        return "anonymous_team";
    }

    function escapeHtml(str) {
        return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function showResult(html, type = 'error') {
        resultBox.innerHTML = html;
        resultBox.className = `result-display ${type}`;
        resultBox.classList.remove('hidden');
    }

    async function handleUnlock() {
        const enteredKey = (keyInput.value || '').trim();
        if (!enteredKey) {
            showResult('⚠️ Please enter an access key.', 'error');
            return;
        }

        unlockBtn.disabled = true;
        unlockBtn.innerHTML = `<span>VERIFYING VAULT CIPHER...</span>`;
        resultBox.classList.add('hidden');

        const teamName = getTeam();
        let verified = false;
        let flag = null;

        // 1. Attempt verification via Central Backend
        try {
            const response = await fetch("/api/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ key: enteredKey, teamName })
            });

            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    verified = true;
                    flag = data.flag;
                }
            }
        } catch (e) {}

        // 2. Client-side deterministic verification fallback (Supports offline & static runners)
        if (!verified && enteredKey === "shadow-4729") {
            verified = true;
            try {
                const token = (window.CTF_FLAGS && window.CTF_FLAGS.getTeamToken) 
                    ? window.CTF_FLAGS.getTeamToken(teamName, 'ctf7') 
                    : '';
                flag = token ? `CTF{y0u_f0und_th3_v4ult_${token}}` : 'CTF{y0u_f0und_th3_v4ult}';
            } catch (e) {
                flag = 'CTF{y0u_f0und_th3_v4ult}';
            }
        }

        if (verified && flag) {
            showResult(`
                <div class="flag-output-title">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    <span>VAULT DECRYPTED // ACCESS GRANTED</span>
                </div>
                <div style="color: #c9d1d9; font-size: 11.5px; margin-top: 4px;">Copy this flag and submit it in the Main Arena Dashboard:</div>
                <code class="flag-output-code">${escapeHtml(flag)}</code>
            `, 'success');
        } else {
            showResult(`❌ ACCESS DENIED: Invalid or revoked access key. Inspect backup telemetry.`, 'error');
        }

        unlockBtn.disabled = false;
        unlockBtn.innerHTML = `
            <span class="btn-text">UNLOCK VAULT</span>
            <svg class="btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M5 12h14"></path>
                <path d="m12 5 7 7-7 7"></path>
            </svg>
        `;
    }

    unlockBtn.addEventListener("click", handleUnlock);
    keyInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") handleUnlock();
    });
})();