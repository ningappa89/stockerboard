const fs=require('fs'); const path=require('path'); const os=require('os'); const root=path.resolve(__dirname,'..'); const output=fs.mkdtempSync(path.join(os.tmpdir(),'stockerboard-screen-'));  const cp=require('child_process'); const chrome=cp.spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-extensions','--remote-debugging-port=9236','--user-data-dir='+path.join(output,'chrome'),'--no-first-run','http://127.0.0.1:8096/'],{windowsHide:true}); const server=cp.spawn('python',['-m','http.server','8096','--bind','127.0.0.1'],{cwd:root,windowsHide:true});
(async()=>{
let targetTab;
for(let attempt=0;attempt<60;attempt++){
 await new Promise(r=>setTimeout(r,500));
 try {const tabs=await (await fetch('http://127.0.0.1:9236/json')).json();targetTab=tabs.find(t=>t.type==='page'&&t.url.includes('127.0.0.1:8096'));if(targetTab)break;}catch(_){}
}
if(!targetTab)throw Error('Local Stockerboard browser tab did not open');
const ws=new WebSocket(targetTab.webSocketDebuggerUrl); await new Promise(r=>ws.onopen=r);
let id=0;const pending=new Map(),errors=[];ws.onmessage=e=>{let m=JSON.parse(e.data);if(m.id){pending.get(m.id)(m.result);pending.delete(m.id)}else if(m.method==='Runtime.exceptionThrown'&&!m.params?.exceptionDetails?.url?.startsWith('chrome-extension://'))errors.push(m.params)};
const call=(method,params={})=>new Promise(r=>{pending.set(++id,r);ws.send(JSON.stringify({id,method,params}))});
const ev=async expression=>{let r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value};
await call('Runtime.enable');await call('Page.enable');
let ready=false;
for(let attempt=0;attempt<60;attempt++){ready=await ev('typeof getMarketSessionDate==="function" && !!document.getElementById("screenerTable")');if(ready)break;await new Promise(r=>setTimeout(r,500));}
if(!ready)throw Error('Stockerboard script did not initialize');
console.log(await ev('JSON.stringify({mode:localStorage.getItem("stockerboard_mode_v2"),rows:document.querySelectorAll("#screenerTable tbody tr").length,session:getMarketSessionDate(),parent:document.getElementById("tab-screener").parentElement.id})'));
await call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
const initialShot=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,'initial-universe-1440.png'),Buffer.from(initialShot.data,'base64'));
for(const preset of ['BREAKOUT','COILED','MOMENTUM','HIGH_ROE','VALUE_PE']) console.log(preset,await ev(`applyQuickScreen('${preset}'); JSON.stringify({count:screenerFilteredRows.length,presets:[...activeScreenerPresets],mode:localStorage.getItem('stockerboard_mode_v2')})`));
 console.log('company',await ev('openStockDrawer("IDEA"); JSON.stringify({visible:document.getElementById("stockDossierView").style.display === "block",symbol:activeDossierSymbol})'));

