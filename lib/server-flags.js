/**
 * CYRAKSHA CTF ARENA — Server-Side Dynamic Flag Engine
 * This file is loaded ONLY by Node.js (server.js) via require().
 * It is NOT served to browsers and must NEVER be placed in a public static directory.
 */
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

function getDynamicFlags(teamName, cid) {
    const token = getTeamToken(teamName, cid);
    switch (cid) {
        case 'ctf0':
            return [`flag{inspect_before_you_click_${token}}`];
        case 'ctf1':
            return [
                `flag{you_should_have_looked_closer_${token}}`,
                `flag{hidden_files_are_still_files_${token}}`
            ];
        case 'ctf2':
            return [`CYRAKSHA{h1dd3n_1n_pl41n_51gh7_${token}}`];
        case 'ctf3':
            return [`FLAG{clues_arent_always_given_as_explicit_instructions_${token}}`];
        case 'ctf4':
            return [`flag{you_looked_deeper_${token}}`];
        case 'ctf5':
            return [`CYRAKSHA{NEVER_TRUST_THE_CLIENT_${token}}`];
        case 'ctf6':
            return [`CYRAKSHA{SPL1T_BR41N_PR0T0C0L_DUO_M4ST3R_${token}}`];
        case 'ctf7':
            return [`CTF{y0u_f0und_th3_v4ult_${token}}`];
        default:
            return [`flag{${token}}`];
    }
}

function getDynamicFlag(teamName, cid, variant = 0) {
    const flags = getDynamicFlags(teamName, cid);
    return flags[variant] || flags[0];
}

module.exports = { getTeamToken, getDynamicFlags, getDynamicFlag };
