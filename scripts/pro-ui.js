/* Progressive Pro controls. Public values retain their source dates and missing-data states. */
(function (root) {
    'use strict';
    const palette = { 'gain-strong': '#146c43', gain: '#245d48', neutral: '#354a40', loss: '#873449', 'loss-strong': '#ac2949', unavailable: '#46535d' };
    const definitions = {
        return: { label: 'Weekly return', note: 'Tile color shows weekly stock return. Sector badges always show the sector weekly return.', stops: [['loss-strong','Below −2.5%'],['loss','−2.5% to −0.5%'],['neutral','−0.5% to +1%'],['gain','+1% to +3%'],['gain-strong','+3% or more']] },
        dist_52w: { label: 'Distance from 52-week high', note: 'Zero means at the high. Negative values are below it. Sector badges remain weekly returns.', stops: [['neutral','More than 6% below'],['gain','Within 6%'],['gain-strong','Within 1%']] },
        volume_mult: { label: 'Volume versus 20-day average', note: '1× is average trading volume. Higher volume does not indicate a positive price return.', stops: [['neutral','Below 1.5×'],['gain','1.5× to 2.5×'],['gain-strong','2.5× or more']] }
    };
    function number(value) {
        if (value === null || value === undefined || value === '' || value === 'N/A') return null;
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    function metricState(metric, value) {
        const n = number(value);
        if (n === null) return {tone:'unavailable', text:'Unavailable'};
        if (metric === 'return') return {tone:n >= 3 ? 'gain-strong' : n >= 1 ? 'gain' : n >= -.5 ? 'neutral' : n >= -2.5 ? 'loss' : 'loss-strong', text:(n >= 0 ? '+' : '') + n.toFixed(2) + '%'};
        if (metric === 'dist_52w') return {tone:n >= -1 ? 'gain-strong' : n >= -6 ? 'gain' : 'neutral', text:(n >= 0 ? '+' : '') + n.toFixed(1) + '%'};
        return n < 0 ? {tone:'unavailable',text:'Unavailable'} : {tone:n >= 2.5 ? 'gain-strong' : n >= 1.5 ? 'gain' : 'neutral', text:n.toFixed(2) + '×'};
    }
    function validSimulation(entry, stop, allocation) {
        return [entry,stop,allocation].every(value=>Number.isFinite(value) && value > 0) && stop < entry;
    }
    function validateSandbox() {
        const entry = number(document.getElementById('whatifEntry')?.value);
        const stop = number(document.getElementById('whatifSL')?.value);
        const allocation = number(document.getElementById('whatifCapital')?.value);
        if (validSimulation(entry,stop,allocation)) return true;
        ['whatifRiskAmountDisp','whatifSectorImpact','whatifCashImpact','whatifBetaImpact','whatifRiskImpact','shockNiftyDrop','shockMidcapDrop','shockStopSlip'].forEach(id=>{
            const el = document.getElementById(id); if (el) el.textContent = '—';
        });
        const badge = document.getElementById('whatifFitBadge'); if (badge) { badge.textContent = 'Check inputs'; badge.className = 'fit-score-badge'; }
        const note = document.getElementById('whatifFitNote'); if (note) note.textContent = 'Enter a positive entry price and allocation. Stop loss must be positive and below entry.';
        return false;
    }
    function validatePlaybook() {
        const entry = number(document.getElementById('calcEntry')?.value);
        const stop = number(document.getElementById('calcSL')?.value);
        const equity = number(document.getElementById('calcEquity')?.value);
        const risk = number(document.getElementById('calcRiskPct')?.value);
        const valid = validSimulation(entry,stop,equity) && risk > 0 && risk <= 100;
        let error = document.getElementById('proCalculatorError');
        if (!error) {
            error = document.createElement('p'); error.id = 'proCalculatorError'; error.className = 'pro-scenario-assumptions'; error.setAttribute('role','status');
            document.querySelector('.calc-results-grid')?.before(error);
        }
        error.hidden = valid;
        error.textContent = valid ? '' : 'Enter positive equity and entry, a risk percentage between 0 and 100, and a positive stop loss below entry.';
        if (!valid) ['calcMaxRisk','calcRiskPerShare','calcQty','calcTotalAlloc','calcTarget1','calcTarget2'].forEach(id=>{
            const el = document.getElementById(id); if (el) el.textContent = '—';
        });
        return valid;
    }
    function keyboardButton(element, label) {
        element.setAttribute('role','button');
        element.tabIndex = 0;
        if (label) element.setAttribute('aria-label',label);
        element.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); element.click(); }
        });
    }
    function legend() {
        let el = document.getElementById('proHeatmapLegend');
        if (!el) {
            el = document.createElement('div'); el.id = 'proHeatmapLegend'; el.className = 'pro-heatmap-legend';
            document.getElementById('treemapControlDeck').after(el);
        }
        return el;
    }
    function setMetric(metric, notify) {
        if (!definitions[metric]) return;
        const meta = definitions[metric];
        const el = legend(); el.replaceChildren();
        const heading = document.createElement('strong'); heading.textContent = meta.label + ' · ';
        el.append(heading, document.createTextNode(meta.note));
        const scale = document.createElement('div'); scale.className = 'pro-heatmap-scale';
        for (const [tone,label] of [...meta.stops,['unavailable','Data unavailable']]) {
            const item = document.createElement('span'); const chip = document.createElement('i');
            chip.style.setProperty('--swatch',palette[tone]); chip.setAttribute('aria-hidden','true');
            item.append(chip,document.createTextNode(label)); scale.append(item);
        }
        el.append(scale);
        const status = document.createElement('span'); status.id = 'proHeatmapStatus'; status.className = 'pro-heatmap-status';
        status.setAttribute('role','status'); status.setAttribute('aria-live','polite'); el.append(status);
        const data = typeof APP_DATA !== 'undefined' ? APP_DATA : root.APP_DATA;
        const pool = new Map((data?.market_screener || []).map(stock => [stock.symbol,stock]));
        document.querySelectorAll('.treemap-stock-tile').forEach(tile => {
            const stock = pool.get(tile.dataset.symbol);
            const value = metric === 'return' ? tile.dataset.retRaw : metric === 'dist_52w' ? stock?.dist_52w_pct : stock?.volume_multiplier;
            const state = metricState(metric,value);
            tile.dataset.tone = state.tone;
            const valueElement = tile.querySelector('.tile-metric-val');
            if (valueElement) valueElement.textContent = state.text;
            tile.setAttribute('aria-label', `${tile.dataset.name || tile.dataset.symbol}, ${tile.dataset.symbol}, ${meta.label}: ${state.text}. Open company.`);
            tile.title = `${tile.dataset.name || tile.dataset.symbol}\n${meta.label}: ${state.text}\nOpen company details`;
        });
        document.querySelectorAll('.metric-btn').forEach(button => {
            const selected = button.id === ({return:'btnMetricReturn',dist_52w:'btnMetricDist',volume_mult:'btnMetricVol'})[metric];
            button.classList.toggle('active',selected); button.setAttribute('aria-pressed',String(selected));
        });
        updateSearchStatus();
        if (notify && typeof showToast === 'function') showToast(meta.label);
    }
    function updateSearchStatus() {
        const tiles = [...document.querySelectorAll('.treemap-stock-tile')];
        const matches = tiles.filter(tile => !tile.classList.contains('spotlight-dim')).length;
        const status = document.getElementById('proHeatmapStatus');
        const query = document.getElementById('heatmapSearchInput')?.value.trim();
        if (status) status.textContent = query ? `${matches} matching ${matches === 1 ? 'stock' : 'stocks'} out of ${tiles.length} displayed. Clear search to show all.` : `${tiles.length} stock tiles across ${document.querySelectorAll('.treemap-sector-group').length} sectors. Up to six leading stocks per sector; equally sized tiles.`;
        syncToolbar();
    }
    function symbols() {
        const tab = document.querySelector('#intermediateTerminal .tab-content.active');
        if (!tab) return [];
        if (tab.id === 'tab-screener' && typeof screenerFilteredRows !== 'undefined') return [...new Set(screenerFilteredRows.map(row=>row.dataset.sym).filter(Boolean))];
        if (tab.id === 'tab-sectors' && document.getElementById('sectorTreemapView')?.style.display === 'none') return [];
        if (tab.id === 'tab-sectors') return [...new Set([...tab.querySelectorAll('.treemap-stock-tile:not(.spotlight-dim)')].map(tile=>tile.dataset.symbol))];
        return [...new Set([...tab.querySelectorAll('tbody tr')].filter(row=>row.style.display !== 'none').map(row=>row.dataset.sym || row.querySelector('[data-sym]')?.dataset.sym).filter(Boolean))];
    }
    function syncToolbar() {
        const tab = document.querySelector('#intermediateTerminal .tab-content.active');
        const count = symbols().length;
        let empty = document.getElementById('proEmptyResults');
        if (!empty) {
            empty = document.createElement('p'); empty.id = 'proEmptyResults'; empty.className = 'pro-scenario-assumptions'; empty.setAttribute('role','status');
            document.querySelector('#tab-screener .filter-row-bottom')?.after(empty);
        }
        if (empty) {
            empty.hidden = tab?.id !== 'tab-screener' || count > 0 || document.body.classList.contains('screen-fresher');
            empty.textContent = 'No stocks match the current search, sector and filters in this technical snapshot. Choose All Sectors or clear filters to continue.';
        }
        const badge = document.getElementById('tvCopyCount'); if (badge) badge.textContent = count;
        const copy = document.querySelector('button[onclick="copyTradingViewTickers()"]');
        const download = document.querySelector('button[onclick="exportActiveTableCSV()"]');
        if (copy) { copy.disabled = count === 0; copy.title = count ? `Copy ${count} symbols from this view` : 'No stock symbols in this view'; }
        if (download) { download.disabled = tab?.id === 'tab-sectors' ? (document.getElementById('sectorTreemapView')?.style.display !== 'none' && count === 0) : !tab?.querySelector('table'); download.title = download.disabled ? 'This view has no downloadable stock list' : 'Download data from this view'; }
    }
    function exportHeatmapCSV() {
        const rows = [['Symbol','Company','Sector',definitions[typeof activeHeatmapMetric !== 'undefined' ? activeHeatmapMetric : 'return'].label]];
        document.querySelectorAll('.treemap-stock-tile:not(.spotlight-dim)').forEach(tile => rows.push([
            tile.dataset.symbol,tile.dataset.name,tile.dataset.sector,tile.querySelector('.tile-metric-val').textContent
        ]));
        if (document.getElementById('sectorTreemapView')?.style.display === 'none') {
            rows.splice(0,rows.length,['Sector','Weekly return','Stocks in sector']);
            document.querySelectorAll('.treemap-sector-group').forEach(group=>rows.push([
                group.querySelector('.group-sec-name').textContent.trim(),group.querySelector('.group-ret-badge').textContent.trim(),
                group.querySelector('.group-count').textContent.match(/of (\d+)/)?.[1] || ''
            ]));
        }
        if (rows.length === 1) { if (typeof showToast === 'function') showToast('No matching stock tiles to download.'); return; }
        const csv = rows.map(row=>row.map(value=>'"'+String(value ?? '').replace(/"/g,'""')+'"').join(',')).join('\n');
        const url = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
        const link = document.createElement('a'); link.href = url; link.download = 'stockerboard-sector-heatmap.csv'; link.click();
        setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
    function setSectorView(mode) {
        ['treemap','barometer','cards'].forEach(view => document.getElementById('btnView'+view[0].toUpperCase()+view.slice(1))?.setAttribute('aria-pressed',String(view===mode)));
        const el = document.getElementById('proHeatmapLegend'); if (el) el.hidden = mode !== 'treemap';
        queueMicrotask(syncToolbar);
    }
    function init() {
        const terminal = document.getElementById('intermediateTerminal'); if (!terminal) return;
        terminal.querySelectorAll('.whatif-field,.calc-field,.journal-field').forEach(field=>{
            const input = field.querySelector('input,select'); const label = field.querySelector('label');
            if (input?.id && label) label.setAttribute('for',input.id);
        });
        const sandbox = document.getElementById('whatifSandboxBox');
        if (sandbox && !document.getElementById('proScenarioAssumptions')) {
            const note = document.createElement('p'); note.id = 'proScenarioAssumptions'; note.className = 'pro-scenario-assumptions';
            note.textContent = 'Illustrative model assumptions: portfolio value is at least ₹5 lakh, with a ₹1 lakh cash floor above logged allocations. Existing portfolio beta is assumed to be 1.02 and candidate beta 1.15; these are scenario inputs, not measured company risk.';
            sandbox.querySelector('.action-radar-hdr')?.after(note);
        }
        const active = terminal.querySelector('.tab-btn.active');
        if (typeof showProGroup === 'function') showProGroup(active?.dataset.proGroup || 'market',false);
        const search = document.getElementById('heatmapSearchInput');
        if (search) { search.setAttribute('aria-label','Spotlight a stock or sector on the heat map'); search.placeholder = 'Find stock or sector…'; search.addEventListener('input',updateSearchStatus); }
        terminal.querySelectorAll('.treemap-stock-tile').forEach(tile => {
            keyboardButton(tile);
            tile.onclick = () => { if (typeof openStockDossier === 'function') openStockDossier(tile.dataset.symbol); };
            tile.onmouseenter = null; tile.onmouseleave = null;
            const name = tile.querySelector('.tile-sub-name'); if (name) name.textContent = tile.dataset.name || tile.dataset.symbol;
        });
        terminal.querySelectorAll('.treemap-group-header,.barometer-row,.sector-card').forEach(el => keyboardButton(el,el.title || el.textContent.trim()));
        terminal.querySelectorAll('.group-count').forEach(el => {
            const shown = el.closest('.treemap-sector-group')?.querySelectorAll('.treemap-stock-tile').length;
            if (shown) el.textContent = `${shown} of ${el.textContent.match(/\d+/)?.[0] || shown} stocks shown`;
        });
        setMetric('return',false); setSectorView('treemap');
        const hint = terminal.querySelector('.sector-breadth-hint');
        if (hint) hint.textContent = 'Select a stock to open its company view. Select a sector to filter Market Explorer. Sector badges show weekly returns. Sector coverage can extend beyond the 350-stock technical screen.';
        terminal.querySelectorAll('.tab-btn').forEach(button => { button.setAttribute('aria-controls',button.getAttribute('onclick')?.match(/'([^']+)'/)?.[1] || ''); });
        const observer = new MutationObserver(syncToolbar);
        observer.observe(terminal.querySelector('.tab-bar'),{attributes:true,subtree:true,attributeFilter:['class']});
        syncToolbar();
    }
    root.StockerboardPro = {metricState,setMetric,setSectorView,symbols,syncToolbar,updateSearchStatus,exportHeatmapCSV,validateSandbox,validatePlaybook};
    if (typeof module !== 'undefined') module.exports = {metricState,palette,validSimulation};
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init); else init();
    }
})(typeof window !== 'undefined' ? window : globalThis);
