(function (root, factory) {
    'use strict';
    const contract = root.StockerboardPersonalContract || (typeof require === 'function' ? require('./personal-research-contract.js') : null);
    const api = factory(contract);
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }
    root.StockerboardPersonalStorage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Contract) {
    'use strict';

    const LEGACY_ARRAY_KEY = 'stockerboard_watchlist';
    const GUEST_STORAGE_KEY = 'stockerboard_guest_watchlist_v2';
    const RECEIPT_PREFIX = 'stockerboard_migration_receipt_';

    function safeStorage(storage) {
        if (storage) return storage;
        try {
            if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
        } catch (_) {}
        return null;
    }

    function fnv1aDigest(input) {
        const text = typeof input === 'string' ? input : JSON.stringify(input);
        let h1 = 0x811c9dc5;
        let h2 = 0x9e3779b9;
        for (let i = 0; i < text.length; i++) {
            const c = text.charCodeAt(i);
            h1 ^= c;
            h1 = Math.imul(h1, 0x01000193) >>> 0;
            h2 ^= (c + i) & 0xff;
            h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
        }
        return ('00000000' + h1.toString(16)).slice(-8) + ('00000000' + h2.toString(16)).slice(-8);
    }

    function inspectLegacyBrowserWatchlist(storage) {
        const store = safeStorage(storage);
        if (!store) return { status: 'EMPTY', items: [], digest: null, rawLength: 0, error: null };
        let raw = null;
        try {
            raw = store.getItem(LEGACY_ARRAY_KEY);
        } catch (err) {
            return { status: 'UNREADABLE', items: [], digest: null, rawLength: 0, error: String(err) };
        }
        if (raw === null || raw === '') {
            return { status: 'EMPTY', items: [], digest: null, rawLength: 0, error: null };
        }
        const byteLen = Contract ? Contract.utf8ByteLength(raw) : raw.length;
        const maxBytes = Contract ? Contract.BUDGETS.LEGACY_IMPORT_MAX_BYTES : 524288;
        if (byteLen > maxBytes) {
            return {
                status: 'QUARANTINED_OVERSIZED',
                classification: 'LEGACY_UNSCOPED',
                items: [],
                rawPreview: raw.slice(0, 200),
                rawForExport: raw,
                digest: fnv1aDigest(raw),
                rawLength: byteLen,
                error: 'LEGACY_PAYLOAD_TOO_LARGE',
            };
        }
        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (_) {
            return {
                status: 'QUARANTINED_MALFORMED',
                classification: 'LEGACY_UNSCOPED',
                items: [],
                rawPreview: raw.slice(0, 200),
                rawForExport: raw,
                digest: fnv1aDigest(raw),
                rawLength: byteLen,
                error: 'LEGACY_INVALID_JSON',
            };
        }
        if (!Array.isArray(parsed)) {
            return {
                status: 'QUARANTINED_WRONG_SHAPE',
                classification: 'LEGACY_UNSCOPED',
                items: [],
                rawPreview: raw.slice(0, 200),
                rawForExport: raw,
                digest: fnv1aDigest(raw),
                rawLength: byteLen,
                error: 'LEGACY_EXPECTED_ARRAY',
            };
        }
        const cleaned = [];
        const invalidEntries = [];
        const seen = new Set();
        for (const entry of parsed) {
            if (typeof entry !== 'string' || entry.length > 64) {
                invalidEntries.push(entry);
                continue;
            }
            const sym = Contract ? Contract.normalizeSymbol(entry) : entry.trim().toUpperCase();
            if (!sym) continue;
            if (!seen.has(sym)) {
                seen.add(sym);
                cleaned.push(sym);
            }
        }
        if (!cleaned.length && !invalidEntries.length) {
            return { status: 'EMPTY', items: [], digest: fnv1aDigest(raw), rawLength: byteLen, error: null };
        }
        return {
            status: 'AVAILABLE',
            classification: 'LEGACY_UNSCOPED',
            items: cleaned,
            invalidCount: invalidEntries.length,
            digest: fnv1aDigest(JSON.stringify(cleaned)),
            rawLength: byteLen,
            error: null,
        };
    }

    function readGuestWatchlist(storage) {
        const store = safeStorage(storage);
        if (!store) return { version: 2, updatedAt: null, symbols: [] };
        try {
            const raw = store.getItem(GUEST_STORAGE_KEY);
            if (!raw) return { version: 2, updatedAt: null, symbols: [] };
            const parsed = JSON.parse(raw);
            if (parsed && parsed.version === 2 && Array.isArray(parsed.symbols)) {
                const valid = [];
                const seen = new Set();
                for (const s of parsed.symbols) {
                    const sym = Contract ? Contract.normalizeSymbol(s) : String(s || '').trim().toUpperCase();
                    if (sym && (!Contract || Contract.isValidSymbol(sym)) && !seen.has(sym)) {
                        seen.add(sym);
                        valid.push(sym);
                    }
                }
                return { version: 2, updatedAt: parsed.updatedAt || null, symbols: valid.slice(0, Contract ? Contract.BUDGETS.GUEST_WATCHLIST_MAX : 3) };
            }
        } catch (_) {}
        return { version: 2, updatedAt: null, symbols: [] };
    }

    function writeGuestWatchlist(symbols, storage) {
        const store = safeStorage(storage);
        const maxGuest = Contract ? Contract.BUDGETS.GUEST_WATCHLIST_MAX : 3;
        const clean = [];
        const seen = new Set();
        for (const s of Array.isArray(symbols) ? symbols : []) {
            const sym = Contract ? Contract.normalizeSymbol(s) : String(s || '').trim().toUpperCase();
            if (sym && (!Contract || Contract.isValidSymbol(sym)) && !seen.has(sym)) {
                seen.add(sym);
                clean.push(sym);
            }
        }
        if (clean.length > maxGuest) {
            return { ok: false, code: 'GUEST_LIMIT_REACHED', limit: maxGuest, state: readGuestWatchlist(store) };
        }
        const record = {
            version: 2,
            updatedAt: new Date().toISOString(),
            symbols: clean,
        };
        if (store) {
            store.setItem(GUEST_STORAGE_KEY, JSON.stringify(record));
        }
        return { ok: true, state: record };
    }

    function clearGuestWatchlist(storage) {
        const store = safeStorage(storage);
        if (store) {
            try { store.removeItem(GUEST_STORAGE_KEY); } catch (_) {}
        }
    }

    function clearLegacyBrowserWatchlist(storage) {
        const store = safeStorage(storage);
        if (store) {
            try { store.removeItem(LEGACY_ARRAY_KEY); } catch (_) {}
        }
    }

    function migrationReceiptKey(uid) {
        return RECEIPT_PREFIX + fnv1aDigest(String(uid || ''));
    }

    function getLocalMigrationDecision(uid, sourceDigest, storage) {
        const store = safeStorage(storage);
        if (!store || !uid || !sourceDigest) return null;
        try {
            const raw = store.getItem(migrationReceiptKey(uid));
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (parsed && parsed.sourceDigest === sourceDigest) {
                return parsed; // Minimal decision only: decision, sourceDigest, decidedAt
            }
        } catch (_) {}
        return null;
    }

    function setLocalMigrationDecision(uid, sourceDigest, decision, storage) {
        const store = safeStorage(storage);
        if (!store || !uid || !sourceDigest) return;
        // Store zero emails, note bodies, tokens, or cloud watchlist copies in global localStorage.
        const minimal = {
            version: 1,
            sourceDigest: String(sourceDigest),
            decision: decision === 'IMPORTED' ? 'IMPORTED' : 'SKIPPED',
            decidedAt: new Date().toISOString(),
        };
        try {
            store.setItem(migrationReceiptKey(uid), JSON.stringify(minimal));
        } catch (_) {}
    }

    return {
        LEGACY_ARRAY_KEY,
        GUEST_STORAGE_KEY,
        fnv1aDigest,
        inspectLegacyBrowserWatchlist,
        readGuestWatchlist,
        writeGuestWatchlist,
        clearGuestWatchlist,
        clearLegacyBrowserWatchlist,
        getLocalMigrationDecision,
        setLocalMigrationDecision,
    };
});
