
import axios from "axios";
import { publishMemo, getMemo } from "./ndnRepoManager.js";
import { enqueue } from "./Queuemanager.js";

// =======================
// CONFIG
// =======================
const AI_SERVER_URL = "http://192.168.1.4:8000/predict";
const AI_TIMEOUT_MS = 3000;

// =======================
// STATE PER CLIENT
// Menyimpan bitrate terakhir yang berhasil untuk keperluan fallback.
// =======================
const lastBitrateByClient = new Map();

// =======================
// HELPERS
// =======================

/**
 * Mengirim hasil inferensi ke client via WebSocket.
 */
function sendResult(ws, { action, status, token }) {
  ws.send(JSON.stringify({ type: "INFERENCE_RESULT", action, status, token }));
}

/**
 * Fallback: kirim ulang bitrate terakhir jika terjadi error atau queue penuh.
 */
function sendFallback(ws, token) {
  const lastBitrate = lastBitrateByClient.get(ws) ?? 0;
  sendResult(ws, { action: lastBitrate, status: "FALLBACK_HOLD", token });
}

/**
 * Meminta prediksi bitrate ke AI Server.
 *
 * @param {number[][]} observations - Array observasi dari client
 * @returns {Promise<{ bitrate_index: number, status: string }>}
 */
async function fetchFromAI(observations) {
  const response = await axios.post(
    AI_SERVER_URL,
    { observations },
    { timeout: AI_TIMEOUT_MS }
  );
  return response.data;
}

// =======================
// CORE INFERENCE LOGIC
// =======================

/**
 * Proses satu inference request:
 *  - Cek NDN cache terlebih dahulu
 *  - Jika miss, panggil AI Server
 *  - Simpan hasil ke NDN Repo
 */
async function processInference(ws, { observations, memoName, token }) {


  // 2. Cache miss → tanya AI
  console.log(`🧠 [Cache MISS] Memanggil AI untuk: ${memoName}`);
  const { bitrate_index, status } = await fetchFromAI(observations);

  // 3. Simpan ke state client & NDN Repo
  lastBitrateByClient.set(ws, bitrate_index);
  await publishMemo(memoName, bitrate_index);

  // 4. Kirim ke client
  sendResult(ws, { action: bitrate_index, status, token });
}

// =======================
// MESSAGE HANDLER
// =======================

/**
 * Entry point: dipanggil setiap kali ada pesan WebSocket masuk.
 *
 * @param {WebSocket} ws
 * @param {string} rawMessage
 */
export function handleMessage(ws, rawMessage) {
  let data;

  try {
    data = JSON.parse(rawMessage);
  } catch {
    console.warn("[WS] Pesan tidak valid (bukan JSON).");
    return;
  }

  if (!data?.type) {
    console.warn("[WS] Pesan tanpa field `type`:", data);
    return;
  }

  switch (data.type) {
    case "INFERENCE_REQUEST": {
      const { observations, raw, token, memoName } = data;


      enqueue(
        ()=>processInference(ws, { observations, memoName, token }),
        () => sendFallback(ws, token) // dipanggil jika queue penuh
      );
      break;
    }

    default:
      console.warn("[WS] Tipe pesan tidak dikenal:", data.type);
  }
}

/**
 * Cleanup saat client disconnect.
 *
 * @param {WebSocket} ws
 */
export function handleClose(ws) {
  lastBitrateByClient.delete(ws);
  console.log("[WS] Client disconnected, state dibersihkan.");
}
