const ONE_DAY = 24 * 60 * 60;

function headersForHistory() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": `public, max-age=${ONE_DAY}, s-maxage=${ONE_DAY}, stale-while-revalidate=${ONE_DAY}, stale-if-error=${7 * ONE_DAY}`
  };
}

async function fetchWithTimeout(url, options = {}, ms = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const daysRaw = Number(url.searchParams.get("days") || "370");
  const days = Math.min(Math.max(Math.round(daysRaw), 7), 9000);
  const symbolRaw = (url.searchParams.get("symbol") || "XAG").toUpperCase();
  const symbol = ["XAG", "XAU"].includes(symbolRaw) ? symbolRaw : "XAG";

  if (!env.GOLD_API_KEY) {
    return Response.json(
      { error: "GOLD_API_KEY is not configured" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const start = now - days * 86400;

  const upstream = new URL("https://api.gold-api.com/history");
  upstream.searchParams.set("symbol", symbol);
  upstream.searchParams.set("startTimestamp", String(start));
  upstream.searchParams.set("endTimestamp", String(now));
  upstream.searchParams.set("groupBy", "day");
  upstream.searchParams.set("aggregation", "avg");
  upstream.searchParams.set("orderBy", "asc");

  try {
    const res = await fetchWithTimeout(upstream.toString(), {
      headers: { "x-api-key": env.GOLD_API_KEY, "Accept": "application/json" },
      cf: { cacheTtl: ONE_DAY, cacheEverything: true }
    });

    const data = await res.text();

    if (!res.ok) {
      return Response.json(
        { error: "history_upstream_failed", status: res.status, symbol, detail: data.slice(0, 200) },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }

    return new Response(data, { headers: headersForHistory() });
  } catch (err) {
    return Response.json(
      { error: "history_endpoint_failed", detail: String(err?.message || err) },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
