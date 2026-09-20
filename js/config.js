// Central CTF Arena & Admin Unified Origin Configuration
try {
    const cachedUrl = localStorage.getItem('ctf_admin_api_url');
    if (cachedUrl && cachedUrl.includes('onrender.com')) {
        localStorage.removeItem('ctf_admin_api_url');
    }
} catch (e) {}

window.CTF_CONFIG = {
    ADMIN_API_URL: '',

    getApiBase() {
        return window.location.origin;
    },

    setAdminApiUrl(url) {
        if (url) {
            this.ADMIN_API_URL = url.trim().replace(/\/+$/, '');
            localStorage.setItem('ctf_admin_api_url', this.ADMIN_API_URL);
        }
    }
};
