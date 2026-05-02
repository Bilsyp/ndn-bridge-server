import {
  makeInMemoryDataStore,
  RepoProducer,
  PrefixRegStatic
} from "@ndn/repo";
import { Data,Name } from "@ndn/packet";
import { fromUtf8, toUtf8 } from "@ndn/util";
// Variabel internal untuk menyimpan instance store
export let store = null;
const DEBUG = true;
export const initNDNRepo = async () => {
  if (store) return;
  store = await makeInMemoryDataStore();
  RepoProducer.create(store, { reg: PrefixRegStatic(new Name("/ndn/memo")) });

  // PEMBERSIH OTOMATIS (Scavenger)
  // Menjalankan clearExpired setiap 30 detik untuk menghapus data usang secara massal
  // setInterval(async () => {
  //   if (store) {
  //     await store.clearExpired();
  //     console.log("🧹 [NDN Repo] Garbage Collector: Expired records cleared.");
  //   }
  // }, 30000); 

  console.log("📂 [NDN Repo] Data Store Ready.");
};
export const publishMemo = async (memoName, bitrateIndex) => {
  if (!store) return;
  try {
    const name = new Name(memoName);
    const decisionData = new Data(name);
    decisionData.content = toUtf8(bitrateIndex.toString());
    decisionData.freshnessPeriod = 5000; // Tetap 2 detik[cite: 1]

    await store.insert(decisionData);
    if (DEBUG) await debugStore();
    console.log(`📝 [NDN Repo] Memo Published: ${memoName}`);
  } catch (error) {
    console.error("❌ [NDN Repo] Error inserting data:", error);
  }
};
/**
 * Cek apakah memo ada dan masih valid
 */
export const getMemo = async (memoName) => {
  if (!store) return null;
  try {
    // store.get() di NDNts otomatis mengembalikan undefined jika data expired
    const data = await store.get(new Name(memoName));
    return data ? fromUtf8(data.content) : null;
  } catch (err) {
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
  }
  finally {
    console.log("-----------------------------");
  }
};