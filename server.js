const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");
const webPush = require("web-push");

let bcrypt;
try { bcrypt = require("bcryptjs"); } catch (e) { bcrypt = null; }

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const messagesFile = path.join(__dirname, "messages.json");
const usersFile = path.join(__dirname, "users.json");

// --- Web Push VAPID Configuration ---
const publicVapidKey = "BKE2SThNaneudVF39fusqbKwusS2zxRvjI5_tz2_-P85xA2Bb99aJN2ZjrWaVB44PtCjrvisXoa3XpujC/Hj4Pgw";
const privateVapidKey = "zmE20IZFCSikLAuycdEh3n1fmMdCc6b0NB_Cxp-eXA";

webPush.setVapidDetails(
  "mailto:admin@gridlock.app",
  publicVapidKey,
  privateVapidKey
);

const userSubscriptions = {}; // { username: subscription }

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

// Push Subscription Endpoint
app.post("/subscribe", (req, res) => {
  const { username, subscription } = req.body;
  if (username && subscription) {
    userSubscriptions[username] = subscription;
  }
  res.status(201).json({});
});

function sendNotification(targetUser, title, body) {
  const sub = userSubscriptions[targetUser];
  if (sub) {
    const payload = JSON.stringify({ title, body });
    webPush.sendNotification(sub, payload).catch(err => console.error(err));
  }
}

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

  socket.on("user_joined", (username) => {
    if (!username) return;
    currentUser = username;
    onlineUsers[username] = socket.id;

    socket.emit("chat history", readJSON(messagesFile, []));
    io.emit("update user list", Object.keys(onlineUsers));
  });

  socket.on("chat message", (data) => {
    if (!data || !data.username || !data.message) return;

    const chatMessage = {
      id: Date.now(),
      sender: data.username,
      recipient: data.recipient || "global",
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
      const recipientSocket = onlineUsers[chatMessage.recipient];
      if (recipientSocket) {
        io.to(recipientSocket).emit("chat message", chatMessage);
      }
      socket.emit("chat message", chatMessage);

      // Send background notification for direct message
      sendNotification(chatMessage.recipient, `New DM from ${chatMessage.sender}`, chatMessage.message);
    }
  });

  socket.on("call-user", (data) => {
    io.to(data.userToCall).emit("incoming-call", {
      signal: data.signalData,
      from: socket.id,
    });
    // Send push notification for incoming call
    sendNotification(data.userToCall, "Incoming Call 📞", `${data.from} is calling you on Grid Lock`);
  });

  socket.on("answer-call", (data) => {
    io.to(data.to).emit("call-accepted", data.signal);
  });

  socket.on("ice-candidate", (data) => {
    io.to(data.to).emit("ice-candidate", data.candidate);
  });

  socket.on("disconnect", () => {
    if (currentUser && onlineUsers[currentUser]) {
      delete onlineUsers[currentUser];
      io.emit("update user list", Object.keys(onlineUsers));
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("GridLock server running on port " + PORT);
});

