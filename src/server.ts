import { type ServerWebSocket } from "bun";
import type { BinanceTrade, TradeEvent, ServerMessage } from "./types";

const PORT = parseInt(process.env.PORT || "3000");
const BINANCE_WS_URL = "wss://stream.binance.com:9443/ws/btcusdt@trade";
const RECONNECT_DELAY = 3000;
const PUBLIC_DIR = import.meta.dir + "/public";

let binanceConnected = false;

function connectBinance(server: ReturnType<typeof Bun.serve>) {
  const ws = new WebSocket(BINANCE_WS_URL);

  ws.onopen = () => {
    binanceConnected = true;
    console.log("[binance] connected");
    const msg: ServerMessage = { type: "status", connected: true };
    server.publish("trades", JSON.stringify(msg));
  };

  ws.onmessage = (event) => {
    try {
      const raw: BinanceTrade = JSON.parse(event.data as string);
      const trade: TradeEvent = {
        price: parseFloat(raw.p),
        quantity: parseFloat(raw.q),
        isSell: raw.m,
        timestamp: raw.T,
        tradeId: raw.t,
      };
      const msg: ServerMessage = { type: "trade", data: trade };
      server.publish("trades", JSON.stringify(msg));
    } catch {
      // skip malformed messages
    }
  };

  ws.onclose = () => {
    binanceConnected = false;
    console.log(`[binance] disconnected, reconnecting in ${RECONNECT_DELAY}ms`);
    const msg: ServerMessage = { type: "status", connected: false };
    server.publish("trades", JSON.stringify(msg));
    setTimeout(() => connectBinance(server), RECONNECT_DELAY);
  };

  ws.onerror = (err) => {
    console.error("[binance] error:", err);
    ws.close();
  };
}

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
};

const server = Bun.serve<{}>({
  port: PORT,
  hostname: "0.0.0.0",
  async fetch(req, server) {
    const url = new URL(req.url);

    if (url.pathname === "/ws") {
      if (server.upgrade(req)) return;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    // static file serving
    const filePath = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = Bun.file(PUBLIC_DIR + filePath);
    if (!(await file.exists())) return new Response("Not found", { status: 404 });

    const ext = filePath.substring(filePath.lastIndexOf("."));
    return new Response(file, {
      headers: {
        "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      },
    });
  },
  websocket: {
    open(ws: ServerWebSocket<{}>) {
      ws.subscribe("trades");
      const msg: ServerMessage = { type: "status", connected: binanceConnected };
      ws.send(JSON.stringify(msg));
    },
    close(ws: ServerWebSocket<{}>) {
      ws.unsubscribe("trades");
    },
    message() {
      // clients don't send messages
    },
  },
});

console.log(`[server] listening on http://localhost:${PORT}`);
connectBinance(server);
