const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const {initialFinancialView,reasonText,overlayCurrentFinancials}=require('../scripts/research-data.js');
const period=(scope)=>({scope,metrics:{REVENUE_FROM_OPERATIONS:{status:'AVAILABLE',value:100}}});
assert.deepEqual(initialFinancialView({default_scope:'STANDALONE',statements:{quarterly:[period('STANDALONE')]}}),{scope:'STANDALONE',statement:'income',period:'quarterly'});
assert.equal(initialFinancialView({default_scope:'CONSOLIDATED',statements:{balance_sheet:[period('CONSOLIDATED')]}}).statement,'balance');
assert.match(reasonText({reason:'DIVIDEND_WINDOW_COMPLETENESS_UNVERIFIED'}),/complete dividend history/i);

async function testCurrentValuationOverlay(){
 const exported={contract_version:'VALUATION_GOLD_V1.1.0',policy_version:'VALUATION_INPUTS_CERT_V2',valuation_date:'2026-11-03',companies:{TEST:{symbol:'TEST',valuation_date:'2026-11-03',metrics:{P_E:{status:'AVAILABLE',value:12},P_B:{status:'UNAVAILABLE',value:null,reason:'MISSING_MATCHED_SCOPE_FINANCIAL_INPUT'},MARKET_CAP:{status:'AVAILABLE',value:120000}}}}};
 const raw=Buffer.from(JSON.stringify(exported)),hash=crypto.createHash('sha256').update(raw).digest('hex');
 const market={as_of:'2026-11-03',count:1,stocks:[['TEST','Test',120,0,0,'Information Technology','2026-11-03']]};
 const source={symbol:'TEST',pe:10,pb:2,market_cap:100000,sector:'EQUITY',industry:'EQ',debt_to_equity:0,price:{close:100,as_of:'2026-10-09'}};
 const context={window:{},crypto:crypto.webcrypto,TextDecoder,Uint8Array,Map,Set,fetch:async url=>{
  if(url.endsWith('/TEST.json'))return {ok:true,json:async()=>structuredClone(source)};
  if(url.includes('market_universe'))return {ok:true,json:async()=>market};
  if(url.endsWith('valuation_gold_export.json'))return {ok:true,arrayBuffer:async()=>raw};
  if(url.endsWith('.sha256'))return {ok:true,text:async()=>hash+'  valuation_gold_export.json\r\n'};
  return {ok:false};
 }};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../scripts/research-data.js'),'utf8'),context);
 const stock=await(await context.window.StockerboardData.stock('TEST')).json();
 assert.equal(stock.price.close,120);
 assert.equal(stock.pe,12,'Project certified current values rather than the older dossier multiple');
 assert.equal(stock.pb,null,'Unavailable current data must not fall back to an older multiple');
 assert.equal(stock.market_cap,120000);assert.equal(stock.debt_to_equity,0);
 assert.equal(stock.sector,'Information Technology');assert.equal(stock.valuation_as_of,'2026-11-03');
}

async function testActualFinancialPageInitialScope(){
 const text=fs.readFileSync(path.join(__dirname,'../stockerboard_financials_tab.html'),'utf8');
 const actual=text.slice(text.indexOf('async function loadFinancialData(symbol)'),text.indexOf('function formatVal('));
 const doc={symbol:'TEST',default_scope:'STANDALONE',statements:{quarterly:[period('STANDALONE')]}};
 const selected={};const nodes={};
 const context={document:{getElementById:id=>nodes[id]||(nodes[id]={textContent:'',innerText:'',replaceChildren(){}})},
  updateSubnav(){},StockerboardData:{initialFinancialView,statements:async()=>({ok:true,json:async()=>doc}),error:message=>{throw Error(message)}},
  fetch:async url=>({ok:true,json:async()=>url.includes('search_universe')?[]:{release_id:'F'}}),
  setScope:s=>selected.scope=s,setPeriod:p=>selected.period=p,setStatement:s=>selected.statement=s};
 vm.createContext(context);vm.runInContext(actual,context);await context.loadFinancialData('TEST');
 assert.deepEqual(selected,{scope:'STANDALONE',period:'quarterly',statement:'income'});
}

