const DAY = 24 * 60 * 60;
const KB_URL = "https://obank.kbstar.com/quics?page=C039209";
const KB_GUIDE = "https://obank.kbstar.com/quics?page=C039198";

function n(v) {
  const x = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(x) ? x : null;
}

function stripHtml(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseKb(html) {
  const text = stripHtml(html);
  const dateMatch = text.match(/고시기준일\s*[:：]?\s*(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})/);
  const rowMatch = text.match(/(\d{2}:\d{2}:\d{2})\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)/);
  if (!dateMatch || !rowMatch) return null;

  const basisPerGram = n(rowMatch[2]);
  const customerBuy = n(rowMatch[3]);
  const customerSell = n(rowMatch[4]);
  const silverUsd = n(rowMatch[5]);
  const usdKrw = n(rowMatch[6]);
  if (![basisPerGram, customerBuy, customerSell, silverUsd, usdKrw].every(Number.isFinite)) return null;

  const date = `${dateMatch[1]}-${String(dateMatch[2]).padStart(2,"0")}-${String(dateMatch[3]).padStart(2,"0")}`;
  const theoretical1kg = basisPerGram * 1000;
  const vatOnly1kg = theoretical1kg * 1.10;
  const premiumPct = (customerBuy / theoretical1kg - 1) * 100;
  const overVatPct = (customerBuy / vatOnly1kg - 1) * 100;
  const roundTripGapPct = (1 - customerSell / customerBuy) * 100;

  return {
    mode: "actual",
    date,
    time: rowMatch[1],
    basisPerGram,
    theoretical1kg,
    vatOnly1kg,
    customerBuy,
    customerSell,
    silverUsd,
    usdKrw,
    premiumPct,
    overVatPct,
    roundTripGapPct,
    source: "KB국민은행 실버바 가격조회",
    sourceUrl: KB_URL,
    guideUrl: KB_GUIDE
  };
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const r = await fetch(url, {...options, signal: controller.signal});
    if (!r.ok) throw new Error(`${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

async function calculatedFallback(env) {
  const [metal, fx] = await Promise.all([
    fetchJson("https://api.gold-api.com/price/XAG", {
      headers: {"x-api-key": env.GOLD_API_KEY, "Accept":"application/json"},
      cf: {cacheTtl: DAY, cacheEverything:true}
    }),
    fetchJson("https://api.frankfurter.dev/v2/rate/USD/KRW", {
      headers: {"Accept":"application/json"},
      cf: {cacheTtl: DAY, cacheEverything:true}
    })
  ]);

  const silverUsd = Number(metal.price ?? metal.ask ?? metal.bid ?? metal.value);
  const usdKrw = Number(fx.rate ?? fx.rates?.KRW);
  if (!Number.isFinite(silverUsd) || !Number.isFinite(usdKrw)) throw new Error("fallback data missing");

  const basisPerGram = silverUsd * usdKrw / 31.1034768;
  const theoretical1kg = basisPerGram * 1000;
  const vatOnly1kg = theoretical1kg * 1.10;
  // KB official guide: sales margin 19%, customer purchase price is VAT-inclusive.
  const customerBuy = theoretical1kg * 1.19 * 1.10;
  const customerSell = theoretical1kg * 0.93;

  return {
    mode: "estimate",
    date: new Date().toISOString().slice(0,10),
    time: null,
    basisPerGram,
    theoretical1kg,
    vatOnly1kg,
    customerBuy,
    customerSell,
    silverUsd,
    usdKrw,
    premiumPct: (customerBuy / theoretical1kg - 1) * 100,
    overVatPct: (customerBuy / vatOnly1kg - 1) * 100,
    roundTripGapPct: (1 - customerSell / customerBuy) * 100,
    source: "KB 공식 계산구조 기준 예상가",
    sourceUrl: KB_URL,
    guideUrl: KB_GUIDE
  };
}

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    let parsed = null;
    try {
      const r = await fetch(KB_URL, {
        headers: {
          "Accept": "text/html,application/xhtml+xml",
          "User-Agent": "Mozilla/5.0 (compatible; SilverToday/1.0; +https://silver-today.com/)"
        },
        signal: controller.signal,
        cf: {cacheTtl: DAY, cacheEverything:true}
      });
      if (r.ok) parsed = parseKb(await r.text());
    } finally {
      clearTimeout(timer);
    }

    const data = parsed ?? await calculatedFallback(env);
    return Response.json({
      ...data,
      fetchedAt: new Date().toISOString(),
      cachePolicy: "24 hours"
    }, {
      headers: {
        "Cache-Control": `public, max-age=${DAY}, s-maxage=${DAY}, stale-while-revalidate=${DAY}, stale-if-error=${7*DAY}`
      }
    });
  } catch (err) {
    return Response.json(
      {error:"premium_endpoint_failed", detail:String(err?.message || err)},
      {status:502, headers:{"Cache-Control":"no-store"}}
    );
  }
}
