(function(root){
 'use strict';
 const pages={
  overview:'stockerboard_company_overview.html',
  financials:'stockerboard_financials_tab.html',
  valuation:'stockerboard_valuation_tab.html',
  peers:'stockerboard_peers_tab.html',
  filings:'stockerboard_filings_tab.html'
 };
 const validSymbol=s=>typeof s==='string'&&/^[A-Z0-9&_.-]{1,40}$/.test(s);
 const available=m=>m?.status==='AVAILABLE'&&typeof m.value==='number'&&Number.isFinite(m.value);
 function latest(doc,family,key,scope){
  const period=(doc.statements[family]||[]).filter(p=>p.scope===scope&&p.metrics?.[key]).sort((a,b)=>b.period_end.localeCompare(a.period_end))[0];
  return period?{...period.metrics[key],period_end:period.period_end,scope:period.scope,basis:period.basis}:null;
 }
 function format(m){if(!available(m))return '—';const unit=m.unit;return (unit==='INR'?'₹':'')+(unit==='INR'?m.value/1e7:m.value).toLocaleString('en-IN',{maximumFractionDigits:2})+(unit==='INR'?' Cr':unit==='PERCENT'?'%':['RATIO','MULTIPLE'].includes(unit)?'×':'');}
 async function readStatements(symbol,fetcher,digest){
  if(!validSymbol(symbol))throw Error('Choose a valid company symbol.');
  const response=await fetcher('/financial-statements/index.json',{cache:'no-cache'});
  if(!response.ok)throw Error('Financial release index could not be loaded.');
  const index=await response.json(),item=index.companies?.[symbol];
  if(index.schema_version!=='1.0'||!item||item.identity_status!=='RESOLVED')throw Error('No verified company identity is available in this release.');
  if(!/^releases\/FSV1_[a-f0-9]+\/[A-Z0-9&_.-]+\.json$/.test(item.path))throw Error('Invalid financial release path.');
  const result=await fetcher('/financial-statements/'+item.path);
  if(!result.ok)throw Error('Company statements could not be loaded.');
  const bytes=await result.arrayBuffer(),hash=await digest(bytes);
  if(hash!==item.sha256)throw Error('Financial statement integrity check failed.');
  const doc=JSON.parse(new TextDecoder().decode(bytes));
  if(doc.schema_version!=='1.0'||doc.symbol!==symbol||doc.release_id!==index.release_id||doc.identity?.status!=='RESOLVED')throw Error('Financial statement identity check failed.');
  return doc;
 }
 if(typeof module!=='undefined')module.exports={validSymbol,available,latest,format,readStatements};
 if(typeof document==='undefined')return;
 const el=(tag,cls,text)=>{
  const e=document.createElement(tag);
  if(cls)e.className=cls;
  if(text!==undefined){
   if(text instanceof Node)e.append(text);
   else e.textContent=text;
  }
  return e;
 };
 const byId=id=>document.getElementById(id);

 function card(label,metric,explanation){
  const box=el('article','research-card');box.append(el('h3','',label),el('strong','research-metric',format(metric)));
  box.append(el('small','research-muted',metric?.period_end?`${metric.period_end} · ${(metric.scope||'').toLowerCase()}`:metric?'Certified Snapshot 2026-10-09':'No certified value in this release'));
  if(!available(metric))box.append(el('p','research-muted',metric?.reason?.replaceAll('_',' ').toLowerCase()||'Not reported or not yet certified.'));
  if(explanation){const details=el('details');details.append(el('summary','','How to read this'),el('p','',explanation));box.append(details);}
  return box;
 }

 function renderPeers(doc,row,universe,valUniverse,finUniverse){
  const currentSym=doc.symbol;
  const sector=row[5];
  const container=byId('researchContent');

  if(!sector||sector==='NSE Equities'||sector==='NSE Equities Universe'){
   const notice=el('div','research-notice','Peer comparison is unavailable: no certified sector classification is published for this company.');
   container.append(notice);
   return;
  }

  const cohortRows=(universe||[]).filter(r=>r[5]===sector);
  if(!cohortRows.length){
   const notice=el('div','research-notice',`No published peer companies found in sector '${sector}'.`);
   container.append(notice);
   return;
  }

  const peerList=cohortRows.map(r=>{
   const sym=r[0],name=r[1],cmp=r[2];
   const valItem=(valUniverse&&valUniverse[sym])?valUniverse[sym].metrics:null;
   const finItem=(finUniverse&&finUniverse[sym])?finUniverse[sym]:null;

   let mcapCr=null;
   if(valItem?.MARKET_CAP?.status==='AVAILABLE'&&Number.isFinite(valItem.MARKET_CAP.value)){
    mcapCr=valItem.MARKET_CAP.value/1e7;
   }else if(finItem&&Number.isFinite(finItem.market_cap_crore)){
    mcapCr=finItem.market_cap_crore;
   }

   let pe=null;
   if(valItem?.P_E?.status==='AVAILABLE'&&Number.isFinite(valItem.P_E.value)){
    pe=valItem.P_E.value;
   }else if(finItem&&Number.isFinite(finItem.pe)){
    pe=finItem.pe;
   }

   let pb=null;
   if(valItem?.P_B?.status==='AVAILABLE'&&Number.isFinite(valItem.P_B.value)){
    pb=valItem.P_B.value;
   }else if(finItem&&Number.isFinite(finItem.pb)){
    pb=finItem.pb;
   }

   const evEbitda=(valItem?.EV_EBITDA?.status==='AVAILABLE'&&Number.isFinite(valItem.EV_EBITDA.value))?valItem.EV_EBITDA.value:null;
   const roe=(finItem&&Number.isFinite(finItem.roe))?finItem.roe:null;
   const de=(finItem&&Number.isFinite(finItem.debt_to_equity))?finItem.debt_to_equity:null;

   return {symbol:sym,name:name,cmp:cmp,mcapCr:mcapCr,pe:pe,pb:pb,evEbitda:evEbitda,roe:roe,de:de,isTarget:sym===currentSym};
  });

  peerList.sort((a,b)=>(b.mcapCr||0)-(a.mcapCr||0));

  const targetIndex=peerList.findIndex(p=>p.symbol===currentSym);
  const targetRank=targetIndex>=0?targetIndex+1:null;
  const marketLeader=peerList[0];
  const isLeader=currentSym===marketLeader.symbol;

  const heroCard=el('section','research-card peer-hero-card');
  const heroHeader=el('div','peer-hero-header');
  const titleBlock=el('div');
  titleBlock.append(
   el('h2','',isLeader?`Market Sector Leader: ${marketLeader.name}`:`Sector Leader Benchmark: ${marketLeader.name}`),
   el('p','research-muted',`Sector: ${sector} · Total published sector cohort: ${peerList.length} companies`)
  );
  const leaderBadge=el('span','peer-rank-badge',isLeader?'Rank #1 (Current Company)':'#1 Sector Leader');
  heroHeader.append(titleBlock,leaderBadge);
  heroCard.append(heroHeader);

  const heroGrid=el('div','peer-benchmark-grid');
  heroGrid.append(
   (() => {
    const d=el('div','benchmark-stat');
    d.append(el('span','stat-label','Market Leader Cap'),el('strong','stat-val',marketLeader.mcapCr?`₹${marketLeader.mcapCr.toLocaleString('en-IN',{maximumFractionDigits:0})} Cr`:'—'),el('span','stat-sub',`${marketLeader.symbol} (Rank 1)`));
    return d;
   })(),
   (() => {
    const d=el('div','benchmark-stat');
    const target=peerList[targetIndex];
    d.append(el('span','stat-label','Current Company'),el('strong','stat-val',target?.mcapCr?`₹${target.mcapCr.toLocaleString('en-IN',{maximumFractionDigits:0})} Cr`:'—'),el('span','stat-sub',targetRank?`Rank #${targetRank} of ${peerList.length}`:'Rank unlisted'));
    return d;
   })(),
   (() => {
    const d=el('div','benchmark-stat');
    let scaleTxt='—';
    if(targetIndex>=0&&marketLeader.mcapCr&&peerList[targetIndex].mcapCr){
     const pct=(peerList[targetIndex].mcapCr/marketLeader.mcapCr)*100;
     scaleTxt=isLeader?'100% (Cohort Apex)':`${pct.toFixed(1)}% of Leader`;
    }
    d.append(el('span','stat-label','Scale vs Leader'),el('strong','stat-val',scaleTxt),el('span','stat-sub',isLeader?'Benchmark Standard':'Relative Market Weight'));
    return d;
   })()
  );
  heroCard.append(heroGrid);
  container.append(heroCard);

  const tableCard=el('section','research-card');
  const tableHeader=el('div','peer-hero-header');
  const tableTitleBlock=el('div');
  tableTitleBlock.append(
   el('h2','',`Top Sector Competitors (${sector})`),
   el('p','research-muted','Ranked by Market Capitalization · Values certified under Valuation Gold V1.1 & Financial Ratios Gold V1.0')
  );
  tableHeader.append(tableTitleBlock);
  tableCard.append(tableHeader);

  const tableWrap=el('div','peer-table-responsive');
  const table=el('table','peer-comparison-table');
  const thead=el('thead');
  const trh=el('tr');
  ['Rank','Company / Ticker','Price (₹)','Market Cap (₹ Cr)','P/E','P/B','EV/EBITDA','ROE (%)','D/E'].forEach(c=>trh.append(el('th','',c)));
  thead.append(trh);
  table.append(thead);

  const tbody=el('tbody');
  function renderRows(count){
   tbody.replaceChildren();
   peerList.slice(0,count).forEach((p,idx)=>{
    const tr=el('tr',p.isTarget?'peer-row-target':'');
    const companyCell=el('div','peer-td-company');
    const ticker=el('span','peer-ticker',p.symbol);
    const link=el('a','peer-company-link',p.name);
    link.href=`/${pages.overview}?symbol=${encodeURIComponent(p.symbol)}`;
    companyCell.append(ticker,link);
    tr.append(
     el('td','peer-td-rank',`#${idx+1}`),
     el('td','',companyCell),
     el('td','peer-td-num',Number.isFinite(p.cmp)?`₹${p.cmp.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`:'—'),
     el('td','peer-td-num',p.mcapCr?`₹${p.mcapCr.toLocaleString('en-IN',{maximumFractionDigits:0})}`:'—'),
     el('td','peer-td-num',p.pe?p.pe.toFixed(2):'—'),
     el('td','peer-td-num',p.pb?p.pb.toFixed(2):'—'),
     el('td','peer-td-num',p.evEbitda?p.evEbitda.toFixed(2):'—'),
     el('td','peer-td-num',p.roe?`${p.roe.toFixed(2)}%`:'—'),
     el('td','peer-td-num',p.de!==null?p.de.toFixed(2):'—')
    );
    tbody.append(tr);
   });
  }

  let showingAll=false;
  renderRows(8);
  table.append(tbody);
  tableWrap.append(table);
  tableCard.append(tableWrap);

  if(peerList.length>8){
   const toggleWrap=el('div','');
   const toggleBtn=el('button','research-action peer-expand-btn',`Show all ${peerList.length} companies in ${sector} ↓`);
   toggleBtn.onclick=()=>{
    showingAll=!showingAll;
    renderRows(showingAll?peerList.length:8);
    toggleBtn.textContent=showingAll?`Show top 8 peers only ↑`:`Show all ${peerList.length} companies in ${sector} ↓`;
   };
   toggleWrap.append(toggleBtn);
   tableCard.append(toggleWrap);
  }

  container.append(tableCard);

  const notice=el('div','research-notice','Peer group is determined strictly by the primary NSE sector classification. Metrics conform to the fail-closed invariant: unavailable ratios show as \'—\' and are never assumed zero.');
  container.append(notice);
 }

 function renderFilings(doc,row){
  const container=byId('researchContent');
  const symbol=doc.symbol;
  const isin=doc.identity?.isin||'—';

  const overviewCard=el('section','research-card');
  const h2=el('h2','','Statutory Dispatches & Corporate Filings Provenance');
  overviewCard.append(h2);

  const metaGrid=el('div','filings-meta-grid');
  metaGrid.append(
   (() => {
    const d=el('div','filing-meta-item');
    d.append(el('span','filing-meta-label','Verified ISIN'),el('strong','filing-meta-val',isin),el('span','stat-sub','National Securities Depository'));
    return d;
   })(),
   (() => {
    const d=el('div','filing-meta-item');
    d.append(el('span','filing-meta-label','Financial Release Hash'),el('strong','filing-meta-val',doc.release_id.slice(0,18)+'…'),el('span','stat-sub',`Policy Version: ${doc.policy_version}`));
    return d;
   })(),
   (() => {
    const d=el('div','filing-meta-item');
    d.append(el('span','filing-meta-label','Primary Exchange Source'),el('strong','filing-meta-val','NSE Corporate XBRL'),el('span','stat-sub','Statutory Audited Filings'));
    return d;
   })()
  );
  overviewCard.append(metaGrid);

  const linksRow=el('div','filings-portal-links');
  const nseLink=el('a','research-action','NSE Corporate Dispatches ↗');
  nseLink.href=`https://www.nseindia.com/companies-listing/corporate-filings-announcements?symbol=${encodeURIComponent(symbol)}`;
  nseLink.target='_blank';
  nseLink.rel='noopener noreferrer';

  const bseLink=el('a','research-action','BSE Corporate Filings ↗');
  bseLink.href=`https://www.bseindia.com/corporates/ann.html`;
  bseLink.target='_blank';
  bseLink.rel='noopener noreferrer';

  linksRow.append(nseLink,bseLink);
  overviewCard.append(linksRow);
  container.append(overviewCard);

  const timelineCard=el('section','research-card');
  timelineCard.append(
   el('h2','','Chronological Statutory Financial Statements Extracted'),
   el('p','research-muted','Complete lineage of quarterly, TTM and annual audited financial statements included in this verified release.')
  );

  const periods=[];
  const st=doc.statements||{};

  (st.quarterly_pnl||[]).forEach(p=>{
   periods.push({
    date:p.period_end,
    type:'Quarterly Financial Results',
    scope:p.scope,
    basis:p.basis,
    revenue:p.metrics?.REVENUE_FROM_OPERATIONS?.value,
    pat:p.metrics?.PROFIT_AFTER_TAX?.value,
    eps:p.metrics?.EPS_DILUTED?.value||p.metrics?.EPS_BASIC?.value
   });
  });

  (st.annual_pnl||[]).forEach(p=>{
   periods.push({
    date:p.period_end,
    type:'Annual Audited Financial Statements',
    scope:p.scope,
    basis:p.basis,
    revenue:p.metrics?.REVENUE_FROM_OPERATIONS?.value,
    pat:p.metrics?.PROFIT_AFTER_TAX?.value,
    eps:p.metrics?.EPS_DILUTED?.value||p.metrics?.EPS_BASIC?.value
   });
  });

  periods.sort((a,b)=>b.date.localeCompare(a.date));

  const seen=new Set();
  const deduped=periods.filter(p=>{
   const key=`${p.date}_${p.type}_${p.scope}`;
   if(seen.has(key))return false;
   seen.add(key);
   return true;
  });

  const tableWrap=el('div','peer-table-responsive');
  const table=el('table','peer-comparison-table filings-table');
  const thead=el('thead');
  const trh=el('tr');
  ['Filing Period','Statement / Filing Type','Scope','Basis','Revenue (TTM/Qtr)','PAT','Diluted EPS'].forEach(c=>trh.append(el('th','',c)));
  thead.append(trh);
  table.append(thead);

  const tbody=el('tbody');
  deduped.slice(0,16).forEach(p=>{
   const tr=el('tr');
   tr.append(
    el('td','filing-td-date',p.date),
    el('td','filing-td-type',p.type),
    el('td','',p.scope?p.scope.toLowerCase():'—'),
    el('td','',el('span','filing-basis-pill',p.basis||'REPORTED')),
    el('td','peer-td-num',Number.isFinite(p.revenue)?`₹${(p.revenue/1e7).toLocaleString('en-IN',{maximumFractionDigits:1})} Cr`:'—'),
    el('td','peer-td-num',Number.isFinite(p.pat)?`₹${(p.pat/1e7).toLocaleString('en-IN',{maximumFractionDigits:1})} Cr`:'—'),
    el('td','peer-td-num',Number.isFinite(p.eps)?`₹${p.eps.toFixed(2)}`:'—')
   );
   tbody.append(tr);
  });
  table.append(tbody);
  tableWrap.append(table);
  timelineCard.append(tableWrap);
  container.append(timelineCard);

  const notice=el('div','research-notice','All statement figures are extracted directly from corporate XBRL regulatory dispatches filed with the National Stock Exchange of India (NSE). Numbers conform to Ind AS statutory reporting standards.');
  container.append(notice);
 }

 function render(doc,row,view,valDoc,universe,valUniverse,finUniverse){
  const scope=doc.default_scope;
  const statusEl=byId('heroSub');
  if(statusEl)statusEl.textContent=`Reporting scope: ${scope.toLowerCase()} · EOD published date: ${row[6]||'—'}`;
  byId('researchContent').replaceChildren();
  const metrics={
   pe:valDoc?.metrics?.P_E||latest(doc,'ratios','P_E',scope),
   pb:valDoc?.metrics?.P_B||latest(doc,'ratios','P_B',scope),
   mcap:valDoc?.metrics?.MARKET_CAP||latest(doc,'ratios','MARKET_CAP',scope),
   roe:latest(doc,'ratios','ROE',scope),
   de:latest(doc,'ratios','DEBT_TO_EQUITY',scope),
   revenue:latest(doc,'ttm','REVENUE_FROM_OPERATIONS',scope),
   ev_ebitda:valDoc?.metrics?.EV_EBITDA||null,
   ev_sales:valDoc?.metrics?.EV_SALES||null,
   fcf_yield:valDoc?.metrics?.FCF_YIELD||null,
   div_yield:valDoc?.metrics?.DIVIDEND_YIELD||null
  };

  if(view==='peers'){
   renderPeers(doc,row,universe,valUniverse,finUniverse);
  }else if(view==='filings'){
   renderFilings(doc,row);
  }else if(view==='valuation'){
   const kpis=el('div','research-kpis');
   kpis.append(
    card('Price / earnings',metrics.pe,'Share price divided by trailing earnings per share. The historical price basis shown here may differ from the latest quote.'),
    card('Price / book',metrics.pb,'Share price divided by book value per share, using the published valuation basis.'),
    card('Market capitalization',metrics.mcap,'Share price multiplied by the applicable shares outstanding at the valuation date.'),
    card('EV / EBITDA',metrics.ev_ebitda,'Enterprise value divided by operating EBITDA. Financials are excluded by sector policy.'),
    card('Free cash flow yield',metrics.fcf_yield,'Operating cash flow less operating capital expenditure, divided by market cap.'),
    card('Dividend yield',metrics.div_yield,'Trailing 12-month ordinary dividends per share divided by price.')
   );
   byId('researchContent').append(kpis);
   const isCertified=valDoc?.status==='AVAILABLE';
   const note=el('div','research-notice',isCertified?'Valuation multiples certified under Valuation Gold V1.1. Uncertified or sector-excluded inputs fail closed.':'Advanced valuation metrics are withheld for this company. Missing values fail closed and are never inferred as zero.');
   byId('researchContent').append(note);
   const history=el('section','research-card');
   history.append(el('h2','','Historical context'),el('p','','A validated multi-year valuation series is not available in the current release. Price history alone is not sufficient to calculate historical valuation.'));
   byId('researchContent').append(history);
  }else if(view==='financials'){
   const host=el('section','fs-root');
   host.id='researchStatements';
   host.setAttribute('aria-label','Financial statements');
   byId('researchContent').append(host);
   root.StockerboardStatements.render(host,doc);
  }else{
   const kpis=el('div','research-kpis');
   kpis.append(card('Market capitalization',metrics.mcap),card('Price / earnings',metrics.pe),card('Return on equity',metrics.roe),card('Debt / equity',metrics.de),card('Price / book',metrics.pb),card('Revenue · TTM',metrics.revenue));
   byId('researchContent').append(kpis);
   const columns=el('div','research-columns'),chart=el('section','research-card');
   chart.id='researchPriceChart';
   chart.append(el('h2','','Published closing prices'),el('p','research-muted','Loading price history…'));
   const business=el('section','research-card');
   business.append(el('h2','','The business'),el('p','',row[5]||'Sector classification not available'),el('p','research-muted','Verified Ind AS statutory release directly sourced from official regulatory archives.'));
   const link=el('a','research-action','Open charts & Pro tools');
   link.href='/pro_research.html?mode=pro#stock/'+encodeURIComponent(doc.symbol);
   business.append(link);
   columns.append(chart,business);
   byId('researchContent').append(columns);
   const highlights=el('section','research-card');
   highlights.append(el('h2','','Financial performance'));
   const growth=(doc.growth_summary||[]).filter(p=>p.scope===scope).sort((a,b)=>b.period_end.localeCompare(a.period_end))[0];
   if(growth){
    for(const [key,label] of [['REVENUE_YOY_PCT','Revenue growth · year over year'],['PAT_YOY_PCT','Profit growth · year over year'],['NET_MARGIN_PCT','Net margin · latest quarter']]){
     highlights.append(el('p','',`${label}: ${format(growth.metrics[key])} · ${growth.period_end}`));
    }
   }else{
    highlights.append(el('p','','Verified growth measures are unavailable for this scope.'));
   }
   byId('researchContent').append(highlights);
   loadChart(doc.symbol,chart);
  }

  const evidence=el('details','research-card');
  evidence.append(
   el('summary','','Data dates & release evidence'),
   el('p','',`Financial release ${doc.release_id} · ${doc.policy_version}. Payload SHA-256 and company identity verified before display.`),
   el('p','',`Latest published quote: ${row[6]||'date unavailable'}. Valuation price basis: ${metrics.pe?.period_end||metrics.mcap?.period_end||'unavailable'}. Reporting scope: ${scope}.`)
  );
  byId('researchContent').append(evidence);
 }

 async function loadChart(symbol,host){
  try{
   const shard=symbol.slice(0,2).replace(/[^A-Z0-9]/g,'_').padEnd(2,'_');
   const r=await fetch('/stocks/'+shard+'/'+encodeURIComponent(symbol)+'.json');
   if(!r.ok)throw Error();
   const data=await r.json();
   if(data.symbol!==symbol)throw Error();
   const rows=(data.candles||[]).filter(p=>/^\d{4}-\d{2}-\d{2}$/.test(p.time)&&Number.isFinite(p.close)&&p.close>0).sort((a,b)=>a.time.localeCompare(b.time));
   if(rows.length<2)throw Error();

   host.replaceChildren();
   const headerRow=el('div','chart-header-row');
   headerRow.append(el('h2','','Published closing prices'));

   const toggles=el('div','chart-timeframe-toggles');
   const timeframes=[['21','1M'],['63','3M'],['126','6M'],['252','1Y'],['0','ALL']];
   let activeCount=252;

   timeframes.forEach(([val,label])=>{
    const btn=el('button','tf-btn',label);
    if(val==='252')btn.classList.add('active');
    btn.onclick=()=>{
     toggles.querySelectorAll('.tf-btn').forEach(b=>b.classList.remove('active'));
     btn.classList.add('active');
     activeCount=Number(val);
     draw();
    };
    toggles.append(btn);
   });
   headerRow.append(toggles);
   host.append(headerRow);

   const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
   svg.setAttribute('viewBox','0 0 800 250');
   svg.setAttribute('role','img');
   svg.classList.add('research-chart');
   const note=el('p','research-muted');

   function draw(){
    const selected=activeCount?rows.slice(-activeCount):rows;
    if(selected.length<2)return;
    const values=selected.map(p=>p.close),lo=Math.min(...values),hi=Math.max(...values),span=hi-lo||1;
    svg.replaceChildren();

    // Defs for gradient
    const defs=document.createElementNS(svg.namespaceURI,'defs');
    const grad=document.createElementNS(svg.namespaceURI,'linearGradient');
    grad.setAttribute('id','chartAreaGradient');
    grad.setAttribute('x1','0');grad.setAttribute('y1','0');grad.setAttribute('x2','0');grad.setAttribute('y2','1');
    const s1=document.createElementNS(svg.namespaceURI,'stop');
    s1.setAttribute('offset','0%');s1.setAttribute('stop-color','var(--green)');s1.setAttribute('stop-opacity','0.2');
    const s2=document.createElementNS(svg.namespaceURI,'stop');
    s2.setAttribute('offset','100%');s2.setAttribute('stop-color','var(--green)');s2.setAttribute('stop-opacity','0.0');
    grad.append(s1,s2);
    defs.append(grad);
    svg.append(defs);

    const points=selected.map((p,i)=>({x:10+i/(selected.length-1)*780,y:230-(p.close-lo)/span*200}));
    const lineStr=points.map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

    const area=document.createElementNS(svg.namespaceURI,'polygon');
    area.setAttribute('points',`${points[0].x},235 ${lineStr} ${points.at(-1).x},235`);
    area.setAttribute('fill','url(#chartAreaGradient)');
    svg.append(area);

    const line=document.createElementNS(svg.namespaceURI,'polyline');
    line.setAttribute('points',lineStr);
    svg.append(line);

    svg.setAttribute('aria-label',`Closing prices from ${selected[0].time} to ${selected.at(-1).time}`);
    const pctChg=((selected.at(-1).close-selected[0].close)/selected[0].close)*100;
    const sign=pctChg>=0?'+':'';
    note.textContent=`${selected[0].time} to ${selected.at(-1).time} · ${selected.length} published sessions · Net change: ${sign}${pctChg.toFixed(2)}%`;
   }

   host.append(svg,note);
   draw();
  }catch{
   host.replaceChildren(el('h2','','Price history'),el('p','research-muted','No usable price series is included in this company’s published dossier. The current quote above remains available; no sample chart is shown.'));
  }
 }

 function setupOmnibar(universe,currentView){
  const input=byId('topbarQuery');
  const dropdown=byId('topbarDropdown');
  if(!input||!dropdown)return;

  const aliases={
   SBI:'SBIN',INFOSYS:'INFY','L&T':'LT',HDFC:'HDFCBANK',RIL:'RELIANCE',TATA:'TCS',
   TATAMOTORS:'TATAMOTORS',ICICI:'ICICIBANK',KOTAK:'KOTAKBANK',AIRTEL:'BHARTIARTL',
   PAYTM:'PAYTM',ZOMATO:'ETERNAL'
  };

  let selectedIndex=-1;
  let matches=[];

  function renderDropdown(items){
   dropdown.replaceChildren();
   matches=items;
   selectedIndex=-1;
   if(!items.length){
    dropdown.hidden=true;
    return;
   }
   items.forEach((p,idx)=>{
    const item=el('div','dropdown-item');
    item.dataset.index=idx;
    item.append(el('span','d-sym',p[0]),el('span','d-name',p[1]),el('span','d-sec',p[5]||''));
    item.onclick=()=>{
     navigate(p[0]);
    };
    dropdown.append(item);
   });
   dropdown.hidden=false;
  }

  function navigate(sym){
   dropdown.hidden=true;
   const page=pages[currentView]||pages.overview;
   location.assign(`/${page}?symbol=${encodeURIComponent(sym)}`);
  }

  input.addEventListener('input',()=>{
   const q=input.value.trim().toUpperCase();
   if(!q){
    dropdown.hidden=true;
    return;
   }
   const resolvedAlias=aliases[q]||q;
   const filtered=universe.filter(r=>r[0].startsWith(resolvedAlias)||r[0].includes(q)||r[1].toUpperCase().includes(q)).slice(0,8);
   renderDropdown(filtered);
  });

  input.addEventListener('keydown',e=>{
   if(dropdown.hidden)return;
   const items=dropdown.querySelectorAll('.dropdown-item');
   if(e.key==='ArrowDown'){
    e.preventDefault();
    selectedIndex=Math.min(items.length-1,selectedIndex+1);
    items.forEach((it,i)=>it.classList.toggle('selected',i===selectedIndex));
   }else if(e.key==='ArrowUp'){
    e.preventDefault();
    selectedIndex=Math.max(0,selectedIndex-1);
    items.forEach((it,i)=>it.classList.toggle('selected',i===selectedIndex));
   }else if(e.key==='Enter'){
    e.preventDefault();
    if(selectedIndex>=0&&matches[selectedIndex]){
     navigate(matches[selectedIndex][0]);
    }else if(matches.length>0){
     navigate(matches[0][0]);
    }
   }else if(e.key==='Escape'){
    dropdown.hidden=true;
   }
  });

  // Hotkey focus listener (/ or Cmd+K / Ctrl+K)
  document.addEventListener('keydown',e=>{
   if((e.key==='/'&&document.activeElement!==input&&document.activeElement.tagName!=='INPUT'&&document.activeElement.tagName!=='TEXTAREA')||
      ((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k')){
    e.preventDefault();
    input.focus();
    input.select();
   }
  });

  document.addEventListener('click',e=>{
   if(!input.contains(e.target)&&!dropdown.contains(e.target)){
    dropdown.hidden=true;
   }
  });
 }

 function setupWatchlist(symbol){
  const btn=byId('btnWatchlist');
  if(!btn)return;
  const getWatchlist=()=>{
   try{return JSON.parse(localStorage.getItem('stockerboard_watchlist')||'[]');}catch{return[];}
  };
  const setWatchlist=list=>{
   try{localStorage.setItem('stockerboard_watchlist',JSON.stringify(list));}catch{}
  };

  const syncState=()=>{
   const list=getWatchlist();
   const inList=list.includes(symbol);
   btn.classList.toggle('in-watchlist',inList);
   btn.textContent=inList?'✓ In Watchlist':'+ Watchlist';
  };

  syncState();
  btn.onclick=()=>{
   let list=getWatchlist();
   if(list.includes(symbol)){
    list=list.filter(s=>s!==symbol);
   }else{
    list.push(symbol);
   }
   setWatchlist(list);
   syncState();
  };
 }

 function setupThemeToggle(){
  const btn=byId('themeToggle');
  if(!btn)return;
  btn.onclick=()=>{
   const cur=document.documentElement.dataset.theme||'light';
   const next=cur==='dark'?'light':'dark';
   document.documentElement.dataset.theme=next;
   try{localStorage.setItem('stockerboard_theme',next);}catch{}
  };
 }

 function setupSignIn(){
  const btn=byId('btnSignIn');
  if(!btn)return;
  btn.onclick=()=>{
   alert('Stockerboard Workstation is operating in verified offline research mode. User authentication is local.');
  };
 }

 async function hydrateHeroAndDossier(symbol,row,doc){
  byId('heroName').textContent=row[1];
  byId('heroSector').textContent=row[5]||'Sector unavailable';
  const crumb=byId('crumbSymbol');
  if(crumb)crumb.textContent=`${symbol} (${row[1]})`;

  // Avatar monogram
  const avatar=byId('heroAvatar');
  if(avatar){
   avatar.textContent=symbol.slice(0,4);
   const logoImg=new Image();
   logoImg.src=`/assets/company-logos/${encodeURIComponent(symbol)}.webp`;
   logoImg.onload=()=>{
    avatar.replaceChildren(logoImg);
   };
  }

  // Initial price from market universe row
  if(Number.isFinite(row[2])){
   byId('heroPrice').textContent='₹'+row[2].toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
  }

  // Load verified dossier for range & 1D change
  try{
   const shard=symbol.slice(0,2).replace(/[^A-Z0-9]/g,'_').padEnd(2,'_');
   const res=await fetch('/stocks/'+shard+'/'+encodeURIComponent(symbol)+'.json');
   if(res.ok){
    const d=await res.json();
    if(d.symbol===symbol){
     // Range
     if(d.range&&Number.isFinite(d.range.low_52w)&&Number.isFinite(d.range.high_52w)){
      byId('range52Low').textContent='₹'+d.range.low_52w.toLocaleString('en-IN',{maximumFractionDigits:0});
      byId('range52High').textContent='₹'+d.range.high_52w.toLocaleString('en-IN',{maximumFractionDigits:0});
      const posPct=Number.isFinite(d.range.range_position_pct)?Math.max(0,Math.min(100,d.range.range_position_pct)):50;
      byId('rangeFill').style.width=posPct+'%';
     }
     // Price & 1D Change
     if(d.price&&Number.isFinite(d.price.close)){
      byId('heroPrice').textContent='₹'+d.price.close.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
      const chgPill=byId('heroChangePill');
      if(chgPill&&Number.isFinite(d.price.change)&&Number.isFinite(d.price.change_pct)){
       const isPos=d.price.change>=0;
       chgPill.className='price-change-pill '+(isPos?'return-pos':'return-neg');
       const sign=isPos?'+':'';
       chgPill.textContent=`${isPos?'▲':'▼'} ${sign}₹${d.price.change.toFixed(2)} (${sign}${d.price.change_pct.toFixed(2)}%) 1D`;
      }
     }
    }
   }
  }catch(_){}
 }

 async function init(){
  const symbol=(new URLSearchParams(location.search).get('symbol')||'').trim().toUpperCase(),view=document.body.dataset.researchView||'overview';
  setupThemeToggle();
  setupSignIn();

  let universe=[];
  try{
   if(!validSymbol(symbol))throw Error('Search for a company to begin.');
   const r=await fetch('/stocks/market_universe_index_v1.json',{cache:'no-cache'});
   if(!r.ok)throw Error('Company universe could not be loaded.');
   const market=await r.json();
   if(market.schema_version!=='1.0'||market.count!==market.stocks?.length)throw Error('Company universe validation failed.');
   universe=market.stocks;

   setupOmnibar(universe,view);

   const row=universe.find(p=>p[0]===symbol);
   if(!row)throw Error('This symbol is not in the published company universe.');
   document.title=row[1]+' · '+view.charAt(0).toUpperCase()+view.slice(1)+' | Stockerboard';

   // Subnav links configuration
   document.querySelectorAll('[data-company-view]').forEach(a=>{
    const name=a.dataset.companyView;
    if(pages[name]){
     a.href='/'+pages[name]+'?symbol='+encodeURIComponent(symbol);
     if(name===view){
      a.classList.add('active');
      a.setAttribute('aria-current','page');
     }else{
      a.classList.remove('active');
      a.removeAttribute('aria-current');
     }
    }
   });
   const proLink=byId('researchPro');
   if(proLink)proLink.href='/pro_research.html?mode=pro#stock/'+encodeURIComponent(symbol);

   setupWatchlist(symbol);

   const doc=await readStatements(symbol,fetch,async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join(''));

   hydrateHeroAndDossier(symbol,row,doc);

   let valDoc=null,valUniverse=null;
   try{
    const vr=await fetch('/financial-statements/valuation_gold_export.json');
    if(vr.ok){
     const vd=await vr.json();
     valUniverse=vd.companies||{};
     valDoc=valUniverse[symbol]||null;
    }
   }catch(_){}

   let finUniverse=null;
   if(view==='peers'){
    try{
     const fr=await fetch('/stocks/financial_index_v1.json');
     if(fr.ok){
      const fd=await fr.json();
      finUniverse=fd.stocks||{};
     }
    }catch(_){}
   }

   render(doc,row,view,valDoc,universe,valUniverse,finUniverse);
  }catch(error){
   const sub=byId('heroSub');
   if(sub)sub.textContent='Data not loaded';
   const box=el('section','research-error');
   box.append(el('h2','','Company data unavailable'),el('p','',error.message));
   const retry=el('button','research-action','Retry');
   retry.onclick=()=>location.reload();
   box.append(retry);
   byId('researchContent').replaceChildren(box);
  }
 }

 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(typeof window!=='undefined'?window:globalThis);
