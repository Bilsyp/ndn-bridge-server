import axios from "axios";
import { getMemo, publishMemo } from "./ndn-repo-manager.js";
import { aiQueue } from "./queue-manager.js"; // Menyesuaikan nama file baru jika diubah

const AI_SERVER_URL = "https://rl.ryvo.fun/predict";
const AI_TIMEOUT_MS = 3000;

// WeakMap: Otomatis menghapus data dari memori jika koneksi WS diputus oleh client
const clientBitrateRegistry = new WeakMap();

/**
 * Helper untuk mengirim response standar ke client WebSocket
 */
const sendWsResponse = (ws, { action, status, token }) => {
  if (ws.readyState !== 1) return; // 1 artinya WebSocket.OPEN
  ws.send(JSON.stringify({ type: "INFERENCE_RESULT", action, status, token }));
};

/**
 * Helper untuk mengirim data fallback jika antrean penuh atau AI server down
 */
const sendFallbackResponse = (ws, token) => {
  const lastKnownBitrate = clientBitrateRegistry.get(ws) ?? 0;
  console.log(
    `⚠️ [WS] Mengaktifkan Fallback. Menggunakan Bitrate Terakhir: ${lastKnownBitrate}`,
  );
  sendWsResponse(ws, {
    action: Number(lastKnownBitrate),
    status: "FALLBACK_HOLD",
    token,
  });
};

/**
 * Logika Inti: Alur eksekusi Cache Lookup -> AI Queue -> Response
 */
async function processInference(ws, { observations, memoName, token }) {
  try {
    // 1. Jalankan Cache Lookup lewat NDN Repo
    const cachedBitrate = await getMemo(memoName);

    if (cachedBitrate !== null) {
      console.log(`🎯 [Cache HIT] Menggunakan data dari NDN Repo: ${memoName}`);
      const actionValue = Number(cachedBitrate);

      clientBitrateRegistry.set(ws, actionValue); // Update track record client
      sendWsResponse(ws, { action: actionValue, status: "CACHE_HIT", token });
      return;
    }

    // 2. Cache MISS: Masukkan request ke dalam antrean (Queue) agar AI Server tidak overload
    console.log(
      `🧠 [Cache MISS] Menambahkan request ke Antrean AI: ${memoName}`,
    );

    aiQueue(
      async () => {
        console.log(
          `🚀 [Queue Executing] Memanggil AI Server untuk: ${memoName}`,
        );

        const response = await axios.post(
          AI_SERVER_URL,
          { observations },
          { timeout: AI_TIMEOUT_MS },
        );

        const { bitrate_index, status } = response.data;

        // Simpan ke registri lokal dan publish ke NDN Repo agar jadi cache
        clientBitrateRegistry.set(ws, bitrate_index);
        await publishMemo(memoName, bitrate_index);

        // Kirim hasil sukses ke client
        sendWsResponse(ws, { action: bitrate_index, status, token });
      },
      // Callback jika antrean penuh (Drop-oldest / Queue Overload)
      () => sendFallbackResponse(ws, token),
    );
  } catch (error) {
    console.error(
      `❌ [WS Controller] Error memproses inference untuk ${memoName}:`,
      error.message,
    );
    sendFallbackResponse(ws, token);
  }
}

/**
 * Handler utama saat WebSocket menerima pesan dari client
 */
export function handleMessage(ws, rawMessage) {
  try {
    const payload = JSON.parse(rawMessage);

    // Validasi tipe request
    if (payload?.type !== "INFERENCE_REQUEST") return;

    // Validasi skema data (Data Integrity Check)
    const { observations, memoName, token } = payload;
    if (!observations || !memoName || !token) {
      console.warn(
        "⚠️ [WS] Request diabaikan: Struktur payload tidak lengkap.",
      );
      return;
    }

    // Jalankan pipeline pemrosesan
    processInference(ws, { observations, memoName, token });
  } catch (err) {
    console.warn("⚠️ [WS] Gagal memparsing pesan masuk. Format harus JSON.");
  }
}

/**
 * Handler saat koneksi ditutup
 */
export function handleClose(ws) {
  console.log("🔌 [WS] Client terputus. Memori WeakMap otomatis dibersihkan.");
}
