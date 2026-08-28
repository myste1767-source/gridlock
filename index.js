// Handle initiating a call offer
socket.on("call-user", (data) => {
  io.to(data.userToCall).emit("incoming-call", {
    signal: data.signalData,
    from: socket.id,
  });
});

// Handle accepting a call
socket.on("answer-call", (data) => {
  io.to(data.to).emit("call-accepted", data.signal);
});

// Exchange ICE candidates for WebRTC peer connection
socket.on("ice-candidate", (data) => {
  io.to(data.to).emit("ice-candidate", data.candidate);
});

