import {
  makeInMemoryDataStore,
  RepoProducer,
  PrefixRegShorter,
} from "@ndn/repo";
import { Data } from "@ndn/packet";
import { fromUtf8, toUtf8 } from "@ndn/util";
// Variabel internal untuk menyimpan instance store
let store = null;

/**
 * Inisialisasi Repository NDN
 * Fungsi ini dijalankan sekali saat Bridge pertama kali menyala.
 */
export const initNDNRepo = async () => {
  if (store) return; // Mencegah inisialisasi ganda

  store = await makeInMemoryDataStore();

  // Menjalankan Producer untuk mengekspos data ke jaringan
  // PrefixRegShorter(1) akan mendaftarkan prefix yang lebih pendek 1 tingkat dari nama data
  RepoProducer.create(store, { reg: PrefixRegShorter(1) });

  console.log("📂 [NDN Repo] Data Store dan Producer berhasil diaktifkan.");
};

/**
 * Menerbitkan (Publish) Keputusan AI ke Jaringan NDN
 * @param {string} memoName Nama unik berdasarkan kondisi jaringan (Quantized Name)
 * @param {number|string} bitrateIndex Hasil keputusan dari AI
 */
export const publishMemo = async (memoName, bitrateIndex) => {
  if (!store) {
    console.error("❌ [NDN Repo] Store belum diinisialisasi!");
    return;
  }

  try {
    const decisionData = new Data(memoName);

    // Membungkus index bitrate menjadi buffer untuk payload paket NDN
    // decisionData.content = new TextEncoder().encode(bitrateIndex.toString());
    decisionData.content = toUtf8(bitrateIndex.toString());

    // Mengatur masa berlaku memo (FreshnessPeriod) selama 10 detik.
    // Ini memastikan keputusan AI yang lama akan kadaluarsa jika kondisi jaringan berubah.
    decisionData.freshnessPeriod = 10000;

    // Memasukkan paket ke dalam Repository
    await store.insert(decisionData);

    console.log(
      `📝 [NDN Repo] Memo Berhasil Disimpan: ${memoName} -> [Bitrate: ${bitrateIndex}]`,
    );
  } catch (error) {
    console.error("❌ [NDN Repo] Gagal memasukkan data ke store:", error);
  }
};
