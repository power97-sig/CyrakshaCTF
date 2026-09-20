document.addEventListener('DOMContentLoaded', () => {
  const authView = document.getElementById('authView');
  const dashboardView = document.getElementById('dashboardView');
  const loginTabBtn = document.getElementById('loginTabBtn');
  const registerTabBtn = document.getElementById('registerTabBtn');
  const authForm = document.getElementById('authForm');
  const usernameInput = document.getElementById('usernameInput');
  const passwordInput = document.getElementById('passwordInput');
  const submitAuthBtn = document.getElementById('submitAuthBtn');
  const authAlert = document.getElementById('authAlert');
  const logoutBtn = document.getElementById('logoutBtn');
  const displayUsername = document.getElementById('displayUsername');
  const displayRole = document.getElementById('displayRole');
  const avatarLetter = document.getElementById('avatarLetter');
  const cookieDisplay = document.getElementById('cookieDisplay');
  const adminFlagContainer = document.getElementById('adminFlagContainer');
  const notesGrid = document.getElementById('notesGrid');
  const emptyNotes = document.getElementById('emptyNotes');
  const noteCount = document.getElementById('noteCount');
  const sessionIdentity = document.getElementById('sessionIdentity');
  const sessionRole = document.getElementById('sessionRole');
  const openNewNoteModal = document.getElementById('openNewNoteModal');
  const noteModal = document.getElementById('noteModal');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const cancelNoteBtn = document.getElementById('cancelNoteBtn');
  const newNoteForm = document.getElementById('newNoteForm');
  const noteTitleInput = document.getElementById('noteTitleInput');
  const noteContentInput = document.getElementById('noteContentInput');
  const copyFlagBtn = document.getElementById('copyFlagBtn');
  const flagValue = document.getElementById('flagValue');
  const toast = document.getElementById('toast');

  let currentAuthMode = 'login';

  // --- Dynamic Flag Resolver ---
  function getAdminFlag() {
    try {
      const team = (window.CTF_FLAGS && window.CTF_FLAGS.getActiveTeamName) ? window.CTF_FLAGS.getActiveTeamName() : 'anonymous_team';
      const token = (window.CTF_FLAGS && window.CTF_FLAGS.getTeamToken) ? window.CTF_FLAGS.getTeamToken(team, 'ctf5') : '';
      if (token) return `CYRAKSHA{NEVER_TRUST_THE_CLIENT_${token}}`;
    } catch (e) {}
    return 'CYRAKSHA{NEVER_TRUST_THE_CLIENT}';
  }

  // --- Client-Side Mock Database Engine (Supports Vercel, Netlify & Static Hosts) ---
  const MOCK_STORAGE_USERS = 'ctf5_vault_users';
  const MOCK_STORAGE_NOTES = 'ctf5_vault_notes';

  function getMockUsers() {
    try {
      const raw = localStorage.getItem(MOCK_STORAGE_USERS);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return {
      'student': { password: 'password123', role: 'user' },
      'alice': { password: 'alicepassword', role: 'user' }
    };
  }

  function saveMockUsers(users) {
    try {
      localStorage.setItem(MOCK_STORAGE_USERS, JSON.stringify(users));
    } catch (e) {}
  }

  function getMockNotes() {
    try {
      const raw = localStorage.getItem(MOCK_STORAGE_NOTES);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return {
      'student': [
        { id: 1, title: 'Web Security 101', content: 'Remember to study cookie-based authentication and session storage security.', date: '2026-08-28' },
        { id: 2, title: 'Project Checklist', content: 'Complete the lab writeup and submit the report before the weekend.', date: '2026-08-29' }
      ]
    };
  }

  function saveMockNotes(notes) {
    try {
      localStorage.setItem(MOCK_STORAGE_NOTES, JSON.stringify(notes));
    } catch (e) {}
  }

  // Cookie Helpers
  function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) {
      const val = parts.pop().split(';').shift();
      return decodeURIComponent(val.trim());
    }
    return null;
  }

  function setCookie(name, val) {
    document.cookie = `${name}=${encodeURIComponent(val)}; path=/; max-age=86400`;
  }

  function deleteCookie(name) {
    document.cookie = `${name}=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  }

  // Unified Request Wrapper (Server-first with automatic client-side mock fallback)
  async function apiCall(endpoint, options = {}) {
    try {
      const res = await fetch(endpoint, options);
      if (res.ok) {
        const data = await res.json();
        return { ok: true, data };
      }
      if (res.status === 400 || res.status === 401) {
        const data = await res.json().catch(() => ({}));
        return { ok: false, data };
      }
    } catch (netErr) {
      // Server offline / 404 on static hosting like Vercel -> proceed to fallback
    }

    // --- Fallback Mock Engine ---
    const method = (options.method || 'GET').toUpperCase();
    const body = options.body ? JSON.parse(options.body) : {};
    const currentUser = getCookie('user') || 'student';
    const currentRole = getCookie('role') || 'user';

    if (endpoint === '/api/login' && method === 'POST') {
      const users = getMockUsers();
      const cleanUser = (body.username || '').trim().toLowerCase();
      const account = users[cleanUser];
      if (!account || account.password !== body.password) {
        return { ok: false, data: { success: false, message: 'Invalid username or password' } };
      }
      setCookie('user', cleanUser);
      setCookie('role', 'user');
      return { ok: true, data: { success: true, message: 'Login successful', username: cleanUser, role: 'user' } };
    }

    if (endpoint === '/api/register' && method === 'POST') {
      const users = getMockUsers();
      const cleanUser = (body.username || '').trim().toLowerCase();
      if (!cleanUser || !body.password) {
        return { ok: false, data: { success: false, message: 'Username and password are required' } };
      }
      if (users[cleanUser]) {
        return { ok: false, data: { success: false, message: 'User already exists' } };
      }
      users[cleanUser] = { password: body.password, role: 'user' };
      saveMockUsers(users);

      const notes = getMockNotes();
      notes[cleanUser] = [
        { id: Date.now(), title: 'My First Note', content: 'Welcome to your private Cyraksha Notes vault.', date: new Date().toISOString().split('T')[0] }
      ];
      saveMockNotes(notes);

      setCookie('user', cleanUser);
      setCookie('role', 'user');
      return { ok: true, data: { success: true, message: 'Registration successful', username: cleanUser, role: 'user' } };
    }

    if (endpoint === '/api/logout' && method === 'POST') {
      deleteCookie('user');
      deleteCookie('role');
      return { ok: true, data: { success: true, message: 'Logged out successfully' } };
    }

    if (endpoint === '/api/session' && method === 'GET') {
      const user = getCookie('user');
      const role = getCookie('role');
      if (!user && !role) {
        return { ok: true, data: { authenticated: false } };
      }
      const isAdmin = (role || '').toLowerCase() === 'admin';
      return {
        ok: true,
        data: {
          authenticated: true,
          username: user || (isAdmin ? 'administrator' : 'student'),
          role: role || 'user',
          isAdmin: isAdmin,
          flag: isAdmin ? getAdminFlag() : null
        }
      };
    }

    if (endpoint === '/api/notes' && method === 'GET') {
      const notes = getMockNotes();
      const user = (getCookie('user') || 'student').toLowerCase();
      const role = (getCookie('role') || 'user').toLowerCase();

      if (role === 'admin') {
        const dynamicFlag = getAdminFlag();
        const adminNotes = [
          { id: 101, title: 'Server Audit Log', content: 'Notice: Critical advisory on client-side role validation.', date: '2026-08-30' },
          { id: 102, title: 'Confidential Root Credentials', content: `FLAG: ${dynamicFlag}`, date: '2026-08-30' }
        ];
        const userNotes = notes[user] || [];
        return { ok: true, data: { success: true, role: 'admin', notes: [...adminNotes, ...userNotes] } };
      }

      const userNotes = notes[user] || [];
      return { ok: true, data: { success: true, role: role, notes: userNotes } };
    }

    if (endpoint === '/api/notes' && method === 'POST') {
      const notes = getMockNotes();
      const user = (getCookie('user') || 'student').toLowerCase();
      if (!notes[user]) notes[user] = [];
      const newNote = {
        id: Date.now(),
        title: (body.title || '').trim(),
        content: (body.content || '').trim(),
        date: new Date().toISOString().split('T')[0]
      };
      notes[user].unshift(newNote);
      saveMockNotes(notes);
      return { ok: true, data: { success: true, note: newNote } };
    }

    if (endpoint.startsWith('/api/notes/') && method === 'DELETE') {
      const noteId = parseInt(endpoint.split('/').pop(), 10);
      const notes = getMockNotes();
      const user = (getCookie('user') || 'student').toLowerCase();
      if (notes[user]) {
        notes[user] = notes[user].filter(n => n.id !== noteId);
        saveMockNotes(notes);
      }
      return { ok: true, data: { success: true } };
    }

    return { ok: true, data: { success: true } };
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.remove('hidden');
    setTimeout(() => {
      toast.classList.add('hidden');
    }, 3000);
  }

  function showAlert(message, type = 'error') {
    authAlert.textContent = message;
    authAlert.className = `alert-box ${type}`;
    authAlert.classList.remove('hidden');
  }

  function clearAlert() {
    authAlert.classList.add('hidden');
    authAlert.textContent = '';
  }

  function setAuthMode(mode) {
    currentAuthMode = mode;
    clearAlert();
    if (mode === 'login') {
      loginTabBtn.classList.add('active');
      registerTabBtn.classList.remove('active');
      submitAuthBtn.querySelector('.btn-text').textContent = 'Sign In';
    } else {
      registerTabBtn.classList.add('active');
      loginTabBtn.classList.remove('active');
      submitAuthBtn.querySelector('.btn-text').textContent = 'Create Account';
    }
  }

  loginTabBtn.addEventListener('click', () => setAuthMode('login'));
  registerTabBtn.addEventListener('click', () => setAuthMode('register'));

  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlert();

    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    const endpoint = currentAuthMode === 'login' ? '/api/login' : '/api/register';

    const res = await apiCall(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    if (!res.ok || !res.data.success) {
      showAlert(res.data.message || 'Authentication failed', 'error');
      return;
    }

    showToast(currentAuthMode === 'login' ? 'Signed in successfully' : 'Registered successfully');
    checkSessionAndRender();
  });

  logoutBtn.addEventListener('click', async () => {
    await apiCall('/api/logout', { method: 'POST' });
    deleteCookie('user');
    deleteCookie('role');
    showToast('Logged out');
    checkSessionAndRender();
  });

  async function checkSessionAndRender() {
    const res = await apiCall('/api/session');
    const session = (res && res.data) || {};

    const cookieRole = getCookie('role');
    const cookieUser = getCookie('user');

    if (!session.authenticated && !cookieUser && !cookieRole) {
      authView.classList.remove('hidden');
      dashboardView.classList.add('hidden');
      logoutBtn.classList.add('hidden');
      return;
    }

    authView.classList.add('hidden');
    dashboardView.classList.remove('hidden');
    logoutBtn.classList.remove('hidden');

    const role = cookieRole || session.role || 'user';
    const user = cookieUser || session.username || 'student';
    const isAdmin = role.toLowerCase() === 'admin';

    if (isAdmin) {
      displayUsername.textContent = 'administrator.';
      displayRole.textContent = 'admin';
      displayRole.className = 'role-tag role-admin';
      avatarLetter.textContent = 'A';
      sessionIdentity.textContent = user;
      sessionRole.textContent = 'Administrator (Full Access)';
      
      const dynamicFlag = getAdminFlag();
      if (flagValue) flagValue.textContent = dynamicFlag;
      
      adminFlagContainer.classList.remove('hidden');
    } else {
      displayUsername.textContent = `${user}`;
      displayRole.textContent = role;
      displayRole.className = 'role-tag role-user';
      avatarLetter.textContent = user.charAt(0).toUpperCase() || 'U';
      sessionIdentity.textContent = user;
      sessionRole.textContent = 'Standard User';
      adminFlagContainer.classList.add('hidden');
    }

    cookieDisplay.textContent = `role=${role}`;
    loadNotes();
  }

  async function loadNotes() {
    const res = await apiCall('/api/notes');
    const data = (res && res.data) || {};
    const notes = data.notes || [];

    notesGrid.innerHTML = '';
    noteCount.textContent = `${notes.length} note${notes.length === 1 ? '' : 's'}`;

    if (notes.length === 0) {
      emptyNotes.classList.remove('hidden');
      return;
    }

    emptyNotes.classList.add('hidden');
    notes.forEach((note) => {
      const isSecret = note.content && note.content.includes('FLAG:');
      let noteBody = note.content;
      if (isSecret) {
        const dynamicFlag = getAdminFlag();
        noteBody = `FLAG: ${dynamicFlag}`;
      }
      const card = document.createElement('div');
      card.className = `note-card ${isSecret ? 'admin-note' : ''}`;
      
      card.innerHTML = `
        ${isSecret ? '<span class="note-badge-tag">Restricted</span>' : ''}
        <div>
          <h4 class="note-card-title">${escapeHTML(note.title)}</h4>
          <p class="note-card-body">${escapeHTML(noteBody)}</p>
        </div>
        <div class="note-card-footer">
          <span class="note-date">${note.date || 'Active'}</span>
          ${!isSecret ? `<button class="note-delete-btn" data-id="${note.id}" title="Delete Note">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>` : ''}
        </div>
      `;
      notesGrid.appendChild(card);
    });

    document.querySelectorAll('.note-delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        await deleteNote(id);
      });
    });
  }

  async function deleteNote(id) {
    const res = await apiCall(`/api/notes/${id}`, { method: 'DELETE' });
    if (res && res.ok) {
      showToast('Note deleted');
      loadNotes();
    } else {
      showToast('Error deleting note');
    }
  }

  openNewNoteModal.addEventListener('click', () => {
    noteTitleInput.value = '';
    noteContentInput.value = '';
    noteModal.classList.remove('hidden');
    noteTitleInput.focus();
  });

  function closeModal() {
    noteModal.classList.add('hidden');
  }

  closeModalBtn.addEventListener('click', closeModal);
  cancelNoteBtn.addEventListener('click', closeModal);

  newNoteForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = noteTitleInput.value.trim();
    const content = noteContentInput.value.trim();
    if (!title || !content) return;

    const res = await apiCall('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content })
    });

    if (res && res.ok && res.data.success) {
      closeModal();
      showToast('Note saved securely');
      loadNotes();
    } else {
      showToast('Failed to save note');
    }
  });

  copyFlagBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(flagValue.textContent);
    showToast('Flag copied to clipboard!');
  });

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Periodic cookie monitor so changing document.cookie in DevTools instantly triggers admin dashboard update!
  let lastCookieRole = getCookie('role');
  setInterval(() => {
    const currentRole = getCookie('role');
    if (currentRole !== lastCookieRole) {
      lastCookieRole = currentRole;
      checkSessionAndRender();
    }
  }, 1000);

  checkSessionAndRender();
});
