  segmentDownloaded(deltaTimeMs, numBytes, allowSwitch, request, context) {
    // The time indicates that it could be a cache response, so we should
    // ignore this value.
    if (deltaTimeMs >= this.config_.cacheLoadThreshold) {
      shaka.log.v2('Segment downloaded:',
          'contentType=' + (request && request.contentType),
          'deltaTimeMs=' + deltaTimeMs,
          'numBytes=' + numBytes,
          'lastTimeChosenMs=' + this.lastTimeChosenMs_,
          'enabled=' + this.enabled_);
      goog.asserts.assert(deltaTimeMs >= 0, 'expected a non-negative duration');
      this.bandwidthEstimator_.sample(deltaTimeMs, numBytes);
    }

    if (allowSwitch && (this.lastTimeChosenMs_ != null) && this.enabled_) {
      this.suggestStreams_();
    }
  }
  suggestStreams_(force = false) {
    shaka.log.v2('Suggesting Streams...');
    goog.asserts.assert(this.lastTimeChosenMs_ != null,
        'lastTimeChosenMs_ should not be null');

    if (!force) {
      if (!this.startupComplete_) {
        // Check if we've got enough data yet.
        if (!this.bandwidthEstimator_.hasGoodEstimate()) {
          shaka.log.v2('Still waiting for a good estimate...');
          return;
        }
        this.startupComplete_ = true;

        this.lastTimeChosenMs_ -=
            (this.config_.switchInterval - this.config_.minTimeToSwitch) * 1000;
      }

      // Check if we've left the switch interval.
      const now = Date.now();
      const delta = now - this.lastTimeChosenMs_;
      if (delta < this.config_.switchInterval * 1000) {
        shaka.log.v2('Still within switch interval...');
        return;
      }
    }

    const chosenVariant = this.chooseVariant();
    const bandwidthEstimate = this.getBandwidthEstimate();
    const currentBandwidthKbps = Math.round(bandwidthEstimate / 1000.0);

    if (chosenVariant && this.switch_) {
      shaka.log.debug(
          'Calling switch_(), bandwidth=' + currentBandwidthKbps + ' kbps');
      // If any of these chosen streams are already chosen, Player will filter
      // them out before passing the choices on to StreamingEngine.
      this.switch_(chosenVariant, this.config_.clearBufferSwitch,
          this.config_.safeMarginSwitch);
    }
  }