function testActualCashFlowPeriodsAndMissingRatioCards(){
 const text=fs.readFileSync(path.join(__dirname,'../stockerboard_financials_tab.html'),'utf8');
 const actual=text.slice(text.indexOf('function formatVal('),text.indexOf('function setScope('));
 const nodes={};
 const node=()=>({children:[],style:{},classList:{toggle(){}},replaceChildren(){this.children=[];},append(...children){this.children.push(...children)},appendChild(child){this.children.push(child)},
  set innerHTML(html){this.html=html;this.children=[node(),node(),node()]},get innerHTML(){return this.html||''}});
 const available=value=>({status:'AVAILABLE',unit:'INR',value});
 const context={document:{getElementById:id=>nodes[id]||(nodes[id]=node()),createElement:()=>node()},
  currentScope:'CONSOLIDATED',currentStatement:'cashflow',currentPeriodKind:'annual',StockerboardData:{reasonText},
  loadedStatementData:{financial_domain:'GENERAL_CORPORATE',statements:{cash_flow:[
   {scope:'CONSOLIDATED',period_start:'2025-04-01',period_end:'2026-03-31',duration_kind:'ANNUAL',metrics:{CFO:available(100e7)}},
   {scope:'CONSOLIDATED',period_start:'2026-01-01',period_end:'2026-03-31',duration_kind:'QUARTER',metrics:{CFO:available(25e7)}},
   {scope:'CONSOLIDATED',period_start:'2024-04-01',period_end:'2025-03-31',duration_kind:'ANNUAL',metrics:{CFO:available(80e7)}}]}}};
 vm.createContext(context);vm.runInContext(actual,context);context.renderActiveView();
 assert.match(nodes.heroCard1Val.innerText,/100/,'Annual CFO must not be replaced by Q4 CFO ending on the same date');
 assert.equal(nodes.btnTtm.disabled,true,'Do not imply a certified TTM cash-flow series');
 context.currentPeriodKind='quarterly';context.renderActiveView();
 assert.match(nodes.heroCard1Val.innerText,/25/);assert.equal(nodes.thPeriod1.innerText,'Earlier period unavailable');
 context.currentStatement='ratios';context.loadedStatementData.statements.ratios=[{scope:'CONSOLIDATED',period_end:'2026-03-31',metrics:{ROE:{status:'UNAVAILABLE',value:null},P_E:{status:'UNAVAILABLE',value:null},P_B:{status:'UNAVAILABLE',value:null}}}];
 context.renderActiveView();
 for(const id of ['heroCard1Val','heroCard2Val','heroCard3Val'])assert.equal(nodes[id].innerText,'—','Never replace a missing company value with a prototype number');
}

testActualCashFlowPeriodsAndMissingRatioCards();

async function testActualHomeUsesCurrentValuationWithoutChangingOwnerIndex(){
 const text=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 const code=text.slice(text.indexOf('async function loadDossierFinancialIndex()'),text.indexOf('function setScreenerPopulation('));
 const original={pe:10,pb:2,roe:20,ratio_status:{roe:{status:'AVAILABLE'}},coverage_basis:'CERTIFIED'};
 const valuation={coverage_complete:true,valuation_date:'2026-11-03',companies:{TEST:{identity_status:'RESOLVED',valuation_date:'2026-11-03',metrics:{P_E:{status:'AVAILABLE',value:12},P_B:{status:'UNAVAILABLE',value:null},MARKET_CAP:{status:'AVAILABLE',value:120e7}}}}};
 const stock={symbol:'TEST',pe:10,roe_raw:20,strategies:['VCP']};const context={window:{},canonicalUniverse:[['TEST']],canonicalUniverseAsOf:'2026-11-03',APP_DATA:{market_screener:[stock]},
  fetch:async()=>({ok:true,json:async()=>({schema_version:1,source:'certified_public_dossier_v2',canonical_count:1,source_dossier_release_id:'D',stocks:{TEST:original}})}),
  StockerboardData:{overlayCurrentFinancials,valuations:async()=>({json:async()=>valuation})},document:{getElementById:()=>({textContent:''})},console};
 vm.createContext(context);vm.runInContext(code,context);await context.loadDossierFinancialIndex();
 assert.equal(context.dossierFinancialIndex.TEST.pe,12);assert.equal(context.dossierFinancialIndex.TEST.pb,null);
 assert.equal(original.pe,10,'The immutable owner projection is not edited');
 assert.equal(stock.pe,12);assert.equal(stock.pe_raw,12);assert.equal(stock.is_compounder,true);assert.ok(stock.strategies.includes('Compounder'));
 assert.throws(()=>overlayCurrentFinancials({TEST:original},valuation,'2026-11-02'),/mismatch/);
}

Promise.all([testCurrentValuationOverlay(),testActualFinancialPageInitialScope(),testActualHomeUsesCurrentValuationWithoutChangingOwnerIndex()]).then(()=>console.log('PASS: current valuation overlay, unavailable-value isolation, zero preservation, actual Financials scope and Home/Pro valuation wiring')).catch(error=>{console.error(error);process.exitCode=1;});
