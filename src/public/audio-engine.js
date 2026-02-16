class PriceTracker {
  constructor(windowMs = 30000) {
    this._windowMs = windowMs;
    this._prices = [];
  }

  add(price) {
    const now = Date.now();
    this._prices.push({ price, time: now });
    this._prune(now);
  }

  range() {
    this._prune(Date.now());
    if (this._prices.length === 0) return null;
    let min = Infinity;
    let max = -Infinity;
    for (const { price } of this._prices) {
      if (price < min) min = price;
      if (price > max) max = price;
    }
    if (min === max) {
      min -= 1;
      max += 1;
    }
    return { min, max };
  }

  _prune(now) {
    const cutoff = now - this._windowMs;
    let i = 0;
    while (i < this._prices.length && this._prices[i].time < cutoff) i++;
    if (i > 0) this._prices.splice(0, i);
  }
}

class ImbalanceTracker {
  constructor(config) {
    this._config = config;
    this._trades = [];
    this._cvd = 0;
    this._cvdPoints = [];
  }

  addTrade(trade) {
    const now = Date.now();
    const vol = trade.quantity;
    const entry = { time: now, vol, isSell: trade.isSell };
    this._trades.push(entry);

    const delta = trade.isSell ? -vol : vol;
    this._cvd += delta;
    this._cvdPoints.push({ time: now, cvd: this._cvd });

    this._prune(now);
  }

  get imbalanceRatio() {
    let buyVol = 0;
    let sellVol = 0;
    for (const t of this._trades) {
      if (t.isSell) sellVol += t.vol;
      else buyVol += t.vol;
    }
    const total = buyVol + sellVol;
    if (total === 0) return 0;
    return (buyVol - sellVol) / total;
  }

  get cvdPoints() {
    return this._cvdPoints;
  }

  _prune(now) {
    const windowMs = this._config.get("imbalanceWindow") * 1000;
    const cutoff = now - windowMs;

    let i = 0;
    while (i < this._trades.length && this._trades[i].time < cutoff) i++;
    if (i > 0) this._trades.splice(0, i);

    let j = 0;
    while (j < this._cvdPoints.length && this._cvdPoints[j].time < cutoff) j++;
    if (j > 0) this._cvdPoints.splice(0, j);
  }
}

class AudioEngine {
  constructor(config) {
    this._config = config;
    this._started = false;
    this._buySynth = null;
    this._sellSynth = null;
    this._whaleSynth = null;
    this._buyPanner = null;
    this._sellPanner = null;
    this._volume = null;
    this._nextNoteTime = 0;
    this._queue = [];
    this._drainHandle = null;
    this._droneOsc = null;
    this._droneGain = null;
    this.imbalanceTracker = new ImbalanceTracker(config);
    this.onWhale = null;

    config.onChange((key, value) => {
      if (key === "masterVolume" && this._volume) this._volume.volume.value = value;
      if (key === "synthType") this._rebuildSynths();
      if (["attack", "decay", "sustain", "release"].includes(key)) this._updateEnvelopes();
      if (key === "imbalanceVolume" && this._droneGain) this._droneGain.gain.rampTo(this._dbToGain(value), 0.1);
      if (key === "imbalanceFreqCenter" && this._droneOsc) this._droneOsc.frequency.rampTo(value, 0.3);
      if (key === "imbalanceEnabled") this._toggleDrone(value);
    });
  }

  get started() {
    return this._started;
  }

  async start() {
    await Tone.start();

    this._volume = new Tone.Volume(this._config.get("masterVolume")).toDestination();
    this._buyPanner = new Tone.Panner(this._config.get("panWidth")).connect(this._volume);
    this._sellPanner = new Tone.Panner(-this._config.get("panWidth")).connect(this._volume);

    this._config.onChange((key, value) => {
      if (key === "panWidth") {
        if (this._buyPanner) this._buyPanner.pan.value = value;
        if (this._sellPanner) this._sellPanner.pan.value = -value;
      }
    });

    this._buildSynths();
    this._nextNoteTime = Tone.now();
    this._started = true;
    this._startDrain();

    if (this._config.get("imbalanceEnabled")) {
      this._startDrone();
    }
  }

  stop() {
    this._started = false;
    if (this._drainHandle) {
      cancelAnimationFrame(this._drainHandle);
      this._drainHandle = null;
    }
    this._queue.length = 0;
    this._stopDrone();
    [this._buySynth, this._sellSynth, this._whaleSynth, this._buyPanner, this._sellPanner, this._volume].forEach((n) => {
      if (n) n.dispose();
    });
    this._buySynth = this._sellSynth = this._whaleSynth = this._buyPanner = this._sellPanner = this._volume = null;
  }

  _buildSynths() {
    const opts = {
      maxPolyphony: 8,
      oscillator: { type: this._config.get("synthType") },
      envelope: {
        attack: this._config.get("attack"),
        decay: this._config.get("decay"),
        sustain: this._config.get("sustain"),
        release: this._config.get("release"),
      },
    };
    this._buySynth = new Tone.PolySynth(Tone.Synth, opts).connect(this._buyPanner);
    this._sellSynth = new Tone.PolySynth(Tone.Synth, opts).connect(this._sellPanner);

    this._whaleSynth = new Tone.PolySynth(Tone.Synth, {
      maxPolyphony: 12,
      oscillator: { type: "triangle" },
      envelope: { attack: 0.02, decay: 0.15, sustain: 0.4, release: 0.3 },
    }).connect(this._volume);
  }

