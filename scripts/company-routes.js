(function (root) {
    'use strict';

    const legacyPages = {
        overview: 'stockerboard_company_overview.html',
        financials: 'stockerboard_financials_tab.html',
        valuation: 'stockerboard_valuation_tab.html',
        peers: 'stockerboard_peers_tab.html',
        filings: 'stockerboard_filings_tab.html'
    };
    const validSymbol = /^[A-Z0-9&_.-]{1,40}$/;
    let registry;

    function legacyUrl(symbol, tab) {
        return `/${legacyPages[tab] || legacyPages.overview}?symbol=${encodeURIComponent(symbol)}`;
    }

    async function companyUrl(rawSymbol, tab = 'overview') {
        const symbol = String(rawSymbol || '').trim().toUpperCase();
        if (!validSymbol.test(symbol) || symbol.includes('..')) return '/stocks/';
        tab = Object.hasOwn(legacyPages, tab) ? tab : 'overview';
        registry ||= fetch('/company_slug_registry_v1.json', { cache: 'no-cache' })
            .then(response => response.ok ? response.json() : null)
            .catch(() => null);
        const data = await registry;
        const company = Array.isArray(data?.companies) && data.companies.find(row =>
            row.status === 'ACTIVE_PILOT' &&
            (row.symbol === symbol || row.legacy_symbols?.includes(symbol)));
        const slug = company?.canonical_slug;
        if (typeof slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
            return legacyUrl(symbol, tab);
        }
        return `/stocks/${slug}/${tab === 'overview' ? '' : `?tab=${tab}`}`;
    }

    root.StockerboardCompanyRoutes = { companyUrl };
    const tab = Object.keys(legacyPages).find(key => root.location.pathname === `/${legacyPages[key]}`);
    const symbol = new URLSearchParams(root.location.search).get('symbol');
    if (tab && symbol) {
        companyUrl(symbol, tab).then(url => {
            if (url.startsWith('/stocks/') && url !== '/stocks/') root.location.replace(url);
        });
    }
})(window);
