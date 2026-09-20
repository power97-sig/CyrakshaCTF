/**
 * CYRAKSHA CTF ARENA — Client-Side Team Identification Utilities
 * Flag validation is performed exclusively server-side.
 * This file provides team identification helpers only.
 */
(function (exports) {
    const SECRET_SALT = 'CYRAKSHA_DYNAMIC_ARENA_SALT_2026';

    function getTeamToken(teamName, cid) {
        const norm = (teamName || 'anonymous').toLowerCase().trim();
        const input = `${SECRET_SALT}:${norm}:${cid || 'general'}`;

        let h1 = 0x811c9dc5, h2 = 0x27d4eb2f;
        for (let i = 0; i < input.length; i++) {
            const c = input.charCodeAt(i);
            h1 = Math.imul(h1 ^ c, 0x01000193);
            h2 = Math.imul(h2 ^ c, 0x5bd1e995);
        }
        h1 = (h1 ^ (h1 >>> 16)) >>> 0;
        h2 = (h2 ^ (h2 >>> 15)) >>> 0;
        const hex = (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).substring(0, 8);
        return hex;
    }

    function getActiveTeamName() {
        try {
            if (typeof window !== 'undefined' && window.location && window.location.search) {
                const params = new URLSearchParams(window.location.search);
                const qTeam = params.get('team');
                if (qTeam && qTeam.trim()) return qTeam.trim();
            }
        } catch (e) {}
        try {
            if (typeof window !== 'undefined' && window.parent && window.parent !== window && window.parent.location && window.parent.location.search) {
                const pParams = new URLSearchParams(window.parent.location.search);
                const pTeam = pParams.get('team');
                if (pTeam && pTeam.trim()) return pTeam.trim();
            }
        } catch (e) {}
        try {
            if (typeof localStorage !== 'undefined') {
                const raw = localStorage.getItem('ctf_active_session');
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (parsed && parsed.teamName && parsed.teamName.trim()) return parsed.teamName.trim();
                }
            }
        } catch (e) {}
        return 'anonymous_team';
    }

    exports.getTeamToken = getTeamToken;
    exports.getActiveTeamName = getActiveTeamName;

})(typeof module !== 'undefined' && module.exports ? module.exports : (window.CTF_FLAGS = window.CTF_FLAGS || {}));

