const handleMessage = async (ws, message) => {
  try {
    // Parse message dari client
    const data = JSON.parse(message);

    // Validasi basic (biar gak error aneh)
    if (!data || !data.type) {
      console.warn("Invalid message format:", data);
      return;
    }

    // Routing berdasarkan type
    switch (data.type) {
      case "INFERENCE_REQUEST": {
        // Ambil observations dari client
        const obs = data.observations;

        // Validasi observations
        if (!Array.isArray(obs) || obs.length !== 7) {
          console.warn("Invalid observations:", obs);
          return;
        }

        // Debug log (opsional)
        console.log("📥 State from client:", obs);

        // TODO: Kirim ke model AI (PPO)
        // const action = await model.predict(obs);

        // Sementara kita dummy dulu
        const action = 0; // misalnya pilih bitrate index 0

        // TODO: kirim balik ke client
        ws.send(JSON.stringify({ type: "INFERENCE_RESULT", action }));

        console.log("📤 Action to client:", action);

        break;
      }

      default:
        console.warn("Unknown message type:", data.type);
    }
  } catch (error) {
    console.error("Failed to handle message:", error);
  }
};
export { handleMessage };
