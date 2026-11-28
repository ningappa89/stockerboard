(function () {
    'use strict';
    function init() {
        const home = document.getElementById('fresherHome');
        if (home) {
            const hero = home.querySelector('.fresher-hero-studio');
            const browse = document.createElement('button');
            browse.className = 'research-browse';
            browse.type = 'button';
            browse.textContent = 'Browse all companies';
            browse.setAttribute('aria-controls', 'tab-screener');
            browse.setAttribute('aria-expanded', 'false');
            const reveal = () => { document.body.dataset.discovery = 'open'; browse.setAttribute('aria-expanded', 'true'); };
            browse.onclick = () => { reveal(); document.getElementById('tab-screener')?.scrollIntoView({behavior:'smooth',block:'start'}); };
            hero?.append(browse);
            home.querySelectorAll('.fresher-qs-btn').forEach(button => button.addEventListener('click', reveal));
        }
        const main = document.querySelector('main[data-research-company]');
        if (!main) return;

        const allowedPanels = ['overview', 'financials', 'valuation', 'peers', 'filings'];
        const labelMap = {
            overview: 'Overview',
            financials: 'Financials',
            valuation: 'Valuation',
            peers: 'Peers',
            filings: 'Filings'
        };

        const panelEntries = [];
        for (const name of allowedPanels) {
            const el = main.querySelector('[data-research-panel="' + name + '"]');
            if (el) {
                panelEntries.push({ name, el, label: labelMap[name] });
            }
        }
        if (panelEntries.length === 0) return;

        const tabs = document.createElement('nav');
        tabs.className = 'research-company-tabs';
        tabs.setAttribute('role', 'tablist');
        tabs.setAttribute('aria-label', 'Company research');

        const buttons = panelEntries.map((entry, i) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = entry.label;
            button.id = 'research-tab-' + entry.name;
            button.setAttribute('role', 'tab');
            button.setAttribute('aria-controls', entry.el.id || ('research-' + entry.name));
            button.setAttribute('data-tab-name', entry.name);
            entry.el.setAttribute('role', 'tabpanel');
            entry.el.setAttribute('aria-labelledby', button.id);
            entry.el.tabIndex = 0;
            entry.el.classList.add('research-company-panel');
            button.onclick = () => activate(i, true);
            button.onkeydown = event => {
                const n = panelEntries.length;
                const next = event.key === 'ArrowRight' ? (i + 1) % n : event.key === 'ArrowLeft' ? (i + n - 1) % n : event.key === 'Home' ? 0 : event.key === 'End' ? n - 1 : -1;
                if (next >= 0) {
                    event.preventDefault();
                    activate(next, true);
                    buttons[next].focus();
                }
            };
            tabs.append(button);
            return button;
        });

        function activate(index, updateUrl = false) {
            panelEntries.forEach((entry, i) => {
                entry.el.hidden = i !== index;
                buttons[i].setAttribute('aria-selected', String(i === index));
                buttons[i].tabIndex = i === index ? 0 : -1;
            });
            const activeEntry = panelEntries[index];
            if (updateUrl && window.history && window.history.replaceState) {
                const url = new URL(window.location.href);
                if (activeEntry.name === 'overview') {
                    url.searchParams.delete('tab');
                } else {
                    url.searchParams.set('tab', activeEntry.name);
                }
                window.history.replaceState(null, '', url.toString());
            }

            // Lazy initialization triggers for peers and filings
            const sym = main.getAttribute('data-symbol') || (document.getElementById('companyFinancialStatements')?.getAttribute('data-symbol')) || '';
            if (activeEntry.name === 'peers' && typeof window.StockerboardPeers !== 'undefined' && !window.__PEERS_HYDRATED__) {
                if (sym) {
                    window.__PEERS_HYDRATED__ = true;
                    window.StockerboardPeers.load(sym);
                }
            }
            if (activeEntry.name === 'filings' && typeof window.loadFilingsTable !== 'undefined' && !window.__FILINGS_HYDRATED__) {
                if (sym) {
                    window.__FILINGS_HYDRATED__ = true;
                    window.loadFilingsTable(sym);
                }
            }
        }

        panelEntries[0].el.before(tabs);

        // Check initial URL ?tab parameter
        const p = new URLSearchParams(window.location.search);
        const reqTab = (p.get('tab') || 'overview').toLowerCase();
        const initIndex = panelEntries.findIndex(e => e.name === reqTab);
        activate(initIndex >= 0 ? initIndex : 0, false);

        // Wire Watchlist button through the shared personal-research facade
        const btnWatchlist = document.getElementById('btnWatchlist');
        if (btnWatchlist) {
            const sym = main.getAttribute('data-symbol') || '';
            const acct = window.StockerboardAccount;
            const store = window.StockerboardPersonalStorage;
            const getSymbols = () => {
                if (acct) return acct.getSnapshot().watchlistSymbols;
                if (store) return store.readGuestWatchlist().symbols;
                return [];
            };
            const updateBtn = () => {
                const list = getSymbols();
                const isSaved = list.includes(sym);
                btnWatchlist.textContent = isSaved ? '✓ Saved' : '+ Watchlist';
                btnWatchlist.classList.toggle('active', isSaved);
                btnWatchlist.setAttribute('aria-pressed', String(isSaved));
                btnWatchlist.setAttribute('aria-label', `${isSaved ? 'Remove from' : 'Add to'} watchlist`);
            };
            if (acct) acct.subscribe(updateBtn);
            else updateBtn();
            btnWatchlist.onclick = async () => {
                if (acct) {
                    const res = await acct.toggleWatchlistSymbol(sym);
                    if (!res.ok && res.code === 'GUEST_LIMIT_REACHED') {
                        showToast('Guest limit reached (3 stocks). Manage your full watchlist on Home or Pro.');
                    }
                    return;
                }
                if (store) {
                    const cur = store.readGuestWatchlist().symbols;
                    const next = cur.includes(sym) ? cur.filter(s => s !== sym) : [...cur, sym];
                    const wr = store.writeGuestWatchlist(next);
                    if (!wr.ok) {
                        showToast('Manage your full watchlist in Pro research.');
                        return;
                    }
                    updateBtn();
                }
            };
        }

        // Wire Copy Research Link button if present
        const btnCopyLink = document.getElementById('btnCopyLink');
        if (btnCopyLink) {
            btnCopyLink.onclick = async () => {
                const url = window.location.href;
                try {
                    await navigator.clipboard.writeText(url);
                    showToast('Research link copied to clipboard!');
                } catch(e) {
                    const inp = document.createElement('input');
                    inp.value = url;
                    document.body.appendChild(inp);
                    inp.select();
                    document.execCommand('copy');
                    inp.remove();
                    showToast('Research link copied to clipboard!');
                }
            };
        }

        function showToast(msg) {
            let toast = document.getElementById('researchToast');
            if (!toast) {
                toast = document.createElement('div');
                toast.id = 'researchToast';
                toast.className = 'research-toast';
                toast.setAttribute('role', 'status');
                document.body.appendChild(toast);
            }
            toast.textContent = msg;
            toast.classList.add('visible');
            setTimeout(() => toast.classList.remove('visible'), 2800);
        }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
