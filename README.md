# audio-trading

Real-time audio sonification of BTC-USDT trades from Binance. Each trade is mapped to a synthesized note — buys and sells get distinct pitches (A=432 Hz and a perfect fifth below), with volume and duration scaled by trade size. Large "whale" trades trigger chords and visual alerts.

## Features

- **Trade sonification** — buys and sells as distinct tones, stereo-panned left/right
- **Whale detection** — two-tier system plays chords for large trades with screen flash effects
- **Imbalance drone** — a continuous tone whose pitch shifts based on buy/sell volume imbalance
- **CVD visualization** — cumulative volume delta chart with color-coded buy/sell pressure
- **Particle visualization** — canvas-based trade particles positioned by price, sized by quantity
- **Configurable** — full control panel for synth waveform, ADSR envelope, volume mapping, timing, spatial panning, whale thresholds, and imbalance settings. Config persists in localStorage.

## Quick start

```sh
bun install
bun dev
```

Open `http://localhost:3000` and click **Start Audio**.

## Architecture

```
src/
├── server.ts              # Bun HTTP + WebSocket server, connects to Binance trade stream
├── types.ts               # Shared TypeScript types
└── public/
    ├── index.html          # Entry point
    ├── style.css           # Dark terminal-style UI
    ├── config.js           # ConfigManager with schema-driven UI builder
    ├── audio-engine.js     # Tone.js synth engine, ImbalanceTracker, PriceTracker
    └── trade-viz.js        # Canvas particle system and CVD chart
```

The server proxies the Binance `btcusdt@trade` WebSocket stream and re-broadcasts parsed trades to browser clients over a local WebSocket. The browser handles all audio synthesis (via Tone.js) and visualization (via Canvas 2D).

## Requirements

- [Bun](https://bun.sh) runtime
