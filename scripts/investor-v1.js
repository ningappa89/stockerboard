/* Source-backed beginner result cards. Filtering and pagination stay with the existing engine. */
(function () {
    'use strict';

    function element(tag, className, value) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (value !== undefined) node.textContent = String(value);
        return node;
    }

    function updateDataNote() {
        const note = document.getElementById('investorDataNote');
        if (!note || typeof APP_DATA === 'undefined') return;
        if (document.body.classList.contains('screen-fresher')) {
            const count = window.investorUniverseStocks?.size || (APP_DATA.universe || []).length;
            const loadState = window.dossierFinancialIndexLoadState;
            note.classList.toggle('investor-data-error', loadState?.ok === false);
            if (loadState?.ok === false) {
                note.textContent = `${count.toLocaleString('en-IN')} companies are listed, but P/E and ROE could not load. The ratio cells show a loading error, not missing company data. `;
                if (loadState.fileOrigin) {
                    note.append(document.createTextNode('Local file pages cannot reliably load the financial index. '));
                    const link = element('a', '', 'Open the live Stockerboard site');
                    link.href = 'https://stockerboard.com/';
                    note.append(link, document.createTextNode(' instead.'));
                } else {
                    note.append(document.createTextNode('Please reload the page.'));
                }
            } else {
                note.textContent = `${count.toLocaleString('en-IN')} companies in the canonical universe · Market snapshot ${APP_DATA.universe_as_of || 'unavailable'} · Individual last-traded dates may be earlier. Ratios use their own certified report dates.`;
            }
        } else {
            note.classList.remove('investor-data-error');
            note.textContent = `${(APP_DATA.market_screener || []).length} technical snapshot stocks · Price session ${APP_DATA.session_date || 'unavailable'} · Missing values appear as —.`;
        }
    }

    async function showDataCoverage() {
        const note = document.getElementById('investorDataNote');
        if (!note) return;
        try {
            const response = await fetch('ui_data_contract_v1.json', {cache: 'no-store'});
            if (!response.ok) return;
            const contract = await response.json();
            if (contract.schema_version !== 1 || contract.population.count !== (APP_DATA.universe || []).length) return;
            const details = element('details', 'investor-data-coverage');
            details.id = 'investorDataCoverage';
            details.append(element('summary', '', 'Data coverage and dates'));
            const body = element('div', 'investor-data-coverage-body');
            body.append(element('p', '', `${contract.population.count.toLocaleString('en-IN')} companies in the canonical universe. Technical screens in Pro use a separate 350-stock snapshot.`));
            body.append(element('p', '', `Universe prices: ${contract.dates.universe_as_of}. Pro technical snapshot: ${contract.dates.pro_market_session}. Ratio dates and scopes vary by company.`));
            if (contract.dossier_coverage) {
                const coverage = contract.dossier_coverage;
                body.append(element('p', '', `${coverage.current_certified_count.toLocaleString('en-IN')} companies have certified financial dossiers; ${coverage.market_only_symbols.length} have market data with financials pending. All ${contract.population.count.toLocaleString('en-IN')} companies can be opened.`));
            }
            const list = element('ul');
            for (const [key, label] of [['pe', 'P/E'], ['roe', 'ROE'], ['pb', 'P/B'], ['roce', 'ROCE'], ['revenue_yoy', 'Quarterly revenue growth'], ['market_cap', 'Market cap'], ['return_1y', '1-year return'], ['sales_growth_3y', '3-year sales growth'], ['debt_to_equity', 'Debt/equity']]) {
                const item = contract.metrics[key];
                list.append(element('li', '', `${label}: ${item.covered}/${item.population} with a value${item.enabled ? '' : ' · unavailable as a beginner filter'}.`));
            }
            body.append(list);
            details.append(body);
            note.after(details);
        } catch (_) {
            // The dated note remains visible if the optional coverage file cannot load.
        }
    }

    function metric(label, value, dateNote) {
        const wrap = element('div');
        const title = element('dt', '', label);
        const number = element('dd', '', value || '—');
        if (value === '—') number.title = `${label} unavailable for this stock`;
        wrap.append(title, number);
        if (dateNote && value !== '—') wrap.append(element('small', 'investor-card-metric-date', dateNote));
        return wrap;
    }

    window.renderInvestorV1Cards = function (rows) {
        const container = document.getElementById('investorStockCards');
        if (!container) return;
        updateDataNote();
        const stocks = window.investorUniverseStocks || new Map((APP_DATA.market_screener || []).map(stock => [stock.symbol, stock]));
        const watched = new Set(typeof getWatchlist === 'function' ? getWatchlist() : []);
        const fragment = document.createDocumentFragment();
        for (const row of rows) {
            const stock = stocks.get(row.dataset.sym);
            if (!stock) continue;
            const card = element('article', 'investor-stock-card');
            const top = element('div', 'investor-card-top');
            const identity = element('div');
            identity.append(
                element('h3', 'investor-card-company', stock.company_name || stock.symbol),
                element('div', 'investor-card-meta', `${stock.symbol} · ${stock.sector || 'Sector unavailable'}`)
            );
            const star = element('button', 'investor-card-star', watched.has(stock.symbol) ? '★' : '☆');
            star.type = 'button';
            star.setAttribute('aria-label', `${watched.has(stock.symbol) ? 'Remove' : 'Add'} ${stock.symbol} ${watched.has(stock.symbol) ? 'from' : 'to'} watchlist`);
            star.setAttribute('aria-pressed', String(watched.has(stock.symbol)));
            star.onclick = () => {
                toggleWatchlist(stock.symbol, star);
                const isWatched = getWatchlist().includes(stock.symbol);
                star.textContent = isWatched ? '★' : '☆';
                star.setAttribute('aria-pressed', String(isWatched));
                star.setAttribute('aria-label', `${isWatched ? 'Remove' : 'Add'} ${stock.symbol} ${isWatched ? 'from' : 'to'} watchlist`);
            };
            top.append(identity, star);
            const price = element('div', 'investor-card-price', row.cells[5].textContent.trim() || '—');
            price.title = `Price as of ${stock.price_as_of || APP_DATA.universe_as_of || 'date unavailable'}`;
            const values = element('dl', 'investor-card-metrics');
            const pe = row.cells[10].textContent.trim();
            const peAvailable = stock.ratio_status?.pe?.status === 'AVAILABLE' ||
                (!stock.ratio_status && number(stock.pe) !== null);
            values.append(
                metric('P/E', peAvailable ? `${pe}x` : pe, peAvailable && stock.ratio_price_as_of ? `Price ${stock.ratio_price_as_of}` : null),
                metric('ROE', row.cells[11].textContent.trim(), stock.ratio_status?.roe?.status === 'AVAILABLE' && stock.roe_period_end ? `Period ${stock.roe_period_end}` : null)
            );
            const open = element('button', 'investor-card-open', 'View company →');
            open.type = 'button';
            open.setAttribute('aria-label', `View ${stock.company_name || stock.symbol}`);
            open.onclick = () => openStockDossier(stock.symbol);
            card.append(top, price, values, open);
            fragment.append(card);
        }
        container.replaceChildren(fragment);
    };

    window.renderProMobileCards = function (rows) {
        const container = document.getElementById('proMobileCards');
        if (!container) return;
        const watched = new Set(typeof getWatchlist === 'function' ? getWatchlist() : []);
        const fragment = document.createDocumentFragment();

        for (const row of rows) {
            const sym = row.dataset.sym;
            if (!sym) continue;
            const name = row.dataset.name || sym;
            const sec = row.dataset.sec || 'General';
            const dist = parseFloat(row.dataset.dist || '0');
            const mom = row.dataset.mom || '—';
            const volmult = row.dataset.volmult || '—';
            const roe = row.dataset.roe;
            const pe = row.dataset.pe;

            const price = row.cells[5]?.textContent.trim() || '—';
            const high52 = row.cells[6]?.textContent.trim() || '—';
            const distStr = row.cells[7]?.textContent.trim() || (dist >= 0 ? `+${dist.toFixed(1)}%` : `${dist.toFixed(1)}%`);

            let regime = 'Consolidation';
            let regimeClass = 'regime-consolidation';
            if (row.dataset.confluence === '1') {
                regime = 'Multi-Confluence';
                regimeClass = 'regime-confluence';
            } else if (row.dataset.stage2 === '1') {
                regime = 'Stage 2 Pullback';
                regimeClass = 'regime-stage2';
            } else if (row.dataset.pivot === '1') {
                regime = 'Pocket Pivot';
                regimeClass = 'regime-pivot';
            } else if (row.dataset.vcp === '1') {
                regime = 'Minervini VCP';
                regimeClass = 'regime-vcp';
            } else if (dist >= -0.5) {
                regime = '52W Breakout';
                regimeClass = 'regime-breakout';
            } else if (dist >= -3.0) {
                regime = 'Coiled (<3%)';
                regimeClass = 'regime-coiled';
            }

            const peDisplay = (pe && pe !== '-1.0' && pe !== '-999') ? `${parseFloat(pe).toFixed(1)}x` : '—';
            const roeDisplay = (roe && roe !== '-1.0' && roe !== '-999') ? `${parseFloat(roe).toFixed(1)}%` : '—';

            const card = element('div', 'pro-stock-card');
            card.dataset.symbol = sym;

            const hdr = element('div', 'pro-card-header');
            const ident = element('div', 'pro-card-identity');
            ident.append(
                element('span', 'pro-card-symbol', sym),
                element('span', 'pro-card-name', name),
                element('span', 'pro-card-sector', sec)
            );

            const star = element('button', 'pro-watchlist-btn', watched.has(sym) ? '★' : '☆');
            star.type = 'button';
            star.setAttribute('aria-label', `${watched.has(sym) ? 'Remove' : 'Add'} ${sym} to watchlist`);
            star.setAttribute('aria-pressed', String(watched.has(sym)));
            star.onclick = (e) => {
                e.stopPropagation();
                if (typeof toggleWatchlist === 'function') toggleWatchlist(sym, star);
                const isW = typeof getWatchlist === 'function' && getWatchlist().includes(sym);
                star.textContent = isW ? '★' : '☆';
                star.setAttribute('aria-pressed', String(isW));
            };
            hdr.append(ident, star);

            const mainMetric = element('div', 'pro-card-main-metric');
            const priceBlock = element('div', 'pro-price-block');
            priceBlock.append(
                element('span', 'pro-price', price),
                element('span', `pro-change ${dist >= -1.0 ? 'badge-up' : 'badge-flat'}`, distStr)
            );

            const highBlock = element('div', 'pro-high-dist-block');
            highBlock.append(
                element('span', 'pro-high-val', distStr),
                element('span', 'pro-high-lbl', 'from 52W High')
            );
            mainMetric.append(priceBlock, highBlock);

            const hls = element('div', 'pro-card-highlights');
            const hlMom = element('div', 'pro-hl-item');
            hlMom.append(
                element('span', 'hl-lbl', 'Momentum Strength'),
                element('span', 'hl-val score-high', `${mom} / 100`)
            );
            const hlRegime = element('div', 'pro-hl-item');
            hlRegime.append(
                element('span', 'hl-lbl', 'Setup Regime'),
                element('span', `hl-val ${regimeClass}`, regime)
            );
            hls.append(hlMom, hlRegime);

            const details = element('details', 'pro-card-expandable');
            const summary = element('summary', 'pro-expand-trigger', 'View Volume, P/E & ROE');
            const content = element('div', 'pro-expanded-content');

            const rowVol = element('div', 'detail-row');
            rowVol.append(element('span', '', 'Volume Surge:'), element('strong', '', `${volmult}x`));

            const rowHigh = element('div', 'detail-row');
            rowHigh.append(element('span', '', '52W High:'), element('strong', '', high52));

            const rowVal = element('div', 'detail-row');
            rowVal.append(element('span', '', 'P/E / ROE:'), element('strong', '', `${peDisplay} / ${roeDisplay}`));

            const link = element('a', 'pro-dossier-link', 'Open Full Analysis & Chart ➔');
            link.href = `#stock/${sym}`;
            link.onclick = (e) => {
                e.preventDefault();
                if (typeof openStockDrawer === 'function') openStockDrawer(sym);
                else if (typeof openStockDossier === 'function') openStockDossier(sym);
            };

            content.append(rowVol, rowHigh, rowVal, link);
            details.append(summary, content);

            card.append(hdr, mainMetric, hls, details);
            fragment.append(card);
        }

        container.replaceChildren(fragment);
    };

    function number(value) {
        if (value === null || value === undefined || value === '' || value === 'N/A') return null;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }

    const explanations = {
        'P/E': 'Share price compared with earnings per share. A lower P/E alone does not make a stock inexpensive.',
        'P/B': 'Market price compared with accounting book value per share. Compare with the company’s business and sector.',
        'ROE': 'Profit relative to shareholders’ equity. Debt and one-off gains can affect it.',
        'Standalone ROE (FY26)': 'Profit relative to shareholders’ equity for parent company standalone operations in FY26 (for companies without subsidiaries).',
        'ROCE': 'Profit relative to capital employed. This measure is unavailable until its inputs are certified.',
        'Debt / equity': 'Borrowings compared with shareholders’ equity. The figure is not directly comparable across all sectors.',
        'Current ratio': 'Current assets divided by current liabilities. This presentation is not applicable to some financial companies.'
    };

    function missingReason(status) {
        const reason = status && status.reason;
        if (status?.status === 'NOT_APPLICABLE' || reason === 'DOMAIN_NOT_APPLICABLE') return 'Not applicable for this business type';
        if (status?.status === 'PENDING_LAYER' || reason === 'UNSUPPORTED_INPUT_CONTRACT') return 'Certified inputs are not available yet';
        if (reason === 'UNSUPPORTED_ATTRIBUTION_SEMANTICS') return 'Profit and equity attribution cannot be matched safely';
        if (reason === 'UNSUPPORTED_DOMAIN_SEMANTICS') return 'This ratio is not supported for this business type';
        if (reason === 'MISSING_EPS') return 'Earnings per share is unavailable';
        if (reason === 'MISSING_TOTAL_DEBT') return 'A debt component is unavailable';
        if (reason === 'MISSING_CURRENT_ASSETS') return 'Current assets are unavailable';
        return 'Not available in this release';
    }

    function formatSemanticValue(value, statusObj, options = {}) {
        const status = statusObj?.status;
        const reason = statusObj?.reason;
        const parsed = number(value);

        if (status === 'AVAILABLE' && parsed !== null) {
            const digits = options.digits ?? 1;
            const amount = Math.abs(parsed).toLocaleString('en-IN', {minimumFractionDigits: 0, maximumFractionDigits: digits});
            return `${parsed < 0 ? '−' : ''}${options.prefix || ''}${amount}${options.suffix || ''}`;
        }
        if (status === 'NOT_APPLICABLE' || reason === 'NOT_APPLICABLE' || reason === 'DOMAIN_NOT_APPLICABLE') {
            return 'Not applicable for this company type';
        }
        if (status === 'PENDING_LAYER' || reason === 'UNSUPPORTED_INPUT_CONTRACT') {
            return 'Not available yet';
        }
        if (status === 'UNAVAILABLE') {
            return '— Not available';
        }
        return '— Not available';
    }

    function formatted(value, options = {}) {
        return formatSemanticValue(value, null, options);
    }

    function summaryMetric(label, value, status) {
        const row = element('div', 'investor-summary-metric');
        const header = element('div', 'investor-summary-metric-label');
        header.append(element('dt', '', label));
        if (explanations[label]) {
            const help = element('button', 'investor-metric-explain', '?');
            help.type = 'button';
            help.setAttribute('aria-label', `Explain ${label}`);
            help.setAttribute('aria-expanded', 'false');
            const explanation = element('p', 'investor-metric-explanation', explanations[label]);
            explanation.hidden = true;
            help.onclick = () => {
                explanation.hidden = !explanation.hidden;
                help.setAttribute('aria-expanded', String(!explanation.hidden));
            };
            header.append(help);
            row.append(header, element('dd', '', value));
            row.append(explanation);
        } else {
            row.append(header, element('dd', '', value));
        }
        if (value === '— Not available' && status) {
            const reasonText = missingReason(status);
            if (reasonText && reasonText !== 'Not available in this release' && reasonText !== 'Not available') {
                row.append(element('p', 'investor-metric-status', reasonText));
            }
        }
        return row;
    }

    function summaryGroup(title, entries, context) {
        const group = element('section', 'investor-summary-group');
        group.append(element('h3', '', title));
        if (context) group.append(element('p', 'investor-summary-context', context));
        const values = element('dl', 'investor-summary-values');
        for (const [label, value, status] of entries) values.append(summaryMetric(label, value, status));
        group.append(values);
        return group;
    }

    function reportingContext(metric) {
        if (!metric?.financial_period_end) return 'Reporting period unavailable';
        const scope = metric.scope ? ` · ${String(metric.scope).toLowerCase()}` : '';
        return `Reported period ending ${metric.financial_period_end}${scope}`;
    }

    function setupCompanyView() {
        const view = document.getElementById('stockDossierView');
        if (!view || document.getElementById('investorCompanySummary')) return;
        const hero = view.querySelector('.dossier-hero-card');
        const financials = view.querySelector('.dossier-details-grid');
        const chart = view.querySelector('.dossier-chart-card');
        const technical = view.querySelector('.dossier-bento-grid');
        const risk = view.querySelector('.fresher-edu-card');
        if (!hero || !financials || !chart || !technical || !risk) return;

        const overview = element('section', 'investor-company-summary');
        overview.id = 'investorCompanySummary';
        const heading = element('h2', '', 'Understand this company');
        const source = element('p', 'investor-summary-source');
        source.id = 'investorSummarySource';
        const grid = element('div', 'investor-summary-grid');
        grid.id = 'investorSummaryGrid';
        overview.append(heading, source, grid);

        const advanced = element('section', 'investor-company-advanced');
        advanced.id = 'investorCompanyAdvanced';
        advanced.append(element('h2', '', 'Technicals and risk tools'));
        advanced.append(technical, risk);
        const market = element('section', 'investor-company-panel');
        market.id = 'investorCompanyMarket';
        market.append(chart);
        const finance = element('section', 'investor-company-panel');
        finance.id = 'investorCompanyFinancials';
        finance.append(financials);
        const statements=element('section','fs-root');
        statements.id='dossierFinancialStatements';
        statements.setAttribute('aria-label','Financial statements');
        finance.append(statements);
        const panels = [overview, market, finance, advanced];
        const tabs = element('nav', 'investor-dossier-tabs');
        tabs.id = 'investorDossierTabs';
        tabs.setAttribute('role', 'tablist');
        tabs.setAttribute('aria-label', 'Company sections');
        const labels = ['Overview', 'Price & chart', 'More financials', 'Technicals & risk'];
        const buttons = panels.map((panel, index) => {
            panel.setAttribute('role', 'tabpanel');
            panel.setAttribute('aria-labelledby', `investorDossierTab${index}`);
            const button = element('button', 'investor-dossier-tab', labels[index]);
            button.type = 'button';
            button.id = `investorDossierTab${index}`;
            button.setAttribute('role', 'tab');
            button.setAttribute('aria-controls', panel.id);
            button.onclick = () => activate(index);
            button.onkeydown = event => {
                const next = event.key === 'ArrowRight' ? (index + 1) % buttons.length
                    : event.key === 'ArrowLeft' ? (index + buttons.length - 1) % buttons.length
                    : event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : -1;
                if (next >= 0) { event.preventDefault(); activate(next); buttons[next].focus(); }
            };
            tabs.append(button);
            return button;
        });
        function activate(index) {
            panels.forEach((panel, offset) => {
                const selected = offset === index;
                panel.hidden = !selected;
                buttons[offset].setAttribute('aria-selected', String(selected));
                buttons[offset].tabIndex = selected ? 0 : -1;
            });
        }
        window.activateInvestorDossierTab = name => {
            const index = ['overview', 'market', 'financials', 'technicals'].indexOf(name);
            activate(index < 0 ? 0 : index);
        };
        hero.after(tabs);
        tabs.after(...panels);
        activate(0);
    }

    window.renderInvestorCompanySummary = function (stock) {
        setupCompanyView();
        const grid = document.getElementById('investorSummaryGrid');
        const source = document.getElementById('investorSummarySource');
        if (!grid || !source) return;
        const status = stock.ratios_status || {};
        const provenance = stock.dossier_provenance || {};
        const biz = provenance.business_performance || {};
        const bs = provenance.balance_sheet || {};
        const rat = provenance.ratios || {};
        const val = provenance.valuation || {};

        source.textContent = stock.dossier_provenance ? 'Financial values come from the certified public company dossier. Dates and scope are shown by section where published.' : 'Market data is available for this company. Certified financial statements and ratios are pending; unavailable values are shown below.';
        grid.replaceChildren(
            summaryGroup('Business', [
                ['Revenue (TTM)', formatSemanticValue(stock.revenue_crore, biz.REVENUE_TTM, {prefix: '₹', suffix: ' Cr', digits: 0}), biz.REVENUE_TTM],
                ['Profit (TTM)', formatSemanticValue(stock.pat_crore, biz.PAT_TTM, {prefix: '₹', suffix: ' Cr', digits: 0}), biz.PAT_TTM],
                ['Basic EPS (TTM)', formatSemanticValue(stock.eps, biz.EPS_BASIC_TTM, {prefix: '₹', digits: 2}), biz.EPS_BASIC_TTM],
                ['Net margin (latest quarter)', formatSemanticValue(stock.net_margin_pct, biz.NET_MARGIN_PCT, {suffix: '%', digits: 1}), biz.NET_MARGIN_PCT]
            ], reportingContext(biz.REVENUE_TTM)),
            summaryGroup('Financial health', [
                ['Net worth', formatSemanticValue(stock.net_worth_crore, bs.NET_WORTH, {prefix: '₹', suffix: ' Cr', digits: 0}), bs.NET_WORTH],
                ['Total debt', formatSemanticValue(stock.total_debt_crore, bs.TOTAL_DEBT, {prefix: '₹', suffix: ' Cr', digits: 0}), bs.TOTAL_DEBT],
                ['Debt / equity', formatSemanticValue(stock.debt_to_equity, status.debt_to_equity || rat.DEBT_TO_EQUITY, {suffix: 'x', digits: 2}), status.debt_to_equity || rat.DEBT_TO_EQUITY],
                ['Current ratio', formatSemanticValue(stock.current_ratio, status.current_ratio || rat.CURRENT_RATIO, {suffix: 'x', digits: 2}), status.current_ratio || rat.CURRENT_RATIO]
            ], reportingContext(bs.NET_WORTH)),
            summaryGroup('Returns', [
                ['ROE', formatSemanticValue(stock.roe, status.roe || rat.ROE, {suffix: '%', digits: 1}), status.roe || rat.ROE],
                ...(stock.standalone_roe != null ? [['Standalone ROE (FY26)', formatSemanticValue(stock.standalone_roe, {status: 'AVAILABLE'}, {suffix: '%', digits: 1}), {status: 'AVAILABLE'}]] : []),
                ['ROCE', formatSemanticValue(stock.roce, status.roce || rat.ROCE, {suffix: '%', digits: 1}), status.roce || rat.ROCE]
            ], reportingContext(stock.roe != null ? rat.ROE : (stock.standalone_roe != null ? {financial_period_end: stock.standalone_roe_period_end, scope: 'STANDALONE'} : rat.ROE))),
            summaryGroup('Valuation', [
                ['P/E', formatSemanticValue(stock.pe, status.pe || val.P_E, {suffix: 'x', digits: 1}), status.pe || val.P_E],
                ['P/B', formatSemanticValue(stock.pb, status.pb || val.P_B, {suffix: 'x', digits: 2}), status.pb || val.P_B],
                ['Book value / share', formatSemanticValue(stock.bvps, bs.BVPS, {prefix: '₹', digits: 2}), bs.BVPS]
            ], `Price as of ${val.P_E?.price_as_of || stock.price_as_of || 'date unavailable'}`)
        );
        const marketCap = document.getElementById('dossierMarketCap');
        if (marketCap) {
            const mcapVal = formatSemanticValue(stock.market_cap_crore, val.MARKET_CAP, {prefix: '₹', suffix: ' Cr', digits: 0});
            marketCap.textContent = mcapVal === '— Not available' ? 'Market cap — Not available' : `Market cap ${mcapVal}`;
        }
        for (const [id, metric] of [['dossierTblNetDebt', 'NET_DEBT'], ['dossierTblWorkingCapital', 'WORKING_CAPITAL'], ['dossierTblBookValue', 'BOOK_VALUE']]) {
            const target = document.getElementById(id);
            if (target) target.textContent = formatSemanticValue(bs[metric]?.display_value, bs[metric], {prefix: '₹', suffix: ' Cr', digits: 0});
        }
        if (window.activateInvestorDossierTab) window.activateInvestorDossierTab('overview');
    };

    window.sortInvestorResults = function (key) {
        const tbody = document.querySelector('#screenerTable tbody');
        if (!tbody) return;
        const rows = [...tbody.rows];
        const numeric = (row, field) => field === 'price'
            ? number(row.cells[5].textContent.replace(/[^\d.\-]/g, ''))
            : number(row.dataset[field]);
        rows.sort((a, b) => {
            if (key === 'published') return Number(a.dataset.publishedRank) - Number(b.dataset.publishedRank);
            if (key === 'company_asc') return a.dataset.name.localeCompare(b.dataset.name) || a.dataset.sym.localeCompare(b.dataset.sym);
            if (key === 'coverage_desc') {
                const coverage = row => Number(number(row.dataset.pe) !== null) + Number(number(row.dataset.roe) !== null);
                return coverage(b) - coverage(a) || a.dataset.name.localeCompare(b.dataset.name) || a.dataset.sym.localeCompare(b.dataset.sym);
            }
            const [field, direction] = key.split('_');
            const left = numeric(a, field);
            const right = numeric(b, field);
            if (left === null || right === null) return left === null && right === null ? a.dataset.sym.localeCompare(b.dataset.sym) : left === null ? 1 : -1;
            return (direction === 'desc' ? right - left : left - right) || a.dataset.sym.localeCompare(b.dataset.sym);
        });
        tbody.append(...rows);
        const visible = new Set(screenerFilteredRows);
        screenerFilteredRows = rows.filter(row => visible.has(row));
        screenerCurrentPage = 1;
        renderScreenerPage();
    };

    let filterDialog;
    const filterFields = ['sector', 'roe', 'pe', 'distance'];

    function selectField(id, label, options) {
        const wrap = element('label', 'investor-filter-field');
        wrap.append(element('span', '', label));
        const select = element('select');
        select.id = id;
        for (const [value, text] of options) {
            const option = element('option', '', text);
            option.value = value;
            select.append(option);
        }
        select.onchange = previewFilters;
        wrap.append(select);
        return wrap;
    }

    function filterDraft() {
        return Object.fromEntries(filterFields.map(field => [field, filterDialog.querySelector(`#investorFilter-${field}`).value]));
    }

    function matchesExistingPreset(row) {
        const dist = number(row.dataset.dist);
        const mom = number(row.dataset.mom);
        const vol = number(row.dataset.volmult);
        const roe = number(row.dataset.roe);
        const pe = number(row.dataset.pe);
        for (const preset of activeScreenerPresets) {
            if (preset === 'BREAKOUT' && !(dist !== null && dist >= -.5)) return false;
            if (preset === 'COILED' && !(dist !== null && dist >= -3 && dist < -.05)) return false;
            if (preset === 'VCP' && row.dataset.vcp !== '1') return false;
            if (preset === 'POCKET_PIVOT' && row.dataset.pivot !== '1') return false;
            if (preset === 'STAGE2' && row.dataset.stage2 !== '1') return false;
            if (preset === 'CONFLUENCE' && row.dataset.confluence !== '1') return false;
            if (preset === 'MOMENTUM' && !(mom !== null && mom >= 85)) return false;
            if (preset === 'VOL_SURGE' && !(vol !== null && vol >= 1.5)) return false;
            if (preset === 'HIGH_ROE' && !(roe !== null && roe >= 15)) return false;
            if (preset === 'VALUE_PE' && !(pe !== null && pe > 0 && pe <= 25)) return false;
        }
        return true;
    }

    function previewFilters() {
        if (!filterDialog) return;
        const draft = filterDraft();
        const minRoe = Number(draft.roe);
        const maxPe = Number(draft.pe);
        const minDistance = Number(draft.distance);
        const minVolume = Number(document.getElementById('sliderVol').value);
        const query = document.getElementById('tableSearch').value.trim().toLowerCase();
        const rows = document.querySelectorAll('#screenerTable tbody tr');
        let count = 0;
        for (const row of rows) {
            const roe = number(row.dataset.roe);
            const pe = number(row.dataset.pe);
            const dist = number(row.dataset.dist);
            const vol = number(row.dataset.volmult);
            if (draft.sector !== 'ALL' && (draft.sector === '__missing__' ? Boolean(row.dataset.sec) : row.dataset.sec !== draft.sector)) continue;
            if (minRoe > 0 && !(roe !== null && roe >= minRoe)) continue;
            if (maxPe < 80 && !(pe !== null && pe > 0 && pe <= maxPe)) continue;
            if (minDistance > -20 && !(dist !== null && dist >= minDistance)) continue;
            if (minVolume > 0 && !(vol !== null && vol >= minVolume)) continue;
            if (query && !row.textContent.toLowerCase().includes(query)) continue;
            if (!matchesExistingPreset(row)) continue;
            count++;
        }
        filterDialog.querySelector('#investorFilterApply').textContent = `Show ${count} ${count === 1 ? 'stock' : 'stocks'}`;
    }

    function readCurrentFilters() {
        for (const [field, slider, label] of [
            ['roe', 'sliderRoe', value => `At least ${value}%`],
            ['pe', 'sliderPe', value => `Up to ${value}`],
            ['distance', 'sliderDist', value => `Within ${Math.abs(Number(value))}%`]
        ]) {
            const select = filterDialog.querySelector(`#investorFilter-${field}`);
            const value = document.getElementById(slider).value;
            if (![...select.options].some(option => option.value === value)) {
                const option = element('option', '', label(value));
                option.value = value;
                select.append(option);
            }
        }
        filterDialog.querySelector('#investorFilter-sector').value = document.getElementById('screenerSectorSelect').value;
        filterDialog.querySelector('#investorFilter-roe').value = document.getElementById('sliderRoe').value;
        filterDialog.querySelector('#investorFilter-pe').value = document.getElementById('sliderPe').value;
        filterDialog.querySelector('#investorFilter-distance').value = document.getElementById('sliderDist').value;
        previewFilters();
    }

    function applyFilterDraft() {
        const draft = filterDraft();
        document.getElementById('screenerSectorSelect').value = draft.sector;
        document.getElementById('sliderRoe').value = draft.roe;
        document.getElementById('sliderPe').value = draft.pe;
        document.getElementById('sliderDist').value = draft.distance;
        updatePowerSliderBadges();
        applyScreenerFilters();
        filterDialog.close();
        document.getElementById('investorFilterOpen').focus();
    }

    function restoreFilterUrl() {
        const params = new URLSearchParams(location.search);
        const sector = params.get('sector');
        if (sector && [...document.getElementById('screenerSectorSelect').options].some(option => option.value === sector)) document.getElementById('screenerSectorSelect').value = sector;
        for (const [name, id, min, max, step] of [
            ['roe', 'sliderRoe', 0, 35, 5],
            ['pe', 'sliderPe', 15, 80, 5],
            ['distance', 'sliderDist', -20, 0, .5]
        ]) {
            const value = params.get(name);
            const parsed = Number(value);
            if (value !== null && Number.isFinite(parsed) && parsed >= min && parsed <= max && Number.isInteger((parsed - min) / step)) document.getElementById(id).value = value;
        }
    }

    window.syncInvestorFilterUrl = function () {
        if (!filterDialog) return;
        const url = new URL(location.href);
        for (const key of filterFields) url.searchParams.delete(key);
        const sector = document.getElementById('screenerSectorSelect').value;
        const roe = document.getElementById('sliderRoe').value;
        const pe = document.getElementById('sliderPe').value;
        const distance = document.getElementById('sliderDist').value;
        if (sector !== 'ALL') url.searchParams.set('sector', sector);
        if (roe !== '0') url.searchParams.set('roe', roe);
        if (pe !== '80') url.searchParams.set('pe', pe);
        if (distance !== '-20') url.searchParams.set('distance', distance);
        history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    };

    window.setupInvestorFilters = function () {
        if (filterDialog) return;
        const bar = document.querySelector('#tab-screener .filter-row-bottom');
        if (!bar) return;
        const open = element('button', 'investor-filter-open', 'Filters');
        open.id = 'investorFilterOpen';
        open.type = 'button';
        bar.append(open);

        filterDialog = element('dialog', 'investor-filter-dialog');
        filterDialog.id = 'investorFilterDialog';
        const title = element('h2', '', 'Filter stocks');
        title.id = 'investorFilterTitle';
        const intro = element('p', 'investor-filter-intro', `Filter the ${(APP_DATA.universe || []).length.toLocaleString('en-IN')}-company canonical universe. Unavailable values do not pass a selected financial rule.`);
        intro.id = 'investorFilterIntro';
        filterDialog.setAttribute('aria-labelledby', title.id);
        filterDialog.setAttribute('aria-describedby', intro.id);
        const fields = element('div', 'investor-filter-fields');
        const sectors = [...document.getElementById('screenerSectorSelect').options].map(option => [option.value, option.textContent]);
        fields.append(
            selectField('investorFilter-sector', 'Sector', sectors),
            selectField('investorFilter-roe', 'Profitability · ROE', [['0', 'Any ROE'], ['10', 'At least 10%'], ['15', 'At least 15%'], ['20', 'At least 20%']]),
            selectField('investorFilter-pe', 'Valuation · P/E', [['80', 'Any P/E'], ['15', 'Up to 15'], ['25', 'Up to 25'], ['40', 'Up to 40']]),
            selectField('investorFilter-distance', 'Price strength · distance from 52-week high', [['-20', 'Any'], ['-10', 'Within 10%'], ['-5', 'Within 5%']])
        );
        const actions = element('div', 'investor-filter-actions');
        const reset = element('button', 'investor-filter-reset', 'Reset');
        reset.type = 'button';
        reset.onclick = () => {
            filterDialog.querySelector('#investorFilter-sector').value = 'ALL';
            filterDialog.querySelector('#investorFilter-roe').value = '0';
            filterDialog.querySelector('#investorFilter-pe').value = '80';
            filterDialog.querySelector('#investorFilter-distance').value = '-20';
            previewFilters();
        };
        const cancel = element('button', 'investor-filter-cancel', 'Cancel');
        cancel.type = 'button';
        cancel.onclick = () => filterDialog.close();
        const apply = element('button', 'investor-filter-apply', 'Show stocks');
        apply.id = 'investorFilterApply';
        apply.type = 'button';
        apply.onclick = applyFilterDraft;
        actions.append(reset, cancel, apply);
        filterDialog.append(title, intro, fields, actions);
        document.body.append(filterDialog);
        open.onclick = () => { readCurrentFilters(); filterDialog.showModal(); filterDialog.querySelector('#investorFilter-sector').focus(); };
        restoreFilterUrl();
    };

    document.addEventListener('DOMContentLoaded', () => { setupCompanyView(); showDataCoverage(); });
})();
