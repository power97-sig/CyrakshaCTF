# 🚩 CYRAKSHA CTF ARENA — Hackathon Contest Hub

An interactive, multi-category Capture The Flag (CTF) arena designed for hackathons, cybersecurity competitions, and club contests.

---

## 🏆 Challenge Lineup

| ID | Challenge Name | Category | Points | Description |
|---|---|---|---|---|
| **CTF 0** | **The Liar Button** | Web / DOM Inspection | 200 PTS | Deceptive client-side prompts and hidden element inspection. |
| **CTF 1** | **Cyraksha CTF Hub** | Web & Forensics | 200 PTS | Hidden DOM attributes and event zip archive analysis. |
| **CTF 2** | **CYRAKSHA Sign In** | Web / Reconnaissance | 200 PTS | Hidden input leak & admin authentication. |
| **CTF 3** | **Gateway Auth Level 1** | Web / Metadata Clues | 200 PTS | Developer hints and metadata-based gateway bypass. |
| **CTF 4** | **The Hidden Message** | Steganography / Terminal | 200 PTS | Interactive in-browser terminal and steghide extraction. |
| **CTF 5** | **Cyraksha Notes (Boss Box)** | Web / Broken Access Control | 500 PTS | Cookie tampering & privilege escalation to access root notes. |

---

## 🌐 Deploy to Render (100% Free Tier)

Deploying to Render takes less than 2 minutes:

### Method 1: Render Web Service (Fastest)
1. Go to your [Render Dashboard](https://dashboard.render.com/).
2. Click **New +** > **Web Service**.
3. Select **Build and deploy from a Git repository** and choose `bidhansaha510-debug/cyraksha-ctf-arena`.
4. Configure settings:
   - **Name:** `cyraksha-ctf-arena`
   - **Language / Runtime:** `Docker`
   - **Instance Type:** `Free`
5. Click **Create Web Service**.
6. Render will automatically build the container and provide your live HTTPS URL (e.g. `https://cyraksha-ctf-arena.onrender.com`).

### Method 2: Render Blueprint (1-Click)
1. Go to [Render Dashboard](https://dashboard.render.com/) > **New +** > **Blueprint**.
2. Select repository `bidhansaha510-debug/cyraksha-ctf-arena`.
3. Render will detect `render.yaml` and set up everything automatically.

---

## 🚀 Local Run

### Option A: Docker Compose
```bash
docker compose up --build -d
```
Visit the Arena at: **`http://localhost`**

### Option B: Standalone Web Server
```bash
npx serve .
# or
python -m http.server 8080
```

---

## 🔒 Scoring & State Management
* **Client-Side Persistence:** Team progress, unlocks, scores, and timestamps are tracked via `localStorage`.
* **Exportable Scorecard:** Participants can view and download their verified scorecard upon completing challenges.

---

## 📜 License
MIT License. Built for hackathon organizers and security enthusiasts.
