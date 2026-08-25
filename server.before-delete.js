const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;
// Website content
const contentFile = path.join(__dirname, "content.json");

const defaultContent = {
    title: "Grid Lock",
    welcome: "WELCOME TO THE DARK SIDE",
    giveaways: "🎁 FREE GIVEAWAYS",
    scripts: "💻 FREE SCRIPTS",
    whatsapp: "https://wa.me/18764611987",
    instagram: "https://www.instagram.com/me_jus_2_calm/",
    footer: "Grid Lock © 2026"
};

if (!fs.existsSync(contentFile)) {
    fs.writeFileSync(contentFile, JSON.stringify(defaultContent, null, 2));
}

app.get("/api/content", (req, res) => {
    try {
        const content = JSON.parse(fs.readFileSync(contentFile, "utf8"));
        res.json(content);
    } catch (error) {
        res.status(500).json(defaultContent);
    }
});

app.post("/api/content", express.json(), (req, res) => {
    try {
        fs.writeFileSync(contentFile, JSON.stringify(req.body, null, 2));
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Could not save content"
        });
    }
});

// Create uploads folder automatically
const uploadsDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// File uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const safeName = Date.now() + "-" + file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
        cb(null, safeName);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 500 * 1024 * 1024
    }
});

// Website files
app.use(express.static(__dirname));

// Uploaded files
app.use("/uploads", express.static(uploadsDir));

// Upload endpoint
app.post("/upload", upload.single("file"), (req, res) => {
    if (!req.file) {
        return res.status(400).json({
            success: false,
            message: "No file uploaded"
        });
    }

    const game = req.body.game;

    const allowedGames = [
        "freefire",
        "pubg",
        "codm",
        "fortnite",
        "roblox"
    ];

    if (!allowedGames.includes(game)) {
        return res.status(400).json({
            success: false,
            message: "Invalid game"
        });
    }

    try {
        const games = loadGamePages();

        if (!games[game]) {
            return res.status(404).json({
                success: false,
                message: "Game not found"
            });
        }

        if (!Array.isArray(games[game].files)) {
            games[game].files = [];
        }

        games[game].files.push({
            name: req.file.originalname,
            url: "/uploads/" + encodeURIComponent(req.file.filename)
        });

        fs.writeFileSync(
            gamePagesFile,
            JSON.stringify(games, null, 2)
        );

        res.json({
            success: true,
            filename: req.file.filename,
            originalName: req.file.originalname,
            url: "/uploads/" + encodeURIComponent(req.file.filename)
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Could not save game file"
        });
    }
});

// File list for downloads page
app.get("/api/files", (req, res) => {
    fs.readdir(uploadsDir, (err, files) => {
        if (err) {
            return res.status(500).json([]);
        }

        const fileList = files.map(filename => ({
            name: filename.replace(/^\d+-/, ""),
            url: "/uploads/" + encodeURIComponent(filename)
        }));

        res.json(fileList);
    });
});
// ===============================
// ACCOUNTS + PERSISTENT CHAT
// ===============================

const bcrypt = require("bcryptjs");

const usersFile = path.join(__dirname, "users.json");
const messagesFile = path.join(__dirname, "messages.json");
const suggestionsFile = path.join(__dirname, "suggestions.json");

function readJSON(file, fallback) {
    try {
        if (!fs.existsSync(file)) {
            fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
            return fallback;
        }

        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (error) {
        console.error("JSON read error:", error);
        return fallback;
    }
}

function writeJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

if (!fs.existsSync(usersFile)) writeJSON(usersFile, []);
if (!fs.existsSync(messagesFile)) writeJSON(messagesFile, []);
if (!fs.existsSync(suggestionsFile)) writeJSON(suggestionsFile);


// REGISTER
app.post("/api/register", express.json(), async (req, res) => {
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "");

    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
        return res.status(400).json({
            success: false,
            message: "Username must be 3-20 characters and use only letters, numbers or _."
        });
    }

    if (password.length < 6) {
        return res.status(400).json({
            success: false,
            message: "Password must be at least 6 characters."
        });
    }

    const users = readJSON(usersFile, []);

    if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
        return res.status(409).json({
            success: false,
            message: "Username already exists."
        });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    users.push({
        username,
        passwordHash,
        createdAt: new Date().toISOString()
    });

    writeJSON(usersFile, users);

    res.json({ success: true, username });
});


