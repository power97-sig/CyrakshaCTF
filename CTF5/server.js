const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const users = {
  'student': { password: 'password123', role: 'user' },
  'alice': { password: 'alicepassword', role: 'user' }
};

const notesStore = {
  'student': [
    { id: 1, title: 'Web Security 101', content: 'Remember to study cookie-based authentication and session storage security.', date: '2026-08-28' },
    { id: 2, title: 'Project Checklist', content: 'Complete the lab writeup and submit the report before the weekend.', date: '2026-08-29' }
  ],
  'admin': [
    { id: 101, title: 'Server Audit Log', content: 'Notice: Critical advisory on client-side role validation.', date: '2026-08-30' },
    { id: 102, title: 'Confidential Root Credentials', content: 'FLAG: CYRAKSHA{NEVER_TRUST_THE_CLIENT}', date: '2026-08-30' }
  ]
};

let nextNoteId = 200;

app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password are required' });
  }
  const cleanUser = username.trim();
  if (users[cleanUser]) {
    return res.status(400).json({ success: false, message: 'User already exists' });
  }
  users[cleanUser] = { password, role: 'user' };
  notesStore[cleanUser] = [
    { id: nextNoteId++, title: 'My First Note', content: 'Welcome to your private Cyraksha Notes vault.', date: new Date().toISOString().split('T')[0] }
  ];
  res.cookie('user', cleanUser, { httpOnly: false, path: '/' });
  res.cookie('role', 'user', { httpOnly: false, path: '/' });
  return res.json({ success: true, message: 'Registration successful', username: cleanUser, role: 'user' });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password are required' });
  }
  const cleanUser = username.trim();
  const account = users[cleanUser];
  if (!account || account.password !== password) {
    return res.status(401).json({ success: false, message: 'Invalid username or password' });
  }
  res.cookie('user', cleanUser, { httpOnly: false, path: '/' });
  res.cookie('role', 'user', { httpOnly: false, path: '/' });
  return res.json({ success: true, message: 'Login successful', username: cleanUser, role: 'user' });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('user', { path: '/' });
  res.clearCookie('role', { path: '/' });
  return res.json({ success: true, message: 'Logged out successfully' });
});

app.get('/api/session', (req, res) => {
  const user = req.cookies.user;
  const role = req.cookies.role;

  if (!user && !role) {
    return res.json({ authenticated: false });
  }

  const isAdmin = role === 'admin';
  const effectiveUser = isAdmin ? (user || 'administrator') : (user || 'student');
  const effectiveRole = role || 'user';

  return res.json({
    authenticated: true,
    username: effectiveUser,
    role: effectiveRole,
    isAdmin: isAdmin,
    flag: isAdmin ? 'CYRAKSHA{NEVER_TRUST_THE_CLIENT}' : null
  });
});

app.get('/api/notes', (req, res) => {
  const user = req.cookies.user || 'student';
  const role = req.cookies.role || 'user';

  if (role === 'admin') {
    const adminNotes = notesStore['admin'] || [];
    const userNotes = notesStore[user] || [];
    return res.json({
      success: true,
      role: 'admin',
      notes: [...adminNotes, ...userNotes]
    });
  }

  const userNotes = notesStore[user] || [];
  return res.json({
    success: true,
    role: role,
    notes: userNotes
  });
});

app.post('/api/notes', (req, res) => {
  const user = req.cookies.user || 'student';
  const { title, content } = req.body;
  if (!title || !content) {
    return res.status(400).json({ success: false, message: 'Title and content are required' });
  }
  if (!notesStore[user]) {
    notesStore[user] = [];
  }
  const newNote = {
    id: nextNoteId++,
    title: title.trim(),
    content: content.trim(),
    date: new Date().toISOString().split('T')[0]
  };
  notesStore[user].unshift(newNote);
  return res.json({ success: true, note: newNote });
});

app.delete('/api/notes/:id', (req, res) => {
  const user = req.cookies.user || 'student';
  const noteId = parseInt(req.params.id, 10);
  if (notesStore[user]) {
    notesStore[user] = notesStore[user].filter(n => n.id !== noteId);
  }
  return res.json({ success: true });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Cyraksha Notes server running on port ${PORT}`);
});
