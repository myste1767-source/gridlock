const PUBLIC_VAPID_KEY = "BCw27p1mjShGoXPtxuSdq6xySb_Q9VStzHN2YRgVU19xDK2CV7oUYXMSMdmWGR1AXeJ6o-GKZQhSR1m6qlGiXrs";

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
let localStream = null;
let peerConnection = null;

const rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

const messagesDiv = document.getElementById("messages");
const messageInput = document.getElementById("messageInput");
const callControls = document.getElementById("call-controls");
const chatTitle = document.getElementById("chatTitle");
const videoContainer = document.getElementById("video-container");

socket.emit("user_joined", username);

// Discord-Style User Search
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
  messagesDiv.innerHTML = "";
}

function selectGlobalChat() {
  activeRecipient = "global";
  chatTitle.innerText = "🌐 Global Chat";
  callControls.style.display = "none";
  messagesDiv.innerHTML = "";
}

// Send Message
function sendMessage() {
  const msg = messageInput.value.trim();
  if (!msg) return;

  socket.emit("chat message", {
    username: username,
    message: msg,
    recipient: activeRecipient
  });

  messageInput.value = "";
}

messageInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage();
});

// WhatsApp Style Message Rendering + Delete Button
socket.on("chat message", (data) => {
  if (data.recipient === "global" && activeRecipient !== "global") return;
  if (data.recipient !== "global" && data.sender !== activeRecipient && data.sender !== username) return;

  const isSentByMe = data.sender === username;
  const msgDiv = document.createElement("div");
  msgDiv.id = `msg-${data.id}`;
  msgDiv.className = `message-bubble ${isSentByMe ? "msg-sent" : "msg-received"}`;

  let deleteBtnHtml = isSentByMe ? `<button class="delete-btn" onclick="deleteMessage(${data.id})">🗑️</button>` : "";

  msgDiv.innerHTML = `
    ${!isSentByMe ? `<span class="sender-name">${data.sender}</span>` : ""}
    <span>${data.message}</span>
    ${deleteBtnHtml}
  `;

  messagesDiv.appendChild(msgDiv);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
});

// Delete Message Logic
function deleteMessage(msgId) {
  socket.emit("delete message", { id: msgId, username: username });
}

socket.on("message deleted", (data) => {
  const target = document.getElementById(`msg-${data.id}`);
  if (target) target.remove();
});

// WebRTC Calling & Screen Share
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

