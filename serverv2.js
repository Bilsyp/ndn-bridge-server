import { WebSocketServer } from "ws";
import { openUplinks } from "@ndn/cli-common";
import {
  makeInMemoryDataStore,
  RepoProducer,
  PrefixRegShorter,
} from "@ndn/repo";
import { Data, Name, digestSigning } from "@ndn/packet";
import { toUtf8 } from "@ndn/util";

// Konfigurasi Dasar
const WS_PORT = 5151;
const NDN_PREFIX = "/ndn/sensor/stream";

async function startRepoServer() {
  try {
    // 1. Hubungkan ke NDN Forwarder (NFD)
    await openUplinks();
    console.log("✅ Terhubung ke NFD.");

    // 2. Inisialisasi DataStore (Gudang Data di Memori)
    // Gunakan await using agar resource dibersihkan otomatis saat aplikasi berhenti
    const store = await makeInMemoryDataStore();

    // 3. Aktifkan RepoProducer (Pustakawan Otomatis)
    // reg: PrefixRegShorter(1) akan mendaftarkan prefix utama ke NFD
    RepoProducer.create(store, {
      reg: PrefixRegShorter(1),
    });
    console.log("📦 NDN Repository siap melayani permintaan jaringan.");

    // 4. Inisialisasi WebSocket Server untuk menerima stream dari Client
    const wss = new WebSocketServer({ port: WS_PORT });
    console.log(`🚀 WebSocket Bridge aktif di ws://localhost:${WS_PORT}`);

    wss.on("connection", (ws) => {
      console.log("🔌 Streamer terhubung via WebSocket.");

      ws.on("message", async (message) => {
        try {
          const data = JSON.parse(message);
          const seq = data.header?.sequence;

          if (seq !== undefined) {
            // LOGIKA REPO: Membuat paket Data NDN yang utuh
            // Nama: /ndn/sensor/stream/seg/<nomor_urut>
            const dataName = new Name(NDN_PREFIX).append("seg", seq.toString());

            const packet = new Data(
              dataName,
              Data.FreshnessPeriod(10000), // Data dianggap segar selama 10 detik
              toUtf8(JSON.stringify(data.payload)),
            );

            // Paket WAJIB ditandatangani sebelum masuk ke Repo
            await digestSigning.sign(packet);

            // MASUKKAN KE REPO
            // Repo akan otomatis menangani Interest yang mencari nama ini
            await store.insert(packet);

            console.log(
              `📥 Simpan Segmen [${seq}] ke Repo: ${dataName.toString()}`,
            );

            // Kirim balik konfirmasi ke WebSocket Client
            ws.send(JSON.stringify({ status: "ACK", sequence: seq }));
          }
        } catch (err) {
          console.error("❌ Gagal memproses data stream:", err.message);
        }
      });

      ws.on("close", () => console.log("📴 Streamer terputus."));
    });

    console.log(`🌐 Memantau jalur NDN: ${NDN_PREFIX}`);
  } catch (err) {
    console.error("❌ Gagal menjalankan Repo Server:", err);
    process.exit(1);
  }
}

// Jalankan Server
startRepoServer();
