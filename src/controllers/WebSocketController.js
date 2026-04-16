import axios from "axios";
import { publishMemo } from "./ndnRepoManager.js";
function getQuantizedNameOnServer(rawState) {
  // 1. KATEGORI BUFFER (Detik)
  let b =
    rawState.buffer < 5 ? "panic" : rawState.buffer < 10 ? "safe" : "full";

  // 2. KATEGORI SPEED (Mbps)
  let w =
    rawState.throughput < 2 ? "slow" : rawState.throughput < 6 ? "mid" : "fast";

  // 3. KATEGORI CWND (Paket)
  let c =
    rawState.cwnd < 15 ? "congested" : rawState.cwnd < 45 ? "stable" : "wide";

  // 4. KATEGORI SEGMEN (Group per 10)
  const s = Math.floor(rawState.segment / 10);

  return `/ndn/memo/s${s}/${b}/${w}/${c}`;
}
const handleMessage = async (ws, message) => {
  try {
    // Parse message dari client
    const data = JSON.parse(message);
    const { observations, memoName, raw } = data;
    const validMemoName = getQuantizedNameOnServer(raw);

    if (validMemoName !== memoName) {
      console.warn(
        "⚠️ Client mengirim nama memo yang tidak valid! Menggunakan versi Server.",
      );
    }
    // Validasi basic (biar gak error aneh)
    if (!data || !data.type) {
      console.warn("Invalid message format:", data);
      return;
    }

    // Routing berdasarkan type
    switch (data.type) {
      case "INFERENCE_REQUEST": {
        await handleInferenceRequest(ws, observations, memoName);
        break;
      }

      default:
        console.warn("Unknown message type:", data.type);
    }
  } catch (error) {
    console.error("Failed to handle message:", error);
  }
};
let isInferenceRunning = false;
async function handleInferenceRequest(ws, observations, memoName) {
  if (isInferenceRunning) return;
  isInferenceRunning = true;
  try {
    const response = await axios.post(
      "http://192.168.1.22:8000/predict",
      {
        observations,
      },
      {
        timeout: 3000,
      },
    );
    const { bitrate_index, status } = response.data;
    await publishMemo(memoName, bitrate_index);
    ws.send(
      JSON.stringify({
        type: "INFERENCE_RESULT",
        action: bitrate_index,
        status: status,
      }),
    );
  } catch (err) {
    console.error("❌ `Gagal kontak AI Server:", err.message);
  } finally {
    isInferenceRunning = false;
  }
}
const handleClose = (message) => {};
export { handleMessage, handleClose };
