/* Silver Today V43 home engagement layer.
   No additional API calls. Reads data already loaded by app-v31.js. */
(()=>{
  const byId=id=>document.getElementById(id);
  const text=id=>byId(id)?.textContent?.trim()||"—";
  const set=(id,v)=>{const el=byId(id);if(el)el.textContent=v};
  const parseNum=v=>{const cleaned=String(v||"").replace(/[^0-9+-.]/g,"");if(!/[0-9]/.test(cleaned))return null;const n=Number(cleaned);return Number.isFinite(n)?n:null};
  const parseWon=v=>{const cleaned=String(v||"").replace(/[^0-9.-]/g,"");if(!/[0-9]/.test(cleaned))return null;const n=Number(cleaned);return Number.isFinite(n)?n:null};
  const fmtWon=n=>Number.isFinite(n)?Math.round(n).toLocaleString("ko-KR")+"원":"—";
  const fmtUsd=n=>Number.isFinite(n)?"$"+n.toFixed(2):"—";
  const fmtPct=n=>Number.isFinite(n)?`${n>=0?"+":""}${n.toFixed(1)}%`:"—";
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

  function renderHeroPremium(){
    const prem=parseNum(text("premiumPct"));
    const intl=parseWon(text("premiumIntl"));
    const buy=parseWon(text("premiumKbBuy"));
    const kbLabel=text("premiumKbLabel");
    const box=byId("todayPremiumBox");
    const snap=byId("snapshotText");
    const meta=byId("premiumHeroMeta");
    const label=byId("premiumHeroLabel");
    const status=byId("apiStatus");
    if(label)label.textContent=kbLabel.includes("예상")?"예상 은 프리미엄*":"오늘 은 프리미엄*";
    if(snap){
      snap.textContent=Number.isFinite(prem)?fmtPct(prem):"계산 중";
      snap.className=`value premium-hero-value ${Number.isFinite(prem)?(prem>=0?"up":"down"):""}`.trim();
    }
    if(meta){
      if(Number.isFinite(intl)&&Number.isFinite(buy)){
        const diff=buy-intl;
        meta.textContent=`국제가격 대비 ${diff>=0?"+":"-"}${Math.round(Math.abs(diff)).toLocaleString("ko-KR")}원`;
      }else{
        meta.textContent="KB 실버바 1kg 기준 비교";
      }
    }
    if(status){
      status.textContent=kbLabel.includes("예상")?"공식 가격구조 기반 예상치":"KB 실버바 1kg 기준";
    }
    if(box){
      box.classList.toggle("estimate", kbLabel.includes("예상"));
      box.classList.toggle("positive", Number.isFinite(prem)&&prem>=0);
      box.classList.toggle("negative", Number.isFinite(prem)&&prem<0);
    }
  }

  function renderBrief(){
    const month=parseNum(text("change1m"));
    const prem=parseNum(text("premiumPct"));
    const sent=byId("briefSentence");
    if(sent&&Number.isFinite(month)&&Number.isFinite(prem)){
      const momentum=month>=5?"최근 한 달 상승폭이 큰 편입니다":month<=-5?"최근 한 달 조정폭이 큰 편입니다":month>0?"최근 한 달 완만한 상승 흐름입니다":month<0?"최근 한 달 완만한 하락 흐름입니다":"최근 한 달 큰 방향 변화는 제한적입니다";
      const kbLabel=text("premiumKbLabel");
      const priceWord=kbLabel.includes("예상")?"KB 공식구조 예상가는":"KB 실버바 1kg 구매가는";
      sent.textContent=`${momentum}. ${priceWord} 국제가격 환산보다 ${Math.abs(prem).toFixed(1)}% ${prem>=0?"높게":"낮게"} 표시되고 있습니다.`;
    }
    set("checkPremium",Number.isFinite(prem)?`국제가 대비 ${fmtPct(prem)}`:"KB 가격 확인 중");
  }

  function renderRange(){
    try{
      if(typeof state==="undefined"||!Array.isArray(state.hist)||state.hist.length<20)return;
      const oneYear=state.hist.filter(p=>new Date(p.date).getTime()>=Date.now()-370*86400000).map(p=>Number(p.price)).filter(Number.isFinite);
      const cur=Number(state.xag)||oneYear.at(-1);
      if(oneYear.length<20||!Number.isFinite(cur))return;
      const low=Math.min(...oneYear), high=Math.max(...oneYear);
      const pos=high>low?clamp((cur-low)/(high-low)*100,0,100):50;
      set("rangeLow",fmtUsd(low));set("rangeNow",fmtUsd(cur));set("rangeHigh",fmtUsd(high));
      set("rangePositionText",`1년 범위의 ${Math.round(pos)}% 지점`);
      set("checkPosition",`최근 1년 ${Math.round(pos)}% 지점`);
      const fill=byId("rangeFill"),dot=byId("rangeDot"); if(fill)fill.style.width=pos+"%";if(dot)dot.style.left=pos+"%";
      const badge=byId("rangeBadge");
      const card=byId("yearRangeCard");
      let msg="최근 1년 가격 범위의 중간 구간에 있습니다.";
      let zone="mid", badgeText="중간권";
      if(pos>=80){msg="최근 1년 가격 범위의 상단에 있습니다. 최근 고점과의 거리를 함께 확인해 보세요.";zone="high";badgeText="상단권";}
      else if(pos>=60){msg="최근 1년 가격 범위에서 중상단에 있습니다.";zone="upper";badgeText="중상단";}
      else if(pos<=20){msg="최근 1년 가격 범위의 하단에 있습니다. 낮은 가격 자체가 매수 신호를 뜻하지는 않습니다.";zone="low";badgeText="하단권";}
      else if(pos<=40){msg="최근 1년 가격 범위에서 중하단에 있습니다.";zone="lower";badgeText="중하단";}
      if(badge)badge.textContent=`XAG/USD · ${badgeText}`;
      if(card)card.className=`range-card trend-range-card zone-${zone}`;
      set("rangeInterpret",msg);
    }catch(e){}
  }

  function renderCost(){
    let intl=null;
    try{if(typeof pg==="function")intl=pg()*1000}catch(e){}
    if(!Number.isFinite(intl))intl=parseWon(text("premiumIntl"));
    const vat=Number.isFinite(intl)?intl*1.10:null;
    const real=parseWon(text("premiumKbBuy"));
    set("costIntl",fmtWon(intl));set("costVat",fmtWon(vat));set("costReal",fmtWon(real));
    set("costRealLabel",text("premiumKbLabel")||"KB 고객 구매가");
    const vals=[intl,vat,real].filter(Number.isFinite);if(!vals.length)return;
    const max=Math.max(...vals)*1.03;
    [["costIntlBar",intl],["costVatBar",vat],["costRealBar",real]].forEach(([id,v])=>{const el=byId(id);if(el&&Number.isFinite(v))el.style.width=clamp(v/max*100,8,100)+"%"});
    if(Number.isFinite(real)&&Number.isFinite(intl)){
      const extra=real-intl;set("costExtra",`${extra>=0?"국제 은 가치보다 ":"국제 은 가치보다 낮게 "}${fmtWon(Math.abs(extra))}${extra>=0?" 더 지불":""}`);
    }
  }

  function renderChecks(){
    const mdd=text("mdd20"); if(mdd!=="계산 중"&&mdd!=="—"&&mdd!=="데이터 확인 중")set("checkMdd",`20년 MDD ${mdd}`);
  }

  function renderAll(){renderHeroPremium();renderBrief();renderRange();renderCost();renderChecks()}
  document.querySelectorAll('.calc-presets button[data-grams]').forEach(btn=>btn.addEventListener('click',()=>{
    const grams=Number(btn.dataset.grams);const amount=byId('amount'),unit=byId('unit');if(!amount||!unit)return;
    if(grams===1000){amount.value='1';unit.value='1000'}else{amount.value=String(grams);unit.value='1'}
    unit.dispatchEvent(new Event('change',{bubbles:true}));amount.dispatchEvent(new Event('input',{bubbles:true}));
    document.querySelectorAll('.calc-presets button').forEach(x=>x.classList.toggle('active',x===btn));
  }));
  const watched=['priceDonHero','price1kg','change1m','premiumPct','premiumIntl','premiumKbBuy','premiumKbLabel','mdd20'];
  const obs=new MutationObserver(()=>renderAll());watched.forEach(id=>{const el=byId(id);if(el)obs.observe(el,{childList:true,subtree:true,characterData:true})});
  renderAll();let tries=0;const timer=setInterval(()=>{renderAll();if(++tries>30)clearInterval(timer)},700);
})();
