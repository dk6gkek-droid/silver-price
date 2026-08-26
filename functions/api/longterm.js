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

const DAY_MS = 86400000;

function pts(raw) {
  return raw.rows.map(r => ({ date:r.__date, price:r.__price }));
}
function nearest(points, target, direction="any") {
  const t=new Date(target).getTime(); let best=null,diff=Infinity;
  for(const p of points){
    const pt=new Date(p.date).getTime();
    if(!Number.isFinite(pt))continue;
    if(direction==="after"&&pt<t)continue;
    if(direction==="before"&&pt>t)continue;
    const d=Math.abs(pt-t); if(d<diff){best=p;diff=d}
  }
  return best;
}
function cutoffPoints(points,years){
  const cutoff=Date.now()-years*365.25*DAY_MS;
  return points.filter(p=>new Date(p.date).getTime()>=cutoff);
}
function totalReturn(points,years){
  const a=cutoffPoints(points,years); if(a.length<2)return null;
  return ((a.at(-1).price/a[0].price)-1)*100;
}
function maxDrawdown(points,years){
  const a=cutoffPoints(points,years); if(a.length<2)return null;
  let peak=a[0],worst={drawdown:0,peak:a[0],trough:a[0]};
  for(const p of a){if(p.price>peak.price)peak=p;const dd=((p.price/peak.price)-1)*100;if(dd<worst.drawdown)worst={drawdown:dd,peak,trough:p}}
  return {value:worst.drawdown,peakDate:worst.peak.date,peakPrice:worst.peak.price,troughDate:worst.trough.date,troughPrice:worst.trough.price};
}
function monthly(points){
  const map=new Map();
  for(const p of points){
    const d=new Date(p.date); if(Number.isNaN(d.getTime()))continue;
    const k=`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}`; map.set(k,p);
  }
  return [...map.values()];
}
function normalizedRange(points,start,end){
  const s=nearest(points,start,"after"),e=nearest(points,end,"before");
  if(!s||!e||new Date(s.date)>new Date(e.date))return null;
  const sub=points.filter(p=>new Date(p.date)>=new Date(s.date)&&new Date(p.date)<=new Date(e.date));
  const base=s.price;
  return {start:s,end:e,change:((e.price/s.price)-1)*100,series:monthly(sub).map(p=>({date:p.date,index:(p.price/base)*100}))};
}

async function readFinalCache() {
  return await readCache(cacheReq("longterm-final-v36"));
}
async function writeFinalCache(context, value) {
  await writeCache(context, cacheReq("longterm-final-v36"), value, 14 * DAY);
}

async function buildLongterm(env, context) {
  const [silverRaw,goldRaw] = await Promise.all([
    getRaw("XAG", env, context, DAY),
    getRaw("XAU", env, context, 2*DAY)
  ]);
  if(!silverRaw?.rows?.length || !goldRaw?.rows?.length) throw new Error("raw history unavailable");

  const silver=pts(silverRaw),gold=pts(goldRaw);
  const metrics={};
  for(const y of [5,10,20]){
    metrics[y]={silverReturn:totalReturn(silver,y),goldReturn:totalReturn(gold,y),silverMdd:maxDrawdown(silver,y),goldMdd:maxDrawdown(gold,y)};
  }
  const cycles=[
    {id:"2004-2006",label:"2004~2006",start:"2004-06-30",end:"2006-06-29"},
    {id:"2015-2018",label:"2015~2018",start:"2015-12-17",end:"2018-12-20"},
    {id:"2022-2023",label:"2022~2023",start:"2022-03-17",end:"2023-07-27"}
  ].map(c=>({...c,silver:normalizedRange(silver,c.start,c.end),gold:normalizedRange(gold,c.start,c.end)}));

  const start20=Date.now()-20*365.25*DAY_MS;
  const silver20=monthly(silver.filter(p=>new Date(p.date).getTime()>=start20));
  const gold20=monthly(gold.filter(p=>new Date(p.date).getTime()>=start20));
  const sb=silver20[0]?.price,gb=gold20[0]?.price;
  const gm=new Map(gold20.map(p=>[p.date.slice(0,7),p]));
  const comparison=silver20.map(s=>{
    const g=gm.get(s.date.slice(0,7));
    return (!g||!sb||!gb)?null:{date:s.date,silverIndex:(s.price/sb)*100,goldIndex:(g.price/gb)*100};
  }).filter(Boolean);

  return {
    generatedAt:new Date().toISOString(),
    basis:"Gold API daily average XAG/USD and XAU/USD",
    cachePolicy:"raw XAG 24h / XAU 48h, stale up to 30d",
    dataStatus:{
      silver:silverRaw.cacheState||"miss",
      gold:goldRaw.cacheState||"miss",
      silverAgeSeconds:silverRaw.ageSeconds??0,
      goldAgeSeconds:goldRaw.ageSeconds??0
    },
    metrics,comparison,cycles
  };
}

export async function onRequestGet(context) {
  const { env }=context;
  if(!env.GOLD_API_KEY) return Response.json({error:"GOLD_API_KEY is not configured"},{status:503,headers:{"Cache-Control":"no-store"}});

  const finalCached = await readFinalCache();
  if(finalCached?.generatedAt){
    const age=(Date.now()-new Date(finalCached.generatedAt).getTime())/1000;
    if(age<=2*DAY){
      return Response.json({...finalCached,finalCache:"fresh"},{
        headers:{"Cache-Control":"public, max-age=3600, s-maxage=3600, stale-while-revalidate=172800, stale-if-error=1209600"}
      });
    }
    if(context?.waitUntil){
      context.waitUntil(buildLongterm(env,context).then(v=>writeFinalCache(context,v)).catch(()=>null));
    }
    return Response.json({...finalCached,finalCache:"stale"},{
      headers:{"Cache-Control":"public, max-age=3600, s-maxage=3600, stale-while-revalidate=172800, stale-if-error=1209600"}
    });
  }

  try{
    const built=await buildLongterm(env,context);
    await writeFinalCache(context,built);
    return Response.json({...built,finalCache:"miss"},{
      headers:{"Cache-Control":"public, max-age=3600, s-maxage=3600, stale-while-revalidate=172800, stale-if-error=1209600"}
    });
  }catch(err){
    return Response.json({error:"longterm_analysis_failed",detail:String(err?.message||err)},{
      status:502,headers:{"Cache-Control":"no-store"}
    });
  }
}
