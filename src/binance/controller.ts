import type { Context } from "hono";
import { sseManager } from "./ssseManager.js";
import {
  ensureBinancePriceStream,
  releaseBinancePriceStream,
} from "./service.js";
import { topics } from "./topics.js";
import { MarketRepository } from "../repo/market.repo.js";

export class BinanceController {
  constructor(private marketService = new MarketRepository()) {}

  async streamMarketTicker(c: Context) {
    const marketId = parseInt(c.req.param("id"));
    const market = await this.marketService.findById(marketId as any);
    const symbol = market?.binance_symbol;
    if (!symbol) return c.json({ error: "symbol query param required" }, 400);

    const clientId = `binance-${marketId}-${Date.now()}`;

    const { client, response } = sseManager.createSSEConnection(c, clientId);
    sseManager.subscribeToTopic(clientId, topics.marketTicker(marketId));
    // start Binance WS
    ensureBinancePriceStream(marketId, symbol);

    // close client on abort
    c.req.raw.signal?.addEventListener("abort", () => {
      sseManager.closeClient(clientId);
      try {
        releaseBinancePriceStream(marketId);
      } catch (err) {
        console.error(err);
      }
    });

    return response;
  }
}
