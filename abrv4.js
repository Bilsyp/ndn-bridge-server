import BandwidthEstimator from "./Ewma_Estimator";
import { consume } from "@ndn/endpoint";
import { fromUtf8 } from "@ndn/util";
import { MemoStatsManager } from "../ndn/MemoStatsManager";
import { LatencyMonitor } from "../ndn/LatencyMonitor";

// =============================================================================
// CONFIGURATION CONSTANTS
// =============================================================================
const WS_SOCKET_URL = "ws://192.168.1.13:5151/ws";
const NUM_ACTIONS = 4;
const SCALE_TARGET_MBPS = 5.1;
const LOW_BUFFER_THRESHOLD = 5.1; // Disamakan dengan batas lokal panic mode
const BUFFER_SAFETY_LIMIT = 15.0;
const MAX_BUFFER_SECONDS = 30.0;
const BUFFER_SAFETY_RANGE = 15.0;
const MAX_CWND = 100.0;
const SETTLE_TIME_MS = 5000;
const NDN_MEMO_LIFETIME_MS = 100;
const AI_THROTTLE_MS = 4000;

export default class NdnAiAbrManagerv3 {
  constructor(player, ndnPlugin) {
    // Shaka Player & Plugin References
    this.player_ = player;
    this.ndnPlugin_ = ndnPlugin;

    // Core ABR States
    this.switch_ = null;
    this.enabled_ = false;
    this.variants_ = [];
    this.playbackRate_ = 1;
    this.config_ = null;

    // Control & Timing States
    this.nextBestVariant_ = null;
    this.lastTimeChosenMs_ = 0;
    this.lastAiRequestTimeMs = 0;
    this.pendingAiStartTime = null;
    this.isWaitingAI = false;
    this.requestToken = 0;
    this.currentRequestToken = null;
    this.aiSafetyTimeoutTimer = null;

    // Metrics & Monitoring Modules
    this.memoStats_ = new MemoStatsManager();
    this.latencyMonitor_ = new LatencyMonitor();
    this.bandwidthEstimator_ = new BandwidthEstimator();

    // Cache Stats NDN
    this.lastNdnStats = { bytes: 0, timeMs: 0 };

    this._registerResponseFilter();
    this._initBridgeSocket();
    this._setupSeekingListener();
  }

  init(switchCallback) {
    this.switch_ = switchCallback;
  }
  stop() {
    this.switch_ = null;
    this.enabled_ = false;
    this.variants_ = [];
  }
  release() {
    this.stop();
  }
  playbackRateChanged(rate) {
    this.playbackRate_ = rate;
  }
  configure(config) {
    this.config_ = config;
  }
  trySuggestStreams() {}
  getBandwidthEstimate() {}
  setMediaElement(mediaElement) {}
  setCmsdManager(cmsdManager) {}

  setVariants(variants) {
    const sorted = [...variants].sort((a, b) => a.bandwidth - b.bandwidth);
    if (sorted.length >= NUM_ACTIONS) {
      const step = (sorted.length - 1) / (NUM_ACTIONS - 1);
      this.variants_ = Array.from(
        { length: NUM_ACTIONS },
        (_, i) => sorted[Math.round(i * step)],
      );
    } else {
      this.variants_ = sorted;
    }
  }

  /**
   * Mengatur listener untuk reset state ABR ketika user melompat (seeking) video.
   */
  _setupSeekingListener() {
    const videoElement = this.player_.getMediaElement();
    if (!videoElement) return;

    videoElement.addEventListener("seeking", () => {
      console.log("[ABR] ↩️ User seeking. Resetting AI lock & timers.");
      this.isWaitingAI = false;
      this.lastAiRequestTimeMs = 0;

      if (this.aiSafetyTimeoutTimer) {
        clearTimeout(this.aiSafetyTimeoutTimer);
        this.aiSafetyTimeoutTimer = null;
      }
    });
  }

  /**
   * Kuantisasi Metric State menjadi Segmented NDN Namespace Key.
   */
  _getCacheKey(buffer, throughput) {
    let bufferBucket = "safe";
    if (buffer <= LOW_BUFFER_THRESHOLD) bufferBucket = "panic";
    else if (buffer <= BUFFER_SAFETY_LIMIT) bufferBucket = "low";
    else if (buffer <= 25.0) bufferBucket = "safe";
    else bufferBucket = "abundant";

    let tpBucket = "good";
    if (throughput < 1.2) tpBucket = "critical";
    else if (throughput < 2.3) tpBucket = "fair";
    else if (throughput < 3.8) tpBucket = "good";
    else tpBucket = "excellent";

    return `/ndn/memo/${bufferBucket}/${tpBucket}`;
  }

