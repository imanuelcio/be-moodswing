type Relay = {
  abort: AbortController;
  readers: number;
};
const relays = new Map<string, Relay>();

// util: publish dengan try/catch + minimal log
function safePublish(publish: (p: any) => void, payload: any) {
  try {
    publish(payload);
  } catch (e) {
    console.error("publish failed", e);
  }
}

export async function ensureHermesPriceStream(
  priceId: string,
  symbol: string,
  publish: (payload: any) => void
) {
  // If already streaming this priceId, just bump readers
  const existing = relays.get(priceId);
  if (existing) {
    existing.readers++;
    return;
  }

  let attempt = 0;
  let closed = false;

  const start = async () => {
    attempt++;
    const abort = new AbortController();
    relays.set(priceId, { abort, readers: 1 });

    const url =
      `https://hermes.pyth.network/v2/updates/price/stream` +
      `?ids[]=${priceId}&parsed=true&benchmarks_only=false&speed=fast`;

    console.info("[Hermes] connecting", { priceId, symbol, attempt });
    let res: Response;
    try {
      res = await fetch(url, {
        signal: abort.signal,
        headers: { Accept: "text/event-stream" }, // <- penting di beberapa env
        // keepalive: true,                             // opsional
      });
    } catch (err) {
      console.warn("[Hermes] connect error", { priceId, err });
      await backoff(attempt);
      if (!closed) return start();
      return;
    }

    if (!res.ok || !res.body) {
      console.warn("[Hermes] bad response", { status: res?.status });
      await backoff(attempt);
      if (!closed) return start();
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    console.info("[Hermes] connected", { priceId });

    // Buffer untuk menangani chunk pecah di tengah baris
    let buffer = "";

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        buffer += text;

        // Potong per-baris (tangani \r\n)
        const lines = buffer.split(/\r?\n/);
        // sisakan last partial line di buffer
        buffer = lines.pop() ?? "";

        for (let raw of lines) {
          const line = raw.trim(); // <- TRIM supaya " data:" juga lolos
          if (!line) continue;

          // SSE format bisa: "event: x", "data: y". Kita hanya peduli "data:"
          if (line.toLowerCase().startsWith("data:")) {
            const jsonStr = line.slice(line.indexOf(":") + 1).trim();

            // (opsional) debug raw
            // safePublish(publish, { kind: 'hermes_raw', raw: jsonStr })

            let msg: any;
            try {
              msg = JSON.parse(jsonStr);
            } catch {
              continue;
            }

            const out = extractFromParsed(msg);
            if (!out) continue;

            safePublish(publish, {
              symbol,
              priceId,
              source: "PYTH/HERMES",
              price: out.price, // string sudah ter-scaling, presisi utuh
              conf: out.conf,
              ts: new Date(out.tsSec * 1000).toISOString(),
            });
          }
        }
      }
    } catch (err) {
      console.warn("[Hermes] stream error", { priceId, err });
    } finally {
      // only delete if no one reuses it
      relays.delete(priceId);
      if (!closed) {
        await backoff(attempt);
        return start();
      }
    }
  };

  await start();

  // helper backoff
  async function backoff(n: number) {
    const ms = Math.min(30000, 500 * Math.pow(2, n - 1)); // 0.5s, 1s, 2s, ... max 30s
    await new Promise((r) => setTimeout(r, ms));
  }
}

// panggil saat client terakhir detach
export function releaseHermesPriceStream(priceId: string) {
  const r = relays.get(priceId);
  if (!r) return;
  r.readers--;
  if (r.readers <= 0) {
    console.info("[Hermes] closing", { priceId });
    r.abort.abort();
    relays.delete(priceId);
  }
}

// hermes-latest.ts
export async function fetchHermesLatest(priceId: string) {
  const url =
    `https://hermes.pyth.network/v2/updates/price/latest` +
    `?ids[]=${priceId}&parsed=true&ignore_invalid_price_ids=false`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Hermes latest failed: ${res.status}`);
  const json = await res.json();

  // bentuk payload umum { price, conf, ts }
  // struktur Hermes bisa berbeda-beda; ambil yang aman
  const item = Array.isArray(json.parsed) ? json.parsed[0] : json;
  const price = item?.price?.price ?? item?.price?.priceMessage?.price ?? null;
  const conf = item?.price?.conf ?? item?.price?.priceMessage?.conf ?? null;
  const tsSec = item?.publishTime ?? Math.floor(Date.now() / 1000);

  if (price == null) return null;
  return { price, conf, ts: new Date(tsSec * 1000).toISOString() };
}

function scaleDecimal(intStr: string, expo: number): string {
  // aman secara presisi, return string "3891.47216721"
  if (expo === 0) return intStr;
  const neg = intStr.startsWith("-");
  const s = neg ? intStr.slice(1) : intStr;
  if (expo > 0) return (neg ? "-" : "") + s + "0".repeat(expo);

  const e = -expo;
  if (s.length <= e) {
    const z = "0".repeat(e - s.length);
    return (neg ? "-" : "") + "0." + z + s;
  }
  const idx = s.length - e;
  return (neg ? "-" : "") + s.slice(0, idx) + "." + s.slice(idx);
}

export function extractFromParsed(msg: any) {
  const node =
    (Array.isArray(msg?.parsed) && msg.parsed[0]) ??
    (Array.isArray(msg?.updates) && msg.updates[0]) ??
    msg;

  // bentuk yang kamu lihat: node.price.{price, conf, expo, publish_time}
  const id = node?.id ?? node?.price_id ?? node?.price?.id;
  const pObj = node?.price;
  if (!pObj || pObj.price == null || pObj.expo == null) return null;

  const priceStr = String(pObj.price); // "389147216721"
  const confStr = pObj.conf != null ? String(pObj.conf) : null;
  const expo = Number(pObj.expo); // -8
  const tsSec = Number(
    pObj.publish_time ?? msg?.publishTime ?? Date.now() / 1000
  );

  return {
    id,
    price: scaleDecimal(priceStr, expo), // "3891.47216721"
    conf: confStr != null ? scaleDecimal(confStr, expo) : null,
    tsSec,
  };
}
