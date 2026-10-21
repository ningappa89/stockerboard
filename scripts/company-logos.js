/**
 * stockerboard_repo/scripts/company-logos.js
 * ==========================================
 * Canonical Visual Recognition Layer for Stockerboard Stock Identity.
 *
 * Hardened Features:
 * - Dynamic release / cache versioning (zero manual version strings)
 * - Session-level image asset failure circuit breaker
 * - Strict global error listener isolation (zero interference with charts/scripts/images)
 * - Explicit intrinsic image dimensions (width/height attributes) for CLS protection
 * - Progressive fallback enhancement (fail-closed, zero layout shifts)
 * - Lightweight public manifest consumption
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.CompanyLogos = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // Singleton Manifest State
    let _manifest = {
        schema_version: '1.0.0',
        total_logos: 0,
        aliases: { 'ZOMATO': 'ETERNAL' },
        logos: {}
    };
    let _manifestPromise = null;
    let _isLoaded = false;

    // Session-Level Failure Circuit Breaker
    const _circuit = {
        attemptedLoads: 0,
        successfulLoads: 0,
        failedLoads: 0,
        consecutiveFailures: 0,
        isOpen: false,
        MIN_ATTEMPTS: 8,
        CONSECUTIVE_THRESHOLD: 6
    };

    /**
     * Resolves the active release/session identifier from the host environment.
     * @returns {string} Release version string
     */
    function getActiveReleaseVersion() {
        if (typeof window !== 'undefined') {
            if (window.__STOCKERBOARD_RELEASE_ID) return String(window.__STOCKERBOARD_RELEASE_ID);
            if (window.dossierFinancialIndexReleaseId) return String(window.dossierFinancialIndexReleaseId);
            if (window.APP_DATA && window.APP_DATA.session_date) {
                return `session_${window.APP_DATA.session_date}_ed${window.APP_DATA.edition || 1}`;
            }
        }
        return '1.0.0';
    }

    /**
     * Normalizes any input symbol string into canonical uppercase ticker.
     * Strips exchange prefixes (NSE:, BSE:) and suffixes (.NS, .BO).
     * Resolves canonical aliases registered in the manifest.
     *
     * @param {string} symbol - Raw or user-supplied stock ticker
     * @returns {string} Canonical symbol
     */
    function normalizeLogoSymbol(symbol) {
        if (!symbol) return '';
        let clean = String(symbol)
            .replace(/NSE:|BSE:|\.NS|\.BO/gi, '')
            .trim()
            .toUpperCase();

        if (_manifest && _manifest.aliases && _manifest.aliases[clean]) {
            clean = _manifest.aliases[clean];
        }
        return clean;
    }

    /**
     * Extracts a deterministic fallback character from a canonical ticker.
     * @param {string} symbol - Canonical ticker
     * @returns {string} 1-character uppercase fallback initial
     */
    function getFallbackInitial(symbol) {
        const sym = normalizeLogoSymbol(symbol);
        const match = sym.match(/[A-Za-z0-9]/);
        return match ? match[0].toUpperCase() : '•';
    }

    /**
     * Initializes and loads the company logo manifest once.
     * @param {string} [customVersion] - Optional version override
     * @returns {Promise<Object>} Manifest data
     */
    function initCompanyLogoManifest(customVersion) {
        if (_manifestPromise) {
            return _manifestPromise;
        }

        const releaseVer = customVersion || getActiveReleaseVersion();
        const url = `assets/company-logos/manifest.json?v=${encodeURIComponent(releaseVer)}`;

        _manifestPromise = fetch(url, { cache: 'default' })
            .then(function (res) {
                if (!res.ok) {
                    throw new Error(`Logo manifest HTTP ${res.status}`);
                }
                return res.json();
            })
            .then(function (data) {
                if (data && typeof data === 'object') {
                    _manifest = {
                        schema_version: data.schema_version || '1.0.0',
                        updated_at: data.updated_at || null,
                        total_logos: typeof data.total_logos === 'number' ? data.total_logos : Object.keys(data.logos || {}).length,
                        aliases: Object.assign({ 'ZOMATO': 'ETERNAL' }, data.aliases || {}),
                        logos: data.logos || {}
                    };
                    _isLoaded = true;
                    if (typeof window !== 'undefined') {
                        window.__COMPANY_LOGO_MANIFEST = _manifest;
                    }
                }
                return _manifest;
            })
            .catch(function (err) {
                _isLoaded = true;
                return _manifest;
            });

        return _manifestPromise;
    }

    /**
     * Records asset load success to maintain circuit breaker state.
     */
    function recordAssetSuccess() {
        _circuit.attemptedLoads++;
        _circuit.successfulLoads++;
        _circuit.consecutiveFailures = 0;
    }

    /**
     * Records asset load failure and evaluates circuit breaker threshold.
     * Only called when a manifest-backed asset failed.
     */
    function recordAssetFailure() {
        _circuit.attemptedLoads++;
        _circuit.failedLoads++;
        _circuit.consecutiveFailures++;

        if (!_circuit.isOpen &&
            _circuit.attemptedLoads >= _circuit.MIN_ATTEMPTS &&
            _circuit.consecutiveFailures >= _circuit.CONSECUTIVE_THRESHOLD) {
            _circuit.isOpen = true;
        }
    }

    /**
     * Resolves logo availability and asset metadata for a given symbol.
     * Automatically enforces circuit breaker when open.
     *
     * @param {string} symbol - Raw or canonical ticker
     * @returns {Object} Resolution metadata
     */
    function resolveCompanyLogo(symbol) {
        const sym = normalizeLogoSymbol(symbol);
        const fallback = getFallbackInitial(sym);

        // If circuit breaker tripped, immediately route to fallback without firing network requests
        if (_circuit.isOpen) {
            return {
                available: false,
                symbol: sym,
                src: null,
                fallback: fallback,
                preferredSurface: 'light',
                circuitBreakerActive: true
            };
        }

        if (_manifest && _manifest.logos && _manifest.logos[sym]) {
            const meta = _manifest.logos[sym];
            return {
                available: true,
                symbol: sym,
                src: `assets/company-logos/${meta.file}`,
                fallback: fallback,
                preferredSurface: meta.preferred_surface || 'light',
                circuitBreakerActive: false
            };
        }

        return {
            available: false,
            symbol: sym,
            src: null,
            fallback: fallback,
            preferredSurface: 'light',
            circuitBreakerActive: false
        };
    }

    /**
     * Transitions an image element to its intentional fallback state.
     * Centralized and safe against layout shift.
     *
     * @param {HTMLImageElement} img - Image element that failed to load
     * @param {string} [overrideFallback] - Optional fallback initial character
     */
    function handleCompanyLogoError(img, overrideFallback) {
        if (!img || !img.closest) return;
        const wrap = img.closest('.stock-logo-wrap');
        if (!wrap) return;

        // Record failure against circuit breaker only if this was a registered asset
        if (wrap.getAttribute('data-manifest-backed') === 'true') {
            recordAssetFailure();
        }

        const fallback = overrideFallback || wrap.getAttribute('data-fallback') || '•';

        wrap.classList.add('is-fallback');
        wrap.setAttribute('aria-hidden', 'true');

        while (wrap.firstChild) {
            wrap.removeChild(wrap.firstChild);
        }

        if (typeof document !== 'undefined') {
            const fallbackEl = document.createElement('span');
            fallbackEl.className = 'stock-logo-fallback';
            fallbackEl.setAttribute('aria-hidden', 'true');
            fallbackEl.textContent = fallback;
            wrap.appendChild(fallbackEl);
        }
    }

    /**
     * Computes intrinsic pixel dimensions corresponding to container size.
     * @param {string} size - 'sm', 'md', 'lg'
     * @returns {{w: number, h: number}}
     */
    function getIntrinsicDimensions(size) {
        if (size === 'sm') return { w: 18, h: 18 };
        if (size === 'lg') return { w: 26, h: 26 };
        return { w: 22, h: 22 };
    }

    /**
     * Programmatic DOM element builder for stock recognition logos.
     *
     * @param {string} symbol - Ticker symbol
     * @param {Object} [options] - Configuration
     * @param {string} [options.size='md'] - 'sm' (24px), 'md' (28px), 'lg' (34px)
     * @param {boolean} [options.eager=false] - Eager loading for visible initial viewport
     * @param {string} [options.className=''] - Additional class names
     * @returns {HTMLSpanElement} Ready-to-mount DOM container
     */
    function createCompanyLogoElement(symbol, options) {
        const opts = options || {};
        const sizeKey = opts.size === 'sm' ? 'sm' : (opts.size === 'lg' ? 'lg' : 'md');
        const sizeClass = `size-${sizeKey}`;
        const dims = getIntrinsicDimensions(sizeKey);
        const resolved = resolveCompanyLogo(symbol);

        const wrap = document.createElement('span');
        wrap.className = `stock-logo-wrap ${sizeClass} ${opts.className || ''}`.trim();
        wrap.setAttribute('data-surface', resolved.preferredSurface);
        wrap.setAttribute('data-sym', resolved.symbol);
        wrap.setAttribute('data-fallback', resolved.fallback);
        wrap.setAttribute('aria-hidden', 'true');

        if (resolved.available && resolved.src) {
            wrap.setAttribute('data-manifest-backed', 'true');

            const img = document.createElement('img');
            img.className = 'stock-logo-img';
            img.src = resolved.src;
            img.alt = '';
            img.setAttribute('aria-hidden', 'true');
            img.width = dims.w;
            img.height = dims.h;
            img.loading = opts.eager ? 'eager' : 'lazy';
            img.decoding = 'async';
            if (!opts.eager) {
                img.setAttribute('fetchpriority', 'low');
            }

            img.addEventListener('load', function onLogoLoad() {
                recordAssetSuccess();
            }, { once: true });

            img.addEventListener('error', function onLogoError() {
                handleCompanyLogoError(img, resolved.fallback);
            }, { once: true });

            wrap.appendChild(img);
        } else {
            wrap.classList.add('is-fallback');
            const fallbackEl = document.createElement('span');
            fallbackEl.className = 'stock-logo-fallback';
            fallbackEl.setAttribute('aria-hidden', 'true');
            fallbackEl.textContent = resolved.fallback;
            wrap.appendChild(fallbackEl);
        }

        return wrap;
    }

    /**
     * HTML string generator for string-templated components (search dropdown, table templates).
     *
     * @param {string} symbol - Ticker symbol
     * @param {Object} [options] - Options
     * @returns {string} Sanitized HTML string
     */
    function renderStockLogoHtml(symbol, options) {
        const opts = options || {};
        const sizeKey = opts.size === 'sm' ? 'sm' : (opts.size === 'lg' ? 'lg' : 'md');
        const sizeClass = `size-${sizeKey}`;
        const dims = getIntrinsicDimensions(sizeKey);
        const resolved = resolveCompanyLogo(symbol);
        const loadingAttr = opts.eager ? 'loading="eager"' : 'loading="lazy" fetchpriority="low"';

        if (resolved.available && resolved.src) {
            return (
                `<span class="stock-logo-wrap ${sizeClass} ${opts.className || ''}" ` +
                `data-surface="${resolved.preferredSurface}" ` +
                `data-sym="${resolved.symbol}" ` +
                `data-fallback="${resolved.fallback}" ` +
                `data-manifest-backed="true" ` +
                `aria-hidden="true">` +
                `<img class="stock-logo-img" src="${resolved.src}" alt="" aria-hidden="true" ` +
                `width="${dims.w}" height="${dims.h}" ${loadingAttr} decoding="async">` +
                `</span>`
            );
        }

        return (
            `<span class="stock-logo-wrap ${sizeClass} is-fallback ${opts.className || ''}" ` +
            `data-surface="${resolved.preferredSurface}" ` +
            `data-sym="${resolved.symbol}" ` +
            `data-fallback="${resolved.fallback}" ` +
            `aria-hidden="true">` +
            `<span class="stock-logo-fallback" aria-hidden="true">${resolved.fallback}</span>` +
            `</span>`
        );
    }

    // Strictly Isolated Delegated Global Error Listener (Zero false positives on charts, scripts, fonts, etc.)
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('error', function (event) {
            const target = event.target;
            if (!target) return;
            // Strict type guard: must be an HTMLImageElement
            if (typeof HTMLImageElement !== 'undefined' && !(target instanceof HTMLImageElement)) return;
            // Strict class guard: must have .stock-logo-img class
            if (!target.classList || !target.classList.contains('stock-logo-img')) return;
            handleCompanyLogoError(target);
        }, true);
    }

    // Auto-initialize manifest on script load in browser
    if (typeof window !== 'undefined') {
        initCompanyLogoManifest(getActiveReleaseVersion());
    }

    return {
        initCompanyLogoManifest: initCompanyLogoManifest,
        normalizeLogoSymbol: normalizeLogoSymbol,
        getFallbackInitial: getFallbackInitial,
        resolveCompanyLogo: resolveCompanyLogo,
        createCompanyLogoElement: createCompanyLogoElement,
        renderStockLogoHtml: renderStockLogoHtml,
        handleCompanyLogoError: handleCompanyLogoError,
        isReady: function () { return _isLoaded; },
        getManifest: function () { return _manifest; },
        isCircuitOpen: function () { return _circuit.isOpen; },
        getCircuitMetrics: function () { return Object.assign({}, _circuit); },
        resetCircuitBreaker: function () {
            _circuit.attemptedLoads = 0;
            _circuit.successfulLoads = 0;
            _circuit.failedLoads = 0;
            _circuit.consecutiveFailures = 0;
            _circuit.isOpen = false;
        }
    };
}));