  _updateBandwidthEstimator() {
    const { bytes, timeMs } = this.lastNdnStats;
    if (bytes > 0 && timeMs > 0) {
      this.bandwidthEstimator_.addSample(timeMs, bytes);
    }
  }

  _getMetricsState() {
    // 1. Throughput & Volatility
    const estimatedMbps = this.bandwidthEstimator_.getEstimate(500_000) / 1e6;
    const volRaw =
      Math.abs(
        this.bandwidthEstimator_.fast.getEstimate() -
          this.bandwidthEstimator_.slow.getEstimate(),
      ) /
      (this.bandwidthEstimator_.slow.getEstimate() + 1e-6);
    const volatility = Math.min(volRaw, 1.0);

    // 2. Track & Last Bitrate Index
    const tracks = [...this.player_.getVariantTracks()].sort(
      (a, b) => a.bandwidth - b.bandwidth,
    );
    const activeIndex = tracks.findIndex((t) => t.active);
    const lastExecIndex = activeIndex !== -1 ? activeIndex : 0;
    const lastBrNorm = lastExecIndex / (NUM_ACTIONS - 1);

    // 3. Buffer Info
    const goal = this.player_.getConfiguration().streaming.bufferingGoal;
    const bufferInSeconds = this.player_.getBufferFullness() * goal;
    const linearRatio = Math.min(
      Math.max(bufferInSeconds / MAX_BUFFER_SECONDS, 0.0),
      1.0,
    );
    const bufferNorm = Math.pow(linearRatio, 2);
    const safetyNorm = Math.min(
      Math.max(0, bufferInSeconds - BUFFER_SAFETY_LIMIT) / BUFFER_SAFETY_RANGE,
      1.0,
    );

    // 4. NDN Network Internals
    const ndnInternal = this.ndnPlugin_.getInternals();

    return {
      bufferInSeconds,
      estimatedMbps,
      volatility,
      lastBrNorm,
      bufferNorm,
      safetyNorm,
      ndnInternal,
    };
  }

  _buildObservations(metrics) {
    return [
      metrics.bufferNorm,
      Math.min(Math.max(metrics.estimatedMbps / SCALE_TARGET_MBPS, 0.0), 1.0),
      Math.min(Math.max(metrics.lastBrNorm, 0.0), 1.0),
      Math.min(Math.max(metrics.safetyNorm, 0.0), 1.0),
      Math.min(Math.max(metrics.volatility, 0.0), 1.0),
      Math.min(Math.max(metrics.ndnInternal.ca.cwnd / MAX_CWND, 0.0), 1.0),
    ];
  }

  async _checkNdnCache(cacheKey) {
    const start = performance.now();
    try {
      const data = await consume(cacheKey, {
        retx: 0,
        lifetime: NDN_MEMO_LIFETIME_MS,
      });
      const actionIndex = parseInt(fromUtf8(data.content));

      if (!isNaN(actionIndex)) {
        const duration = performance.now() - start;
        this.memoStats_.recordResult(true);
        this.latencyMonitor_.record("NDN", duration);
        this._applyAction(actionIndex, true);
        return true;
      }
    } catch {
      // Cache miss / Nack
    }
    return false;
  }

  _requestAiInference(cacheKey, metrics) {
    if (this.isWaitingAI) return;

    this.requestToken++;
    const currentToken = this.requestToken;
    this.currentRequestToken = currentToken;
    this.pendingAiStartTime = performance.now();

    const observations = this._buildObservations(metrics);

    this.isWaitingAI = true;

    // Anti-Deadlock Timeout
    if (this.aiSafetyTimeoutTimer) clearTimeout(this.aiSafetyTimeoutTimer);
    this.aiSafetyTimeoutTimer = setTimeout(() => {
      if (this.isWaitingAI && this.currentRequestToken === currentToken) {
        console.warn(
          `[ABR-AI] Deadlock detected for token #${currentToken}. Unlocking.`,
        );
        this.isWaitingAI = false;
      }
    }, 2500);

    try {
      this._sendToBridge({
        type: "INFERENCE_REQUEST",
        observations,
        token: currentToken,
        memoName: cacheKey,
      });
    } catch (error) {
      console.error("[ABR-AI] Failed to send WS message:", error);
      this.isWaitingAI = false;
    }
  }

