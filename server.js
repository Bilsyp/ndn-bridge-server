import { WebSocketServer } from "ws";
import { openUplinks } from "@ndn/cli-common";
import { produce } from "@ndn/endpoint";
import { Data, Name, digestSigning } from "@ndn/packet";
import { toUtf8 } from "@ndn/util";

// Konfigurasi
const WS_PORT = 5151;
const NDN_PREFIX = "/ndn/sensor/stream";

/**
 * Gudang Data Segmen (In-Memory Storage)
 * Key: sequence_number (n)
 * Value: Data payload dari client
 */
const segmentStorage = new Map();

async function startBridgeServer() {
  try {
    // 1. Inisialisasi NDN Uplink (Koneksi ke NFD)
    await openUplinks();
    console.log("✅ Terhubung ke NFD.");

    // 2. Inisialisasi WebSocket Server pada port 5151
    const wss = new WebSocketServer({ port: WS_PORT });
    console.log(`🚀 WebSocket Server aktif di ws://localhost:${WS_PORT}`);

    wss.on("connection", (ws) => {
      console.log("🔌 Client (Streamer) terhubung via WebSocket.");

      ws.on("message", (message) => {
        try {
          const data = JSON.parse(message);
          const seq = data.header?.sequence;

          if (seq !== undefined) {
            // Simpan data ke gudang berdasarkan nomor urut (segmen)
            segmentStorage.set(seq, data.payload);
            console.log(`📥 Menerima Segmen [${seq}]:`, data.payload);

            // Beri feedback ke client
            ws.send(JSON.stringify({ status: "ACK", sequence: seq }));
          }
        } catch (err) {
          console.error("❌ Gagal memproses pesan WS:", err.message);
        }
      });

      ws.on("close", () => console.log("📴 Client terputus."));
    });

    // 3. Registrasi NDN Producer (Smart Gateway)
    // Kita gunakan slice() untuk membedah instruksi sisa
    const rootName = new Name(NDN_PREFIX);

    produce(
      rootName,
      async (interest) => {
        console.log(`\n[NDN] Interest Masuk: ${interest.name.toString()}`);

        // Gunakan slice untuk mengambil bagian setelah /ndn/sensor/stream
        // Misal: /ndn/sensor/stream/seg/1 -> sisa: /seg/1
        const subPath = interest.name.slice(rootName.length);

        const category = subPath.at(0)?.text; // "seg"
        const seqStr = subPath.at(1)?.text; // "1"

        if (category === "seg" && seqStr) {
          const seqNum = parseInt(seqStr);
          const content = segmentStorage.get(seqNum);

          if (content) {
            console.log(`   🎯 Mengirim Segmen ${seqNum} ke Consumer.`);
            const response = new Data(
              interest.name,
              Data.FreshnessPeriod(5000), // Data segar selama 5 detik
              toUtf8(JSON.stringify(content)),
            );
            await digestSigning.sign(response);
            return response;
          } else {
            console.log(`   ⚠️ Segmen ${seqNum} belum tersedia di gudang.`);
            // Jika belum ada, biarkan timeout atau kirim respon kosong
          }
        }

        return undefined; // Abaikan jika tidak cocok
      },
      {
        concurrency: 16,
        dataSigner: digestSigning,
      },
    );

    console.log(`🌐 NDN Producer aktif di prefix: ${NDN_PREFIX}`);
  } catch (err) {
    console.error("❌ Gagal menjalankan server:", err);
    process.exit(1);
  }
}

startBridgeServer();
