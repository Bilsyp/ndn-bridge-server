import { openUplinks } from "@ndn/cli-common";
import { produce } from "@ndn/endpoint";
import { Data, Name, digestSigning } from "@ndn/packet";
import { toUtf8 } from "@ndn/util";

// Konfigurasi Prefix Utama
const ROOT_PREFIX_STR = "/ndn/myapi";

/**
 * Controller Khusus Sensor
 * Hanya peduli pada bagian setelah /ndn/myapi/sensor
 */
async function sensorController(interest, subPath) {
  const action = subPath.at(0)?.text; // misal: "suhu" atau "kelembaban"
  console.log(`   [SensorController] Menangani aksi: ${action}`);

  let val = "Data tidak ada";
  if (action === "suhu") val = "25°C";
  if (action === "kelembaban") val = "60%";

  const response = new Data(
    interest.name,
    Data.FreshnessPeriod(1000),
    toUtf8(val),
  );
  await digestSigning.sign(response);
  return response;
}

/**
 * Controller Khusus User
 * Hanya peduli pada bagian setelah /ndn/myapi/user
 */
async function userController(interest, subPath) {
  const userId = subPath.at(0)?.text;
  console.log(`   [UserController] Mencari data user ID: ${userId}`);

  const userData = { id: userId, nama: "Budi Santoso", role: "Admin" };

  const response = new Data(
    interest.name,
    Data.FreshnessPeriod(1000),
    toUtf8(JSON.stringify(userData)),
  );
  await digestSigning.sign(response);
  return response;
}

async function startServer() {
  try {
    await openUplinks();
    console.log(`✅ Server aktif di ${ROOT_PREFIX_STR}`);

    const rootName = new Name(ROOT_PREFIX_STR);

    // --- GATEWAY UTAMA ---
    produce(
      rootName,
      async (interest) => {
        console.log(`\n[NDN] Interest Masuk: ${interest.name.toString()}`);

        // 1. POTONG JALUR menggunakan slice()
        // Jika interest: /ndn/myapi/sensor/suhu
        // rootName.length adalah 2
        // subPath menjadi: /sensor/suhu
        const subPath = interest.name.slice(rootName.length);

        // 2. Tentukan "Ruangan" (Controller) mana yang dituju
        const target = subPath.at(0)?.text;

        if (target === "sensor") {
          // Lempar ke sensorController, potong lagi bagian "sensor"-nya
          return await sensorController(interest, subPath.slice(1));
        }

        if (target === "user") {
          // Lempar ke userController, potong lagi bagian "user"-nya
          return await userController(interest, subPath.slice(1));
        }

        // Default jika rute tidak ditemukan
        const errorData = new Data(
          interest.name,
          toUtf8("Error: Jalur tidak ditemukan"),
        );
        await digestSigning.sign(errorData);
        return errorData;
      },
      { concurrency: 16 },
    );
  } catch (err) {
    console.error("Gagal memulai server:", err);
  }
}

startServer();