// LOGIN
app.post("/api/login", express.json(), async (req, res) => {
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "");

    const users = readJSON(usersFile, []);

    const user = users.find(
        u => u.username.toLowerCase() === username.toLowerCase()
    );

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
        return res.status(401).json({
            success: false,
            message: "Invalid username or password."
        });
    }

    res.json({
        success: true,
        username: user.username
    });
});


// CHAT HISTORY
app.get("/api/messages", (req, res) => {
    res.json(readJSON(messagesFile, []));
});


// SUGGESTIONS
app.get("/api/suggestions", (req, res) => {
    res.json(readJSON(suggestionsFile, []));
});

app.post("/api/suggestions", express.json(), (req, res) => {
    const username = String(req.body.username || "").trim();
    const message = String(req.body.message || "").trim();

    if (!username || !message) {
        return res.status(400).json({
            success: false,
            message: "Username and suggestion are required."
        });
    }

    const suggestions = readJSON(suggestionsFile, []);

    const suggestion = {
        id: Date.now(),
        username,
        message: message.substring(0, 1000),
        timestamp: new Date().toISOString()
    };

    suggestions.push(suggestion);
    writeJSON(suggestionsFile, suggestions);

    res.json({ success: true, suggestion });
});


// SOCKET.IO CHAT
io.on("connection", (socket) => {
    console.log("User connected");

    socket.emit("chat history", readJSON(messagesFile, []));

    socket.on("chat message", (data) => {
        if (!data || !data.username || !data.message) return;

        const username = String(data.username).trim().substring(0, 20);
        const message = String(data.message).trim().substring(0, 500);

        if (!username || !message) return;

        const chatMessage = {
            id: Date.now(),
            username,
            message,
            timestamp: new Date().toISOString()
        };

        const messages = readJSON(messagesFile, []);

        messages.push(chatMessage);
        writeJSON(messagesFile, messages);

        io.emit("chat message", chatMessage);
    });

    socket.on("disconnect", () => {
        console.log("User disconnected");
    });
});
// Game pages API
const gamePagesFile = path.join(__dirname, "game-pages.json");

function loadGamePages() {
    try {
        return JSON.parse(
            fs.readFileSync(gamePagesFile, "utf8")
        );
    } catch (error) {
        return {};
    }
}

app.get("/api/games", (req, res) => {
    res.json(loadGamePages());
});

app.get("/api/games/:game", (req, res) => {
    const games = loadGamePages();
    const game = games[req.params.game];

    if (!game) {
        return res.status(404).json({
            success: false,
            message: "Game not found"
        });
    }

    res.json(game);
});

// =========================
// ADMIN GAME MANAGER
// =========================

app.post("/api/admin/games", express.json(), (req, res) => {
    const { id, title, message } = req.body;

    const gameId = String(id || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-_]/g, "");

    const gameTitle = String(title || "").trim();
    const gameMessage = String(message || "").trim();

    if (!gameId || !gameTitle) {
        return res.status(400).json({
            success: false,
            message: "Game ID and title are required."
        });
    }

    const games = loadGamePages();

    if (games[gameId]) {
        return res.status(409).json({
            success: false,
            message: "That game already exists."
        });
    }

    games[gameId] = {
        title: gameTitle,
        message: gameMessage || "Welcome to this game section.",
        files: []
    };

    fs.writeFileSync(
        gamePagesFile,
        JSON.stringify(games, null, 2)
    );

    res.json({
        success: true,
        game: games[gameId]
    });
});


app.delete("/api/admin/games/:game", (req, res) => {

    const gameId = String(req.params.game || "")
        .trim()
        .toLowerCase();

    const games = loadGamePages();

    if (!games[gameId]) {
        return res.status(404).json({
            success: false,
            message: "Game not found."
        });
    }

    delete games[gameId];

    fs.writeFileSync(
        gamePagesFile,
        JSON.stringify(games, null, 2)
    );

    res.json({
        success: true,
        message: "Game deleted."
    });
});
server.listen(PORT, "0.0.0.0", () => {
    console.log("Grid Lock server running on port " + PORT);
});

