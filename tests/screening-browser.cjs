const fs=require('fs'); const path=require('path'); const os=require('os'); const root=path.resolve(__dirname,'..'); const output=fs.mkdtempSync(path.join(os.tmpdir(),'stockerboard-screen-'));  const cp=require('child_process'); const chrome=cp.spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--remote-debugging-port=9236','--user-data-dir='+path.join(output,'chrome'),'--no-first-run','http://127.0.0.1:8096/'],{windowsHide:true}); const server=cp.spawn('python',['-m','http.server','8096','--bind','127.0.0.1'],{cwd:root,windowsHide:true});
(async()=>{
await new Promise(r=>setTimeout(r,6000)); const tabs=await (await fetch('http://127.0.0.1:9236/json')).json();
const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl); await new Promise(r=>ws.onopen=r);
let id=0;const pending=new Map(),errors=[];ws.onmessage=e=>{let m=JSON.parse(e.data);if(m.id){pending.get(m.id)(m.result);pending.delete(m.id)}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params)};
const call=(method,params={})=>new Promise(r=>{pending.set(++id,r);ws.send(JSON.stringify({id,method,params}))});
const ev=async expression=>{let r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value};
await call('Runtime.enable');await call('Page.enable');
console.log(await ev('JSON.stringify({mode:localStorage.getItem("stockerboard_mode_v2"),rows:document.querySelectorAll("#screenerTable tbody tr").length,session:getMarketSessionDate(),parent:document.getElementById("tab-screener").parentElement.id})'));
for(const preset of ['BREAKOUT','COILED','MOMENTUM','HIGH_ROE','VALUE_PE']) console.log(preset,await ev(`applyQuickScreen('${preset}'); JSON.stringify({count:screenerFilteredRows.length,presets:[...activeScreenerPresets],mode:localStorage.getItem('stockerboard_mode_v2')})`));
console.log('drawer',await ev('openStockDrawer("IDEA"); JSON.stringify({open:document.getElementById("drawerOverlay").classList.contains("open"),summary:document.getElementById("drawerScreenSummary").innerText})'));

console.log('regressions', await ev(`(async () => {
 const checks=[]; const check=(name,ok)=>{if(!ok)throw Error(name);checks.push(name)};
 closeStockDrawer(); resetScreenFilters();
 check('missing values',formatMetric(null)==='—' && formatMetric(undefined)==='—' && formatMetric('N/A')==='—' && formatMetric(0)==='0');
 check('52W positions',[10,15,19,20].every((cmp,i)=>stockPosition({cmp,low_52w:10,high_52w:20})===[0,50,90,100][i]) && stockPosition({cmp:10,high_52w:20})===null);
 const predicates={BREAKOUT:s=>s.dist_52w_pct>=-.5,COILED:s=>s.dist_52w_pct>=-3&&s.dist_52w_pct<-.05,MOMENTUM:s=>s.momentum_score>=85,HIGH_ROE:s=>parseFloat(s.roe)>=15,VALUE_PE:s=>parseFloat(s.pe)>0&&parseFloat(s.pe)<=25,VCP:s=>s.is_vcp,POCKET_PIVOT:s=>s.is_pocket_pivot,STAGE2:s=>s.is_stage2,CONFLUENCE:s=>s.is_confluence,VOL_SURGE:s=>parseFloat(s.volume_multiplier)>=1.5};
 for(const [preset,predicate] of Object.entries(predicates)) {
  applyQuickScreen(preset);
  const expected=APP_DATA.market_screener.filter(s=>predicate(s)&&parseFloat(s.volume_multiplier)>=1).map(s=>s.symbol).sort();
  check(preset,JSON.stringify(screenerFilteredRows.map(r=>r.dataset.sym).sort())===JSON.stringify(expected));
 }
 applyQuickScreen('HIGH_ROE'); switchUserMode('intermediate'); switchUserMode('fresher'); check('mode state retained',activeScreenerPresets.has('HIGH_ROE')&&document.getElementById('tab-screener').parentElement.id==='fresherHome');
 resetScreenFilters(); document.getElementById('screenerSectorSelect').value='Financial Services';applyScreenerFilters();check('sector',screenerFilteredRows.every(r=>r.dataset.sec==='Financial Services'));
 document.getElementById('sliderVol').value=3;onPowerSliderChange();check('volume slider',screenerFilteredRows.every(r=>parseFloat(r.dataset.volmult)>=3));
 document.getElementById('tableSearch').value='__no_such_stock__';applyScreenerFilters();check('empty state',screenerFilteredRows.length===0&&document.getElementById('screenerEmptyState').classList.contains('visible'));
 resetScreenFilters();check('reset',!activeScreenerPresets.size&&document.getElementById('tableSearch').value===''&&document.getElementById('screenerSectorSelect').value==='ALL');
 handleFresherSearchInput('RELIANCE');await new Promise(r=>setTimeout(r,400));check('autocomplete',document.getElementById('fresherDropdownList').innerText.includes('RELIANCE'));clearFresherSearch();
 document.dispatchEvent(new KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true}));check('Ctrl K',document.activeElement.id==='fresherSearchInput');document.activeElement.blur();
 const row=screenerFilteredRows[0];row.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));check('keyboard drawer',currentDrawerSym===row.dataset.sym&&document.getElementById('drawerOverlay').classList.contains('open'));closeStockDrawer();
 const before=getWatchlist().includes(row.dataset.sym);row.querySelector('.star-btn').click();check('watch star stays in results',!document.getElementById('drawerOverlay').classList.contains('open'));check('watch persistence',getWatchlist().includes(row.dataset.sym)!==before);row.querySelector('.star-btn').click();
 const theme=document.documentElement.dataset.theme;toggleTheme();check('theme toggle',document.documentElement.dataset.theme!==theme);toggleTheme();
 const stock=await fetchDossierData('RELIANCE');check('dossier on demand',stock&&stock.symbol==='RELIANCE');
 check('retained tools',['exportActiveTableCSV','copyTradingViewTickers','copyFilteredTradingViewWatchlist','refreshRiskShield','updateJournalUI','handleGoogleAuthClick'].every(n=>typeof window[n]==='function'));
 return checks;
})()`));
await ev('closeStockDrawer(); resetScreenFilters();');
for(const width of [1440,1280,1024,768,430,390,375]){
await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
console.log(width,await ev('JSON.stringify({page:document.documentElement.scrollWidth,viewport:innerWidth,table:document.getElementById("screenerTable").getBoundingClientRect().width,resultsY:document.getElementById("tab-screener").getBoundingClientRect().top})'));
if([1440,375].includes(width)){const r=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,`screen-${width}.png`),Buffer.from(r.data,'base64'));}
}
if(errors.length) throw Error(JSON.stringify(errors)); console.log('No JavaScript exceptions. Screenshots:',output);ws.close(); chrome.kill(); server.kill();
})().catch(e=>{console.error(e);chrome.kill();server.kill();process.exit(1)});