  _sendToBridge(payload) {
    if (this.bridgeSocket.readyState === WebSocket.OPEN) {
      this.bridgeSocket.send(JSON.stringify(payload));
    }
  }

  _applyAction(actionIndex, force = false) {
    const safeIndex = Math.max(
      0,
      Math.min(actionIndex, this.variants_.length - 1),
    );
    this.nextBestVariant_ = this.variants_[safeIndex];

    const now = Date.now();
    if (!force && now - this.lastTimeChosenMs_ < SETTLE_TIME_MS) return;

    const chosen = this.nextBestVariant_;
    if (!chosen || !this.switch_) return;

    // Buffer upgrade guard
    const goal = this.player_.getConfiguration().streaming.bufferingGoal;
    const currentBuffer = this.player_.getBufferFullness() * goal;
    const currentBw = this.currentVariant_?.bandwidth || 0;

    if (chosen.bandwidth > currentBw && currentBuffer < 10) {
      return; // Hold upgrade
    }

    this.lastTimeChosenMs_ = now;
    this.switch_(
      chosen,
      this.config_.clearBufferSwitch,
      this.config_.safeMarginSwitch,
    );
  }

  _initBridgeSocket() {
    this.bridgeSocket = new WebSocket(WS_SOCKET_URL);
    this.bridgeSocket.onopen = () =>
      console.log("[ABR-NDN] ✅ Connected to AI Bridge");
    this.bridgeSocket.onerror = (err) =>
      console.error("[ABR-NDN] ❌ WebSocket Error:", err);
    this.bridgeSocket.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        if (
          data.type === "INFERENCE_RESULT" &&
          data.token === this.currentRequestToken
        ) {
          this.isWaitingAI = false;
          if (this.aiSafetyTimeoutTimer)
            clearTimeout(this.aiSafetyTimeoutTimer);

          const latency = performance.now() - this.pendingAiStartTime;
          this.latencyMonitor_.record("AI", latency);

          console.log(
            `[ABR-AI] ✅ Result received: action=${data.action} | latency=${latency.toFixed(0)}ms`,
          );
          this._applyAction(data.action, true);
        }
      } catch (e) {
        console.warn("[ABR-NDN] Invalid JSON message", e);
      }
    };
  }

  _registerResponseFilter() {
    this.player_
      .getNetworkingEngine()
      .registerResponseFilter((type, response) => {
        if (response.data && response.timeMs) {
          this.lastNdnStats = {
            bytes: response.data.byteLength,
            timeMs: response.timeMs,
          };
        }
      });
  }

  // =============================================================================
  // MAIN CORE ENTRY POINT (REFRACTORED LINEAR PIPELINE)
  // =============================================================================
  async segmentDownloaded(
    deltaTimeMs,
    numBytes,
    allowSwitch,
    request,
    context,
  ) {
    this._updateBandwidthEstimator();
    if (!allowSwitch || !this.enabled_) return;

    const metrics = this._getMetricsState();

    // 1. Emergency Braking (Local Panic Mode)
    if (metrics.bufferInSeconds <= LOW_BUFFER_THRESHOLD) {
      console.log(
        `[ABR] 🚨 Emergency! Buffer critically low (${metrics.bufferInSeconds.toFixed(1)}s). Forcing lowest profile.`,
      );
      this._applyAction(0, true);
      return;
    }

    const cacheKey = this._getCacheKey(
      metrics.bufferInSeconds,
      metrics.estimatedMbps,
    );

    // 2. Route 1: Check NDN Cache Data
    const isCacheHit = await this._checkNdnCache(cacheKey);
    if (isCacheHit) {
      return; // Sukses via cache, hentikan pipeline.
    }

    // 3. Route 2: AI Inference Pipeline (Gembok & Rate Limiting)
    if (this.isWaitingAI) return;

    const now = performance.now();
    if (
      this.lastAiRequestTimeMs &&
      now - this.lastAiRequestTimeMs < AI_THROTTLE_MS
    ) {
      return; // Kena rate limit 4 detik
    }

    // Cache Miss Terkonfirmasi, minta tolong ke AI
    this.memoStats_.recordResult(false);
    this.lastAiRequestTimeMs = now;
    this._requestAiInference(cacheKey, metrics);
  }
}
