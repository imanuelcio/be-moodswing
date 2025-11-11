import type { Hono } from "hono";
import { eventBus, marketChannel } from "../services/sse.service.js";

export function debugRoutes(app: Hono) {
  app.post("/debug/sse/emit/:id", async (c) => {
    const marketId = Number(c.req.param("id"));
    if (!marketId) return c.text("invalid id", 400);
    const body = await c.req.json().catch(() => ({}));
    const payload = body.payload ?? {
      test: "hello from debug",
      ts: Date.now(),
    };

    eventBus.emit(marketChannel(marketId), payload);
    return c.json({ ok: true, marketId, payload });
  });
}
