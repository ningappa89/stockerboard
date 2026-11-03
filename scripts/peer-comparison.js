(function(root){
 'use strict';
 const number=cell=>cell?.status==='AVAILABLE'&&Number.isFinite(cell.value)?cell.value:null;
 function cohort(symbol,universe,groups){
  const target=groups.companies?.[symbol];if(target?.status!=='AVAILABLE'||!target.group)return [];
  const seen=new Set(),selectedIssuer=target.company_id;
  return universe.filter(c=>{
   const entry=groups.companies?.[c.symbol];if(entry?.status!=='AVAILABLE'||entry.group!==target.group)return false;
   if(selectedIssuer&&entry.company_id===selectedIssuer&&c.symbol!==symbol)return false;
   const id=entry.company_id||c.symbol;if(seen.has(id))return false;seen.add(id);return true;
  });
 }
 function unavailableMessage(group,count){
  if(group?.reason==='CURRENT_EQUITY_IDENTITY_REQUIRED')return 'The current eligible equity security or issuer identity is unresolved. Comparisons are held until identity is verified.';
  if(group?.reason?.startsWith('INCOMPATIBLE_'))return 'The business classification and financial reporting domain conflict. Comparisons are held for review.';
  if(count===1)return 'Only one eligible company is available in this cohort. Additional unrelated companies are not substituted.';
  return 'Verified industry classification or additional comparable companies are missing. Unrelated companies are not substituted.';
 }
 if(typeof module!=='undefined')module.exports={cohort,number,unavailableMessage};
 if(typeof document==='undefined')return;
 const put=(id,text)=>{const n=document.getElementById(id);if(n)n.textContent=text;};
 const fmt=(n,suffix='')=>n===null||!Number.isFinite(n)?'—':n.toLocaleString('en-IN',{maximumFractionDigits:2})+suffix;
 const median=values=>{values=values.filter(Number.isFinite).sort((a,b)=>a-b);const m=values.length>>1;return !values.length?null:values.length%2?values[m]:(values[m-1]+values[m])/2;};
 async function load(symbol){
  document.querySelectorAll('.subnav-tabs a').forEach(a=>{const href=a.getAttribute('href');if(href?.startsWith('stockerboard_'))a.href=href.split('?')[0]+'?symbol='+encodeURIComponent(symbol);});
  const stocks=document.getElementById('navStocks');if(stocks)stocks.href='/stocks/';
  const body=document.getElementById('peersTableBody');body.replaceChildren();for(const id of ['bmMcap','bmPe','bmRoe'])put(id,'—');put('peersCount','Checking peer classification…');
  put('companyName',symbol);put('sectorBadge','Checking classification…');put('peerSubtitle','Checking comparable company classifications…');
  try{
   const [ur,gr]=await Promise.all([fetch('/search_universe.json',{cache:'no-cache'}),fetch('/stocks/peer_groups_v1.json',{cache:'no-cache'})]);
   if(!ur.ok||!gr.ok)throw Error('Peer classification is not available in this release');
   const universe=await ur.json(),groups=await gr.json(),active=universe.find(c=>c.symbol===symbol);
   if(!active||groups.contract!=='PEER_GROUPS_V1')throw Error('No published peer classification for this company');
   const ir=await fetch('/financial-statements/index.json',{cache:'no-cache'});if(!ir.ok||(await ir.json()).release_id!==groups.statement_release)throw Error('Peer classification does not match the financial release');
   const mr=await fetch('/stocks/market_universe_index_v1.json',{cache:'no-cache'});if(!mr.ok||(await mr.json()).as_of!==groups.market_as_of)throw Error('Peer classification does not match the market release');
   if(Object.keys(groups.companies).length!==universe.length)throw Error('Peer universe does not reconcile');
   put('companyName',active.name);put('sectorTag',active.sector);put('heroAvatar',symbol);put('tickerLine','NSE: '+symbol);
   const group=groups.companies[symbol],candidates=cohort(symbol,universe,groups);
   put('sectorBadge',group?.label||'Classification unavailable');
   put('peerSubtitle',group?.basis==='BASIC_INDUSTRY'?'Companies sharing the same evidenced basic industry.':group?.group==='BANKING'?'Banks grouped by verified financial-reporting domain. Business mix and size still differ.':'Broader sector context only: detailed business-industry classification is not available. These companies are not asserted to be direct business peers.');
   if(candidates.length<2){put('peersCount','No comparable cohort available');put('peerSubtitle',unavailableMessage(group,candidates.length));return;}
   const vr=await root.StockerboardData.valuations(),valuation=await vr.json();
   const rows=candidates.map(c=>({...c,mcap:number(valuation.companies[c.symbol]?.metrics?.MARKET_CAP)})).sort((a,b)=>(b.mcap??-Infinity)-(a.mcap??-Infinity)||a.symbol.localeCompare(b.symbol));
   let selected=rows.slice(0,8);if(!selected.some(c=>c.symbol===symbol))selected=[...rows.slice(0,7),rows.find(c=>c.symbol===symbol)];
   const details=await Promise.all(selected.map(async c=>{
    let doc;
    try{const response=await root.StockerboardData.statements(c.symbol);doc=await response.json();}catch(e){
     return {...c,pe:null,pb:null,roe:null,financialStatus:'No verified financial statements'};
    }
    const scope=doc.default_scope;
    if(doc.release_id!==groups.statement_release||doc.financial_domain!==groups.companies[c.symbol].domain)throw Error('Peer financial identity changed; reload the current release');
    const latest=key=>{const p=(doc.statements.ratios||[]).filter(p=>p.scope===scope&&p.metrics[key]).sort((a,b)=>b.period_end.localeCompare(a.period_end))[0];return number(p?.metrics[key]);};
    const metrics=valuation.companies[c.symbol]?.metrics||{};
    return {...c,pe:number(metrics.P_E),pb:number(metrics.P_B),roe:latest('ROE'),valuationDate:valuation.companies[c.symbol]?.valuation_date};
   }));
   const others=details.filter(c=>c.symbol!==symbol);
   put('bmMcap',others.every(c=>c.mcap!==null)?fmt(others.reduce((s,c)=>s+c.mcap,0)/1e7)+' Cr':'—');put('bmPe',fmt(median(others.map(c=>c.pe)),'×'));put('bmRoe',fmt(median(others.map(c=>c.roe)),'%'));
   put('peersCount',`${others.length} comparable companies + selected company · ${candidates.length} classified companies in total`);
   const headers=document.querySelectorAll('thead th');if(headers.length===7){headers[5].textContent='P/B (x)';headers[6].textContent='Quote date';}
   for(const c of details){
    const tr=document.createElement('tr');if(c.symbol===symbol)tr.className='row-active';
    for(const text of [c.name+' · '+c.symbol+(c.symbol===symbol?' (selected)':''),fmt(c.price_num),fmt(c.mcap===null?null:c.mcap/1e7),fmt(c.pe,'×'),fmt(c.roe,'%'),fmt(c.pb,'×'),c.price_as_of||'—']){const td=document.createElement('td');td.textContent=text;tr.append(td);}
    const a=document.createElement('a');a.className='peer-company-link';a.href='/stockerboard_company_overview.html?symbol='+encodeURIComponent(c.symbol);a.textContent=tr.firstChild.textContent;tr.firstChild.replaceChildren(a);body.append(tr);
   }
   const note=document.querySelector('.peers-card-footer');if(note)note.textContent=`Comparisons use up to 7 other companies, excluding the selected company from benchmark statistics. Prices use the quote dates shown; valuation basis ${valuation.valuation_date}. ROE uses the latest period in each company's default reporting scope. Missing values are excluded from medians; no data is inferred.`;
  }catch(e){body.replaceChildren();put('peersCount','Peer comparison unavailable');root.StockerboardData.error(e.message);}
 }
 root.StockerboardPeers={load};
})(typeof window!=='undefined'?window:globalThis);
