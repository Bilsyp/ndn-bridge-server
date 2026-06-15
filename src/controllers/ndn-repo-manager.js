import {
  makeInMemoryDataStore,
  RepoProducer,
  PrefixRegStatic,
} from "@ndn/repo";
import { Data, Name } from "@ndn/packet";
import { fromUtf8, toUtf8 } from "@ndn/util";

export let ndnDataStore = null;
const NDN_MEMO_PREFIX = "/ndn/memo";
const CACHE_FRESHNESS_MS = 5000;
export const initNDNRepo = async () => {
  if (ndnDataStore) return;

  try {
    ndnDataStore = await makeInMemoryDataStore();
    RepoProducer.create(ndnDataStore, {
      reg: PrefixRegStatic(new Name(NDN_MEMO_PREFIX)),
    });

    console.log(
      `📂 [NDN Repo] Data Store Ready with prefix: ${NDN_MEMO_PREFIX}`,
    );
  } catch (error) {
    console.error(
      "❌ [NDN Repo] Gagal menginisialisasi repository:",
      error.message,
    );
    ndnDataStore = null;
    throw error;
  }
};
/**
 * Menyimpan data hasil kalkulasi AI ke dalam NDN Data Store dengan masa berlaku tertentu.
 * @param {string} memoName - Nama unik paket data (URI/Interest Name)
 * @param {string|number} bitrateIndex - Nilai keputusan bitrate yang akan disimpan
 */
export const publishMemo = async (memoName, bitrateIndex) => {
  // 1. Guard Clause: Pastikan store sudah siap dan input valid
  if (!ndnDataStore) {
    console.warn(
      "⚠️ [NDN Repo] Gagal publish: ndnDataStore belum diinisialisasi.",
    );
    return;
  }
  if (bitrateIndex === undefined || bitrateIndex === null) {
    console.warn(
      `⚠️ [NDN Repo] Gagal publish untuk ${memoName}: Data bitrate tidak valid.`,
    );
    return;
  }

  try {
    // 2. Buat objek Nama NDN formal
    const ndnName = new Name(memoName);

    // 3. Siapkan objek Data NDN
    const decisionData = new Data(ndnName);

    // 4. Konversi payload ke format biner (Uint8Array)
    const stringPayload = String(bitrateIndex);
    decisionData.content = toUtf8(stringPayload);

    // 5. Atur masa aktif data di dalam cache (5000 ms = 5 detik)
    decisionData.freshnessPeriod = CACHE_FRESHNESS_MS;

    // 6. Masukkan data ke dalam penyimpanan lokal
    await ndnDataStore.insert(decisionData);

    console.log(
      `📝 [NDN Repo] Memo Published: ${memoName} -> Value: ${stringPayload} `,
    );

    // Jalankan fungsi debug jika mode debug aktif
    //    if (DEBUG_MODE) {
    //      await debugStore();
    //   }
  } catch (error) {
    console.error(
      `❌ [NDN Repo] Gagal menyimpan data untuk nama [${memoName}]:`,
      error.message,
    );
  }
};
/**
 * Mencari dan mengambil data dari NDN Data Store berdasarkan nama paket (Cache Lookup).
 * @param {string} memoName - Nama unik paket data yang dicari
 * @returns {Promise<string|null>} Mengembalikan data berupa string jika ditemukan (Cache Hit), atau null jika tidak ada (Cache Miss)
 */
export const getMemo = async (memoName) => {
  // 1. Guard Clause: Pastikan store sudah siap digunakan
  if (!ndnDataStore) {
    console.warn("⚠️ [NDN Repo] Gagal lookup: ndnDataStore belum siap.");
    return null;
  }

  try {
    // 2. Ubah string nama pencarian menjadi objek Name NDN resmi
    const ndnName = new Name(memoName);

    // 3. Tarik data dari store
    const dataPacket = await ndnDataStore.get(ndnName);

    // 4. Jika data tidak ditemukan di store, kembalikan null (Cache Miss)
    if (!dataPacket) {
      return null;
    }

    // 5. Jika ditemukan (Cache Hit), dekode payload biner (Uint8Array) kembali ke string
    const cachedValue = fromUtf8(dataPacket.content);
    return cachedValue;
  } catch (error) {
    // 6. Tangani error internal store secara terpisah dari kondisi Cache Miss normal
    console.error(
      `❌ [NDN Repo] Error saat melakukan lookup nama [${memoName}]:`,
      error.message,
    );
    return null;
  }
};

export const debugStore = async () => {
  if (!store) {
    console.log("⚠️ Store belum diinisialisasi.");
    return;
  }

  console.log("--- Isi NDN Repo Saat Ini ---");
  let count = 0;

  try {
    // Memanggil listData() menghasilkan generator
    const allData = store.listData();

    for await (const data of allData) {
      count++;
      console.log(`${count}. Name: ${data.name.toString()}`);
      console.log(`Content: ${fromUtf8(data.content)}`); // Decode content ke string
      console.log(`Freshness: ${data.freshnessPeriod}ms`);
    }

    if (count === 0) console.log("📭 Repo kosong.");
  } catch (error) {
    console.error("❌ Gagal membaca listData:", error);
  } finally {
    console.log("-----------------------------");
  }
};
