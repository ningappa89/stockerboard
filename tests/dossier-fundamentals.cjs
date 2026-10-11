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

assert.equal(evaluate('readDossierFundamentals({pe:null},{pe:20}).pe'), null);
assert.equal(evaluate('readDossierFundamentals({},{pe:20}).pe'), 20);
assert.equal(evaluate('readDossierFundamentals({pe:18},{pe:"N/A"}).pe'), 18);
assert.equal(evaluate('readDossierFundamentals({roe:0}).roe'), 0);
assert.equal(evaluate('readDossierFundamentals({roe:-2.1}).roe'), -2.1);
assert.equal(evaluate('readDossierFundamentals({pe:"N/A"}).pe'), null);

context.fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '../stocks/HD/HDFCBANK.json'), 'utf8'));

// Test 1: Public dossier nulls remain unavailable, even with no preview.
evaluate('renderDossierFundamentals(normalizeDossierJson(fixture,"HDFCBANK"))');
assert.equal(elements.get('dossierTblPE').textContent, '—');
assert.equal(elements.get('dossierTblPB').textContent, '1.87');
assert.equal(elements.get('dossierFundamentalsStatus').textContent, 'Partial ratio coverage');
assert.equal(elements.get('dossierFundamentalsNotice').hidden, false);

// Test 2: A preview cannot override public values or explicit nulls.
context.researchPreviewSnapshot = {
    HDFCBANK: {
        pe: 20,
        pb: 2,
        roe: 0,
        roce: -2.1,
        source: 'Stockerboard Fundamental Gold',
        retrieved_at: '2026-10-08'
    }
};
evaluate('renderDossierFundamentals(normalizeDossierJson(fixture,"HDFCBANK"))');
assert.equal(elements.get('dossierTblPE').textContent, '—');
assert.equal(elements.get('dossierTblPB').textContent, '1.87');
assert.equal(elements.get('dossierTblROE').textContent, '—');
assert.equal(elements.get('dossierTblROCE').textContent, '—');
assert.equal(elements.get('dossierFundamentalsNotice').hidden, false);
assert.equal(elements.get('dossierFundamentalsStatus').textContent, 'Partial ratio coverage');

// Test 3: The public ratios for a non-financial stock are visible.
context.fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '../stocks/MR/MRF.json'), 'utf8'));
evaluate('renderDossierFundamentals(normalizeDossierJson(fixture,"MRF"))');
assert.equal(elements.get('dossierTblPE').textContent, '21.44');
assert.equal(elements.get('dossierTblPB').textContent, '2.47');
assert.equal(elements.get('dossierFundamentalsStatus').textContent, 'Partial ratio coverage');
console.log('PASS: certified dossier values, explicit nulls, fallback for absent fields, and partial coverage');

// Phase 0 Verification: fundamentals.json must NOT exist in production repository
assert.equal(fs.existsSync(path.join(__dirname, '../fundamentals.json')), false, 'fundamentals.json must not exist in production repo');
console.log('PASS: production repository free from fundamentals.json');
