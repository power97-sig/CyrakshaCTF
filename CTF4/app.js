const TARGET_FLAG = "flag{you_looked_deeper}";
const STORAGE_SESSION_KEY = 'ctf_active_session';
const STORAGE_SCORES_KEY = 'ctf_teams_progress';

let basePoints = 200;
let hintDeductions = 0;
let unlockedHints = { 1: false, 2: false, 3: false };
let isExtracted = false;
let isSolved = false;
let commandHistory = [];
let historyIndex = -1;

const termScreen = document.getElementById("terminal-screen");
const termInput = document.getElementById("terminal-input");
const navPointsEl = document.getElementById("nav-current-pts");
const statusTextEl = document.getElementById("challenge-status-text");
const statusPillEl = document.querySelector(".status-pill");
const ptsRewardBadge = document.getElementById("pts-reward-badge");
const imageModal = document.getElementById("image-modal");
const inspectBtn = document.getElementById("inspect-preview-btn");
const closeImgModalBtn = document.getElementById("close-img-modal-btn");

function getActiveSession() {
    try {
        const raw = localStorage.getItem(STORAGE_SESSION_KEY);
        if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
}

function getTeamProgress() {
    const session = getActiveSession();
    if (!session || !session.teamName) return { allProgress: {}, teamProgress: null };

    let allProgress = {};
    try {
        const raw = localStorage.getItem(STORAGE_SCORES_KEY);
        if (raw) allProgress = JSON.parse(raw);
    } catch (e) {}

    const teamKey = session.teamName.toLowerCase();
    if (!allProgress[teamKey]) {
        allProgress[teamKey] = {
            teamName: session.teamName,
            mode: session.mode || 'team',
            solved: {},
            hintsUnlocked: { 1: false, 2: false, 3: false },
            totalScore: 0,
            lastSolveTime: null
        };
    }
    return { allProgress, teamProgress: allProgress[teamKey] };
}

function saveTeamProgress(allProgress) {
    try {
        localStorage.setItem(STORAGE_SCORES_KEY, JSON.stringify(allProgress));
    } catch (e) {}
}

function recalculateScore(teamProgress) {
    let total = 0;
    const BASE_SCORES = { ctf0: 200, ctf1: 200, ctf2: 200, ctf3: 200, ctf4: 200, ctf5: 500 };
    Object.keys(BASE_SCORES).forEach(cid => {
        if (teamProgress.solved && teamProgress.solved[cid]) {
            if (cid === 'ctf4') {
                let y = 200;
                if (teamProgress.hintsUnlocked && teamProgress.hintsUnlocked[2]) y -= 10;
                if (teamProgress.hintsUnlocked && teamProgress.hintsUnlocked[3]) y -= 20;
                total += Math.max(0, y);
            } else {
                total += BASE_SCORES[cid];
            }
        }
    });
    teamProgress.totalScore = total;
    return total;
}

let audioCtx = null;

function getAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
}

function playBeep(freq = 440, type = "sine", duration = 0.1, gainVal = 0.05) {
    try {
        const ctx = getAudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gain.gain.setValueAtTime(gainVal, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + duration);
    } catch (e) {}
}

function playSuccessChime() {
    try {
        const ctx = getAudioContext();
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((note, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(note, ctx.currentTime + idx * 0.12);
            gain.gain.setValueAtTime(0.08, ctx.currentTime + idx * 0.12);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + idx * 0.12 + 0.4);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime + idx * 0.12);
            osc.stop(ctx.currentTime + idx * 0.12 + 0.4);
        });
    } catch (e) {}
}

function playErrorBuzzer() {
    try {
        const ctx = getAudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(100, ctx.currentTime + 0.25);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.25);
    } catch (e) {}
}

function updatePointsUI() {
    const currentYield = Math.max(0, basePoints - hintDeductions);
    if (navPointsEl) navPointsEl.textContent = `${currentYield} PTS`;
    if (ptsRewardBadge) ptsRewardBadge.textContent = `${currentYield} PTS Reward`;
}

