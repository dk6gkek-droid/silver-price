const API={current:"/api/current",history:"/api/history",longterm:"/api/longterm",premium:"/api/premium"};
const state={xag:null,fx:null,hist:[],longterm:null}; const OZ=31.1034768;
const $=id=>document.getElementById(id); const won=n=>Number.isFinite(n)?Math.round(n).toLocaleString("ko-KR")+"원":"—";
const pct=n=>Number.isFinite(n)?`${n>=0?"+":""}${n.toFixed(2)}%`:"—";
function cls(n){return Number.isFinite(n)?(n>=0?"up":"down"):""}
function pg(){return Number.isFinite(state.xag)&&Number.isFinite(state.fx)?state.xag*state.fx/OZ:null}
function nearest(days){if(!state.hist.length)return null;const t=Date.now()-days*86400000;let b=null,d=Infinity;for(const p of state.hist){const q=Math.abs(new Date(p.date)-t);if(q<d){b=p.price;d=q}}return b}
function change(cur,old){return Number.isFinite(cur)&&Number.isFinite(old)&&old?((cur/old)-1)*100:null}
function normalize(a){return Array.isArray(a)?a.map(r=>({date:r.day||r.date||r.timestamp||r.time,price:Number(r.avg_price??r.price??r.close??r.max_price)})).filter(x=>x.date&&Number.isFinite(x.price)).sort((a,b)=>new Date(a.date)-new Date(b.date)):[]}
function render(){const g=pg(); if(Number.isFinite(g)){ $("priceDonHero").textContent=won(g*3.75);$("price100g").textContent=won(g*100);$("price500g").textContent=won(g*500);$("price1kg").textContent=won(g*1000);calc()}
 if(Number.isFinite(state.xag))$("xagPrice").textContent="$"+state.xag.toFixed(2);if(Number.isFinite(state.fx))$("usdKrw").textContent=won(state.fx);
 if(state.hist.length){const c=state.xag||state.hist.at(-1).price;const vals=[["change1d",1],["change1w",7],["change1m",30],["change1y",365]];let snap=[];for(const [id,d] of vals){const v=change(c,nearest(d));$(id).textContent=pct(v);$(id).className=cls(v);if(d==1||d==7||d==365)snap.push(`${d==1?"오늘":d==7?"1주":"1년"} <span class="${cls(v)}">${pct(v)}</span>`)}$("snapshotText").innerHTML=snap.join(" · ")}
}
function saveLocal(k,v){try{localStorage.setItem(k,JSON.stringify({t:Date.now(),v}))}catch(e){}}
function readLocal(k,maxAge){try{const x=JSON.parse(localStorage.getItem(k)||"null");return x&&Date.now()-x.t<=maxAge?x.v:null}catch(e){return null}}
async function get(u){const r=await fetch(u,{cache:"no-store"});if(!r.ok)throw new Error(r.status);return r.json()}
async function getStable(u,key,maxAge){try{const d=await get(u);saveLocal(key,d);return {d,stale:false}}catch(e){const d=readLocal(key,maxAge);if(d)return {d,stale:true};throw e}}
async function load(){
 try{
   const {d,stale}=await getStable(API.current,"st_current_v36",6*60*60*1000);
   state.xag=Number(d.xagUsd);state.fx=Number(d.usdKrw);
   $("apiStatus").textContent=stale?"최근 저장 시세 · API 재연결 대기":"실제 API 데이터";
   if(!stale)$("apiStatus").classList.add("ok");
   if(d.updatedAt)$("updatedAt").textContent=new Date(d.updatedAt).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"});
   render();setTimeout(loadPremium,700)
 }catch(e){$("apiStatus").textContent="현재 시세 연결 확인 필요";setTimeout(loadPremium,700)}
 try{
   const {d}=await getStable(API.history+"?days=370","st_history_v36",7*24*60*60*1000);
   state.hist=normalize(d);render()
 }catch(e){}
 try{
   const {d}=await getStable(API.longterm,"st_longterm_v36",30*24*60*60*1000);
   state.longterm=d;renderLongterm()
 }catch(e){
   document.querySelectorAll('[id^="mdd"]').forEach(x=>{if(!x.id.includes("date"))x.textContent="데이터 확인 중"});
   $("fedSummary").textContent="장기 데이터 연결을 확인하면 자동 계산됩니다."
 }
}


async function loadPremium(){
  const intl=pg();
  if(Number.isFinite(intl) && $("premiumIntl")){
    $("premiumIntl").textContent=won(intl*1000);
  }

  try{
    const d=await get(API.premium);
    const buy=Number(d.customerBuy);
    const pp=Number(d.premiumPct);

    if($("premiumKbBuy")) $("premiumKbBuy").textContent=won(buy);
    if($("premiumPct")){
      $("premiumPct").textContent=Number.isFinite(pp)?`+${pp.toFixed(1)}%`:"—";
    }
    if($("premiumKbLabel")){
      $("premiumKbLabel").textContent=d.mode==="actual"?"KB 고객 구매가":"KB 공식구조 예상가";
    }
    if($("premiumSource")){
      const dt=d.date?String(d.date).replaceAll("-","."):"";
      $("premiumSource").textContent=d.mode==="actual"
        ?`KB국민은행 고시 ${dt}${d.time?" "+d.time:""} · 24시간 캐시`
        :`KB 가격조회 파싱 실패 시 공식 판매마진(19%)·부가세 구조로 계산한 예상값 · ${dt}`;
    }
  }catch(e){
    if($("premiumKbBuy")) $("premiumKbBuy").textContent="잠시 후 확인";
    if($("premiumSource")){
      $("premiumSource").textContent="KB 가격 비교는 메인 시세와 독립적으로 불러옵니다. 현재 비교 데이터 연결을 확인해 주세요.";
    }
  }
}

