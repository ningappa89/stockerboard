const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const universe = JSON.parse(fs.readFileSync(path.join(root, 'stocks/universe_index.json'), 'utf8'));
const financialIndex = JSON.parse(fs.readFileSync(path.join(root, 'stocks/financial_index_v1.json'), 'utf8'));
const uiContract = JSON.parse(fs.readFileSync(path.join(root, 'ui_data_contract_v1.json'), 'utf8'));
assert.equal(universe.count, 2524);
assert.equal(universe.stocks.length, universe.count);
assert.equal(financialIndex.canonical_count, universe.count);
for (const key of ['pe', 'pb', 'roe', 'roce']) {
    assert.equal(uiContract.metrics[key].covered, financialIndex.coverage[key]);
    assert.equal(uiContract.metrics[key].source, 'certified_public_dossier_v2');
}
const seen = new Set();
const coverage = Object.fromEntries(['pe', 'pb', 'roe', 'roce', 'debt_to_equity', 'current_ratio'].map(key => [key, 0]));

for (const [symbol, name] of universe.stocks) {
    assert.ok(symbol && name, 'missing canonical identity');
    assert.ok(!seen.has(symbol), `duplicate canonical symbol ${symbol}`);
    seen.add(symbol);
    const shard = symbol.slice(0, 2).replace(/[^A-Z0-9]/gi, '_').padEnd(2, '_');
    const file = path.join(root, 'stocks', shard, symbol + '.json');
    assert.ok(fs.existsSync(file), `missing public dossier ${symbol}`);
    const dossier = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(dossier.symbol, symbol);
    assert.ok(financialIndex.stocks[symbol], `missing compact financial row ${symbol}`);
    assert.ok(dossier.price && dossier.price.as_of, `undated price ${symbol}`);
    for (const key of Object.keys(coverage)) {
        const value = dossier[key];
        assert.ok(value === null || (typeof value === 'number' && Number.isFinite(value)), `invalid ${key} for ${symbol}`);
        assert.ok(dossier.ratios_status?.[key], `missing ${key} status for ${symbol}`);
        if (Object.hasOwn(financialIndex.stocks[symbol], key)) {
            assert.equal(financialIndex.stocks[symbol][key], value, `compact index differs for ${symbol} ${key}`);
        }
        if (value !== null) coverage[key]++;
    }
}

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const investor = fs.readFileSync(path.join(root, 'scripts/investor-v1.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'scripts/investor-v1.css'), 'utf8');
for (const id of ['investorCompanySummary', 'investorCompanyMarket', 'investorCompanyFinancials', 'investorCompanyAdvanced']) {
    assert.ok(investor.includes(`id = '${id}'`), `missing company panel ${id}`);
}
assert.ok(investor.includes("source.textContent = 'Financial values come from the certified public company dossier"));
assert.ok(css.includes('.investor-dossier-tabs'));
assert.ok(html.includes('<link rel="canonical" href="https://stockerboard.com/">'));
assert.ok(html.includes('<link rel="icon" type="image/svg+xml" href="favicon.svg">'));
assert.ok(fs.existsSync(path.join(root, 'favicon.svg')));
assert.ok(html.includes('type="application/ld+json"'));
assert.ok(!html.includes('Profitable · ROE ≥15%'));
console.log(JSON.stringify({result: 'PASS', canonical_companies: seen.size, public_dossiers: seen.size, coverage}, null, 2));
