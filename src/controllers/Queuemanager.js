/**
 * queueManager.js
 * Mengatur konkurensi request ke AI Server agar tidak overload.
 * Jika queue penuh, request lama dibuang (drop-oldest strategy).
 */

const MAX_CONCURRENT = 2;
const MAX_QUEUE = 3;

let activeCount = 0;
const taskQueue = [];

/**
 * Menjalankan task berikutnya dari queue jika slot tersedia.
 */
function runNext() {
  if (activeCount >= MAX_CONCURRENT || taskQueue.length === 0) return;

  const task = taskQueue.shift();
  activeCount++;

  task()
    .catch((err) => console.error("[Queue] Task error:", err.message))
    .finally(() => {
      activeCount--;
      runNext();
    });
}

/**
 * Menambahkan task ke queue.
 * Jika queue penuh, request tertua dibuang dan onQueueFull dipanggil sebagai fallback.
 *
 * @param {() => Promise<void>} task - Fungsi async yang akan dijalankan
 * @param {() => void} onQueueFull - Callback jika queue penuh (untuk fallback ke client)
 */
export function enqueue(task, onQueueFull) {
  if (taskQueue.length >= MAX_QUEUE) {
    taskQueue.shift(); // buang request paling lama
    onQueueFull?.();
  }

  taskQueue.push(task);
  runNext();
}