console.log('regressions', await ev(`(async () => {
 const checks=[]; const check=(name,ok)=>{if(!ok)throw Error(name);checks.push(name)};
 closeStockDossier(); resetScreenFilters();
 check('missing values',formatMetric(null)==='—' && formatMetric(undefined)==='—' && formatMetric('N/A')==='—' && formatMetric(0)==='0');
 check('52W positions',[10,15,19,20].every((cmp,i)=>stockPosition({cmp,low_52w:10,high_52w:20})===[0,50,90,100][i]) && stockPosition({cmp:10,high_52w:20})===null);
 check('canonical beginner population',investorUniverseStocks.size===2524&&document.querySelectorAll('#screenerTable tbody tr').length===2524);
 check('sort order initialized',document.getElementById('investorSort').value==='coverage_desc');
 check('search quote uses canonical price date',searchStocksFuzzy('HDFCBANK')[0].stock.cmp===721.2);
 const predicates={BREAKOUT:s=>s.dist_52w_pct!==null&&s.dist_52w_pct>=-.5,COILED:s=>s.dist_52w_pct!==null&&s.dist_52w_pct>=-3&&s.dist_52w_pct<-.05,MOMENTUM:s=>s.momentum_score!==null&&s.momentum_score>=85,HIGH_ROE:s=>parseFloat(s.roe)>=15,VALUE_PE:s=>parseFloat(s.pe)>0&&parseFloat(s.pe)<=25,VCP:s=>s.is_vcp,POCKET_PIVOT:s=>s.is_pocket_pivot,STAGE2:s=>s.is_stage2,CONFLUENCE:s=>s.is_confluence,VOL_SURGE:s=>parseFloat(s.volume_multiplier)>=1.5};
 for(const [preset,predicate] of Object.entries(predicates)) {
  applyQuickScreen(preset);
  const expected=[...investorUniverseStocks.values()].filter(predicate).map(s=>s.symbol).sort();
  check(preset,JSON.stringify(screenerFilteredRows.map(r=>r.dataset.sym).sort())===JSON.stringify(expected));
 }
 applyQuickScreen('HIGH_ROE'); switchUserMode('intermediate');check('Pro retains its 350-stock technical population',document.querySelectorAll('#screenerTable tbody tr').length===350);switchUserMode('fresher'); check('mode state retained',activeScreenerPresets.has('HIGH_ROE')&&document.getElementById('tab-screener').parentElement.id==='fresherHome'&&document.querySelectorAll('#screenerTable tbody tr').length===2524);
 resetScreenFilters(); document.getElementById('screenerSectorSelect').value='Financial Services';applyScreenerFilters();check('sector',screenerFilteredRows.every(r=>r.dataset.sec==='Financial Services'));
 document.getElementById('sliderVol').value=3;onPowerSliderChange();check('volume slider',screenerFilteredRows.every(r=>parseFloat(r.dataset.volmult)>=3));
 document.getElementById('tableSearch').value='__no_such_stock__';applyScreenerFilters();check('empty state',screenerFilteredRows.length===0&&document.getElementById('screenerEmptyState').classList.contains('visible'));
 resetScreenFilters();check('reset',!activeScreenerPresets.size&&document.getElementById('tableSearch').value===''&&document.getElementById('screenerSectorSelect').value==='ALL');
 document.getElementById('investorSort').value='roe_desc';sortInvestorResults('roe_desc');
 check('explicit ROE sort executes',screenerFilteredRows.length>0&&document.querySelector('#investorStockCards .investor-stock-card'));
 document.getElementById('investorSort').value='published';sortInvestorResults('published');
 document.getElementById('investorFilterOpen').click();
 check('filter dialog has an accessible name',document.getElementById('investorFilterDialog').getAttribute('aria-labelledby')==='investorFilterTitle');
 document.getElementById('investorFilter-sector').value='Financial Services';document.getElementById('investorFilter-sector').dispatchEvent(new Event('change'));
 const expectedFilterCount=[...investorUniverseStocks.values()].filter(s=>s.sector==='Financial Services').length;
 check('filter draft count',document.getElementById('investorFilterDialog').open&&document.getElementById('investorFilterApply').textContent==='Show '+expectedFilterCount+' '+(expectedFilterCount===1?'stock':'stocks'));
 document.getElementById('investorFilterApply').click();
 check('filter applied and URL state',screenerFilteredRows.length===expectedFilterCount&&new URLSearchParams(location.search).get('sector')==='Financial Services');
 resetScreenFilters();
 handleFresherSearchInput('RELIANCE');await new Promise(r=>setTimeout(r,400));check('autocomplete',document.getElementById('fresherDropdownList').innerText.includes('RELIANCE'));clearFresherSearch();
 document.dispatchEvent(new KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true}));check('Ctrl K',document.activeElement.id==='fresherSearchInput');document.activeElement.blur();
 const row=screenerFilteredRows[0];row.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));check('keyboard company view',activeDossierSymbol===row.dataset.sym&&document.getElementById('stockDossierView').style.display==='block');closeStockDossier();
 const before=getWatchlist().includes(row.dataset.sym);row.querySelector('.star-btn').click();check('watch star stays in results',!document.getElementById('drawerOverlay').classList.contains('open'));check('watch persistence',getWatchlist().includes(row.dataset.sym)!==before);row.querySelector('.star-btn').click();
 const theme=document.documentElement.dataset.theme;toggleTheme();check('theme toggle',document.documentElement.dataset.theme!==theme);toggleTheme();
 const stock=await fetchDossierData('RELIANCE');check('dossier on demand',stock&&stock.symbol==='RELIANCE');
 await openStockDossier('HDFCBANK'); check('HDFCBANK dossier fails closed on uncertified metrics',document.getElementById('dossierFundamentalsStatus').textContent==='Partial ratio coverage' && document.getElementById('dossierTblPE').textContent==='— Not available' && document.getElementById('dossierTblPB').textContent==='1.87' && document.getElementById('dossierTblROE').textContent==='— Not available' && document.getElementById('dossierTblROCE').textContent==='Not applicable for this company type'); check('company price uses dated dossier shard',(document.getElementById('dossierCmp').textContent==='₹707.25'||document.getElementById('dossierCmp').textContent==='₹721.20')&&(document.getElementById('dossierPriceAsOf').textContent.includes('2026-10-09')||document.getElementById('dossierPriceAsOf').textContent.includes('2026-10-01'))); check('company order and reported growth',document.getElementById('investorDossierTabs').nextElementSibling.id==='investorCompanySummary'&&document.getElementById('investorSummaryGrid').innerText.includes('Revenue')&&document.getElementById('investorCompanyAdvanced').hidden);check('canonical same-sector peers',(document.querySelectorAll('#dossierPeersContainer .dossier-peer-row').length===4&&document.querySelector('#dossierPeersContainer .dossier-peers-note')?.textContent.includes('Financial Services'))||document.getElementById('dossierPeersContainer').textContent.includes('published sector')); closeStockDossier();
 check('ratio provenance cites Stockerboard or official source and zero competitor link',(document.getElementById('dossierFundamentalsSource').textContent.includes('Certified public company dossier') || document.getElementById('dossierFundamentalsSource').textContent.includes('Official filing')) && !document.querySelector('#dossierFundamentalsSource a') && !document.querySelector('a[href*="screener.in"]'));
 await openStockDossier('ZOMATO');check('same-ISIN legacy symbol resolves to canonical company',activeDossierSymbol==='ETERNAL'&&document.getElementById('dossierSym').textContent==='ETERNAL');closeStockDossier();
 check('full-universe count is honest',investorUniverseStocks.size===2524);
 check('published company registered',investorUniverseStocks.has('HDFCBANK'));
 const expanded=investorUniverseStocks.get('3BBLACKBIO');check('non-technical universe company present',expanded!==undefined);
 await openStockDossier('3BBLACKBIO');check('expanded company page shows details',document.getElementById('investorSummaryGrid').textContent.includes('P/B'));closeStockDossier();
 await openStockDossier('SHIPROCKET'); check('empty source fails closed with honest em dash',document.getElementById('dossierTblPE').textContent==='— Not available'); closeStockDossier();
 for (const symbol of ['TCS','INFY','ITC','SBIN','RELIANCE','FEDDERSHOL']) {const data=await fetchDossierData(symbol);check(symbol+' data loads',data!==null);}
 check('zero network requests to fundamentals.json or competitor',performance.getEntriesByType('resource').filter(r=>r.name.includes('/fundamentals.json')||r.name.includes('screener')).length===0);
 check('retained tools',['exportActiveTableCSV','copyTradingViewTickers','copyFilteredTradingViewWatchlist','refreshRiskShield','updateJournalUI','handleGoogleAuthClick'].every(n=>typeof window[n]==='function'));
 check('investor date and universe disclosure',document.getElementById('investorDataNote').textContent.includes('2,524 companies')&&document.getElementById('investorDataNote').textContent.includes(APP_DATA.universe_as_of));
 check('zero competitor links across entire page',document.querySelectorAll('a[href*="screener.in"]').length===0);
 check('investor cards match first page',document.querySelectorAll('#investorStockCards .investor-stock-card').length===Math.min(24,screenerFilteredRows.length));
 check('honest quick screen names',document.getElementById('qs-btn-quality').textContent.includes('ROE ≥15%')&&document.getElementById('qs-btn-value').textContent.includes('P/E ≤25'));
 return checks;
})()`));
await ev('closeStockDossier(); resetScreenFilters();');
await call('Emulation.setDeviceMetricsOverride',{width:1280,height:1000,deviceScaleFactor:1,mobile:false});
await ev('openStockDossier("HDFCBANK")');
await ev('document.getElementById("dossierFundamentalsStatus").scrollIntoView({block:"center"})');
const hdfcShot=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,'hdfcbank-fundamentals.png'),Buffer.from(hdfcShot.data,'base64'));
await ev('closeStockDossier(); window.scrollTo(0,0)');
for(const width of [1440,1280,1024,768,430,390,375]){
await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
console.log(width,await ev('JSON.stringify({page:document.documentElement.scrollWidth,viewport:innerWidth,table:document.getElementById("screenerTable").getBoundingClientRect().width,resultsY:document.getElementById("tab-screener").getBoundingClientRect().top})'));
if([1440,375].includes(width)){const r=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,`screen-${width}.png`),Buffer.from(r.data,'base64'));}
if(width===375){await ev('document.getElementById("investorStockCards").scrollIntoView({block:"start"})');const r=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,'cards-375.png'),Buffer.from(r.data,'base64'));}
if(width===375){await ev('document.getElementById("investorFilterOpen").click()');const r=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,'filters-375.png'),Buffer.from(r.data,'base64'));await ev('document.getElementById("investorFilterDialog").close()');}
if(width===375){await ev('openStockDossier("HDFCBANK")');await ev('window.scrollTo({top:0,behavior:"instant"})');const r=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,'company-375.png'),Buffer.from(r.data,'base64'));await ev('closeStockDossier()');}
}
await call('Page.navigate',{url:'http://127.0.0.1:8096/?sector=Financial%20Services&roe=15'});
let restored=false;
for(let attempt=0;attempt<30;attempt++){
 await new Promise(r=>setTimeout(r,500));
 try{restored=await ev('document.getElementById("screenerSectorSelect")?.value==="Financial Services"&&document.getElementById("sliderRoe")?.value==="15"');if(restored)break;}catch(_){}
}
console.log('URL restore',await ev('JSON.stringify({sector:document.getElementById("screenerSectorSelect").value,roe:document.getElementById("sliderRoe").value,count:screenerFilteredRows.length})'));
if(!restored) throw Error('URL filter restore');
if(errors.length) throw Error(JSON.stringify(errors)); console.log('No JavaScript exceptions. Screenshots:',output);ws.close(); chrome.kill(); server.kill();
})().catch(e=>{console.error(e);chrome.kill();server.kill();process.exit(1)});

