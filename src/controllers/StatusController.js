import express from 'express';
// Pastikan helper fromUtf8 sudah diimport (biasanya dari @ndn/util)
import { fromUtf8 } from '@ndn/util'; 
import { store} from "./ndnRepoManager.js"

const router = express.Router();

/**
 * Endpoint untuk melihat isi NDN Repo secara real-time
 */
router.get('/debug-store', async (req, res) => {
  // 1. Guard: Pastikan store sudah siap
  if (!store) {
    return res.status(404).json({
      status: "error",
      message: "Store belum diinisialisasi."
    });
  }

  const repoContents = [];
  let count = 0;

  try {
    // 2. Akses generator asinkron dari NDN Store
    const allData = store.listData();

    // 3. Iterasi asinkron untuk mengumpulkan data
    for await (const data of allData) {
      count++;
      repoContents.push({
        id: count,
        name: data.name.toString(),
        content: fromUtf8(data.content), // Decode content ke string yang terbaca
        freshness: `${data.freshnessPeriod}ms`
      });
    }

    // 4. Kirim respon JSON
    res.status(200).json({
      status: "success",
      total: count,
      timestamp: Date.now(), // Untuk sinkronisasi di dashboard Anda
      data: repoContents
    });

  } catch (error) {
    console.error("❌ Gagal membaca NDN Repo:", error);
    res.status(500).json({
      status: "error",
      message: "Gagal membaca isi repo",
      error: error.message
    });
  }
});

export default router;