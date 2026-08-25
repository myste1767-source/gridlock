from pathlib import Path

p = Path("server.js")
s = p.read_text()

old = '''// Chat
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
'''

new = r'''// ===============================
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
'''

if old not in s:
    print("ERROR: Old chat block was not found. Nothing changed.")
    raise SystemExit(1)

p.write_text(s.replace(old, new, 1))
print("Server updated successfully.")
