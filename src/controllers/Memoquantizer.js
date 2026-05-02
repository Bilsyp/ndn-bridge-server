/**
 * memoQuantizer.js
 * Mengubah state mentah (buffer, throughput, cwnd) menjadi NDN Name yang terkuantisasi.
 * Tujuan: mengelompokkan state serupa ke satu "bucket" agar cache lebih sering hit.
 *
 * Contoh output: /ndn/memo/panic/slow/congested
 */

/**
 * @param {number} buffer - Buffer level dalam detik
 * @returns {"panic"|"safe"|"full"}
 */
function categorizeBuffer(buffer) {
    if (buffer < 5) return "panic";
    if (buffer < 10) return "safe";
    return "full";
  }
  
  /**
   * @param {number} throughput - Throughput dalam Mbps
   * @returns {"slow"|"mid"|"fast"}
   */
  function categorizeThroughput(throughput) {
    if (throughput < 1.5) return "slow";
    if (throughput < 3.5) return "mid";
    return "fast";
  }
  
  /**
   * @param {number} cwnd - Congestion window size
   * @returns {"congested"|"stable"|"wide"}
   */
  function categorizeCwnd(cwnd) {
    if (cwnd < 10) return "congested";
    if (cwnd < 30) return "stable";
    return "wide";
  }
  
  /**
   * Menghasilkan NDN Name dari raw state client.
   *
   * @param {{ buffer: number, throughput: number, cwnd: number }} rawState
   * @returns {string} NDN Name, contoh: "/ndn/memo/safe/mid/stable"
   */
  export function quantizeToMemoName(rawState) {
    const buffer = categorizeBuffer(rawState.buffer);
    const throughput = categorizeThroughput(rawState.throughput);
    const cwnd = categorizeCwnd(rawState.cwnd);
  
    return `/ndn/memo/${buffer}/${throughput}/${cwnd}`;
  }