function calc(){const g=pg();if(!Number.isFinite(g))return;const a=Math.max(0,Number($("amount").value||0)),u=Number($("unit").value);$("calcValue").textContent=won(g*a*u)}
if($("amount"))$("amount").addEventListener("input",calc);if($("unit"))$("unit").addEventListener("change",calc);if($("calculateBtn"))$("calculateBtn").addEventListener("click",calc);
function renderMdd(y){const m=state.longterm?.metrics?.[y]?.silverMdd;const el=$("mdd"+y),de=$("mdd"+y+"date");if(!m){el.textContent="—";return}el.textContent=pct(m.value);el.className="down";de.textContent=`${String(m.peakDate).slice(0,10)} → ${String(m.troughDate).slice(0,10)}`}
function drawLines(canvas, series, keys){const ctx=canvas.getContext("2d"),dpr=devicePixelRatio||1,w=canvas.clientWidth||900,h=300;canvas.width=w*dpr;canvas.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);if(!series?.length)return;const vals=series.flatMap(x=>keys.map(k=>Number(x[k])).filter(Number.isFinite));if(!vals.length)return;let min=Math.min(...vals),max=Math.max(...vals),span=max-min||1;min-=span*.08;max+=span*.08;span=max-min;const L=42,R=12,T=15,B=25;ctx.strokeStyle="#e5e9ef";ctx.fillStyle="#7b8491";ctx.font='11px sans-serif';for(let i=0;i<4;i++){let yy=T+(h-T-B)*i/3,v=max-span*i/3;ctx.beginPath();ctx.moveTo(L,yy);ctx.lineTo(w-R,yy);ctx.stroke();ctx.fillText(v.toFixed(0),4,yy+4)}const xx=i=>L+i*(w-L-R)/Math.max(1,series.length-1),yy=v=>h-B-(v-min)/span*(h-T-B);const colors=["#596574","#b28b2e"];keys.forEach((k,ki)=>{ctx.beginPath();series.forEach((p,i)=>{const v=Number(p[k]);if(!Number.isFinite(v))return;i?ctx.lineTo(xx(i),yy(v)):ctx.moveTo(xx(i),yy(v))});ctx.strokeStyle=colors[ki];ctx.lineWidth=2.4;ctx.stroke()})}
function renderCompare(y){const m=state.longterm?.metrics?.[y];if(!m)return;$("silverReturn").textContent=pct(m.silverReturn);$("silverReturn").className=cls(m.silverReturn);$("goldReturn").textContent=pct(m.goldReturn);$("goldReturn").className=cls(m.goldReturn);$("riskCompare").textContent=`은 MDD ${pct(m.silverMdd?.value)} · 금 MDD ${pct(m.goldMdd?.value)}`;
 let comp=state.longterm.comparison||[];if(y<20){const cut=Date.now()-y*365.25*86400000;comp=comp.filter(p=>new Date(p.date).getTime()>=cut);if(comp.length){const s0=comp[0].silverIndex,g0=comp[0].goldIndex;comp=comp.map(p=>({...p,silverIndex:p.silverIndex/s0*100,goldIndex:p.goldIndex/g0*100}))}}drawLines($("compareChart"),comp,["silverIndex","goldIndex"])}
function renderFed(id){const c=state.longterm?.cycles?.find(x=>x.id===id);if(!c||!c.silver||!c.gold){$("fedSummary").textContent="해당 구간 데이터가 충분하지 않습니다.";return}$("fedSummary").innerHTML=`${c.label}: 은 <b class="${cls(c.silver.change)}">${pct(c.silver.change)}</b> · 금 <b class="${cls(c.gold.change)}">${pct(c.gold.change)}</b>`;
 const gm=new Map(c.gold.series.map(x=>[String(x.date).slice(0,7),x.index]));const joined=c.silver.series.map(x=>({date:x.date,silverIndex:x.index,goldIndex:gm.get(String(x.date).slice(0,7))})).filter(x=>Number.isFinite(x.goldIndex));drawLines($("fedChart"),joined,["silverIndex","goldIndex"])}
function renderLongterm(){[5,10,20].forEach(renderMdd);renderCompare(20);renderFed("2022-2023")}
document.querySelectorAll(".compare-range").forEach(b=>b.onclick=()=>{document.querySelectorAll(".compare-range").forEach(x=>x.classList.remove("active"));b.classList.add("active");renderCompare(Number(b.dataset.years))});
document.querySelectorAll(".fed-cycle").forEach(b=>b.onclick=()=>{document.querySelectorAll(".fed-cycle").forEach(x=>x.classList.remove("active"));b.classList.add("active");renderFed(b.dataset.cycle)});
window.addEventListener("resize",()=>{if(state.longterm){const y=Number(document.querySelector(".compare-range.active")?.dataset.years||20);renderCompare(y);renderFed(document.querySelector(".fed-cycle.active")?.dataset.cycle||"2022-2023")}});
load();