function setupTabs() {
    const tabBtns = document.querySelectorAll(".tab-btn");
    const tabPanes = document.querySelectorAll(".tab-pane");

    tabBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            playBeep(600, "sine", 0.05, 0.02);
            const targetId = btn.getAttribute("data-tab");
            tabBtns.forEach(b => b.classList.remove("active"));
            tabPanes.forEach(p => p.classList.remove("active"));
            btn.classList.add("active");
            const targetPane = document.getElementById(targetId);
            if (targetPane) targetPane.classList.add("active");
        });
    });
}

function setupFilters() {
    const filterBtns = document.querySelectorAll(".filter-btn");
    const targetImg = document.getElementById("analyzer-target");

    filterBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            playBeep(700, "sine", 0.04, 0.02);
            filterBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            const filterType = btn.getAttribute("data-filter");
            if (filterType === "normal") {
                targetImg.style.filter = "none";
            } else if (filterType === "invert") {
                targetImg.style.filter = "invert(100%)";
            } else if (filterType === "contrast") {
                targetImg.style.filter = "contrast(250%) saturate(150%)";
            } else if (filterType === "threshold") {
                targetImg.style.filter = "grayscale(100%) contrast(1000%)";
            } else if (filterType === "edges") {
                targetImg.style.filter = "contrast(400%) invert(100%) grayscale(100%) drop-shadow(0 0 1px #ef233c)";
            }
        });
    });
}

function unlockHint(index, cost) {
    const { allProgress, teamProgress } = getTeamProgress();
    if (teamProgress) {
        if (!teamProgress.hintsUnlocked) {
            teamProgress.hintsUnlocked = { 1: false, 2: false, 3: false };
        }
        teamProgress.hintsUnlocked[index] = true;
        recalculateScore(teamProgress);
        saveTeamProgress(allProgress);
    }

    unlockedHints[index] = true;
    hintDeductions = (unlockedHints[2] ? 10 : 0) + (unlockedHints[3] ? 20 : 0);
    updatePointsUI();

    const item = document.getElementById(`hint-${index}-item`);
    const btn = document.getElementById(`unlock-hint-${index}`);
    if (item) item.classList.add("unlocked");
    if (btn) {
        btn.textContent = "Unlocked";
        btn.disabled = true;
        btn.style.opacity = "0.6";
        btn.style.cursor = "default";
    }
    playBeep(880, "sine", 0.15, 0.05);
}

function setupHints() {
    const btn1 = document.getElementById("unlock-hint-1");
    const btn2 = document.getElementById("unlock-hint-2");
    const btn3 = document.getElementById("unlock-hint-3");

    if (btn1) btn1.addEventListener("click", () => unlockHint(1, 0));
    if (btn2) btn2.addEventListener("click", () => unlockHint(2, 10));
    if (btn3) btn3.addEventListener("click", () => unlockHint(3, 20));

    // Two-way sync: Check if hints or solve were already recorded on Dashboard
    const { teamProgress } = getTeamProgress();
    if (teamProgress) {
        if (teamProgress.hintsUnlocked) {
            [1, 2, 3].forEach(idx => {
                if (teamProgress.hintsUnlocked[idx]) {
                    unlockedHints[idx] = true;
                    const item = document.getElementById(`hint-${idx}-item`);
                    const btn = document.getElementById(`unlock-hint-${idx}`);
                    if (item) item.classList.add("unlocked");
                    if (btn) {
                        btn.textContent = "Unlocked";
                        btn.disabled = true;
                        btn.style.opacity = "0.6";
                        btn.style.cursor = "default";
                    }
                }
            });
            hintDeductions = (unlockedHints[2] ? 10 : 0) + (unlockedHints[3] ? 20 : 0);
            updatePointsUI();
        }

        if (teamProgress.solved && teamProgress.solved['ctf4']) {
            isSolved = true;
            statusTextEl.textContent = "SOLVED";
            statusTextEl.style.color = "var(--accent-green)";
            if (statusPillEl) {
                statusPillEl.style.borderColor = "rgba(16, 185, 129, 0.4)";
                const dot = statusPillEl.querySelector(".status-dot");
                if (dot) {
                    dot.style.backgroundColor = "var(--accent-green)";
                    dot.style.boxShadow = "0 0 10px rgba(16, 185, 129, 0.6)";
                }
            }
        }
    }
}

