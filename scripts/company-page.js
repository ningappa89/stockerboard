function toggleTheme() {
    const html = document.documentElement;
    const current = html.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('stockerboard_theme', next);
}
async function loadCompanyValuation(symbol) {
    const statuses = document.querySelectorAll('[data-valuation-release]');
    try {
        const company = JSON.parse(document.getElementById('companyValuationPayload').textContent);
        if (company?.symbol !== symbol) throw new Error('No valuation entry for this company');
        for (const node of document.querySelectorAll('[data-valuation-value]')) {
            const key = node.dataset.valuationValue;
            const metric = company.metrics[key];
            if (metric?.status !== 'AVAILABLE' || !Number.isFinite(metric.value)) continue;
            const value = key === 'MARKET_CAP' ? metric.value / 1e7 : metric.value;
            const display = value.toLocaleString('en-IN', { maximumFractionDigits: 2 });
            node.textContent = key === 'MARKET_CAP' ? display : `${display}${key.endsWith('_YIELD') ? '%' : '×'}`;
        }
        for (const node of document.querySelectorAll('[data-valuation-basis]')) {
            const metric = company.metrics[node.dataset.valuationBasis];
            if (metric?.status !== 'AVAILABLE') {
                node.textContent = StockerboardData.reasonText(metric);
                continue;
            }
            node.textContent = [metric.price_as_of && `Price ${metric.price_as_of}`,
                metric.financial_period_end && `Period ended ${metric.financial_period_end}`,
                metric.period_basis && (metric.period_basis === 'TTM' ? 'TTM' : metric.period_basis === 'ANNUAL' ? 'Annual' : metric.period_basis === 'POINT_IN_TIME' ? 'Point-in-time' : metric.period_basis.toLowerCase()),
                metric.scope && metric.scope.toLowerCase()].filter(Boolean).join(' · ');
        }
        statuses.forEach(node => { node.textContent = `Valuation release · ${company.valuation_date}`; });
        window.StockerboardAnalytics?.track('company_opened', { symbol, entry_route: 'company' });
    } catch (error) {
        statuses.forEach(node => { node.textContent = 'Certified valuation data is unavailable. Reload to retry.'; });
    }
}

function formattedFilingAmount(cell) {
    return cell?.status === 'AVAILABLE' && Number.isFinite(cell.value)
        ? `₹${Math.round(cell.value / 1e7).toLocaleString('en-IN')}` : '—';
}

window.loadFilingsTable = async function(symbol) {
    const status = document.getElementById('filingsTotalCount');
    try {
        const data = await (await StockerboardData.statements(symbol)).json();
        const tbody = document.getElementById('filingsTableBody');
        tbody.replaceChildren();
        const st = data.statements || {};
        const annual = st.annual_pnl || [];
        const annualDates = [...new Set(annual.map(period => period.period_end))].sort().reverse();
        document.getElementById('filingsAnnualPeriods').textContent = annualDates.join(', ') || '—';
        const periods = [
            ...annual.map(period => ({ period, type: 'Annual results' })),
            ...(st.quarterly || []).map(period => ({ period, type: 'Quarterly results' }))
        ].filter(({ period }) => period.filing_id || period.artifact_sha256)
            .sort((a, b) => b.period.period_end.localeCompare(a.period.period_end));
        status.textContent = periods.length ? String(periods.length) : 'No filing evidence available';
        for (const { period, type } of periods) {
            const row = tbody.insertRow();
            const audit = { AUDITED: 'Audited', UNAUDITED: 'Unaudited', LIMITED_REVIEW: 'Limited review' }[period.audit_status] || 'Not stated';
            for (const value of [period.period_end, type, period.scope || '—', audit,
                formattedFilingAmount(period.metrics?.REVENUE_FROM_OPERATIONS),
                formattedFilingAmount(period.metrics?.PROFIT_AFTER_TAX)]) {
                row.insertCell().textContent = value;
            }
            const evidence = row.insertCell();
            if (/^[a-f0-9]{64}$/i.test(period.artifact_sha256 || '')) {
                evidence.title = period.artifact_sha256;
                evidence.textContent = `${period.artifact_sha256.slice(0, 12)}…`;
            } else {
                evidence.textContent = '—';
            }
            if (typeof period.source_url === 'string' && URL.canParse(period.source_url)) {
                const source = new URL(period.source_url);
                if (source.protocol === 'https:') {
                    const link = document.createElement('a');
                    link.href = source.href;
                    link.rel = 'noopener noreferrer';
                    link.target = '_blank';
                    link.textContent = 'Open source';
                    evidence.append(' ', link);
                }
            }
        }
    } catch (error) {
        status.textContent = 'Filing evidence is unavailable. Reload to retry.';
    }
};

