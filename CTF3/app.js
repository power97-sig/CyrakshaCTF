const CORRECT_PASSWORD = 'Welcome2026';
const FLAG_VALUE = 'FLAG{clues_arent_always_given_as_explicit_instructions}';

let attempts = [];

const authForm = document.getElementById('authForm');
const passwordInput = document.getElementById('passwordInput');
const togglePasswordBtn = document.getElementById('togglePassword');
const eyeIcon = document.getElementById('eyeIcon');
const feedbackMessage = document.getElementById('feedbackMessage');
const challengeCard = document.getElementById('challengeCard');
const attemptsLog = document.getElementById('attemptsLog');
const attemptCount = document.getElementById('attemptCount');
const successModal = document.getElementById('successModal');
const flagText = document.getElementById('flagText');
const copyFlagBtn = document.getElementById('copyFlagBtn');
const copyText = document.getElementById('copyText');
const closeModalBtn = document.getElementById('closeModalBtn');
const successFlash = document.getElementById('successFlash');
const challengeTitle = document.getElementById('challengeTitle');
const statusDot = document.getElementById('statusDot');
const systemStatus = document.getElementById('systemStatus');

/* ---------- Motion helpers ---------- */

function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const SCRAMBLE_CHARS = '!<>-_\\/[]{}=+*^?#$%&';

// Progressively "decrypts" text into an element, left to right, cycling
// random glyphs through the not-yet-revealed characters.
function scrambleReveal(el, finalText, duration = 700) {
  if (!el) return;
  if (prefersReducedMotion()) {
    el.textContent = finalText;
    return;
  }

  const chars = finalText.split('');
  const frameRate = 30;
  const totalTicks = Math.max(1, Math.round(duration / frameRate));
  let tick = 0;

  const interval = setInterval(() => {
    tick++;
    const revealCount = Math.floor((tick / totalTicks) * chars.length);
    el.textContent = chars
      .map((ch, i) => {
        if (ch === ' ') return ' ';
        if (i < revealCount) return ch;
        return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
      })
      .join('');

    if (tick >= totalTicks) {
      clearInterval(interval);
      el.textContent = finalText;
    }
  }, frameRate);
}

function replayAnimation(el, ...classNames) {
  el.classList.remove(...classNames);
  void el.offsetWidth;
  el.classList.add(...classNames);
}

/* ---------- Boot sequence ---------- */

window.addEventListener('DOMContentLoaded', () => {
  if (challengeTitle) {
    const titleFinal = challengeTitle.textContent.trim();
    setTimeout(() => scrambleReveal(challengeTitle, titleFinal, 650), 350);
  }

  setTimeout(() => {
    if (statusDot) statusDot.classList.remove('booting');
    if (systemStatus) systemStatus.textContent = 'BOX 04 // CHALLENGE';
  }, 1000);
});

/* ---------- Audio ---------- */

function playAudioTone(frequency, type, duration, gainValue = 0.1) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);

    gain.gain.setValueAtTime(gainValue, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) { }
}

function playSuccessFanfare() {
  playAudioTone(523.25, 'sine', 0.15, 0.12);
  setTimeout(() => playAudioTone(659.25, 'sine', 0.15, 0.12), 120);
  setTimeout(() => playAudioTone(783.99, 'sine', 0.18, 0.12), 240);
  setTimeout(() => playAudioTone(1046.50, 'sine', 0.45, 0.15), 360);
}

function playErrorTone() {
  playAudioTone(160, 'sawtooth', 0.25, 0.15);
}

/* ---------- Attempts log ---------- */

function updateAttemptsLog(inputVal, isCorrect) {
  attempts.unshift({
    value: inputVal,
    isCorrect: isCorrect,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  });

  attemptCount.textContent = `${attempts.length} attempt${attempts.length === 1 ? '' : 's'}`;

  attemptsLog.innerHTML = attempts.map(item => `
    <div class="log-entry">
      <span class="log-input">${escapeHtml(item.value)}</span>
      <span class="log-badge ${item.isCorrect ? 'correct' : 'wrong'}">
        ${item.isCorrect ? 'Granted' : 'Denied'}
      </span>
    </div>
  `).join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.innerText = str;
  return div.innerHTML;
}

function triggerShake() {
  replayAnimation(challengeCard, 'shake');
}

// Clears both state classes before applying the new one so the class list
// never ends up with 'success' and 'error' stacked together, and so the
// entrance animation replays even on back-to-back same-state attempts.
function setFeedbackState(state, text) {
  feedbackMessage.classList.remove('hidden', 'success', 'error');
  void feedbackMessage.offsetWidth;
  feedbackMessage.classList.add(state);
  feedbackMessage.textContent = text;
}

/* ---------- Password visibility toggle ---------- */

togglePasswordBtn.addEventListener('click', () => {
  const isPassword = passwordInput.type === 'password';
  passwordInput.type = isPassword ? 'text' : 'password';

  if (isPassword) {
    eyeIcon.innerHTML = `
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/>
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/>
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/>
      <line x1="2" x2="22" y1="2" y2="22"/>
    `;
  } else {
    eyeIcon.innerHTML = `
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
      <circle cx="12" cy="12" r="3"/>
    `;
  }
});

function getActiveFlag() {
  try {
    const team = (window.CTF_FLAGS && window.CTF_FLAGS.getActiveTeamName) ? window.CTF_FLAGS.getActiveTeamName() : 'anonymous_team';
    const token = (window.CTF_FLAGS && window.CTF_FLAGS.getTeamToken) ? window.CTF_FLAGS.getTeamToken(team, 'ctf3') : '';
    if (token) return `FLAG{clues_arent_always_given_as_explicit_instructions_${token}}`;
  } catch (e) {}
  return 'FLAG{clues_arent_always_given_as_explicit_instructions}';
}

authForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const enteredPassword = passwordInput.value.trim();
  if (!enteredPassword) return;

  if (enteredPassword === CORRECT_PASSWORD) {
    setFeedbackState('success', 'Access granted! Decrypting flag...');
    replayAnimation(successFlash, 'active');

    playSuccessFanfare();
    updateAttemptsLog(enteredPassword, true);

    const currentFlag = getActiveFlag();
    setTimeout(() => {
      successModal.classList.remove('hidden');
      scrambleReveal(flagText, currentFlag, 900);
    }, 450);
  } else {
    setFeedbackState('error', 'Access denied: Incorrect password.');

    triggerShake();
    playErrorTone();
    updateAttemptsLog(enteredPassword, false);
    passwordInput.select();
  }
});

copyFlagBtn.addEventListener('click', () => {
  const currentFlag = getActiveFlag();
  navigator.clipboard.writeText(currentFlag).then(() => {
    copyText.textContent = 'Copied!';
    setTimeout(() => {
      copyText.textContent = 'Copy';
    }, 2000);
  }).catch(() => {
    const textArea = document.createElement('textarea');
    textArea.value = currentFlag;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    copyText.textContent = 'Copied!';
    setTimeout(() => {
      copyText.textContent = 'Copy';
    }, 2000);
  });
});

closeModalBtn.addEventListener('click', () => {
  successModal.classList.add('hidden');
  passwordInput.value = '';
  feedbackMessage.className = 'feedback-message hidden';
  passwordInput.focus();
});