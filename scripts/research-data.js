(function(root){
 'use strict';
 const requests=new Map();
 const valid=s=>typeof s==='string'&&/^[A-Z0-9&_.-]{1,40}$/.test(s);
 const sha=async raw=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',raw))].map(v=>v.toString(16).padStart(2,'0')).join('');
 const messages={MISSING_CERTIFIED_INPUT:'The required inputs have not been verified yet.',
  UNSUPPORTED_INPUT_CONTRACT:'This measure is awaiting verified calculation inputs.',
  UNSUPPORTED_DOMAIN_SEMANTICS:'A verified calculation for this type of business is not available yet.',
  DOMAIN_NOT_APPLICABLE:'This measure does not apply to this type of business.',
  NOT_APPLICABLE_SECTOR_POLICY:'This measure does not apply to this type of business.',
  NO_CURRENT_SESSION_QUOTE:'No quote is available for the current market session.',
  MISSING_CERTIFIED_CURRENT_SHARE_STATE:'A verified current share count is required.',
  MISSING_RESOLVED_FINANCIAL_IDENTITY:'Verified company financial statements are not available yet.',
  MISSING_MATCHED_SCOPE_FINANCIAL_INPUT:'Verified financial inputs for this reporting scope are unavailable.',
  DIVIDEND_WINDOW_COMPLETENESS_UNVERIFIED:'The complete dividend history has not been verified yet.',
  NO_VERIFIED_USABLE_VALUES:'Verified financial statements are not available in this release.'};
 const reasonText=cell=>messages[cell?.reason]||(cell?.status==='NOT_APPLICABLE'?'This measure is not applicable.':'A verified value is not available in this release.');
 function initialFinancialView(doc){
  const scope=doc.default_scope||'CONSOLIDATED',has=key=>(doc.statements?.[key]||[]).some(p=>p.scope===scope&&Object.values(p.metrics||{}).some(c=>c.status==='AVAILABLE'));
  let period=has('annual_pnl')?'annual':has('quarterly')?'quarterly':has('ttm')?'ttm':'annual';
  const statement=['annual_pnl','quarterly','ttm'].some(has)?'income':has('balance_sheet')?'balance':has('cash_flow')?'cashflow':has('ratios')?'ratios':'income';
  if(statement==='cashflow'&&!(doc.statements.cash_flow||[]).some(p=>p.scope===scope&&p.duration_kind==='ANNUAL'))period='quarterly';
  return {scope,period,statement};
 }
 function notice(id,text){
  if(typeof document==='undefined')return;
  let n=document.getElementById(id);if(!n){n=document.createElement('p');n.id=id;n.setAttribute('role','status');n.style.cssText='padding:12px 16px;border:1px solid #ddebe2;border-radius:10px;background:#eff7f2;color:#315747;font-size:14px;line-height:1.6';(document.querySelector('main')||document.body).prepend(n);}n.textContent=text;
 }
 function annotateMetrics(d){
  if(typeof document==='undefined')return;
  for(const [key,id] of Object.entries({market_cap:'kpiMcap',pe:'kpiPe',roe:'kpiRoe',revenue:'kpiRev',net_margin_pct:'kpiMargin',bvps:'kpiDiv'})){
   const node=document.getElementById(id),cell=d.metric_availability?.[key];if(!node||!cell)continue;
   const text=cell.status==='AVAILABLE'?(cell.price_as_of?'Price basis: '+cell.price_as_of:'Verified value'):reasonText(cell);
   node.title=text;if(cell.status!=='AVAILABLE'&&node.nextElementSibling)node.nextElementSibling.textContent=text;
  }
 }
 async function marketIndex(){
  if(!requests.has('market'))requests.set('market',fetch('/stocks/market_universe_index_v1.json',{cache:'no-cache'}).then(async r=>{if(!r.ok)throw Error('Market universe unavailable');const m=await r.json();if(m.count!==m.stocks?.length||new Set(m.stocks.map(x=>x[0])).size!==m.count)throw Error('Invalid market population');return m;}).catch(e=>{requests.delete('market');throw e;}));
  return requests.get('market');
 }
 async function index(){
  if(!requests.has('index'))requests.set('index',fetch('/financial-statements/index.json',{cache:'no-cache'}).then(async r=>{if(!r.ok)throw Error('Statement index unavailable');const d=await r.json();if(d.schema_version!=='1.0')throw Error('Unsupported statement release');return d;}).catch(e=>{requests.delete('index');throw e;}));
  return requests.get('index');
 }
 async function statements(symbol){
  if(!valid(symbol))throw Error('Invalid company symbol');
  const i=await index(),entry=i.companies?.[symbol];
  if(!entry||entry.identity_status!=='RESOLVED'||!/^releases\/FSV1_[a-f0-9]+\/[A-Z0-9&_.-]+\.json$/.test(entry.path))throw Error('No verified company statements');
  const r=await fetch('/financial-statements/'+entry.path,{cache:'no-cache'});if(!r.ok)throw Error('Statement payload unavailable');
  const raw=await r.arrayBuffer();if(await sha(raw)!==entry.sha256)throw Error('Statement integrity check failed');
  const d=JSON.parse(new TextDecoder().decode(raw));
  if(d.symbol!==symbol||d.release_id!==i.release_id||d.schema_version!=='1.0'||d.identity?.status!=='RESOLVED')throw Error('Statement identity mismatch');
  if(!d.default_scope)notice('financialAvailability','Verified financial statements are not available for this company yet. Current prices remain available.');
  return {ok:true,json:async()=>d};
 }
 async function readValuations(){
  let file='/financial-statements/valuation_public_index_v1.json',r=await fetch(file,{cache:'no-cache'});
  if(!r.ok){file='/financial-statements/valuation_gold_export.json';r=await fetch(file,{cache:'no-cache'});}if(!r.ok)throw Error('Valuation release unavailable');
  const raw=await r.arrayBuffer(),sidecar=await fetch(file+'.sha256',{cache:'no-cache'});
  if(!sidecar.ok||(await sidecar.text()).trim().split(/\s+/)[0]!==await sha(raw))throw Error('Valuation integrity check failed');
  const d=JSON.parse(new TextDecoder().decode(raw));
  if(d.contract_version!=='VALUATION_GOLD_V1.1.0'||!d.companies)throw Error('Unsupported valuation release');
  if(d.statement_release&&d.statement_release!==(await index()).release_id)throw Error('Valuation and financial releases do not match');
  if(d.market_sha256){const m=await marketIndex();if(d.market_as_of!==m.as_of)throw Error('Valuation and price sessions do not match');}
  for(const [symbol,c] of Object.entries(d.companies)){
   if(c.symbol!==symbol)throw Error('Valuation identity mismatch');
   for(const cell of Object.values(c.metrics||{}))if(cell.status==='AVAILABLE'&&(!Number.isFinite(cell.value)||typeof cell.value!=='number'))throw Error('Invalid certified valuation value');
   if(d.policy_version!=='VALUATION_INPUTS_CERT_V3'){
    for(const k of ['EV_EBITDA','EV_SALES','FCF_YIELD','DIVIDEND_YIELD'])if(c.metrics?.[k])c.metrics[k]={...c.metrics[k],status:'UNAVAILABLE',value:null,reason:'REVALIDATION_REQUIRED'};
    c.status='HOLD';
   }
  }
  return {ok:true,json:async()=>d};
 }
 async function valuations(){
  if(!requests.has('valuations'))requests.set('valuations',readValuations().catch(e=>{requests.delete('valuations');throw e;}));
  return requests.get('valuations');
 }
 function overlayCurrentFinancials(stocks,valuation,session){
  if(valuation&&(valuation.valuation_date!==session||valuation.coverage_complete!==true))throw Error('Current valuation population/date mismatch');
  const result={};
  for(const [symbol,source] of Object.entries(stocks)){
   const company=valuation?.companies[symbol],r={...source,ratio_status:{...source.ratio_status}};
   if(company&&company.identity_status!=='RESOLVED')for(const field of ['roe','roce','debt_to_equity','current_ratio']){r[field]=null;r.ratio_status[field]={status:'UNAVAILABLE',reason:'UNRESOLVED_CURRENT_IDENTITY'};}
   for(const [key,field] of [['P_E','pe'],['P_B','pb']]){
    const cell=company?.metrics[key];r[field]=cell?.status==='AVAILABLE'&&Number.isFinite(cell.value)?cell.value:null;
    r.ratio_status[field]=cell||{status:'UNAVAILABLE',reason:'CURRENT_VALUATION_UNAVAILABLE'};
   }
   const mcap=company?.metrics.MARKET_CAP;r.market_cap_crore=mcap?.status==='AVAILABLE'?mcap.value/1e7:null;
   r.pe_price_as_of=company?.valuation_date||null;result[symbol]=r;
  }
  return result;
 }
 async function stock(symbol){
  if(!valid(symbol))throw Error('Invalid company symbol');
  const shard=symbol.slice(0,2).replace(/[^A-Z0-9]/g,'_').padEnd(2,'_');
  const r=await fetch('/stocks/'+shard+'/'+encodeURIComponent(symbol)+'.json',{cache:'no-cache'});
  if(!r.ok)throw Error('Company dossier unavailable');const d=await r.json();if(d.symbol!==symbol)throw Error('Dossier identity mismatch');
  const market=await marketIndex(),row=market.stocks.find(x=>x[0]===symbol);
  if(!row)throw Error('Company is outside the current published market universe');
  d.sector=row[5]||'Sector awaiting verification';d.industry=d.industry==='EQ'?'Industry awaiting verification':d.industry;
  d.metric_availability={...d.ratios_status};
  if(row&&Number.isFinite(row[2])&&/^\d{4}-\d{2}-\d{2}$/.test(row[6])){
   if(d.price?.as_of!==row[6]){d.range={};d.price={close:row[2],as_of:row[6],type:'EOD_CLOSE'};}
   else d.price={...d.price,close:row[2]};
   d.cmp=row[2];d.price_as_of=row[6];
  }
  try{
   if(!requests.has('history'))requests.set('history',fetch('/price-history/index.json',{cache:'no-cache'}).then(async r=>{if(!r.ok)throw Error('Price history is not published');return r.json();}));
   const i=await requests.get('history'),entry=i.companies?.[symbol];
   if(i.contract!=='PRICE_HISTORY_V1'||i.as_of!==market.as_of||entry?.status!=='AVAILABLE')throw Error('No matching published price history');
   if(entry.path!==`price-history/releases/${i.release_id}/${symbol}.json`||!/^PHV1_[a-f0-9]{24}$/.test(i.release_id))throw Error('Invalid price history path');
   const r=await fetch('/'+entry.path,{cache:'no-cache'});if(!r.ok)throw Error('Price series unavailable');const raw=await r.arrayBuffer();
   if(await sha(raw)!==entry.sha256)throw Error('Price history integrity check failed');
   const h=JSON.parse(new TextDecoder().decode(raw));
   if(h.contract!=='PRICE_HISTORY_V1'||h.symbol!==symbol||h.release_id!==i.release_id||h.candles.length!==entry.count||h.candles.length<2)throw Error('Price series identity mismatch');
   let previous='';for(const c of h.candles){if(!/^\d{4}-\d{2}-\d{2}$/.test(c.time)||c.time<=previous||!Number.isFinite(c.close)||c.close<=0)throw Error('Invalid price series');previous=c.time;}
   const last=h.candles.at(-1);if(last.time!==row[6]||Math.abs(last.close-row[2])>0.011)throw Error('Price history does not match current quote');
   d.candles=h.candles;d.history={first_session:entry.first,last_session:entry.last,sessions_available:entry.count};
  }catch(e){d.candles=[];d.history_error=e.message;}
  try{
   const valuation=await(await valuations()).json(),company=valuation.companies[symbol];
   if(company&&valuation.valuation_date===market.as_of){
    for(const [key,field] of [['MARKET_CAP','market_cap'],['P_E','pe'],['P_B','pb']]){
     const cell=company.metrics[key];d[field]=cell?.status==='AVAILABLE'?cell.value:null;d.metric_availability[field]=cell;
    }
    d.valuation_as_of=company.valuation_date;
    if(company.identity_status&&company.identity_status!=='RESOLVED'){
     for(const key of ['roe','roce','revenue','pat','eps','net_margin_pct','bvps','debt_to_equity','current_ratio']){d[key]=null;d.metric_availability[key]={status:'UNAVAILABLE',reason:'UNRESOLVED_CURRENT_IDENTITY'};}
     notice('financialAvailability','Financial identity is awaiting verification. Market prices remain available.');
    }
   }else notice('valuationAvailability','Current prices and valuation figures have different dates. Valuation figures use '+(company?.valuation_date||valuation.valuation_date||'an older snapshot')+'.');
  }catch(e){d.valuation_error=e.message;notice('valuationAvailability','Current valuation data could not be verified. Retained financial figures may use an older price basis.');}
  for(const key of ['revenue','net_margin_pct','bvps'])d.metric_availability[key]={status:Number.isFinite(d[key])?'AVAILABLE':'UNAVAILABLE',reason:'MISSING_CERTIFIED_INPUT'};
  if(row[6]!==market.as_of)notice('quoteAvailability','Last available quote: '+row[6]+'. No quote is available for this company in the current session.');
  return {ok:true,json:async()=>d};
 }
 function error(message){
  let box=document.getElementById('researchDataError');if(!box){box=document.createElement('p');box.id='researchDataError';box.setAttribute('role','alert');box.style.cssText='padding:16px;border:1px solid #a04b24;background:#fff4e7;color:#623314';(document.querySelector('main')||document.body).prepend(box);}box.textContent=message+' — retry by reloading this page. No example values should be used as company data.';
 }
 root.StockerboardData={statements,valuations,stock,error,notice,reasonText,annotateMetrics,initialFinancialView,overlayCurrentFinancials};
 if(typeof module!=='undefined')module.exports={valid,reasonText,initialFinancialView,overlayCurrentFinancials};
})(typeof window!=='undefined'?window:globalThis);
