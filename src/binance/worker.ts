import { sseManager } from "./ssseManager.js";

export function emitDebug(marketId: number, payload: any) {
  sseManager.publish(`market:${marketId}:ticker`, payload);
}
