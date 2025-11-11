import WebSocket from "ws";
import { CandleRepository } from "./repo.js";
import { sseManager, type SSEClient } from "./ssseManager.js";
import { topics } from "./topics.js";

interface MarketStream {
  ws: WebSocket;
  marketId: number;
  symbol: string;
  interval: string;
}

const streams = new Map<number, MarketStream>();
const candleRepo = new CandleRepository();

export function ensureBinancePriceStream(
  marketId: number,
  symbol: string,
  interval = "1m"
) {
  if (streams.has(marketId)) return;

  const ws = new WebSocket(
    `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@kline_${interval}`
  );

  ws.on("open", () =>
    console.log(`✅ Binance WS connected for market ${marketId}`)
  );

  ws.on("close", () => {
    console.log(`🔌 Binance WS closed for market ${marketId}`);
    streams.delete(marketId); // Clean up on close
  });

  // ✅ ADD: Handle WebSocket errors
  ws.on("error", (err) => {
    console.error(`❌ Binance WS error for market ${marketId}:`, err.message);
    // Don't crash, just log
  });

  ws.on("message", async (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      if (data.e !== "kline") return;
      const k = data.k;

      const candle = {
        open_time: new Date(k.t).toISOString(),
        close_time: new Date(k.T).toISOString(),
        open: k.o,
        high: k.h,
        low: k.l,
        close: k.c,
        base_volume: k.v,
        quote_volume: k.q,
        trades_count: k.n,
        is_closed: k.x,
      };

      // simpan ke Supabase
      await candleRepo.upsertCandle(marketId, interval, candle);

      // publish ke SSE
      sseManager.publish(topics.marketTicker(marketId), {
        type: "kline.tick",
        interval,
        data: candle,
      });
    } catch (error) {
      console.error(`Error processing Binance message:`, error);
    }
  });

  streams.set(marketId, { ws, marketId, symbol, interval });
}

export function releaseBinancePriceStream(marketId: number) {
  const stream = streams.get(marketId);
  if (!stream) return;

  console.log(`🧹 Releasing Binance stream for market ${marketId}`);

  // ✅ CRITICAL FIX: Check WebSocket state before closing
  const ws = stream.ws;
  const state = ws.readyState;

  console.log(`   WebSocket state: ${state} (${getReadyStateText(state)})`);

  // Only close if WebSocket is actually open or closing
  if (state === WebSocket.OPEN || state === WebSocket.CLOSING) {
    try {
      ws.close();
      console.log(`   ✅ WebSocket closed`);
    } catch (err) {
      console.error(`   ❌ Error closing WebSocket:`, err);
    }
  } else if (state === WebSocket.CONNECTING) {
    // If still connecting, terminate it forcefully
    console.log(`   ⚠️ WebSocket still connecting, terminating...`);
    try {
      ws.terminate(); // Force close without handshake
      console.log(`   ✅ WebSocket terminated`);
    } catch (err) {
      console.error(`   ❌ Error terminating WebSocket:`, err);
    }
  } else {
    console.log(`   ℹ️ WebSocket already closed`);
  }

  streams.delete(marketId);
}

// Helper function to get readable state text
function getReadyStateText(state: number): string {
  switch (state) {
    case WebSocket.CONNECTING:
      return "CONNECTING";
    case WebSocket.OPEN:
      return "OPEN";
    case WebSocket.CLOSING:
      return "CLOSING";
    case WebSocket.CLOSED:
      return "CLOSED";
    default:
      return "UNKNOWN";
  }
}

// Optional: Get stream status
export function getStreamStatus(marketId: number) {
  const stream = streams.get(marketId);
  if (!stream) {
    return { exists: false };
  }

  return {
    exists: true,
    marketId: stream.marketId,
    symbol: stream.symbol,
    interval: stream.interval,
    readyState: stream.ws.readyState,
    readyStateText: getReadyStateText(stream.ws.readyState),
  };
}

// Optional: Get all streams status
export function getAllStreamsStatus() {
  return Array.from(streams.entries()).map(([marketId, stream]) => ({
    marketId,
    symbol: stream.symbol,
    interval: stream.interval,
    readyState: stream.ws.readyState,
    readyStateText: getReadyStateText(stream.ws.readyState),
  }));
}
