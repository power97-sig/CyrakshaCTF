const express = require("express");
const path = require("path");
require("dotenv").config();

let serverFlags = null;
try {
    serverFlags = require("../lib/server-flags");
} catch (e) {}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use('/js', express.static(path.join(__dirname, "..", "js")));

app.get("/backup", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "backup.html"));
});

app.get("/api/status", (req, res) => {
    res.json({
        status: "online",
        message: "Vault authentication service running"
    });
});

app.post("/api/verify", (req, res) => {
    const { key, teamName } = req.body || {};

    if (key === "shadow-4729") {
        let flag = process.env.FLAG;
        if (serverFlags && teamName) {
            flag = serverFlags.getDynamicFlag(teamName, 'ctf7');
        } else if (!flag) {
            flag = "CTF{y0u_f0und_th3_v4ult}";
        }
        return res.json({
            success: true,
            flag
        });
    }

    res.status(403).json({
        success: false,
        message: "Invalid access key"
    });
});

app.listen(PORT, () => {
    console.log(`CTF box running on http://localhost:${PORT}`);
});
