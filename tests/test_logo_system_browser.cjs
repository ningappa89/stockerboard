/**
 * stockerboard_repo/tests/test_logo_system_browser.cjs
 * ====================================================
 * End-to-end browser certification test for the Company Logo Recognition Layer.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');

const root = path.resolve(__dirname, '..');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stockerboard-logo-test-'));

const port = 8196;
const chrome = cp.spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new',
    '--disable-extensions',
    '--remote-debugging-port=9296',
    '--user-data-dir=' + path.join(tempDir, 'chrome'),
    '--no-first-run',
    `http://127.0.0.1:${port}/`
], { windowsHide: true });

const server = cp.spawn('python', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], {
    cwd: root,
    windowsHide: true
});

(async () => {
    let targetTab;
    for (let attempt = 0; attempt < 40; attempt++) {
        await new Promise(r => setTimeout(r, 250));
        try {
            const tabs = await fetch('http://127.0.0.1:9296/json').then(r => r.json());
            targetTab = tabs.find(t => t.url && t.url.includes(String(port)));
            if (targetTab) break;
        } catch (e) {}
    }

    if (!targetTab) {
        chrome.kill();
        server.kill();
        throw new Error('Local Stockerboard browser tab did not open');
    }

    const ws = new WebSocket(targetTab.webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);

    let id = 0;
    const pending = new Map();
    ws.onmessage = e => {
        let m = JSON.parse(e.data);
        if (m.id && pending.has(m.id)) {
            pending.get(m.id)(m.result);
            pending.delete(m.id);
        }
    };

    const call = (method, params = {}) => new Promise(r => {
        pending.set(++id, r);
        ws.send(JSON.stringify({ id, method, params }));
    });

    const ev = async expression => {
        let r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (r.exceptionDetails) {
            throw new Error(`Eval error [${expression}]: ` + JSON.stringify(r.exceptionDetails));
        }
        return r.result ? r.result.value : undefined;
    };

    // Wait for script to initialize
    let ready = false;
    for (let attempt = 0; attempt < 30; attempt++) {
        await new Promise(r => setTimeout(r, 200));
        ready = await ev('typeof window.CompanyLogos !== "undefined" && typeof window.CompanyLogos.resolveCompanyLogo === "function"');
        if (ready) break;
    }

    if (!ready) {
        chrome.kill();
        server.kill();
        throw new Error('CompanyLogos module was not initialized in browser');
    }

    console.log('CompanyLogos module verified in headless browser session.');

    const checks = [];
    const check = (name, ok) => {
        if (!ok) throw new Error(`Assertion failed: ${name}`);
        checks.push(name);
        console.log(`  ✓ ${name}`);
    };

    // 1. Manifest Initialization
    const manifestState = await ev('JSON.stringify(window.CompanyLogos.getManifest())');
    const parsedManifest = JSON.parse(manifestState);
    check('manifest parsed with schema 1.0.0', parsedManifest.schema_version === '1.0.0');
    check('canonical alias ZOMATO -> ETERNAL registered', parsedManifest.aliases && parsedManifest.aliases.ZOMATO === 'ETERNAL');

    // 2. Normalization & Resolution
    check('normalizes standard symbol', await ev('window.CompanyLogos.normalizeLogoSymbol("reliance.ns") === "RELIANCE"'));
    check('normalizes symbol with &', await ev('window.CompanyLogos.normalizeLogoSymbol("m&m.ns") === "M&M"'));
    check('normalizes symbol with -', await ev('window.CompanyLogos.normalizeLogoSymbol("bajaj-auto") === "BAJAJ-AUTO"'));
    check('normalizes alias ZOMATO', await ev('window.CompanyLogos.normalizeLogoSymbol("zomato") === "ETERNAL"'));

    // 3. Fallback Initial Determination
    check('fallback initial for RELIANCE is R', await ev('window.CompanyLogos.getFallbackInitial("RELIANCE") === "R"'));
    check('fallback initial for 20MICRONS is 2', await ev('window.CompanyLogos.getFallbackInitial("20MICRONS") === "2"'));
    check('fallback initial for M&M is M', await ev('window.CompanyLogos.getFallbackInitial("M&M") === "M"'));
    check('fallback initial for BAJAJ-AUTO is B', await ev('window.CompanyLogos.getFallbackInitial("BAJAJ-AUTO") === "B"'));

    // 4. Missing Logo Resolution (Fail-Closed)
    const missing = await ev('window.CompanyLogos.resolveCompanyLogo("NONEXISTENT_STOCK")');
    check('missing logo reports available=false', missing.available === false);
    check('missing logo provides fallback initial', missing.fallback === 'N');

    // 5. DOM Element Creation
    await ev(`
        const el = window.CompanyLogos.createCompanyLogoElement("RELIANCE", { size: "md" });
        el.id = "testLogoElement";
        document.body.appendChild(el);
    `);
    check('created DOM container exists', await ev('document.getElementById("testLogoElement") !== null'));
    check('container has aria-hidden="true"', await ev('document.getElementById("testLogoElement").getAttribute("aria-hidden") === "true"'));
    check('container has .stock-logo-wrap and .size-md', await ev('document.getElementById("testLogoElement").classList.contains("stock-logo-wrap") && document.getElementById("testLogoElement").classList.contains("size-md")'));

    // 6. Geometry & CLS Resistance
    const rect = await ev('JSON.stringify(document.getElementById("testLogoElement").getBoundingClientRect())');
    const parsedRect = JSON.parse(rect);
    check('container width is exactly 28px', Math.round(parsedRect.width) === 28);
    check('container height is exactly 28px', Math.round(parsedRect.height) === 28);

    // 7. HTML String Rendering
    const htmlStr = await ev('window.CompanyLogos.renderStockLogoHtml("TCS", { size: "sm" })');
    check('HTML string contains stock-logo-img for verified logo', htmlStr.includes('stock-logo-img'));
    check('HTML string contains size-sm', htmlStr.includes('size-sm'));
    check('HTML string has aria-hidden="true"', htmlStr.includes('aria-hidden="true"'));
    check('zero inline onerror attributes', !htmlStr.includes('onerror='));

    const fallbackHtml = await ev('window.CompanyLogos.renderStockLogoHtml("XYZ_UNKNOWN", { size: "sm" })');
    check('HTML string contains fallback initial X for unknown symbol', fallbackHtml.includes('>X<'));

    // 8. Sorting Invariance via data-sort-value
    await ev(`
        const table = document.getElementById("screenerTable");
        const tbody = table.querySelector("tbody");
        const rows = tbody.querySelectorAll("tr");
        if (rows.length >= 2) {
            rows[0].children[1].setAttribute("data-sort-value", "000_FIRST");
            rows[1].children[1].setAttribute("data-sort-value", "ZZZ_LAST");
        }
    `);
    await ev('sortTable("screenerTable", 1)');
    const firstRowSortVal = await ev('document.querySelectorAll("#screenerTable tbody tr")[0].children[1].getAttribute("data-sort-value")');
    check('sortTable prioritizes data-sort-value', firstRowSortVal === '000_FIRST');

    // 9. Table Column Count Invariance
    const colCount = await ev('document.querySelectorAll("#screenerTable thead tr th").length');
    check('screener table retains exactly 12 columns', colCount === 12);

    const peHeader = await ev('document.querySelectorAll("#screenerTable thead tr th")[10].textContent');
    check('cell 10 remains P/E', peHeader.includes('P/E'));

    const roeHeader = await ev('document.querySelectorAll("#screenerTable thead tr th")[11].textContent');
    check('cell 11 remains ROE', roeHeader.includes('ROE'));

    // 10. Clean up test elements
    await ev('document.getElementById("testLogoElement")?.remove()');

    console.log(`\nAll ${checks.length} browser logo certification checks PASSED with zero errors!`);

    chrome.kill();
    server.kill();
    process.exit(0);
})().catch(err => {
    console.error('Browser Test Error:', err);
    try { chrome.kill(); } catch (e) {}
    try { server.kill(); } catch (e) {}
    process.exit(1);
});
