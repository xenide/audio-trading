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
      maxNotesPerSec: { default: 30, min: 5, max: 100, step: 1, unit: "n/s", label: "Max Notes/sec" },
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
            this.set(key, e.target.value);
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
