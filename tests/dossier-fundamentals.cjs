const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const elements = new Map();
const context = vm.createContext({fundamentalsSnapshot: {}, URL, APP_DATA: {market_screener: [], fundamental_leaders: []}, document: {createElement(){return {style:{}};},createTextNode(text){return text;},getElementById(id) {if (!elements.has(id)) elements.set(id, {style:{},replaceChildren(){},append(){}}); return elements.get(id);}}});
for (const name of ['numericMetric', 'formatMetric', 'readDossierFundamentals', 'renderDossierFundamentals', 'normalizeDossierJson']) {
 const start = html.indexOf('        function ' + name + '(');
 const end = html.indexOf('\n        }', start) + '\n        }'.length;
 assert.ok(start >= 0 && end > start, name);
 vm.runInContext(html.slice(start,end), context);
}
const evaluate = code => vm.runInContext(code, context);
assert.equal(evaluate('readDossierFundamentals({pe:null},{pe:20}).pe'),20);
assert.equal(evaluate('readDossierFundamentals({pe:18},{pe:"N/A"}).pe'),18);
assert.equal(evaluate('readDossierFundamentals({roe:0}).roe'),0);
assert.equal(evaluate('readDossierFundamentals({roe:-2.1}).roe'),-2.1);
assert.equal(evaluate('readDossierFundamentals({pe:"N/A"}).pe'),null);
context.fixture = JSON.parse(fs.readFileSync(path.join(__dirname,'../stocks/HD/HDFCBANK.json'),'utf8'));
evaluate('renderDossierFundamentals(normalizeDossierJson(fixture,"HDFCBANK"))');
assert.equal(elements.get('dossierTblPE').textContent,'—');
assert.equal(elements.get('dossierFundamentalsStatus').textContent,'Ratios unavailable');
assert.equal(elements.get('dossierFundamentalsNotice').hidden,false);
evaluate('renderDossierFundamentals(normalizeDossierJson({...fixture, fundamentals:{pe:20,pb:2,roe:0,roce:-2.1}},"HDFCBANK"))');
assert.equal(elements.get('dossierTblROE').textContent,'0%');
assert.equal(elements.get('dossierTblROCE').textContent,'-2.1%');
assert.equal(elements.get('dossierFundamentalsNotice').hidden,true);
evaluate('APP_DATA.market_screener=[{symbol:"HDFCBANK",pe:19,pb:"N/A"}]; renderDossierFundamentals(normalizeDossierJson(fixture,"HDFCBANK"))');
assert.equal(elements.get('dossierTblPE').textContent,'19');
assert.equal(elements.get('dossierFundamentalsStatus').textContent,'Partial ratio coverage');
console.log('PASS: dossier fundamentals preservation, fallback, missing/partial coverage, zero and negative ratios');

context.fundamentalsSnapshot = JSON.parse(fs.readFileSync(path.join(__dirname,'../fundamentals.json'),'utf8')).stocks;
evaluate('renderDossierFundamentals(normalizeDossierJson(fixture,"HDFCBANK"))');
assert.equal(elements.get('dossierTblPE').textContent,'14.8');
assert.equal(elements.get('dossierTblPB').textContent,'1.93');
assert.equal(elements.get('dossierTblROE').textContent,'14%');
assert.equal(elements.get('dossierTblROCE').textContent,'6.92%');
assert.equal(elements.get('dossierFundamentalsNotice').hidden,true);
for (const [symbol,record] of Object.entries(context.fundamentalsSnapshot)) {
 context.symbol=symbol;
 const normalized = evaluate('normalizeDossierJson({symbol},symbol)');
 for (const key of ['pe','pb','roe','roce']) assert.equal(normalized[key],record[key] ?? null, symbol+' '+key);
}
console.log('PASS: HDFCBANK values and every snapshot symbol survive the dossier adapter');