function writeTermLine(text, className = "") {
    if (!termScreen) return;
    const div = document.createElement("div");
    div.className = `term-line ${className}`;
    div.textContent = text;
    termScreen.appendChild(div);
    const win = document.getElementById("terminal-window");
    if (win) win.scrollTop = win.scrollHeight;
}

function initTerminal() {
    writeTermLine("Cyraksha Linux Environment (v6.1.0-ctf)", "term-dim");
    writeTermLine("Type 'help' to see available tools & utility commands.\n", "term-dim");
    writeTermLine("Investigative workspace initialized. Target artifact: secret.jpg", "term-accent");
}

function handleCommand(cmdRaw) {
    const cmd = cmdRaw.trim();
    if (!cmd) return;

    commandHistory.push(cmd);
    historyIndex = commandHistory.length;

    writeTermLine(`analyst@cyraksha:~$ ${cmd}`, "term-cmd-echo");
    playBeep(520, "triangle", 0.04, 0.03);

    const parts = cmd.split(/\s+/);
    const mainCmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    if (mainCmd === "clear") {
        termScreen.innerHTML = "";
    } else if (mainCmd === "help") {
        writeTermLine("Available Commands:");
        writeTermLine("  ls [-la]             List files in current working directory");
        writeTermLine("  file <file>          Determine file type");
        writeTermLine("  strings <file>       Print strings of printable characters");
        writeTermLine("  exiftool <file>      Read file metadata tags");
        writeTermLine("  steghide <args>      Extract or inspect steganographic carriers");
        writeTermLine("  cat <file>           Concatenate and display file contents");
        writeTermLine("  whoami               Display current user name");
        writeTermLine("  uname -a             Print system information");
        writeTermLine("  clear                Clear terminal screen");
    } else if (mainCmd === "ls" || mainCmd === "dir") {
        if (args.includes("-la") || args.includes("-l") || args.includes("-a")) {
            writeTermLine("total 248");
            writeTermLine("drwxr-xr-x 2 analyst analyst   4096 Aug 30 01:42 .");
            writeTermLine("drwxr-xr-x 4 analyst analyst   4096 Aug 30 01:40 ..");
            writeTermLine("-rw-r--r-- 1 analyst analyst 245760 Aug 30 01:42 secret.jpg");
            if (isExtracted) {
                writeTermLine("-rw-r--r-- 1 analyst analyst     24 Aug 30 01:43 flag.txt", "term-success");
            }
        } else {
            if (isExtracted) {
                writeTermLine("secret.jpg  flag.txt");
            } else {
                writeTermLine("secret.jpg");
            }
        }
    } else if (mainCmd === "file") {
        const target = args[0];
        if (!target) {
            writeTermLine("file: missing file operand", "term-error");
        } else if (target === "secret.jpg") {
            writeTermLine("secret.jpg: JPEG image data, JFIF standard 1.01, aspect ratio, density 1x1, segment length 16, baseline, precision 8, 1024x768, components 3");
        } else if (target === "flag.txt") {
            if (isExtracted) {
                writeTermLine("flag.txt: ASCII text");
            } else {
                writeTermLine("file: cannot open `flag.txt` (No such file or directory)", "term-error");
            }
        } else {
            writeTermLine(`file: cannot open \`${target}\` (No such file or directory)`, "term-error");
        }
    } else if (mainCmd === "cat") {
        const target = args[0];
        if (!target) {
            writeTermLine("cat: missing file operand", "term-error");
        } else if (target === "flag.txt") {
            if (isExtracted) {
                const team = (typeof window.CTF_FLAGS !== 'undefined' && window.CTF_FLAGS.getActiveTeamName) ? window.CTF_FLAGS.getActiveTeamName() : 'anonymous_team';
                const token = (typeof window.CTF_FLAGS !== 'undefined' && window.CTF_FLAGS.getTeamToken) ? window.CTF_FLAGS.getTeamToken(team, 'ctf4') : '';
                const activeFlag = token ? `flag{you_looked_deeper_${token}}` : TARGET_FLAG;
                writeTermLine(activeFlag, "term-flag-highlight");
            } else {
                writeTermLine("cat: flag.txt: No such file or directory", "term-error");
            }
        } else if (target === "secret.jpg") {
            writeTermLine("\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\x00C\x00\b\x06\x06\x07\x06\x05\b\x07\x07\x07\t\t\b\n\f\x14\r\f\x0b\x0b\f\x19\x12\x13\x0f\x14\x1d\x1a\x1f\x1e\x1d\x1a\x1c\x1c $.' \",#\x1c\x1c(7),01444\x1f'9=82<.342\x00\x11\b\x03\x00\x04\x00\x03\x01\"\x00\x02\x11\x01\x03\x11\x01\x00\x1f\x00\x00\x01\x05\x01\x01\x01\x01\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x01\x02\x03\x04\x05\x06\x07\b\t\n\x0b\x00\x10\x00\x02\x01\x03\x03\x02\x04\x03\x05\x05\x04\x04\x00\x00\x01}\x01\x02\x03\x00\x04\x11\x05\x12!1A\x06\x13Qa\x07\"q\x142\b#B\x15R$3br\x16\x17\x18\x19\x1a%&'()*456789:CDEFGHIJSTUVWXYZcdefghijstuvwxyz\n\n[Binary content truncated... Use appropriate stego tools to extract]", "term-dim");
        } else {
            writeTermLine(`cat: ${target}: No such file or directory`, "term-error");
        }
    } else if (mainCmd === "strings") {
        const target = args[0];
        if (!target) {
            writeTermLine("strings: missing file operand", "term-error");
        } else if (target === "secret.jpg") {
            writeTermLine("JFIF\nPhotoshop 3.0\n8BIM\nhttp://ns.adobe.com/xap/1.0/\n<x:xmpmeta xmlns:x=\"adobe:ns:meta/\">\nICC_PROFILE\nlcms\nmntrRGB XYZ\nacspMSFT\n[Output truncated - 1,482 strings found]");
        } else {
            writeTermLine(`strings: '${target}': No such file`, "term-error");
        }
    } else if (mainCmd === "exiftool") {
        const target = args[0];
        if (!target) {
            writeTermLine("exiftool: missing file operand", "term-error");
        } else if (target === "secret.jpg") {
            writeTermLine("ExifTool Version Number         : 12.60");
            writeTermLine("File Name                       : secret.jpg");
            writeTermLine("Directory                       : .");
            writeTermLine("File Size                       : 240 kB");
            writeTermLine("File Type                       : JPEG");
            writeTermLine("File Type Extension             : jpg");
            writeTermLine("MIME Type                       : image/jpeg");
            writeTermLine("JFIF Version                    : 1.01");
            writeTermLine("Image Width                     : 1024");
            writeTermLine("Image Height                    : 768");
            writeTermLine("Encoding Process                : Baseline DCT, Huffman coding");
            writeTermLine("Bits Per Sample                 : 8");
            writeTermLine("Color Components                : 3");
            writeTermLine("Y Cb Cr Sub Sampling            : YCbCr4:2:0 (2 2)");
        } else {
            writeTermLine(`File not found: ${target}`, "term-error");
        }
    } else if (mainCmd === "steghide") {
        const sub = args[0];
        if (!sub || sub === "--help" || sub === "-h") {
            writeTermLine("steghide version 0.5.1");
            writeTermLine("the first argument must be one of the following:");
            writeTermLine("  embed, --embed          embed data");
            writeTermLine("  extract, --extract      extract data");
            writeTermLine("  info, --info            display information about a cover/stego file");
            writeTermLine("  version, --version      display version information");
            writeTermLine("  license, --license      display licensing information");
            writeTermLine("  help, --help            display this short help");
        } else if (sub === "extract") {
            const hasSf = args.includes("-sf") || args.includes("--stegofile");
            const fileIdx = args.indexOf("-sf") !== -1 ? args.indexOf("-sf") + 1 : args.indexOf("--stegofile") + 1;
            const target = fileIdx > 0 && args[fileIdx] ? args[fileIdx] : null;

            if (!hasSf || !target) {
                writeTermLine("steghide: no stego file specified. Use -sf <filename>", "term-error");
            } else if (target !== "secret.jpg") {
                writeTermLine(`steghide: could not open the file "${target}".`, "term-error");
            } else {
                isExtracted = true;
                writeTermLine('wrote extracted data to "flag.txt".', "term-success");
            }
        } else if (sub === "info") {
            const fileIdx = args.indexOf("-sf") !== -1 ? args.indexOf("-sf") + 1 : 1;
            const target = args[fileIdx] || "secret.jpg";
            if (target === "secret.jpg") {
                writeTermLine('"secret.jpg":');
                writeTermLine("  format: jpeg");
                writeTermLine("  capacity: 14.8 KB");
                writeTermLine("Try extracting data with: steghide extract -sf secret.jpg");
            } else {
                writeTermLine(`steghide: could not open the file "${target}".`, "term-error");
            }
        } else if (sub === "version" || sub === "--version") {
            writeTermLine("steghide version 0.5.1");
        } else {
            writeTermLine(`steghide: unknown command "${sub}"`, "term-error");
        }
    } else if (mainCmd === "whoami") {
        writeTermLine("analyst");
    } else if (mainCmd === "uname") {
        writeTermLine("Linux cyraksha-arena 6.1.0-ctf #1 SMP PREEMPT_DYNAMIC x86_64 GNU/Linux");
    } else {
        writeTermLine(`bash: ${mainCmd}: command not found. Type 'help' for command list.`, "term-error");
    }

    termInput.value = "";
}

