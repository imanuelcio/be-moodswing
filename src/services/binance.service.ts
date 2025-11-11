export async function fetchBinanceLatest(symbol: string) {
  try {
    const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol.toUpperCase()}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const j = await res.json();
    return {
      price: j.lastPrice ?? j.last?.price ?? null,
      volume: j.volume ?? null,
      quoteVolume: j.quoteVolume ?? null,
      highPrice: j.highPrice,
      lowPrice: j.lowPrice,
      ts: Date.now(),
    };
  } catch (e) {
    return null;
  }
}