  _rebuildSynths() {
    if (!this._started) return;
    if (this._buySynth) this._buySynth.dispose();
    if (this._sellSynth) this._sellSynth.dispose();
    if (this._whaleSynth) this._whaleSynth.dispose();
    this._buildSynths();
  }

  _updateEnvelopes() {
    const env = {
      attack: this._config.get("attack"),
      decay: this._config.get("decay"),
      sustain: this._config.get("sustain"),
      release: this._config.get("release"),
    };
    if (this._buySynth) this._buySynth.set({ envelope: env });
    if (this._sellSynth) this._sellSynth.set({ envelope: env });
  }

  _startDrone() {
    if (this._droneOsc) return;
    const freq = this._config.get("imbalanceFreqCenter");
    const vol = this._config.get("imbalanceVolume");

    this._droneGain = new Tone.Gain(this._dbToGain(vol)).connect(this._volume);
    this._droneOsc = new Tone.Oscillator(freq, "sine").connect(this._droneGain);
    this._droneOsc.start();
  }

  _stopDrone() {
    if (this._droneOsc) {
      this._droneOsc.stop();
      this._droneOsc.dispose();
      this._droneOsc = null;
    }
    if (this._droneGain) {
      this._droneGain.dispose();
      this._droneGain = null;
    }
  }

  _toggleDrone(enabled) {
    if (!this._started) return;
    if (enabled) this._startDrone();
    else this._stopDrone();
  }

  _updateDroneFreq() {
    if (!this._droneOsc || !this._config.get("imbalanceEnabled")) return;
    const ratio = this.imbalanceTracker.imbalanceRatio;
    const center = this._config.get("imbalanceFreqCenter");
    // ratio -1 → center * 0.6875, ratio 0 → center, ratio +1 → center * 1.375
    const freq = center * (1 + ratio * 0.375);
    this._droneOsc.frequency.rampTo(freq, 0.3);
  }

  playTrade(trade) {
    if (!this._started) return;
    if (trade.quantity < this._config.get("minTradeSize")) return;

    this.imbalanceTracker.addTrade(trade);
    this._updateDroneFreq();

    const whaleEnabled = this._config.get("whaleEnabled");
    const tier2 = this._config.get("whaleTier2");
    const tier1 = this._config.get("whaleTier1");

    // whale-tier trades bypass the queue limit
    const isWhale = whaleEnabled && trade.quantity >= tier1;

    const maxQueued = this._config.get("maxNotesPerSec");
    if (!isWhale && this._queue.length >= maxQueued) return;

    if (isWhale) {
      trade._whaleTier = trade.quantity >= tier2 ? 2 : 1;
    }

    this._queue.push(trade);
  }

  _startDrain() {
    const drain = () => {
      if (!this._started) return;

      const now = Tone.now();
      const gap = this._config.get("noteGap");

      if (this._nextNoteTime < now) {
        this._nextNoteTime = now;
      }

      const lookahead = 0.2;
      while (this._queue.length > 0 && this._nextNoteTime < now + lookahead) {
        const trade = this._queue.shift();
        this._scheduleNote(trade, this._nextNoteTime);
        const dur = trade._whaleTier === 2 ? 0.8 : trade._whaleTier === 1 ? this._mapDuration(trade.quantity) * 1.5 : this._mapDuration(trade.quantity);
        this._nextNoteTime += dur + gap;
      }

      const maxQueued = this._config.get("maxNotesPerSec");
      if (this._queue.length > maxQueued) {
        this._queue.splice(0, this._queue.length - maxQueued);
      }

      this._drainHandle = requestAnimationFrame(drain);
    };
    this._drainHandle = requestAnimationFrame(drain);
  }

  _scheduleNote(trade, time) {
    const baseFreq = trade.isSell ? 288.054144 : 432.081216;
    const vol = this._mapVolume(trade.quantity);
    const dur = this._mapDuration(trade.quantity);
    const gain = this._dbToGain(vol);

    if (trade._whaleTier === 2) {
      // tier 2: root + major third + perfect fifth, sawtooth, fixed long duration
      const freqs = [baseFreq, baseFreq * 5 / 4, baseFreq * 3 / 2];
      const whaleGain = Math.max(gain, this._dbToGain(-15));
      this._whaleSynth.set({ oscillator: { type: "sawtooth" } });
      this._whaleSynth.triggerAttackRelease(freqs, 0.8, time, whaleGain);
      if (this.onWhale) this.onWhale(trade);
    } else if (trade._whaleTier === 1) {
      // tier 1: root + major third, triangle, 1.5x duration
      const freqs = [baseFreq, baseFreq * 5 / 4];
      this._whaleSynth.set({ oscillator: { type: "triangle" } });
      this._whaleSynth.triggerAttackRelease(freqs, dur * 1.5, time, gain);
      if (this.onWhale) this.onWhale(trade);
    } else {
      const synth = trade.isSell ? this._sellSynth : this._buySynth;
      synth.triggerAttackRelease(baseFreq, dur, time, gain);
    }
  }

  _mapVolume(quantity) {
    const ref = this._config.get("volumeQuantityRef");
    const volMin = this._config.get("volumeMin");
    const volMax = this._config.get("volumeMax");

    const t = Math.log(1 + quantity) / Math.log(1 + ref);
    return volMin + Math.max(0, Math.min(1, t)) * (volMax - volMin);
  }

  _mapDuration(quantity) {
    const ref = this._config.get("volumeQuantityRef");
    const durMin = this._config.get("durationMin");
    const durMax = this._config.get("durationMax");

    const t = Math.min(1, quantity / ref);
    return durMin + t * (durMax - durMin);
  }

  _dbToGain(db) {
    return Math.pow(10, db / 20);
  }
}
