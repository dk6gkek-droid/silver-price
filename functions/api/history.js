const DAY = 86400;
const RAW_TTL = 30 * DAY;
const RETRY_LOCK_TTL = 60 * 60;
const RAW_DAYS = 8500;

function cacheReq(path) {
  return new Request(`https://silver-today.com/__edgecache/${path}`, { method: "GET" });
}

function normalizeRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map(row => {
    const date = row.day || row.date || row.timestamp || row.time;
    const price = Number(row.avg_price ?? row.price ?? row.close ?? row.max_price);
    return { ...row, __date: String(date || ""), __price: price };
  }).filter(x => x.__date && Number.isFinite(x.__price))
    .sort((a,b) => new Date(a.__date) - new Date(b.__date));
}

async function readCache(request) {
  try {
    const hit = await caches.default.match(request);
    if (!hit) return null;
    return await hit.json();
  } catch {
    return null;
  }
}

async function writeCache(context, request, value, ttl = RAW_TTL) {
  const response = new Response(JSON.stringify(value), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${ttl}, s-maxage=${ttl}`
    }
  });
  const p = caches.default.put(request, response);
  if (context?.waitUntil) context.waitUntil(p);
  else await p;
}

async function lockRefresh(context, symbol) {
  const req = cacheReq(`lock-${symbol}-v36`);
  const existing = await caches.default.match(req);
  if (existing) return false;
  await writeCache(context, req, { at: Date.now() }, RETRY_LOCK_TTL);
  return true;
}

async function fetchUpstream(symbol, env) {
  const now = new Date();
  const end = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59) / 1000);
  const start = end - RAW_DAYS * 86400;
  const u = new URL("https://api.gold-api.com/history");
  u.searchParams.set("symbol", symbol);
  u.searchParams.set("startTimestamp", String(start));
  u.searchParams.set("endTimestamp", String(end));
  u.searchParams.set("groupBy", "day");
  u.searchParams.set("aggregation", "avg");
  u.searchParams.set("orderBy", "asc");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(u.toString(), {
      headers: { "x-api-key": env.GOLD_API_KEY, "Accept": "application/json" },
      signal: controller.signal
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${symbol} history ${res.status}: ${text.slice(0,120)}`);
    const json = JSON.parse(text);
    const rows = normalizeRows(json);
    if (rows.length < 20) throw new Error(`${symbol} insufficient history`);
    return rows;
  } finally {
    clearTimeout(timer);
  }
}

async function refreshRaw(symbol, env, context, freshnessSeconds) {
  const req = cacheReq(`raw-${symbol}-${RAW_DAYS}-v36`);
  const allowed = await lockRefresh(context, symbol);
  if (!allowed) return null;
  const rows = await fetchUpstream(symbol, env);
  const payload = { symbol, fetchedAt: new Date().toISOString(), freshnessSeconds, rows };
  await writeCache(context, req, payload, RAW_TTL);
  return payload;
}

async function getRaw(symbol, env, context, freshnessSeconds) {
  const req = cacheReq(`raw-${symbol}-${RAW_DAYS}-v36`);
  const cached = await readCache(req);

  if (cached?.rows?.length) {
    const age = Math.max(0, (Date.now() - new Date(cached.fetchedAt).getTime()) / 1000);
    const result = { ...cached, cacheState: age <= freshnessSeconds ? "fresh" : "stale", ageSeconds: Math.round(age) };

    if (age > freshnessSeconds && context?.waitUntil) {
      context.waitUntil(
        refreshRaw(symbol, env, context, freshnessSeconds).catch(() => null)
      );
    }
    return result;
  }

  return await refreshRaw(symbol, env, context, freshnessSeconds);
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const daysRaw = Number(url.searchParams.get("days") || "370");
  const days = Math.min(Math.max(Math.round(daysRaw), 7), RAW_DAYS);
  const symbolRaw = (url.searchParams.get("symbol") || "XAG").toUpperCase();
  const symbol = ["XAG","XAU"].includes(symbolRaw) ? symbolRaw : "XAG";

  if (!env.GOLD_API_KEY) {
    return Response.json({ error:"GOLD_API_KEY is not configured" }, { status:503, headers:{"Cache-Control":"no-store"} });
  }

  try {
    const freshness = symbol === "XAG" ? DAY : 2 * DAY;
    const raw = await getRaw(symbol, env, context, freshness);
    if (!raw?.rows?.length) throw new Error("history cache unavailable");

    const cutoff = Date.now() - days * 86400000;
    const sliced = raw.rows.filter(r => new Date(r.__date).getTime() >= cutoff)
      .map(({__date,__price,...rest}) => rest);

    return new Response(JSON.stringify(sliced), {
      headers: {
        "Content-Type":"application/json; charset=utf-8",
        "Cache-Control":"public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400, stale-if-error=604800",
        "X-Silver-Cache-State": raw.cacheState || "miss",
        "X-Silver-Cache-Age": String(raw.ageSeconds ?? 0)
      }
    });
  } catch (err) {
    return Response.json(
      { error:"history_endpoint_failed", detail:String(err?.message || err) },
      { status:502, headers:{"Cache-Control":"no-store"} }
    );
  }
}
