
const socket = io();

const messagesContainer = document.getElementById("messages");
const messageInput = document.getElementById("messageInput");
const sendButton = document.getElementById("sendBtn");
const usersListContainer = document.getElementById("usersList");
const userDrawer = document.getElementById("userDrawer");
const chatTitle = document.getElementById("chatTitle");

let currentUsername = localStorage.getItem("username") || localStorage.getItem("user");
if (!currentUsername) {
    currentUsername = prompt("Enter your chat username:") || "Anonymous";
    localStorage.setItem("username", currentUsername);
}

let activeRecipient = "global"; // "global" or username of DM partner
let onlineUsers = [];
let allMessages = [];

// Register online presence
socket.emit("user joined", currentUsername);

function toggleUserList() {
    if (userDrawer.style.left === "0px") {
        userDrawer.style.left = "-200px";
    } else {
        userDrawer.style.left = "0px";
    }
}

function switchChat(target) {
    activeRecipient = target;
    userDrawer.style.left = "-200px";

    if (target === "global") {
        chatTitle.innerHTML = `● LIVE GLOBAL CHAT`;
    } else {
        const isOnline = onlineUsers.includes(target);
        chatTitle.innerHTML = `💬 DM: ${target} <span style="font-size: 0.75em; color: ${isOnline ? '#00ff00' : '#888'};">(${isOnline ? 'Online' : 'Offline'})</span>`;
        
        // Notify server that messages from this user have been opened/seen
        socket.emit("mark seen", { sender: target, recipient: currentUsername });
    }
    renderAllFilteredMessages();
}

function formatTime(isoString) {
    if (!isoString) return "";
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function renderMessage(data) {
    if (!messagesContainer || !data || !data.id) return;
    if (document.getElementById(`msg-${data.id}`)) return;

    const isMine = data.sender === currentUsername;

    const msgDiv = document.createElement("div");
    msgDiv.id = `msg-${data.id}`;
    msgDiv.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: ${isMine ? 'flex-end' : 'flex-start'};
        margin: 8px 0;
        width: 100%;
    `;

    const timeStr = formatTime(data.timestamp);
    const seenText = (isMine && data.recipient !== "global") ? (data.seen ? `<span style="color: #34b7f1; font-weight: bold; margin-left: 4px;">✓✓ Seen</span>` : `<span style="color: #8696a0; margin-left: 4px;">✓ Sent</span>`) : "";

    const bubble = document.createElement("div");
    bubble.style.cssText = `
        background-color: ${isMine ? '#1f2c34' : '#202c33'};
        border: 1px solid ${isMine ? '#00a884' : '#444'};
        color: #ffffff;
        padding: 8px 12px;
        border-radius: 10px;
        max-width: 75%;
        min-width: 120px;
        word-break: break-word;
        box-shadow: 0 1px 2px rgba(0,0,0,0.3);
        cursor: ${isMine ? 'pointer' : 'default'};
    `;

    bubble.innerHTML = `
        <div style="font-size: 0.75em; color: ${isMine ? '#00a884' : '#8696a0'}; font-weight: bold; margin-bottom: 2px;">
            ${data.sender} ${data.recipient !== "global" ? '<span style="color: #ff9900;">(DM)</span>' : ''}
        </div>
        <div style="font-size: 0.95em; color: #e9edef; line-height: 1.3;">
            ${data.message}
        </div>
        <div style="font-size: 0.65em; color: #8696a0; text-align: right; margin-top: 4px;">
            ${timeStr} ${seenText}
        </div>
    `;

    if (isMine) {
        bubble.addEventListener("click", () => {
            if (confirm("Delete this message?")) {
                socket.emit("delete message", { id: data.id, username: currentUsername });
            }
        });
    }

    msgDiv.appendChild(bubble);
    messagesContainer.appendChild(msgDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function renderAllFilteredMessages() {
    messagesContainer.innerHTML = "";
    const filtered = allMessages.filter(msg => {
        if (activeRecipient === "global") {
            return msg.recipient === "global";
        } else {
            return (msg.sender === currentUsername && msg.recipient === activeRecipient) ||
                   (msg.sender === activeRecipient && msg.recipient === currentUsername);
        }
    });
    filtered.forEach(renderMessage);
}

// Socket updates
socket.on("chat history", (history) => {
    allMessages = Array.isArray(history) ? history : [];
    renderAllFilteredMessages();
});

socket.on("update user list", (users) => {
    onlineUsers = users;
    usersListContainer.innerHTML = "";

    users.forEach(user => {
        if (user === currentUsername) return; // Skip self

        const userRow = document.createElement("div");
        userRow.style.cssText = "padding: 10px; border-bottom: 1px solid #222; cursor: pointer; display: flex; align-items: center; justify-content: space-between;";
        userRow.innerHTML = `
            <span style="color: #eee; font-size: 0.9em;">${user}</span>
            <span style="font-size: 0.7em; color: #00ff00;">● Online</span>
        `;
        userRow.onclick = () => switchChat(user);
        usersListContainer.appendChild(userRow);
    });
});

socket.on("chat message", (data) => {
    allMessages.push(data);
    
    // If we are currently inside the active recipient window, render it directly
    if (
        (activeRecipient === "global" && data.recipient === "global") ||
        (activeRecipient !== "global" && (data.sender === activeRecipient || data.sender === currentUsername))
    ) {
        renderMessage(data);
        if (data.sender === activeRecipient && data.recipient === currentUsername) {
            socket.emit("mark seen", { sender: activeRecipient, recipient: currentUsername });
        }
    }
});

socket.on("messages marked seen", (data) => {
    allMessages.forEach(msg => {
        if (msg.sender === data.sender && msg.recipient === data.recipient) {
            msg.seen = true;
        }
    });
    renderAllFilteredMessages();
});

socket.on("message deleted", (data) => {
    allMessages = allMessages.filter(m => m.id !== data.id);
    const targetMsg = document.getElementById(`msg-${data.id}`);
    if (targetMsg) targetMsg.remove();
});

function sendMessage() {
    if (!messageInput) return;
    const text = messageInput.value.trim();
    if (!text) return;

    socket.emit("chat message", {
        username: currentUsername,
        recipient: activeRecipient,
        message: text
    });

    messageInput.value = "";
}

sendButton.addEventListener("click", (e) => {
    e.preventDefault();
    sendMessage();
});

messageInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
        e.preventDefault();
        sendMessage();
    }
});
const peerConfig = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

let localStream;
let peerConnection;

// 1. Initialize Microphone & Video Call
async function startCall(targetSocketId) {
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
  peerConnection = new RTCPeerConnection(peerConfig);

  // Add local tracks to WebRTC connection
  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

  // Handle network candidates
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("ice-candidate", { to: targetSocketId, candidate: event.candidate });
    }
  };

  // Create and send offer
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  socket.emit("call-user", { userToCall: targetSocketId, signalData: offer });
}

// 2. Screen Sharing Feature
async function shareScreen() {
  try {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const screenTrack = screenStream.getVideoTracks()[0];

    // Swap camera video track with screen track
    const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
    if (sender) {
      sender.replaceTrack(screenTrack);
    }

    // Revert back when screen share ends
    screenTrack.onended = () => {
      const videoTrack = localStream.getVideoTracks()[0];
      sender.replaceTrack(videoTrack);
    };
  } catch (err) {
    console.error("Screen share error:", err);
  }
}

