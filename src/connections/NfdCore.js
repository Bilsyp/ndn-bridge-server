import { openUplinks } from "@ndn/cli-common";
export async function ConnectNFD() {
  try {
    await openUplinks();
    console.log("Connection Ke Core NFD Berhasil!!");
  } catch (error) {
    console.error("Connection Mengalami Error: ", error);
  }
}
