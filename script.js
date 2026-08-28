const socket = io("https://gridlock-1.onrender.com");

const username = localStorage.getItem("username") || "Guest_" + Math.floor(Math.random() * 1000);
let activeRecipient = "global";
let localStream = null;
let peerConnection = null;

const rtcConfig = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

// DOM Elements
const messagesDiv = document.getElementById("messages");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const userListContainer = document.getElementById("usersList");
const callControls = document.getElementById("call-controls");
const chatTitle = document.getElementById("chatTitle");

// Hide call buttons until a direct user is selected
if (callControls) callControls.style.display = "none";

socket.emit("user_joined", username);

// Render Online Users List
socket.on("update user list", (users) => {
  if (!userListContainer) return;
  userListContainer.innerHTML = "";

  users.forEach((user) => {
    if (user === username) return; // Skip self

    const userItem = document.createElement("div");
    userItem.style.cssText = "padding: 10px; cursor: pointer; border-bottom: 1px solid #222; color: #fff;";
    userItem.innerText = "👤 " + user;

    userItem.onclick = () => selectUserChat(user);
    userListContainer.appendChild(userItem);
  });
});

// Select a User to DM & Call
function selectUserChat(targetUser) {
  activeRecipient = targetUser;
  if (chatTitle) chatTitle.innerText = "💬 " + targetUser;
  if (callControls) callControls.style.display = "flex"; // Show Call/Screen Share buttons for DM
  messagesDiv.innerHTML = ""; // Clear view for DM chat history
}

// Global Chat Switcher
function selectGlobalChat() {
  activeRecipient = "global";
  if (chatTitle) chatTitle.innerText = "LIVE GLOBAL CHAT";
  if (callControls) callControls.style.display = "none"; // Hide Call buttons in Global
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

sendBtn.onclick = sendMessage;
messageInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage();
});

// Display Incoming Messages
socket.on("chat message", (data) => {
  if (data.recipient === "global" && activeRecipient !== "global") return;
  if (data.recipient !== "global" && data.sender !== activeRecipient && data.sender !== username) return;

  const msgDiv = document.createElement("div");
  msgDiv.style.cssText = "margin-bottom: 8px; padding: 8px 12px; border-radius: 8px; background: #222; max-width: 80%;";
  msgDiv.innerHTML = `<strong style="color: red;">${data.sender}:</strong> ${data.message}`;
  messagesDiv.appendChild(msgDiv);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
});

// --- WebRTC Calling Logic ---
async function startCall(targetUser) {
  if (targetUser === "global") return alert("Select a specific user to call.");

  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  document.getElementById("localVideo").srcObject = localStream;

  peerConnection = new RTCPeerConnection(rtcConfig);
  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

  peerConnection.ontrack = (event) => {
    document.getElementById("remoteVideo").srcObject = event.streams[0];
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("ice-candidate", { to: targetUser, candidate: event.candidate });
    }
  };

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  socket.emit("call-user", { userToCall: targetUser, signalData: offer });
}

async function shareScreen() {
  if (activeRecipient === "global") return alert("Select a user to share screen with.");
  localStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
  document.getElementById("localVideo").srcObject = localStream;
}

