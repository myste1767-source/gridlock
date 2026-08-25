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
// Chat
io.on("connection", (socket) => {
    console.log("User connected");

    socket.on("chat message", (data) => {
        if (!data || !data.username || !data.message) {
            return;
        }

        io.emit("chat message", {
            username: String(data.username).substring(0, 20),
            message: String(data.message).substring(0, 500)
        });
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
server.listen(PORT, "0.0.0.0", () => {
    console.log("Grid Lock server running on port " + PORT);
});

