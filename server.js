const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");
let bcrypt;
try { bcrypt = require("bcryptjs"); } catch (e) { bcrypt = null; }

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;
const messagesFile = path.join(__dirname, "messages.json");
const usersFile = path.join(__dirname, "users.json");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

function readJSON(file, fallback) {
    try {
        if (!fs.existsSync(file)) return fallback;
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (error) {
        return fallback;
    }
}

function writeJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// Track online users: { username: socketId }
const onlineUsers = {};

app.post("/register", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.json({ success: false, message: "Missing fields" });

    const users = readJSON(usersFile, []);
    const existing = users.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (existing) return res.json({ success: false, message: "Username taken" });

    const passHash = bcrypt ? await bcrypt.hash(password, 10) : password;
    users.push({ username, password: passHash });
    writeJSON(usersFile, users);

    res.json({ success: true, username });
});

app.post("/login", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.json({ success: false, message: "Missing fields" });

    const users = readJSON(usersFile, []);
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (!user) return res.json({ success: false, message: "User not found" });

    let match = bcrypt ? await bcrypt.compare(password, user.password) : (user.password === password);
    if (!match) return res.json({ success: false, message: "Invalid password" });

    res.json({ success: true, username: user.username });
});

io.on("connection", (socket) => {
    let currentUser = null;

    // User joins with username
    socket.on("user joined", (username) => {
        if (!username) return;
        currentUser = username;
        onlineUsers[username] = socket.id;

        // Send chat history and current online list to user
        socket.emit("chat history", readJSON(messagesFile, []));
        io.emit("update user list", Object.keys(onlineUsers));
    });

    // Handle Public and Direct Messages
    socket.on("chat message", (data) => {
        if (!data || !data.username || !data.message) return;

        const chatMessage = {
            id: Date.now(),
            sender: data.username,
            recipient: data.recipient || "global", // "global" for main chat, or specific username
            message: String(data.message).trim(),
            timestamp: new Date().toISOString(),
            seen: false
        };

        const messages = readJSON(messagesFile, []);
        messages.push(chatMessage);
        writeJSON(messagesFile, messages);

        if (chatMessage.recipient === "global") {
            io.emit("chat message", chatMessage);
        } else {
            // Send DM to recipient and sender
            const recipientSocket = onlineUsers[chatMessage.recipient];
            if (recipientSocket) {
                io.to(recipientSocket).emit("chat message", chatMessage);
            }
            socket.emit("chat message", chatMessage);
        }
    });

    // Mark messages as seen when chat room is opened
    socket.on("mark seen", (data) => {
        if (!data || !data.sender || !data.recipient) return;
        const messages = readJSON(messagesFile, []);
        let updated = false;

        messages.forEach(msg => {
            if (msg.sender === data.sender && msg.recipient === data.recipient && !msg.seen) {
                msg.seen = true;
                updated = true;
            }
        });

        if (updated) {
            writeJSON(messagesFile, messages);
            const senderSocket = onlineUsers[data.sender];
            if (senderSocket) {
                io.to(senderSocket).emit("messages marked seen", {
                    sender: data.sender,
                    recipient: data.recipient
                });
            }
        }
    });

    // Delete single message
    socket.on("delete message", (data) => {
        if (!data || !data.id || !data.username) return;
        const messages = readJSON(messagesFile, []);
        const index = messages.findIndex(msg => msg.id === data.id && msg.sender === data.username);
        if (index === -1) return;
        
        const deletedMsg = messages[index];
        messages.splice(index, 1);
        writeJSON(messagesFile, messages);

        if (deletedMsg.recipient === "global") {
            io.emit("message deleted", { id: data.id });
        } else {
            const recipientSocket = onlineUsers[deletedMsg.recipient];
            if (recipientSocket) io.to(recipientSocket).emit("message deleted", { id: data.id });
            socket.emit("message deleted", { id: data.id });
        }
    });

    socket.on("disconnect", () => {
        if (currentUser && onlineUsers[currentUser]) {
            delete onlineUsers[currentUser];
            io.emit("update user list", Object.keys(onlineUsers));
        }
    });
});

server.listen(PORT, "0.0.0.0", () => {
    console.log("Grid Lock server running on port " + PORT);
});

// --- PRIVATE MESSAGING & USER SEARCH ---
const onlineUsers = new Map();

if (typeof io !== 'undefined') {
  io.on('connection', (socket) => {
    socket.on('user_connected', (userId) => {
      onlineUsers.set(userId, socket.id);
    });

    socket.on('send_private_message', ({ recipientId, message, senderId }) => {
      const recipientSocketId = onlineUsers.get(recipientId);
      if (recipientSocketId) {
        io.to(recipientSocketId).emit('receive_private_message', { senderId, message });
      }
    });

    socket.on('disconnect', () => {
      for (let [userId, socketId] of onlineUsers.entries()) {
        if (socketId === socket.id) {
          onlineUsers.delete(userId);
          break;
        }
      }
    });
  });
}
