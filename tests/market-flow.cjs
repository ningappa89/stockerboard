const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
 if(m[2].trim()&&!m[1].includes('application/')) new vm.Script(m[2]);
}
const adapter=html.match(/<script id="market-flow-adapter">([\s\S]*?)<\/script>/)[1];
const cache=new Map();let requests=0;
const ctx=vm.createContext({APP_DATA:{session_date:'2026-09-22',universe_as_of:'2026-10-01',market_screener:[{symbol:'GLASSWALL',cmp:9999,candles:[{}]}]},
 fundamentalsSnapshot:{},dossierCache:cache,putInDossierCache:(s,v)=>cache.set(s,v),loadFundamentalsSnapshot:async()=>{},
 getDossierShard:s=>s.slice(0,2),DOMException,
 readDossierFundamentals:s=>Object.fromEntries(['pe','pb','roe','roce'].map(k=>[k,s[k]??null])),
 fetch:async url=>{requests++;const symbol=decodeURIComponent(url.split('/').at(-1).split('.json')[0]);const p=path.join(root,'stocks',symbol.slice(0,2),symbol+'.json');return {ok:fs.existsSync(p),json:async()=>JSON.parse(fs.readFileSync(p,'utf8'))};}
});
vm.runInContext(adapter.slice(0,adapter.indexOf('    preloadDossier =')),ctx);
const evaluate=code=>vm.runInContext(code,ctx);
(async()=>{
 for(const [symbol,sessions] of [['GLASSWALL',12],['DOLLEX',14],['PRANAV',13],['QUINTEGRA',55]]) {
  const stock=await evaluate(`fetchDossierData('${symbol}')`);
  assert.equal(stock.history_basis,'AVAILABLE_HISTORY');assert.equal(stock.history.sessions_available,sessions);assert.equal(stock.price_as_of,'2026-10-01');
 }
 assert.equal((await evaluate("fetchDossierData('GLASSWALL')")).cmp,270.4);
 assert.equal(requests,4,'cached detail does not make an extra request');
 const full=await evaluate("fetchDossierData('TCS')");assert.equal(full.history_basis,'52_WEEK');
 for(const symbol of ['HINDUNILVR','VEDL']) {const stock=await evaluate(`fetchDossierData('${symbol}')`);assert.equal(stock.analytics_status,'BLOCKED_INPUT');for(const key of ['high_52w','low_52w','momentum_score','volume_multiplier','technical_pivot'])assert.equal(stock[key],null);assert.equal(stock.is_stage2,false);}
 const missing=evaluate("normalizeDossierJson({symbol:'EMPTY',price:{close:100},range:{},metrics:{}},'EMPTY')");assert.equal(missing.high_52w,null);assert.equal(missing.momentum_score,null);assert.equal(missing.is_stage2,false);
 ctx.fundamentalsSnapshot.ZERO={roe:0,roce:-3};const zero=evaluate("normalizeDossierJson({symbol:'ZERO'},'ZERO')");assert.equal(zero.roe,0);assert.equal(zero.roce,-3);
 await assert.rejects(()=>evaluate("fetchDossierData('NO_SUCH_STOCK')"));
 console.log('PASS: SPA syntax; canonical-first values; cache; full/short/blocked history; absent metrics; zero/negative ratios; missing-stock failure');
})().catch(e=>{console.error(e);process.exitCode=1});
