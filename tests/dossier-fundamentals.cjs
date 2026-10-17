const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const elements = new Map();
const context = vm.createContext({
    fundamentalsSnapshot: {},
    researchPreviewSnapshot: {},
    URL,
    APP_DATA: {market_screener: [], fundamental_leaders: []},
    document: {
        createElement(){return {style:{},textContent:'',append(){}};},
        createTextNode(text){return text;},
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, {style:{},textContent:'',replaceChildren(){},append(){}});
            return elements.get(id);
        }
    }
});

for (const name of ['numericMetric', 'formatMetric', 'readDossierFundamentals', 'renderDossierFundamentals', 'normalizeDossierJson']) {
    const start = html.indexOf('        function ' + name + '(');
    const end = html.indexOf('\n        }', start) + '\n        }'.length;
    assert.ok(start >= 0 && end > start, name);
    vm.runInContext(html.slice(start, end), context);
}

const evaluate = code => vm.runInContext(code, context);

// Test Suite 1: readDossierFundamentals strictly ignores secondary / fallback
assert.equal(evaluate('readDossierFundamentals({pe:null},{pe:20}).pe'), null);
assert.equal(evaluate('readDossierFundamentals({},{pe:20}).pe'), null, 'Fallback must be strictly ignored when primary is empty');
assert.equal(evaluate('readDossierFundamentals({pe:18},{pe:"N/A"}).pe'), 18);
assert.equal(evaluate('readDossierFundamentals({roe:0}).roe'), 0);
assert.equal(evaluate('readDossierFundamentals({roe:-2.1}).roe'), -2.1);
assert.equal(evaluate('readDossierFundamentals({pe:"N/A"}).pe'), null);
console.log('PASS: readDossierFundamentals single financial authority & zero fallback');

// Test Suite 2: HDFCBANK certified dossier semantic status rendering
context.fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '../stocks/HD/HDFCBANK.json'), 'utf8'));
evaluate('renderDossierFundamentals(normalizeDossierJson(fixture,"HDFCBANK"))');
assert.equal(elements.get('dossierTblPE').textContent, '— Not available', 'HDFCBANK PE UNAVAILABLE must render "— Not available"');
assert.equal(elements.get('dossierTblPB').textContent, '1.87', 'HDFCBANK PB AVAILABLE must render canonical value');
assert.equal(elements.get('dossierTblROE').textContent, '— Not available', 'HDFCBANK ROE UNAVAILABLE must render "— Not available"');
assert.equal(elements.get('dossierTblROCE').textContent, 'Not applicable for this company type', 'HDFCBANK ROCE NOT_APPLICABLE must render "Not applicable for this company type"');
assert.equal(elements.get('dossierFundamentalsStatus').textContent, 'Partial ratio coverage');
assert.equal(elements.get('dossierFundamentalsNotice').hidden, false);
console.log('PASS: HDFCBANK certified status semantics (NOT_APPLICABLE and UNAVAILABLE)');

// Test Suite 3: RELIANCE PENDING_LAYER status check
context.fixtureReliance = JSON.parse(fs.readFileSync(path.join(__dirname, '../stocks/RE/RELIANCE.json'), 'utf8'));
evaluate('renderDossierFundamentals(normalizeDossierJson(fixtureReliance,"RELIANCE"))');
assert.equal(elements.get('dossierTblPE').textContent, '21.19', 'RELIANCE PE AVAILABLE');
assert.equal(elements.get('dossierTblPB').textContent, '1.46', 'RELIANCE PB AVAILABLE');
assert.equal(elements.get('dossierTblROE').textContent, '7.71%', 'RELIANCE ROE AVAILABLE must render canonical value');
assert.equal(elements.get('dossierTblROCE').textContent, 'Not available yet', 'RELIANCE ROCE PENDING_LAYER must render "Not available yet"');
console.log('PASS: RELIANCE certified status semantics (PENDING_LAYER and AVAILABLE)');

// Test Suite 4: MRF AVAILABLE status check
context.fixtureMRF = JSON.parse(fs.readFileSync(path.join(__dirname, '../stocks/MR/MRF.json'), 'utf8'));
evaluate('renderDossierFundamentals(normalizeDossierJson(fixtureMRF,"MRF"))');
assert.equal(elements.get('dossierTblPE').textContent, '21.44');
assert.equal(elements.get('dossierTblPB').textContent, '2.47');
console.log('PASS: MRF non-financial company available ratios');

// Test Suite 5: Failure injection test (simulating research fallback reactivation)
// Even if alternate ratio snapshots are provided in context, they MUST NOT contaminate the render!
context.researchPreviewSnapshot = {
    HDFCBANK: { pe: 25.5, pb: 3.0, roe: 18.0, roce: 22.0 },
    RELIANCE: { roce: 99.9, roe: 88.8 }
};
context.fundamentalsSnapshot = {
    HDFCBANK: { pe: 25.5, pb: 3.0, roe: 18.0, roce: 22.0 },
    RELIANCE: { roce: 99.9, roe: 88.8 }
};
evaluate('renderDossierFundamentals(normalizeDossierJson(fixture,"HDFCBANK"))');
assert.equal(elements.get('dossierTblPE').textContent, '— Not available', 'Failure injection: HDFCBANK PE must not use injected 25.5');
assert.equal(elements.get('dossierTblROCE').textContent, 'Not applicable for this company type', 'Failure injection: HDFCBANK ROCE must not use injected 22.0');

evaluate('renderDossierFundamentals(normalizeDossierJson(fixtureReliance,"RELIANCE"))');
assert.equal(elements.get('dossierTblROCE').textContent, 'Not available yet', 'Failure injection: RELIANCE ROCE must not use injected 99.9');
console.log('PASS: Failure injection proof: secondary / research snapshots cannot alter public financial render');

// Test Suite 6: Static Source Guards
assert.equal(html.includes('./research/current.json'), false, 'index.html must NOT reference ./research/current.json');
assert.equal(html.includes('ratios_index.json'), false, 'index.html must NOT reference ratios_index.json');
assert.equal(fs.existsSync(path.join(__dirname, '../fundamentals.json')), false, 'fundamentals.json must not exist in repo');
assert.equal(fs.existsSync(path.join(__dirname, '../pilot_asof_financials_v1.json')), false, 'pilot_asof_financials_v1.json must not exist in repo');
console.log('PASS: Static source guards: 0 research network endpoints, 0 pilot overrides');
