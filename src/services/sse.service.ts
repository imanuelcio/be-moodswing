import { EventEmitter } from "events";

type MarketStreamEvent = {
  market_id: number;
  interval: string;
  payload: any; // bebas: bisa candle partial/close
};

class Bus extends EventEmitter {}
export const eventBus = new Bus();

// Helper untuk channel per-market
export const marketChannel = (marketId: number) => `market:${marketId}`;
