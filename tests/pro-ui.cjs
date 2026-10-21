const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {metricState,palette,validSimulation} = require('../scripts/pro-ui.js');
for (const value of [null,undefined,'','N/A','not-a-number',NaN]) {
    for (const metric of ['return','dist_52w','volume_mult']) assert.equal(metricState(metric,value).tone,'unavailable');
}
assert.equal(metricState('return',0).text,'+0.00%');
assert.equal(metricState('return',3).tone,'gain-strong');
assert.equal(metricState('return',-2.5).tone,'loss');
assert.equal(metricState('return',-2.51).tone,'loss-strong');
assert.equal(metricState('dist_52w',-1).tone,'gain-strong');
assert.equal(metricState('dist_52w',-6).tone,'gain');
assert.equal(metricState('volume_mult',0).text,'0.00×');
assert.equal(metricState('volume_mult','1.12x').text,'1.12×');
assert.equal(metricState('volume_mult',-1).tone,'unavailable');
assert.equal(validSimulation(100,95,50000),true);
for(const inputs of [[0,0,50000],[100,100,50000],[100,110,50000],[100,95,-1],[NaN,95,50000],[100,95,0]]) assert.equal(validSimulation(...inputs),false);
function luminance(hex) {
 const channels=hex.slice(1).match(/../g).map(c=>parseInt(c,16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
 return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;
}
for(const [tone,color] of Object.entries(palette)) {
 for(const foreground of ['#ffffff','#e4eee8']) {
  const a=luminance(color),b=luminance(foreground),contrast=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  assert.ok(contrast>=4.5,`${tone} ${foreground}: contrast ${contrast}`);
 }
}
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
 if(script[2].trim() && !/type=["']application\//i.test(script[1])) new vm.Script(script[2]);
}
console.log('PASS: missing-data semantics, metric boundaries, sandbox validation, all heat-map text contrast >= 4.5:1, inline script syntax');
let closedUrl;
const routeContext=vm.createContext({document:{getElementById(){return null;}},activeDossierTvChart:null,
 localStorage:{getItem(){return 'intermediate';}},switchUserMode(){},
 history:{pushState(state,title,url){closedUrl=url;}},window:{location:{pathname:'/',search:'?mode=pro&sector=Healthcare'}}});
const closeStart=html.indexOf('        function closeStockDossier(');
const closeEnd=html.indexOf('\n        }',closeStart)+'\n        }'.length;
vm.runInContext(html.slice(closeStart,closeEnd),routeContext);
vm.runInContext('closeStockDossier()',routeContext);
assert.equal(closedUrl,'/?mode=pro&sector=Healthcare');
console.log('PASS: closing a company preserves Pro mode and filter URL');
(async()=>{
 let exported,clicked=false;
 const stockTile={dataset:{symbol:'TECHM',name:'Tech Mahindra Ltd.',sector:'Information Technology'},querySelector(){return {textContent:'+20.94%'};}};
 let boardHidden=false;
 global.document={
  getElementById(){return {style:{display:boardHidden?'none':'flex'}};},
  createElement(){return {click(){clicked=true;}};},
  querySelectorAll(selector){return selector.includes('treemap-sector-group') ? [{querySelector(selector){return {textContent:selector.includes('group-sec-name')?'Information Technology':selector.includes('group-ret-badge')?'+9.30%':'6 of 20 stocks shown'};}}] : [stockTile];}
 };
 global.URL={createObjectURL(blob){exported=blob;return 'blob:test';},revokeObjectURL(){}};
 global.StockerboardPro.exportHeatmapCSV();
 assert.equal(clicked,true);
 assert.match(await exported.text(),/TECHM.*Tech Mahindra Ltd.*Information Technology.*\+20.94%/);
 boardHidden=true;global.StockerboardPro.exportHeatmapCSV();
 const summary=await exported.text();
 assert.match(summary,/Sector.*Weekly return.*Stocks in sector/);
 assert.match(summary,/Information Technology.*\+9.30%.*20/);
 assert.equal(summary.includes('TECHM'),false);
 console.log('PASS: stock and sector CSV exports contain the current view data');
})().catch(error=>{console.error(error);process.exitCode=1;});
