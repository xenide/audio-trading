# CLAUDE.md

## Project overview

Real-time BTC-USDT trade sonification app. Bun server proxies Binance WebSocket trades to browser clients. Browser uses Tone.js for audio synthesis and Canvas 2D for visualization.

## Commands

- `bun dev` — start dev server with hot reload (port 3000)
- `bun install` — install dependencies

## Architecture

- `src/server.ts` — Bun HTTP server + WebSocket relay from Binance `btcusdt@trade` stream
- `src/types.ts` — shared TypeScript interfaces (`BinanceTrade`, `TradeEvent`, `ServerMessage`)
- `src/public/` — static frontend files served directly by the Bun server
  - `audio-engine.js` — `AudioEngine`, `PriceTracker`, `ImbalanceTracker` classes using Tone.js
  - `config.js` — `ConfigManager` with `CONFIG_SCHEMA` for schema-driven UI
  - `trade-viz.js` — `TradeViz` canvas particle system and CVD chart
  - `index.html` — entry point, wires up config/engine/viz and WebSocket client
  - `style.css` — dark monospace terminal aesthetic

## Key conventions

- Frontend is vanilla JS (no build step, no bundler) — classes in global scope
- Tone.js loaded via CDN (`https://cdn.jsdelivr.net/npm/tone@15.0.4`)
- A=432 Hz tuning: buy = 432.081216 Hz, sell = 288.054144 Hz (perfect fifth below)
- Config persisted in `localStorage` under key `audio-trading-config`
- Server auto-reconnects to Binance on disconnect (3s delay)
