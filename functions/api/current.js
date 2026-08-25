export async function onRequestGet(context) {
  const { env } = context;

  if (!env.GOLD_API_KEY) {
    return Response.json(
      { error: "GOLD_API_KEY is not configured" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const [silverRes, fxRes] = await Promise.all([
      fetch("https://api.gold-api.com/price/XAG", {
        headers: {
          "x-api-key": env.GOLD_API_KEY,
          "Accept": "application/json"
        },
        cf: { cacheTtl: 300, cacheEverything: true }
      }),
      fetch("https://api.frankfurter.dev/v2/rate/USD/KRW", {
        headers: { "Accept": "application/json" },
        cf: { cacheTtl: 1800, cacheEverything: true }
      })
    ]);

    const silverText = await silverRes.text();
    const fxText = await fxRes.text();

    if (!silverRes.ok) {
      return Response.json(
        { error: "silver_upstream_failed", status: silverRes.status, detail: silverText.slice(0, 200) },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }

    if (!fxRes.ok) {
      return Response.json(
        { error: "fx_upstream_failed", status: fxRes.status, detail: fxText.slice(0, 200) },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }

    let silver, fx;
    try { silver = JSON.parse(silverText); }
    catch {
      return Response.json(
        { error: "silver_invalid_json", detail: silverText.slice(0, 200) },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }

    try { fx = JSON.parse(fxText); }
    catch {
      return Response.json(
        { error: "fx_invalid_json", detail: fxText.slice(0, 200) },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }

    const xagUsd = Number(silver.price ?? silver.ask ?? silver.bid ?? silver.value);
    const usdKrw = Number(
      fx.rate ??
      fx.rates?.KRW ??
      (Array.isArray(fx) ? fx.find(x => x.quote === "KRW")?.rate : undefined)
    );

    if (!Number.isFinite(xagUsd)) {
      return Response.json({ error: "silver_price_missing" }, { status: 502 });
    }
    if (!Number.isFinite(usdKrw)) {
      return Response.json({ error: "fx_rate_missing" }, { status: 502 });
    }

    return Response.json({
      xagUsd,
      usdKrw,
      updatedAt: silver.updatedAt || silver.timestamp || new Date().toISOString(),
      source: { silver: "Gold API", fx: "Frankfurter" }
    }, {
      headers: { "Cache-Control": "public, max-age=300, s-maxage=300" }
    });

  } catch (err) {
    return Response.json(
      { error: "current_endpoint_failed", detail: String(err?.message || err) },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}