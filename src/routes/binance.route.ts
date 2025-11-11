import { Hono } from "hono";
import { BinanceController } from "../binance/controller.js";
const binance = new Hono();
const ctrl = new BinanceController();
binance.get("/markets/:id", (c) => ctrl.streamMarketTicker(c));

export default binance;