// Interactive Price History Chart
let allCandles = [];
let currentTimeframe = '1Y';
let currentPlotCoords = [];

async function loadPriceHistory(symbol) {
    try {
        const expectedDate = document.getElementById('companyMarketDate').dataset.asOf;
        const data = await StockerboardData.priceHistory(symbol, expectedDate);
        if (data.candles && data.candles.length > 1) {
            allCandles = data.candles;
            renderChart(currentTimeframe);
        } else {
            const note = document.getElementById('chartFootnote');
            if (note) note.textContent = data.history_error || 'Insufficient published price history for chart.';
            document.querySelectorAll('.time-btn').forEach(b => b.disabled = true);
        }
    } catch (error) {
        document.getElementById('chartFootnote').textContent = 'Certified price history is unavailable. Reload to retry.';
        document.querySelectorAll('.time-btn').forEach(button => { button.disabled = true; });
    }
}

function setTimeframe(tf) {
    currentTimeframe = tf;
    document.querySelectorAll('.time-btn').forEach(button => {
        const selected = button.textContent.trim() === tf;
        button.classList.toggle('active', selected);
        button.setAttribute('aria-pressed', String(selected));
    });
    renderChart(tf);
}

function renderChart(tf) {
    if (!allCandles || allCandles.length < 2) return;
    const svg = document.getElementById('chartSvg');
    const { clientWidth: width, clientHeight: height } = svg;
    if (!width || !height) return;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    let candles = allCandles;
    if (tf === '1M') candles = allCandles.slice(-22);
    else if (tf === '6M') candles = allCandles.slice(-126);
    else if (tf === '1Y') candles = allCandles.slice(-252);
    if (candles.length < 2) candles = allCandles.slice(-22);

    const startX = 70, plotWidth = width - startX - 12, topY = 20, baselineY = height - 30;
    const plotHeight = baselineY - topY;
    const closes = candles.map(c => c.close);
    const minP = Math.min(...closes), maxP = Math.max(...closes);
    const span = maxP - minP || 10;
    const pad = span * 0.08;
    const rawMin = Math.max(0, minP - pad), rawMax = maxP + pad;
    const rawStep = (rawMax - rawMin) / 3;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const relStep = rawStep / mag;
    let niceStep = mag;
    if (relStep < 1.5) niceStep = 1 * mag;
    else if (relStep < 3.5) niceStep = 2 * mag;
    else if (relStep < 7.5) niceStep = 5 * mag;
    else niceStep = 10 * mag;

    const yMin = Math.floor(rawMin / niceStep) * niceStep;
    let yMax = yMin + 3 * niceStep;
    if (yMax < maxP) yMax += niceStep;

    const yTicks = Array.from({length: Math.round((yMax-yMin)/niceStep)+1}, (_,i) => yMax-i*niceStep);
    const gridG = document.getElementById('chartGrid');
    if (gridG) {
        gridG.innerHTML = '';
        yTicks.forEach(tickVal => {
            const yPos = topY + ((yMax - tickVal) / (yMax - yMin)) * plotHeight;
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', startX); line.setAttribute('y1', yPos); line.setAttribute('x2', width); line.setAttribute('y2', yPos);
            line.setAttribute('stroke', 'var(--border)'); line.setAttribute('stroke-width', '1');
            gridG.appendChild(line);
            const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            txt.setAttribute('x', '8'); txt.setAttribute('y', yPos + 4); txt.setAttribute('fill', 'var(--text-muted)');
            txt.setAttribute('font-size', '11'); txt.setAttribute('font-family', 'var(--font)');
            txt.textContent = '₹' + tickVal.toLocaleString('en-IN', { maximumFractionDigits: 2 });
            gridG.appendChild(txt);
        });
    }

    currentPlotCoords = [];
    const pts = [];
    const count = candles.length;
    const footnote = document.getElementById('chartFootnote');
    if (footnote) footnote.textContent = `${candles[0].time} to ${candles.at(-1).time} · ${count} of ${allCandles.length} published sessions · Daily EOD close`;

    candles.forEach((c, i) => {
        const x = startX + (i / (count - 1)) * plotWidth;
        const y = topY + ((yMax - c.close) / (yMax - yMin)) * plotHeight;
        pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
        currentPlotCoords.push({ x, y, price: c.close, time: c.time });
    });

    const lineD = 'M ' + pts.join(' L ');
    const areaD = lineD + ` L ${(startX + plotWidth).toFixed(1)},${baselineY} L ${startX},${baselineY} Z`;
    const cl = document.getElementById('chartLine'); if (cl) cl.setAttribute('d', lineD);
    const ca = document.getElementById('chartArea'); if (ca) ca.setAttribute('d', areaD);

    const xG = document.getElementById('chartXAxis');
    if (xG) {
        xG.innerHTML = '';
        const ticks = width < 500 ? 3 : 5;
        const dateIndices = [...new Set(Array.from({length: ticks}, (_, i) => Math.round(i * (count - 1) / (ticks - 1))))];
        const dateFormat = tf === '1M' ? {month:'short',day:'numeric'} : {month:'short',year:'numeric'};
        dateIndices.forEach((cIdx, i) => {
            const c = candles[cIdx]; if (!c) return;
            const x = startX + (cIdx / (count - 1)) * plotWidth;
            const dObj = new Date(c.time);
            const label = dObj.toLocaleDateString('en-IN', dateFormat);
            const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            txt.setAttribute('x', x); txt.setAttribute('y', baselineY + 16);
            txt.setAttribute('text-anchor', i === 0 ? 'start' : i === dateIndices.length - 1 ? 'end' : 'middle');
            txt.setAttribute('fill', 'var(--text-muted)'); txt.setAttribute('font-size', '11'); txt.setAttribute('font-family', 'var(--font)');
            txt.textContent = label;
            xG.appendChild(txt);
        });
    }

    initChartHover(svg, startX, startX + plotWidth);
}

