const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname,'..');
const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
for(const marker of ['const APP_DATA','function switchUserMode','function openStockDossier','initial-ui-mode','research-layout.css']) assert.ok(html.includes(marker),`Missing production contract: ${marker}`);
assert.ok(html.indexOf('initial-ui-mode') < html.indexOf('<body>'),'Mode must be resolved before body paint');
assert.ok(!html.includes('index.legacy_backup.html'),'Production navigation must not use a backup');
for(const dir of ['learn','stocks','about','methodology','privacy']) {
    const text=fs.readFileSync(path.join(root,dir,'index.html'),'utf8');
    assert.ok(!text.includes('/index.legacy_backup.html?mode=pro'),`Broken Pro link: ${dir}`);
}
const company=fs.readFileSync(path.join(root,'stocks/tcs/index.html'),'utf8');
assert.equal((company.match(/id="companyFinancialStatements"/g)||[]).length,1);
for(const panel of ['overview','financials','valuation']) assert.ok(company.includes(`data-research-panel="${panel}"`));
assert.ok(company.includes('data-symbol="TCS"'));
assert.ok(!company.includes('FSV1_d23adf5fd9efc1fd826781f5'),'Must use release index, not a hardcoded release');
console.log('PASS: production shell, early mode initialization, canonical navigation, unique statement host and company panels');