function setupTerminal() {
    initTerminal();

    if (termInput) {
        termInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                handleCommand(termInput.value);
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                if (commandHistory.length > 0 && historyIndex > 0) {
                    historyIndex--;
                    termInput.value = commandHistory[historyIndex];
                }
            } else if (e.key === "ArrowDown") {
                e.preventDefault();
                if (historyIndex < commandHistory.length - 1) {
                    historyIndex++;
                    termInput.value = commandHistory[historyIndex];
                } else {
                    historyIndex = commandHistory.length;
                    termInput.value = "";
                }
            }
        });
    }
}

function setupModal() {
    if (inspectBtn) {
        inspectBtn.addEventListener("click", () => {
            if (imageModal) imageModal.classList.add("open");
        });
    }

    if (closeImgModalBtn) {
        closeImgModalBtn.addEventListener("click", () => {
            if (imageModal) imageModal.classList.remove("open");
        });
    }

    if (imageModal) {
        imageModal.addEventListener("click", (e) => {
            if (e.target === imageModal) {
                imageModal.classList.remove("open");
            }
        });
    }
}

function initBackground() {
    const canvas = document.getElementById("bg-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    window.addEventListener("resize", resize);
    resize();

    const dots = [];
    for (let i = 0; i < 45; i++) {
        dots.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            vx: (Math.random() - 0.5) * 0.4,
            vy: (Math.random() - 0.5) * 0.4,
            radius: Math.random() * 1.5 + 0.5
        });
    }

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        for (let i = 0; i < dots.length; i++) {
            for (let j = i + 1; j < dots.length; j++) {
                const dx = dots[i].x - dots[j].x;
                const dy = dots[i].y - dots[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 130) {
                    ctx.beginPath();
                    ctx.moveTo(dots[i].x, dots[i].y);
                    ctx.lineTo(dots[j].x, dots[j].y);
                    ctx.strokeStyle = `rgba(217, 4, 41, ${0.12 * (1 - dist / 130)})`;
                    ctx.lineWidth = 0.8;
                    ctx.stroke();
                }
            }
        }

        dots.forEach(d => {
            d.x += d.vx;
            d.y += d.vy;
            if (d.x < 0) d.x = canvas.width;
            if (d.x > canvas.width) d.x = 0;
            if (d.y < 0) d.y = canvas.height;
            if (d.y > canvas.height) d.y = 0;

            ctx.beginPath();
            ctx.arc(d.x, d.y, d.radius, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(217, 4, 41, 0.4)";
            ctx.fill();
        });

        requestAnimationFrame(animate);
    }

    animate();
}

document.addEventListener("DOMContentLoaded", () => {
    initBackground();
    setupTabs();
    setupFilters();
    setupHints();
    setupTerminal();
    setupModal();
});
