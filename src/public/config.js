const CONFIG_SCHEMA = {
  volume: {
    label: "Volume",
    params: {
      volumeMin: { default: -30, min: -60, max: 6, step: 1, unit: "dB", label: "Min Volume" },
      volumeMax: { default: 0, min: -60, max: 6, step: 1, unit: "dB", label: "Max Volume" },
      volumeQuantityRef: { default: 1.0, min: 0.001, max: 10, step: 0.001, unit: "BTC", label: "Ref Quantity" },
      masterVolume: { default: -6, min: -40, max: 6, step: 1, unit: "dB", label: "Master Volume" },
    },
  },
  spatial: {
    label: "Spatial",
    params: {
      panWidth: { default: 0.8, min: 0, max: 1.0, step: 0.05, unit: "", label: "Stereo Width" },
    },
  },
  timing: {
    label: "Timing",
    params: {
      durationMin: { default: 0.05, min: 0.01, max: 2.0, step: 0.01, unit: "s", label: "Min Duration" },
      durationMax: { default: 0.4, min: 0.01, max: 2.0, step: 0.01, unit: "s", label: "Max Duration" },
      noteGap: { default: 0.03, min: 0, max: 0.5, step: 0.01, unit: "s", label: "Note Gap" },
      maxNotesPerSec: { default: 30, min: 5, max: 100, step: 1, unit: "n/s", label: "Max Queue" },
    },
  },
  synth: {
    label: "Synth",
    params: {
      synthType: { default: "sine", options: ["sine", "triangle", "square", "sawtooth", "fmsine", "amsine"], label: "Waveform" },
      attack: { default: 0.01, min: 0.001, max: 1.0, step: 0.001, unit: "s", label: "Attack" },
      decay: { default: 0.1, min: 0.01, max: 1.0, step: 0.01, unit: "s", label: "Decay" },
      sustain: { default: 0.3, min: 0, max: 1.0, step: 0.01, unit: "", label: "Sustain" },
      release: { default: 0.2, min: 0.01, max: 2.0, step: 0.01, unit: "s", label: "Release" },
    },
  },
  filter: {
    label: "Filter",
    params: {
      minTradeSize: { default: 0.001, min: 0, max: 10, step: 0.001, unit: "BTC", label: "Min Trade Size" },
    },
  },
  whales: {
    label: "Whales",
    params: {
      whaleEnabled: { default: true, options: [true, false], label: "Enabled" },
      whaleTier1: { default: 0.5, min: 0.01, max: 1, step: 0.01, unit: "BTC", label: "Large Threshold", log: true },
      whaleTier2: { default: 2.0, min: 0.1, max: 50, step: 0.1, unit: "BTC", label: "Whale Threshold", log: true },
    },
  },
  imbalance: {
    label: "Imbalance",
    params: {
      imbalanceEnabled: { default: true, options: [true, false], label: "Enabled" },
      imbalanceWindow: { default: 10, min: 1, max: 60, step: 1, unit: "s", label: "Window" },
      imbalanceVolume: { default: -20, min: -60, max: 0, step: 1, unit: "dB", label: "Drone Volume" },
      imbalanceFreqCenter: { default: 160, min: 80, max: 300, step: 5, unit: "Hz", label: "Drone Freq" },
    },
  },
};

class ConfigManager {
  constructor() {
    this._values = {};
    this._listeners = [];
    this._load();
  }

  _load() {
    const defaults = {};
    for (const group of Object.values(CONFIG_SCHEMA)) {
      for (const [key, schema] of Object.entries(group.params)) {
        defaults[key] = schema.default;
      }
    }
    try {
      const saved = JSON.parse(localStorage.getItem("audio-trading-config") || "{}");
      this._values = { ...defaults, ...saved };
    } catch {
      this._values = defaults;
    }
  }

  get(key) {
    return this._values[key];
  }

  set(key, value) {
    this._values[key] = value;
    this._save();
    this._listeners.forEach((fn) => fn(key, value));
  }

  onChange(fn) {
    this._listeners.push(fn);
  }

  reset() {
    localStorage.removeItem("audio-trading-config");
    this._load();
    for (const [key, value] of Object.entries(this._values)) {
      this._listeners.forEach((fn) => fn(key, value));
    }
  }

  _save() {
    localStorage.setItem("audio-trading-config", JSON.stringify(this._values));
  }

  buildUI(container) {
    container.innerHTML = "";

    for (const [groupKey, group] of Object.entries(CONFIG_SCHEMA)) {
      const section = document.createElement("div");
      section.className = "config-group";
      section.innerHTML = `<h3>${group.label}</h3>`;

      for (const [key, schema] of Object.entries(group.params)) {
        const row = document.createElement("div");
        row.className = "config-row";

        if (schema.options) {
          row.innerHTML = `
            <label>${schema.label}</label>
            <select data-key="${key}">
              ${schema.options.map((o) => `<option value="${o}" ${this.get(key) === o ? "selected" : ""}>${o}</option>`).join("")}
            </select>
          `;
          row.querySelector("select").addEventListener("change", (e) => {
            let v = e.target.value;
            if (v === "true") v = true;
            else if (v === "false") v = false;
            this.set(key, v);
          });
        } else if (schema.log) {
          const val = this.get(key);
          const toSlider = (v) => 1000 * Math.log(v / schema.min) / Math.log(schema.max / schema.min);
          const fromSlider = (s) => schema.min * Math.pow(schema.max / schema.min, s / 1000);
          const fmt = (v) => {
            const rounded = parseFloat(v.toPrecision(3));
            return `${rounded}${schema.unit ? " " + schema.unit : ""}`;
          };
          row.innerHTML = `
            <label>${schema.label}</label>
            <input type="range" data-key="${key}" min="0" max="1000" step="1" value="${toSlider(val)}">
            <span class="config-value" data-display="${key}">${fmt(val)}</span>
          `;
          row.querySelector("input").addEventListener("input", (e) => {
            const v = fromSlider(parseFloat(e.target.value));
            this.set(key, v);
            row.querySelector(`[data-display="${key}"]`).textContent = fmt(v);
          });
        } else {
          const val = this.get(key);
          row.innerHTML = `
            <label>${schema.label}</label>
            <input type="range" data-key="${key}" min="${schema.min}" max="${schema.max}" step="${schema.step}" value="${val}">
            <span class="config-value" data-display="${key}">${val}${schema.unit ? " " + schema.unit : ""}</span>
          `;
          row.querySelector("input").addEventListener("input", (e) => {
            const v = parseFloat(e.target.value);
            this.set(key, v);
            row.querySelector(`[data-display="${key}"]`).textContent = `${v}${schema.unit ? " " + schema.unit : ""}`;
          });
        }
        section.appendChild(row);
      }
      container.appendChild(section);
    }

    const resetBtn = document.createElement("button");
    resetBtn.className = "reset-btn";
    resetBtn.textContent = "Reset to Defaults";
    resetBtn.addEventListener("click", () => {
      this.reset();
      this.buildUI(container);
    });
    container.appendChild(resetBtn);
  }
}
