export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const daysRaw = Number(url.searchParams.get("days") || "370");
  const days = Math.min(Math.max(Math.round(daysRaw), 7), 3700);

  if (!env.GOLD_API_KEY) {
    return Response.json(
      { error: "GOLD_API_KEY is not configured" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const start = now - days * 86400;

  const upstream = new URL("https://api.gold-api.com/history");
  upstream.searchParams.set("symbol", "XAG");
  upstream.searchParams.set("startTimestamp", String(start));
  upstream.searchParams.set("endTimestamp", String(now));
  upstream.searchParams.set("groupBy", "day");
  upstream.searchParams.set("aggregation", "avg");
  upstream.searchParams.set("orderBy", "asc");

  const res = await fetch(upstream.toString(), {
    headers: { "x-api-key": env.GOLD_API_KEY }
  });

  if (!res.ok) {
    return Response.json(
      { error: "Silver history upstream failed", status: res.status },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }

  const data = await res.text();
  return new Response(data, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // 과거 일봉은 자주 바뀌지 않으므로 1시간 캐시
      "Cache-Control": "public, max-age=3600, s-maxage=3600"
    }
  });
}