function initChartHover(svg, minX, maxX) {
    const box = document.getElementById('chartBox');
    const tooltip = document.getElementById('chartTooltip');
    const hoverLine = document.getElementById('hoverLine');
    const hoverPin = document.getElementById('hoverPin');
    if (!box || !tooltip || !hoverLine || !hoverPin) return;

    const showPoint = (e) => {
        if (!currentPlotCoords || currentPlotCoords.length === 0) return;
        const rect = svg.getBoundingClientRect();
        const mouseX = ((e.clientX - rect.left) / rect.width) * svg.viewBox.baseVal.width;
        if (mouseX < minX || mouseX > maxX) {
            tooltip.style.display = 'none';
            hoverLine.setAttribute('opacity', '0');
            hoverPin.setAttribute('opacity', '0');
            return;
        }
        let closest = currentPlotCoords[0];
        let minDist = Math.abs(currentPlotCoords[0].x - mouseX);
        for (let i = 1; i < currentPlotCoords.length; i++) {
            const dist = Math.abs(currentPlotCoords[i].x - mouseX);
            if (dist < minDist) {
                minDist = dist;
                closest = currentPlotCoords[i];
            }
        }
        hoverLine.setAttribute('x1', closest.x);
        hoverLine.setAttribute('x2', closest.x);
        hoverLine.setAttribute('opacity', '1');
        hoverPin.setAttribute('cx', closest.x);
        hoverPin.setAttribute('cy', closest.y);
        hoverPin.setAttribute('opacity', '1');

        const dObj = new Date(closest.time);
        const dateStr = dObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        tooltip.innerText = `₹${closest.price.toFixed(2)} · ${dateStr}`;
        tooltip.style.display = 'block';
        const boxX = (closest.x / svg.viewBox.baseVal.width) * rect.width;
        tooltip.style.left = Math.max(4, Math.min(boxX + 10, rect.width - tooltip.offsetWidth - 4)) + 'px';
        tooltip.style.top = '12px';
    };
    box.onpointermove = showPoint;
    box.onpointerdown = showPoint;
    box.onpointerleave = () => {
        tooltip.style.display = 'none';
        hoverLine.setAttribute('opacity', '0');
        hoverPin.setAttribute('opacity', '0');
    };
}

document.addEventListener('DOMContentLoaded', () => {
    const symbol = document.querySelector('[data-research-company]').dataset.symbol;
    let priceHistoryRequested = false;
    new ResizeObserver(([entry]) => {
        if (!entry.contentRect.width) return;
        if (!priceHistoryRequested) {
            priceHistoryRequested = true;
            loadPriceHistory(symbol);
        } else {
            renderChart(currentTimeframe);
        }
    }).observe(document.getElementById('chartBox'));
    loadCompanyValuation(symbol);
});
