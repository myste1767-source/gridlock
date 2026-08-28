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

// Updated Web Push VAPID Config
const publicVapidKey = "BExOQLo2x60_ZFdznTR4v4LKOA70RI9h6kh3SExVluYwT87TSyczPnC5e1pJi1r40YrlSy_zXv_6ZaqDkbxexZE";
const privateVapidKey = "6sCWF3grPVfnAgjV95G6Bqy6zyTbCwr6iiH4PYI1TZ0";

webPush.setVapidDetails("mailto:admin@gridlock.app", publicVapidKey, privateVapidKey);

const userSubscriptions = {};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

function readJSON(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) { return fallback; }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

app.post("/subscribe", (req, res) => {
  const { username, subscription } = req.body;
  if (username && subscription) userSubscriptions[username] = subscription;
  res.status(201).json({});
});

function sendNotification(targetUser, title, body) {
  const sub = userSubscriptions[targetUser];
  if (sub) {
    webPush.sendNotification(sub, JSON.stringify({ title, body })).catch(err => console.error(err));
  }
}

const onlineUsers = {};

io.on("connection", (socket) => {
  let currentUser = null;

  socket.on("user_joined", (username) => {
    if (!username) return;
    currentUser = username;
    onlineUsers[username] = socket.id;
    socket.emit("chat history", readJSON(messagesFile, []));
    io.emit("update user list", Object.keys(onlineUsers));
  });

  socket.on("typing", (data) => {
    if (data.recipient === "global") {
      socket.broadcast.emit("user typing", { username: data.username, recipient: "global" });
    } else {
      const targetSocket = onlineUsers[data.recipient];
      if (targetSocket) {
        io.to(targetSocket).emit("user typing", { username: data.username, recipient: data.recipient });
      }
    }
  });

  socket.on("stop typing", (data) => {
    if (data.recipient === "global") {
      socket.broadcast.emit("user stop typing", { username: data.username });
    } else {
      const targetSocket = onlineUsers[data.recipient];
      if (targetSocket) {
        io.to(targetSocket).emit("user stop typing", { username: data.username });
      }
    }
  });

  socket.on("chat message", (data) => {
    if (!data || !data.username || !data.message) return;

    const chatMessage = {
      id: Date.now(),
      sender: data.username,
      recipient: data.recipient || "global",
      message: String(data.message).trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const messages = readJSON(messagesFile, []);
    messages.push(chatMessage);
    writeJSON(messagesFile, messages);

    if (chatMessage.recipient === "global") {
      io.emit("chat message", chatMessage);
    } else {
      const recipientSocket = onlineUsers[chatMessage.recipient];
      if (recipientSocket) io.to(recipientSocket).emit("chat message", chatMessage);
      socket.emit("chat message", chatMessage);
      sendNotification(chatMessage.recipient, `New DM from ${chatMessage.sender}`, chatMessage.message);
    }
  });

  socket.on("delete message", (data) => {
    if (!data || !data.id || !data.username) return;
    let messages = readJSON(messagesFile, []);
    const index = messages.findIndex(msg => msg.id === data.id && msg.sender === data.username);

    if (index !== -1) {
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
  console.log("GridLock server running on port " + PORT);
});
