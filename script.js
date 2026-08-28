const PUBLIC_VAPID_KEY = "BExOQLo2x60_ZFdznTR4v4LKOA70RI9h6kh3SExVluYwT87TSyczPnC5e1pJi1r40YrlSy_zXv_6ZaqDkbxexZE";

if ("serviceWorker" in navigator && "PushManager" in window) {
  navigator.serviceWorker.register("/sw.js").then(async (reg) => {
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: PUBLIC_VAPID_KEY
      });

      const username = localStorage.getItem("username") || "Guest";
      fetch("/subscribe", {
        method: "POST",
        body: JSON.stringify({ username: username, subscription: sub }),
        headers: { "Content-Type": "application/json" }
      });
    }
  });
}

const socket = io("https://gridlock-1.onrender.com");

const username = localStorage.getItem("username") || "User_" + Math.floor(Math.random() * 1000);
let activeRecipient = "global";
let allMessages = [];
let localStream = null;
let peerConnection = null;

const rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

const messagesDiv = document.getElementById("messages");
const messageInput = document.getElementById("messageInput");
const callControls = document.getElementById("call-controls");
const chatTitle = document.getElementById("chatTitle");
const videoContainer = document.getElementById("video-container");
const typingIndicator = document.getElementById("typingIndicator");

let typingTimeout;

socket.emit("user_joined", username);

messageInput.addEventListener("input", () => {
  socket.emit("typing", { username: username, recipient: activeRecipient });

  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket.emit("stop typing", { username: username, recipient: activeRecipient });
  }, 1500);
});

socket.on("user typing", (data) => {
  if (data.username !== username) {
    typingIndicator.innerText = `${data.username} is typing...`;
  }
});

socket.on("user stop typing", () => {
  typingIndicator.innerText = "";
});

function searchUser() {
  const query = document.getElementById("user-search").value.trim();
  if (!query) return;
  if (query.toLowerCase() === username.toLowerCase()) return alert("Can't message yourself!");
  
  selectUserChat(query);
  document.getElementById("user-search").value = "";
}

function selectUserChat(targetUser) {
  activeRecipient = targetUser;
  chatTitle.innerText = "💬 " + targetUser;
  callControls.style.display = "flex";
  renderMessages();
}

function selectGlobalChat() {
  activeRecipient = "global";
  chatTitle.innerText = "🌐 Global Chat";
  callControls.style.display = "none";
  renderMessages();
}

function sendMessage() {
  const msg = messageInput.value.trim();
  if (!msg) return;

  socket.emit("chat message", {
    username: username,
    message: msg,
    recipient: activeRecipient
  });

  socket.emit("stop typing", { username: username, recipient: activeRecipient });
  messageInput.value = "";
}

function deleteMessage(id) {
  socket.emit("delete message", { id, username });
}

messageInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage();
});

socket.on("chat history", (history) => {
  allMessages = history;
  renderMessages();
});

socket.on("chat message", (data) => {
  allMessages.push(data);
  renderMessages();
});

socket.on("message deleted", (data) => {
  allMessages = allMessages.filter(msg => msg.id !== data.id);
  renderMessages();
});

function renderMessages() {
  messagesDiv.innerHTML = "";
  
  const filteredMessages = allMessages.filter(msg => {
    if (activeRecipient === "global") return msg.recipient === "global";
    return (msg.sender === username && msg.recipient === activeRecipient) ||
           (msg.sender === activeRecipient && msg.recipient === username);
  });

  filteredMessages.forEach(msg => {
    const isSentByMe = msg.sender === username;
    const msgDiv = document.createElement("div");
    msgDiv.className = `message-bubble ${isSentByMe ? "msg-sent" : "msg-received"}`;
    msgDiv.setAttribute("data-id", msg.id);

    msgDiv.innerHTML = `
      ${!isSentByMe ? `<span class="sender-name">${msg.sender}</span>` : ""}
      <span>${msg.message}</span>
      <div class="msg-meta">
        <span>${msg.timestamp || ""}</span>
        ${isSentByMe ? `<span class="delete-btn" onclick="deleteMessage(${msg.id})">🗑️</span>` : ""}
      </div>
    `;

    messagesDiv.appendChild(msgDiv);
  });

  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

async function startCall(targetUser) {
  if (targetUser === "global") return alert("Select a user to call.");

  videoContainer.style.display = "flex";
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  document.getElementById("localVideo").srcObject = localStream;

  peerConnection = new RTCPeerConnection(rtcConfig);
  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

  peerConnection.ontrack = (e) => document.getElementById("remoteVideo").srcObject = e.streams[0];
  peerConnection.onicecandidate = (e) => {
    if (e.candidate) socket.emit("ice-candidate", { to: targetUser, candidate: e.candidate });
  };

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  socket.emit("call-user", { userToCall: targetUser, signalData: offer });
}

async function shareScreen() {
  if (activeRecipient === "global") return alert("Select a user to share screen with.");
  videoContainer.style.display = "flex";
  localStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
  document.getElementById("localVideo").srcObject = localStream;
}
