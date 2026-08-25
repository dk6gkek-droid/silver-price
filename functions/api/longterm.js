const DAY = 86400000;

function normalize(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map(row => {
    const date = row.day || row.date || row.timestamp || row.time;
    const price = Number(row.avg_price ?? row.price ?? row.close ?? row.max_price);
    return { date: String(date || ""), price };
  }).filter(x => x.date && Number.isFinite(x.price))
    .sort((a,b) => new Date(a.date) - new Date(b.date));
}

function nearest(points, target, direction = "any") {
  const t = new Date(target).getTime();
  let best = null, bestDiff = Infinity;
  for (const p of points) {
    const pt = new Date(p.date).getTime();
    if (!Number.isFinite(pt)) continue;
    if (direction === "after" && pt < t) continue;
    if (direction === "before" && pt > t) continue;
    const d = Math.abs(pt - t);
    if (d < bestDiff) { best = p; bestDiff = d; }
  }
  return best;
}

function cutoffPoints(points, years) {
  const cutoff = Date.now() - years * 365.25 * DAY;
  return points.filter(p => new Date(p.date).getTime() >= cutoff);
}

function totalReturn(points, years) {
  const arr = cutoffPoints(points, years);
  if (arr.length < 2) return null;
  return ((arr[arr.length - 1].price / arr[0].price) - 1) * 100;
}

function maxDrawdown(points, years) {
  const arr = cutoffPoints(points, years);
  if (arr.length < 2) return null;
  let peak = arr[0], worst = { drawdown: 0, peak: arr[0], trough: arr[0] };
  for (const p of arr) {
    if (p.price > peak.price) peak = p;
    const dd = ((p.price / peak.price) - 1) * 100;
    if (dd < worst.drawdown) worst = { drawdown: dd, peak, trough: p };
  }
  return {
    value: worst.drawdown,
    peakDate: worst.peak.date,
    peakPrice: worst.peak.price,
    troughDate: worst.trough.date,
    troughPrice: worst.trough.price
  };
}

function monthly(points) {
  const map = new Map();
  for (const p of points) {
    const d = new Date(p.date);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}`;
    map.set(key, p); // last available observation of month
  }
  return [...map.values()];
}

function normalizedRange(points, start, end) {
  const s = nearest(points, start, "after");
  const e = nearest(points, end, "before");
  if (!s || !e || new Date(s.date) > new Date(e.date)) return null;
  const subset = points.filter(p => new Date(p.date) >= new Date(s.date) && new Date(p.date) <= new Date(e.date));
  const base = s.price;
  return {
    start: s,
    end: e,
    change: ((e.price / s.price) - 1) * 100,
    series: monthly(subset).map(p => ({ date: p.date, index: (p.price / base) * 100 }))
  };
}

async function fetchMetal(symbol, env) {
  const now = Math.floor(Date.now()/1000);
  const start = now - Math.round(8500 * 86400);
  const u = new URL("https://api.gold-api.com/history");
  u.searchParams.set("symbol", symbol);
  u.searchParams.set("startTimestamp", String(start));
  u.searchParams.set("endTimestamp", String(now));
  u.searchParams.set("groupBy", "day");
  u.searchParams.set("aggregation", "avg");
  u.searchParams.set("orderBy", "asc");
  const res = await fetch(u.toString(), {
    headers: { "x-api-key": env.GOLD_API_KEY, "Accept":"application/json" },
    cf: { cacheTtl: 21600, cacheEverything: true }
  });
  if (!res.ok) throw new Error(`${symbol} history ${res.status}`);
  return normalize(await res.json());
}

export async function onRequestGet(context) {
  const { env } = context;
  if (!env.GOLD_API_KEY) {
    return Response.json({ error:"GOLD_API_KEY is not configured" }, { status:503 });
  }

  try {
    const [silver, gold] = await Promise.all([
      fetchMetal("XAG", env),
      fetchMetal("XAU", env)
    ]);
    if (silver.length < 20 || gold.length < 20) throw new Error("insufficient history");

    const years = [5,10,20];
    const metrics = {};
    for (const y of years) {
      metrics[y] = {
        silverReturn: totalReturn(silver, y),
        goldReturn: totalReturn(gold, y),
        silverMdd: maxDrawdown(silver, y),
        goldMdd: maxDrawdown(gold, y)
      };
    }

    const cycles = [
      { id:"2004-2006", label:"2004~2006", start:"2004-06-30", end:"2006-06-29" },
      { id:"2015-2018", label:"2015~2018", start:"2015-12-17", end:"2018-12-20" },
      { id:"2022-2023", label:"2022~2023", start:"2022-03-17", end:"2023-07-27" }
    ].map(c => ({
      ...c,
      silver: normalizedRange(silver, c.start, c.end),
      gold: normalizedRange(gold, c.start, c.end)
    }));

    const start20 = Date.now() - 20 * 365.25 * DAY;
    const silver20 = monthly(silver.filter(p => new Date(p.date).getTime() >= start20));
    const gold20 = monthly(gold.filter(p => new Date(p.date).getTime() >= start20));
    const silverBase = silver20[0]?.price;
    const goldBase = gold20[0]?.price;
    const mapGold = new Map(gold20.map(p => [p.date.slice(0,7), p]));
    const comparison = silver20.map(s => {
      const key = s.date.slice(0,7);
      const g = mapGold.get(key);
      if (!g || !silverBase || !goldBase) return null;
      return {
        date: s.date,
        silverIndex: (s.price/silverBase)*100,
        goldIndex: (g.price/goldBase)*100
      };
    }).filter(Boolean);

    return Response.json({
      generatedAt: new Date().toISOString(),
      basis: "Gold API daily average XAG/USD and XAU/USD",
      metrics,
      comparison,
      cycles
    }, {
      headers:{ "Cache-Control":"public, max-age=21600, s-maxage=21600" }
    });
  } catch (err) {
    return Response.json(
      { error:"longterm_analysis_failed", detail:String(err?.message || err) },
      { status:502, headers:{ "Cache-Control":"no-store" } }
    );
  }
}