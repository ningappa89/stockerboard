/* Display dated, hash-checked outputs from the StockMe pattern scanner. */
(() => {
    'use strict';
    const labels = {FORMING: 'Forming', CLOSE_ABOVE_PIVOT: 'Price-only breakout', VOLUME_CONFIRMED: 'Volume confirmed'};
    const rank = {VOLUME_CONFIRMED: 0, CLOSE_ABOVE_PIVOT: 1, FORMING: 2};
    const anchors = {left_rim: 'Left rim', trough: 'Cup low', right_rim: 'Right rim', handle_low: 'Handle low'};
    const exclusionLabels = {
        BELOW_LIQUIDITY_FLOOR: 'Below the liquidity minimum',
        INSUFFICIENT_CONTIGUOUS_COMPARABLE_HISTORY: 'Insufficient comparable price and volume history',
        OUTSIDE_CERTIFIED_MARKET_UNIVERSE: 'Outside the certified market universe',
        UNRESOLVED_SECURITY_IDENTITY: 'Security identity awaiting verification',
        UNRESOLVED_ADJUSTMENT_OR_VOLUME: 'Price or volume adjustment awaiting verification',
        NO_CURRENT_SESSION_BAR: 'No certified bar for this session',
        MARKET_CLOSE_MISMATCH: 'Certified closing prices disagree',
        DUPLICATE_SECURITY: 'Security already represented by another listing',
        INVALID_SESSION_SEQUENCE: 'Invalid trading-session sequence',
    };
    const el = id => document.getElementById(id);
    const number = new Intl.NumberFormat('en-IN', {maximumFractionDigits: 2});
    const currency = new Intl.NumberFormat('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    const dates = new Intl.DateTimeFormat('en-IN', {dateStyle: 'medium', timeZone: 'UTC'});
    const rupees = value => `₹${currency.format(value)}`;
    const dateLabel = day => dates.format(new Date(day));
    const distanceLabel = value => value === 0 ? 'At pivot'
        : `${number.format(Math.abs(value))}% ${value > 0 ? 'above' : 'below'} pivot`;
    let request, release, chart, active, pointIndex, selection = 0;

    async function checkedJson(path, expected) {
        const response = await fetch(path, {cache: 'no-cache'});
        if (!response.ok || !/^[0-9a-f]{64}$/.test(expected)) throw new Error('Research artifact unavailable');
        const raw = await response.arrayBuffer();
        const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', raw)), n => n.toString(16).padStart(2, '0')).join('');
        if (digest !== expected) throw new Error('Research artifact does not match the release');
        return JSON.parse(new TextDecoder().decode(raw));
    }

    function textNode(tag, value, className) {
        const node = document.createElement(tag);
        node.textContent = value;
        if (className) node.className = className;
        return node;
    }

    function drawChart() {
        const canvas = el('cup-chart');
        if (!chart || !active || !canvas.clientWidth) return;
        const width = canvas.clientWidth, height = canvas.clientHeight, scale = Math.min(devicePixelRatio || 1, 3);
        canvas.width = width * scale;
        canvas.height = height * scale;
        const ctx = canvas.getContext('2d');
        ctx.scale(scale, scale);
        const bars = chart.candles;
        const byDate = new Map(bars.map((bar, i) => [bar.time, i]));
        const priceLow = Math.min(...bars.map(bar => bar.low), active.pivot);
        const priceHigh = Math.max(...bars.map(bar => bar.high), active.pivot);
        const padding = (priceHigh - priceLow || 1) * .08;
        const minimum = priceLow - padding, maximum = priceHigh + padding;
        const maxVolume = Math.max(...bars.map(bar => bar.volume), 1);
        const left = 48, right = width - 12, top = 12, priceBottom = height - 94, volumeBottom = height - 27;
        const step = (right - left) / (bars.length - 1);
        const x = i => left + step * i;
        const y = value => priceBottom - (value - minimum) * (priceBottom - top) / (maximum - minimum);
        const style = getComputedStyle(canvas);
        const color = name => style.getPropertyValue(`--cup-${name}`).trim();
        const ink = color('subtle'), grid = color('grid'), green = color('green'), amber = color('amber');
        function line(points, color, stroke = 1) {
            ctx.strokeStyle = color;
            ctx.lineWidth = stroke;
            ctx.beginPath();
            points.forEach(([cx, cy], i) => i ? ctx.lineTo(cx, cy) : ctx.moveTo(cx, cy));
            ctx.stroke();
        }
        function dot(cx, cy, radius, fill) {
            ctx.fillStyle = fill;
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.fill();
        }
        const rightRim = x(byDate.get(active.anchors.right_rim[0]));
        const handleEnd = x(byDate.get(active.pivot_confirmed));
        ctx.fillStyle = color('zone');
        ctx.fillRect(left, top, rightRim - left, priceBottom - top);
        ctx.fillStyle = color('handle');
        ctx.fillRect(rightRim, top, handleEnd - rightRim, priceBottom - top);
        ctx.font = `11px ${style.fontFamily}`;
        const axis = new Intl.NumberFormat('en-IN', {maximumFractionDigits: 0});
        for (const value of [priceLow, (priceLow + priceHigh) / 2, priceHigh]) {
            line([[left, y(value)], [right, y(value)]], grid);
            ctx.fillStyle = ink;
            ctx.fillText(axis.format(value), 0, y(value) + 3, left - 5);
        }
        ctx.setLineDash([4, 4]);
        line([[left, y(active.pivot)], [right, y(active.pivot)]], amber);
        ctx.setLineDash([]);
        ctx.lineJoin = 'round';
        line(bars.map((bar, i) => [x(i), y(bar.close)]), green, 2);
        for (const [key, [day, price]] of Object.entries(active.anchors)) {
            const cx = x(byDate.get(day)), cy = y(price);
            dot(cx, cy, 3.5, key === 'handle_low' ? amber : green);
            if (width >= 480) {
                ctx.fillStyle = ink;
                ctx.textAlign = key === 'left_rim' ? 'left' : 'right';
                ctx.fillText(anchors[key], cx + (key === 'left_rim' ? 7 : -7), cy - 7);
            }
        }
        const breakout = byDate.get(active.breakout);
        const breakoutColor = active.state === 'VOLUME_CONFIRMED' ? green : amber;
        const volumeWidth = Math.min(8, Math.max(1, step * .73));
        line([[left, volumeBottom], [right, volumeBottom]], grid);
        for (const [i, bar] of bars.entries()) {
            const barHeight = bar.volume * 43 / maxVolume;
            ctx.fillStyle = i === breakout ? breakoutColor : color('volume');
            ctx.fillRect(x(i) - volumeWidth / 2, volumeBottom - barHeight, volumeWidth, barHeight);
        }
        if (breakout !== undefined) dot(x(breakout), y(bars[breakout].close), 5.5, breakoutColor);
        if (pointIndex != null) {
            const markerX = x(pointIndex);
            ctx.setLineDash([2, 3]);
            line([[markerX, top], [markerX, volumeBottom]], ink);
            ctx.setLineDash([]);
            dot(markerX, y(bars[pointIndex].close), 4, green);
        }
        ctx.fillStyle = ink;
        ctx.textAlign = 'left';
        ctx.fillText(dateLabel(bars[0].time), left, height - 7);
        ctx.textAlign = 'right';
        ctx.fillText(dateLabel(bars.at(-1).time), right, height - 7);
    }

    function showPoint(index, announce = false) {
        if (!chart) return;
        pointIndex = index;
        const bar = chart.candles[index ?? chart.candles.length - 1];
        const values = `${dateLabel(bar.time)} · Close ${rupees(bar.close)} · Volume ${number.format(bar.volume)}`;
        el('cup-chart-point').textContent = values;
        if (announce) el('cup-chart-announcement').textContent = values;
        drawChart();
    }

    function badge(element, state) {
        element.dataset.state = state;
        element.textContent = labels[state];
    }

    async function evidence(row, focus = false) {
        const panel = el('cup-evidence');
        if (active?.id === row.id && chart) {
            if (focus) panel.focus();
            return;
        }
        const current = ++selection;
        active = row;
        chart = null;
        pointIndex = null;
        panel.hidden = false;
        for (const button of el('cup-results').querySelectorAll('button')) {
            button.setAttribute('aria-pressed', String(button.dataset.setupId === row.id));
        }
        el('cup-evidence-title').textContent = row.symbol;
        el('cup-company-name').textContent = row.name;
        badge(el('cup-setup-badge'), row.state);
        el('cup-chart-status').textContent = 'Loading adjusted chart…';
        el('cup-figure').hidden = true;
        const metrics = el('cup-metrics');
        metrics.replaceChildren();
        const breakoutVolume = row.volume_multiple == null ? '—' : `${number.format(row.volume_multiple)}×`;
        for (const [label, value, detail, className] of [
            ['Latest close', '—', distanceLabel(row.distance_pct), row.distance_pct < 0 ? 'cup-below' : ''],
            ['Pivot price', rupees(row.pivot), row.breakout ? `Crossed ${dateLabel(row.breakout)}` : 'Awaiting a close above', ''],
            ['Breakout volume', breakoutVolume, row.breakout ? '1.50× required' : 'Awaiting breakout', ''],
        ]) {
            const metric = document.createElement('div');
            metric.append(textNode('dt', label), textNode('dd', value), textNode('small', detail, className));
            metrics.append(metric);
        }
        const link = el('cup-company-link');
        link.href = `/stockerboard_company_overview.html?symbol=${encodeURIComponent(row.symbol)}`;
        const description = el('cup-anchor-summary');
        description.replaceChildren();
        for (const [key, label] of Object.entries(anchors)) {
            const [date, value] = row.anchors[key];
            description.append(textNode('dt', label), textNode('dd', `${rupees(value)} · ${date}`));
        }
        for (const [label, value] of [['Pivot', `${rupees(row.pivot)} · ${row.pivot_confirmed}`],
            ['Cup depth', `${number.format(row.depth_pct)}% over ${row.base_sessions} sessions`],
            ['Handle depth', `${number.format(row.handle_depth_pct)}% over ${row.handle_sessions} sessions`],
            ['First detected', row.first_seen], ['Breakout close', row.breakout || 'Awaiting breakout']]) {
            description.append(textNode('dt', label), textNode('dd', value));
        }
        if (focus) panel.focus();
        Promise.resolve(window.StockerboardCompanyRoutes?.companyUrl(row.symbol)).then(href => {
            if (current === selection && href) link.href = href;
        }).catch(() => {});
        try {
            const prefix = `pro-research/cup-with-handle/releases/${release.run_id}/${row.id}.json`;
            if (row.chart_path !== prefix) throw new Error('Invalid chart path');
            const data = await checkedJson(`/${prefix}`, row.chart_sha256);
            if (current !== selection) return;
            if (data.session !== release.session || data.id !== row.id || data.symbol !== row.symbol ||
                data.price_basis !== release.price_basis || data.candles.length < 2) throw new Error('Chart identity mismatch');
            chart = data;
            metrics.firstElementChild.querySelector('dd').textContent = rupees(data.candles.at(-1).close);
            const figure = el('cup-figure');
            figure.dataset.state = row.state;
            el('cup-key-breakout').hidden = !row.breakout;
            figure.hidden = false;
            el('cup-chart-status').textContent = '';
            showPoint(null);
        } catch (error) {
            if (current === selection) el('cup-chart-status').textContent = 'Adjusted chart unavailable for this setup.';
        }
    }

    function renderRows() {
        const filter = el('cup-state').value, sort = el('cup-sort').value;
        const results = el('cup-results');
        results.replaceChildren();
        const rows = release.rows.filter(row => !filter || row.state === filter);
        const compare = sort === 'symbol' ? (a, b) => a.symbol.localeCompare(b.symbol) : sort === 'distance'
            ? (a, b) => Math.abs(a.distance_pct) - Math.abs(b.distance_pct)
            : (a, b) => rank[a.state] - rank[b.state];
        rows.sort((a, b) => compare(a, b) || a.symbol.localeCompare(b.symbol) || a.id.localeCompare(b.id));
        if (!rows.length) {
            selection++;
            active = chart = null;
            el('cup-evidence').hidden = true;
            results.append(textNode('li', filter ? 'No setups match this filter.' : 'No setups matched this scan.'));
            return;
        }
        for (const row of rows) {
            const item = textNode('li', '', 'cup-result');
            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.setupId = row.id;
            button.setAttribute('aria-pressed', String(active?.id === row.id));
            button.setAttribute('aria-label', `View ${row.symbol} chart`);
            const label = document.createElement('span');
            const arrow = textNode('span', '›');
            arrow.setAttribute('aria-hidden', 'true');
            label.append(textNode('strong', row.symbol), arrow);
            const status = textNode('span', '', 'cup-badge');
            badge(status, row.state);
            button.append(label, status, textNode('span', distanceLabel(row.distance_pct), 'cup-result-summary'));
            button.addEventListener('click', () => evidence(row, true));
            item.append(button);
            results.append(item);
        }
        if (!rows.some(row => row.id === active?.id)) evidence(rows[0]);
    }

    async function load() {
        const panel = el('tab-cup-with-handle');
        if (!panel) return;
        try {
            release = await checkedJson('/pro-research/cup-with-handle/index.json', panel.dataset.indexSha256);
            if (release.contract !== 'STOCKERBOARD_CUP_WITH_HANDLE_V1' || release.session !== panel.dataset.session) throw new Error('Wrong market session');
            let historyNote = '';
            if (release.status === 'UNAVAILABLE' && release.historical) {
                const prior = release.historical;
                const path = `pro-research/cup-with-handle/history/${prior.sha256}.json`;
                if (prior.path !== path || !(prior.session < panel.dataset.session)) throw new Error('Invalid historical release');
                release = await checkedJson(`/${path}`, prior.sha256);
                if (release.session !== prior.session || release.status !== 'AVAILABLE' ||
                    release.contract !== 'STOCKERBOARD_CUP_WITH_HANDLE_V1') throw new Error('Historical release mismatch');
                historyNote = `Scan unavailable for ${panel.dataset.session}. Showing historical results for `;
            }
            if (release.status !== 'AVAILABLE') {
                el('cup-status').textContent = `Scan unavailable for ${panel.dataset.session}.`;
                return;
            }
            if (!/^[a-f0-9]{24}$/.test(release.run_id) || !release.rows.every(row => /^[a-f0-9]{24}$/.test(row.id) && labels[row.state])) throw new Error('Invalid research index');
            const {scanned, cohort, excluded} = release.coverage;
            const date = el('cup-session');
            date.dateTime = release.session;
            date.textContent = dateLabel(release.session);
            el('cup-status').textContent = historyNote ? historyNote + dateLabel(release.session) + '.' : '';
            el('cup-scanned').replaceChildren(document.createTextNode(number.format(scanned)),
                textNode('span', ` of ${number.format(cohort)}`));
            el('cup-matched').textContent = number.format(release.rows.length);
            el('cup-confirmed').textContent = number.format(release.rows.filter(row => row.state === 'VOLUME_CONFIRMED').length);
            el('cup-exclusion-count').textContent = `· ${number.format(excluded)}`;
            el('cup-stats').hidden = false;
            const reasons = new Map();
            for (const [symbol, reason] of Object.entries(release.exclusions ?? {})) {
                const label = exclusionLabels[reason] || 'Data or eligibility checks pending';
                if (!reasons.has(label)) reasons.set(label, []);
                reasons.get(label).push(symbol);
            }
            for (const [label, symbols] of reasons) {
                el('cup-exclusions').append(textNode('dt', `${label} · ${number.format(symbols.length)}`),
                    textNode('dd', symbols.sort().join(', ')));
            }
            el('cup-coverage').hidden = !reasons.size;
            if (!scanned) {
                el('cup-status').textContent += ' Insufficient eligible data.';
                return;
            }
            el('cup-filters').hidden = !release.rows.length;
            el('cup-state').addEventListener('change', renderRows);
            el('cup-sort').addEventListener('change', renderRows);
            const canvas = el('cup-chart');
            function inspectPosition(event) {
                if (!chart) return;
                const offset = event.clientX - canvas.getBoundingClientRect().left;
                const last = chart.candles.length - 1;
                const index = Math.round((offset - 48) / (canvas.clientWidth - 60) * last);
                const selected = Math.max(0, Math.min(last, index));
                if (selected !== pointIndex) showPoint(selected);
            }
            canvas.addEventListener('pointermove', event => {
                if (event.pointerType !== 'touch') inspectPosition(event);
            });
            canvas.addEventListener('pointerdown', event => {
                if (event.pointerType === 'touch') inspectPosition(event);
            });
            canvas.addEventListener('pointerleave', event => {
                if (event.pointerType !== 'touch') showPoint(null);
            });
            canvas.addEventListener('keydown', event => {
                if (!chart || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const last = chart.candles.length - 1;
                const next = (pointIndex ?? last) + (event.key === 'ArrowLeft' ? -1 : 1);
                const index = event.key === 'Home' ? 0 : event.key === 'End' ? last : Math.max(0, Math.min(last, next));
                showPoint(index, true);
            });
            new ResizeObserver(drawChart).observe(canvas);
            new MutationObserver(drawChart).observe(document.documentElement, {attributes: true, attributeFilter: ['data-theme']});
            el('cup-workspace').hidden = false;
            renderRows();
        } catch (error) {
            el('cup-status').textContent = `Scan unavailable for ${panel.dataset.session}. Reopen this view to retry.`;
            request = null;
        }
    }

    window.StockerboardCup = {open: () => request ||= load()};
})();
