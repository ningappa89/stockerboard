(function(root){
 'use strict';
 const requests=new Map();
 const valid=s=>typeof s==='string'&&/^[A-Z0-9&_.-]{1,40}$/.test(s);
 const sha=async raw=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',raw))].map(v=>v.toString(16).padStart(2,'0')).join('');
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
  return {ok:true,json:async()=>d};
 }
 async function valuations(){
  const r=await fetch('/financial-statements/valuation_gold_export.json',{cache:'no-cache'});if(!r.ok)throw Error('Valuation release unavailable');
  const raw=await r.arrayBuffer(),sidecar=await fetch('/financial-statements/valuation_gold_export.json.sha256',{cache:'no-cache'});
  if(!sidecar.ok||(await sidecar.text()).trim().split(/\s+/)[0]!==await sha(raw))throw Error('Valuation integrity check failed');
  const d=JSON.parse(new TextDecoder().decode(raw));
  if(d.contract_version!=='VALUATION_GOLD_V1.1.0'||!d.companies)throw Error('Unsupported valuation release');
  for(const [symbol,c] of Object.entries(d.companies)){
   if(c.symbol!==symbol)throw Error('Valuation identity mismatch');
   if(d.policy_version!=='VALUATION_INPUTS_CERT_V2'){
    for(const k of ['EV_EBITDA','EV_SALES','FCF_YIELD','DIVIDEND_YIELD'])if(c.metrics?.[k])c.metrics[k]={...c.metrics[k],status:'UNAVAILABLE',value:null,reason:'REVALIDATION_REQUIRED'};
    c.status='HOLD';
   }
  }
  return {ok:true,json:async()=>d};
 }
 async function stock(symbol){
  if(!valid(symbol))throw Error('Invalid company symbol');
  const shard=symbol.slice(0,2).replace(/[^A-Z0-9]/g,'_').padEnd(2,'_');
  const r=await fetch('/stocks/'+shard+'/'+encodeURIComponent(symbol)+'.json',{cache:'no-cache'});
  if(!r.ok)throw Error('Company dossier unavailable');const d=await r.json();if(d.symbol!==symbol)throw Error('Dossier identity mismatch');
  if(!requests.has('market'))requests.set('market',fetch('/stocks/market_universe_index_v1.json',{cache:'no-cache'}).then(async r=>{if(!r.ok)throw Error('Market universe unavailable');const m=await r.json();if(m.count!==m.stocks?.length||new Set(m.stocks.map(x=>x[0])).size!==m.count)throw Error('Invalid market population');return m;}));
  const market=await requests.get('market'),row=market.stocks.find(x=>x[0]===symbol);
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
  return {ok:true,json:async()=>d};
 }
 function error(message){
  let box=document.getElementById('researchDataError');if(!box){box=document.createElement('p');box.id='researchDataError';box.setAttribute('role','alert');box.style.cssText='padding:16px;border:1px solid #a04b24;background:#fff4e7;color:#623314';(document.querySelector('main')||document.body).prepend(box);}box.textContent=message+' — retry by reloading this page. No example values should be used as company data.';
 }
 root.StockerboardData={statements,valuations,stock,error};
 if(typeof module!=='undefined')module.exports={valid};
})(typeof window!=='undefined'?window:globalThis);
