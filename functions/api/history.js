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
    const res = await fetch(upstream.toString(), {
      headers: { "x-api-key": env.GOLD_API_KEY, "Accept": "application/json" },
      cf: { cacheTtl: 21600, cacheEverything: true }
    });

    if (!res.ok) {
      return Response.json(
        { error: "Metal history upstream failed", status: res.status, symbol },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }

    const data = await res.text();
    return new Response(data, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=21600, s-maxage=21600"
      }
    });
  } catch (err) {
    return Response.json(
      { error: "history_endpoint_failed", detail: String(err?.message || err) },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}