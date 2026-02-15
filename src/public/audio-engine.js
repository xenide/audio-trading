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

class NoteScheduler {
  constructor(maxPerSec) {
    this._maxPerSec = maxPerSec;
    this._timestamps = [];
  }

  set maxPerSec(v) {
    this._maxPerSec = v;
  }

  allow() {
    const now = Date.now();
    const cutoff = now - 1000;
    let i = 0;
    while (i < this._timestamps.length && this._timestamps[i] < cutoff) i++;
    if (i > 0) this._timestamps.splice(0, i);

    if (this._timestamps.length >= this._maxPerSec) return false;
    this._timestamps.push(now);
    return true;
  }
}

class AudioEngine {
  constructor(config) {
    this._config = config;
    this._started = false;
    this._synth = null;
    this._panner = null;
    this._volume = null;
    this._priceTracker = new PriceTracker();
    this._scheduler = new NoteScheduler(config.get("maxNotesPerSec"));

    config.onChange((key, value) => {
      if (key === "maxNotesPerSec") this._scheduler.maxPerSec = value;
      if (key === "masterVolume" && this._volume) this._volume.volume.value = value;
      if (key === "synthType") this._rebuildSynth();
      if (["attack", "decay", "sustain", "release"].includes(key)) this._updateEnvelope();
    });
  }

  get started() {
    return this._started;
  }

  async start() {
    await Tone.start();

    this._volume = new Tone.Volume(this._config.get("masterVolume")).toDestination();
    this._panner = new Tone.Panner(0).connect(this._volume);
    this._buildSynth();
    this._started = true;
  }

  stop() {
    if (this._synth) {
      this._synth.dispose();
      this._synth = null;
    }
    if (this._panner) {
      this._panner.dispose();
      this._panner = null;
    }
    if (this._volume) {
      this._volume.dispose();
      this._volume = null;
    }
    this._started = false;
  }

  _buildSynth() {
    const type = this._config.get("synthType");
    this._synth = new Tone.PolySynth(Tone.Synth, {
      maxPolyphony: 16,
      oscillator: { type },
      envelope: {
        attack: this._config.get("attack"),
        decay: this._config.get("decay"),
        sustain: this._config.get("sustain"),
        release: this._config.get("release"),
      },
    }).connect(this._panner);
  }

  _rebuildSynth() {
    if (!this._started) return;
    if (this._synth) this._synth.dispose();
    this._buildSynth();
  }

  _updateEnvelope() {
    if (!this._synth) return;
    this._synth.set({
      envelope: {
        attack: this._config.get("attack"),
        decay: this._config.get("decay"),
        sustain: this._config.get("sustain"),
        release: this._config.get("release"),
      },
    });
  }

  playTrade(trade) {
    if (!this._started || !this._synth) return;
    if (trade.quantity < this._config.get("minTradeSize")) return;
    if (!this._scheduler.allow()) return;

    this._priceTracker.add(trade.price);

    const freq = this._mapFrequency(trade.price);
    const vol = this._mapVolume(trade.quantity);
    const dur = this._mapDuration(trade.quantity);
    const pan = trade.isSell ? -this._config.get("panWidth") : this._config.get("panWidth");

    this._panner.pan.value = pan;
    this._synth.triggerAttackRelease(freq, dur, Tone.now(), this._dbToGain(vol));
  }

  _mapFrequency(price) {
    const pitchMin = this._config.get("pitchMin");
    const pitchMax = this._config.get("pitchMax");

    if (this._config.get("pitchMode") === "auto") {
      const range = this._priceTracker.range();
      if (!range) return (pitchMin + pitchMax) / 2;
      const t = (price - range.min) / (range.max - range.min);
      return pitchMin + Math.max(0, Math.min(1, t)) * (pitchMax - pitchMin);
    }

    // fixed mode: use price directly with modular mapping
    const t = (price % 1000) / 1000;
    return pitchMin + t * (pitchMax - pitchMin);
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
