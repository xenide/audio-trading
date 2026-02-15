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

class AudioEngine {
  constructor(config) {
    this._config = config;
    this._started = false;
    this._buySynth = null;
    this._sellSynth = null;
    this._buyPanner = null;
    this._sellPanner = null;
    this._volume = null;
    this._nextNoteTime = 0;
    this._queue = [];
    this._drainHandle = null;

    config.onChange((key, value) => {
      if (key === "masterVolume" && this._volume) this._volume.volume.value = value;
      if (key === "synthType") this._rebuildSynths();
      if (["attack", "decay", "sustain", "release"].includes(key)) this._updateEnvelopes();
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
  }

  stop() {
    this._started = false;
    if (this._drainHandle) {
      cancelAnimationFrame(this._drainHandle);
      this._drainHandle = null;
    }
    this._queue.length = 0;
    [this._buySynth, this._sellSynth, this._buyPanner, this._sellPanner, this._volume].forEach((n) => {
      if (n) n.dispose();
    });
    this._buySynth = this._sellSynth = this._buyPanner = this._sellPanner = this._volume = null;
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
  }

  _rebuildSynths() {
    if (!this._started) return;
    if (this._buySynth) this._buySynth.dispose();
    if (this._sellSynth) this._sellSynth.dispose();
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

  playTrade(trade) {
    if (!this._started) return;
    if (trade.quantity < this._config.get("minTradeSize")) return;

    const maxQueued = this._config.get("maxNotesPerSec");
    if (this._queue.length >= maxQueued) return;

    this._queue.push(trade);
  }

  _startDrain() {
    const drain = () => {
      if (!this._started) return;

      const now = Tone.now();
      const gap = this._config.get("noteGap");

      // if we've fallen behind, snap forward
      if (this._nextNoteTime < now) {
        this._nextNoteTime = now;
      }

      // schedule notes that fit within a short lookahead window
      const lookahead = 0.2;
      while (this._queue.length > 0 && this._nextNoteTime < now + lookahead) {
        const trade = this._queue.shift();
        this._scheduleNote(trade, this._nextNoteTime);
        const dur = this._mapDuration(trade.quantity);
        this._nextNoteTime += dur + gap;
      }

      // if queue is overflowing, drop oldest trades
      const maxQueued = this._config.get("maxNotesPerSec");
      if (this._queue.length > maxQueued) {
        this._queue.splice(0, this._queue.length - maxQueued);
      }

      this._drainHandle = requestAnimationFrame(drain);
    };
    this._drainHandle = requestAnimationFrame(drain);
  }

  _scheduleNote(trade, time) {
    const freq = trade.isSell ? 288.380 : 432.081216;
    const vol = this._mapVolume(trade.quantity);
    const dur = this._mapDuration(trade.quantity);
    const gain = this._dbToGain(vol);
    const synth = trade.isSell ? this._sellSynth : this._buySynth;

    synth.triggerAttackRelease(freq, dur, time, gain);
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
