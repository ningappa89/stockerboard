(function (root, factory) {
    'use strict';
    const contract = root.StockerboardPersonalContract || (typeof require === 'function' ? require('./personal-research-contract.js') : null);
    const storage = root.StockerboardPersonalStorage || (typeof require === 'function' ? require('./personal-research-storage.js') : null);
    const fbAdapter = root.StockerboardPersonalFirebase || (typeof require === 'function' ? require('./personal-research-firebase.js') : null);
    const api = factory(contract, storage, fbAdapter, root);
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }
    root.StockerboardAccount = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Contract, Storage, FirebaseAdapter, root) {
    'use strict';

    const DEFAULT_STATE = () => ({
        mode: Contract.MODES.DISABLED,
        lifecycleState: Contract.STATES.GUEST,
        syncStatus: Contract.SYNC_STATUS.LOCAL,
        syncMessage: 'Guest storage on this browser',
        user: null, // { uid, email, displayName, photoURL, authTimeSeconds }
        accountEpoch: null,
        revision: 0,
        serverObservedRevision: 0,
        watchlist: [], // Array of { itemId, symbol, companyId, securityId, identityStatus, unresolvedReason }
        notes: [],     // Array of { noteId, companyId, symbol, title, body, releaseRef, updatedAt }
        legacyPreview: null,
        identityIndex: new Map(), // symbol -> { companyId, companyName, isin, series, status }
        identityMappingVersion: null,
        lastError: null,
    });

    let _state = DEFAULT_STATE();
    let _sessionGeneration = 0;
    let _subscribers = new Set();
    let _unsubscribes = [];
    let _authUnsubscribe = null;
    let _pendingTimers = new Set();
    let _inFlightOps = 0;
    let _localStorageRef = null;
    let _broadcast = null;
    let _firebaseInitialized = false;
    let _authDeps = null;
    let _loaded = {};
    let _pendingViewRevision = -1;
    const _retryEnvelopes = new Map();
    let _deleteRequest = null;

    function notify() {
        const snapshot = getSnapshot();
        for (const fn of _subscribers) {
            try { fn(snapshot); } catch (_) {}
        }
    }

    function getSnapshot() {
        return {
            mode: _state.mode,
            lifecycleState: _state.lifecycleState,
            syncStatus: _state.syncStatus,
            syncMessage: _state.syncMessage,
            user: _state.user ? { ..._state.user } : null,
            accountEpoch: _state.accountEpoch,
            revision: _state.revision,
            serverObservedRevision: _state.serverObservedRevision,
            watchlist: _state.watchlist.map((w) => ({ ...w })),
            watchlistSymbols: _state.watchlist.map((w) => w.symbol),
            notes: _state.notes.map((n) => ({ ...n })),
            legacyPreview: _state.legacyPreview ? { ..._state.legacyPreview } : null,
            identityMappingVersion: _state.identityMappingVersion,
            lastError: _state.lastError,
        };
    }

    function subscribe(fn) {
        if (typeof fn !== 'function') return () => {};
        _subscribers.add(fn);
        fn(getSnapshot());
        return () => _subscribers.delete(fn);
    }

    function detachAllListenersAndTimers() {
        for (const unsub of _unsubscribes) {
            try { unsub(); } catch (_) {}
        }
        _unsubscribes = [];
        for (const tid of _pendingTimers) {
            clearTimeout(tid);
        }
        _pendingTimers.clear();
    }

    function makeOperationId(prefix) {
        const rnd = Math.random().toString(36).slice(2, 10);
        return `${prefix}_${Date.now().toString(36)}_${rnd}`.slice(0, 64);
    }

    function setupBroadcastChannel() {
        if (_broadcast || typeof BroadcastChannel === 'undefined') return;
        try {
            _broadcast = new BroadcastChannel('stockerboard_personal_session');
            if (typeof _broadcast.unref === 'function') _broadcast.unref();
            _broadcast.onmessage = (ev) => {
                const msg = ev && ev.data;
                if (!msg || typeof msg !== 'object') return;
                // Only invalidation metadata crosses tabs — zero note bodies, tokens, or watchlists.
                if (msg.type === 'SESSION_INVALIDATED' && _state.user && Storage.fnv1aDigest(_state.user.uid) === msg.uidHash) {
                    _sessionGeneration += 1;
                    detachAllListenersAndTimers();
                    clearSignedInMemoryToGuest();
                }
            };
        } catch (_) {}
    }

    function broadcastInvalidation(uid) {
        if (!_broadcast || !uid) return;
        try {
            _broadcast.postMessage({
                type: 'SESSION_INVALIDATED',
                uidHash: Storage.fnv1aDigest(uid),
            });
        } catch (_) {}
    }

    function resolveSymbolIdentity(symbol) {
        const sym = Contract.normalizeSymbol(symbol);
        if (!Contract.isValidSymbol(sym)) {
            return { symbol: sym, companyId: null, identityStatus: 'INVALID_SYMBOL' };
        }
        const entry = _state.identityIndex.get(sym);
        if (entry && entry.companyId && entry.status === 'RESOLVED') {
            return {
                symbol: sym,
                companyId: entry.companyId,
                securityId: entry.securityId || null,
                isin: entry.isin || null,
                series: entry.series || null,
                companyName: entry.companyName || sym,
                identityStatus: 'RESOLVED',
            };
        }
        return {
            symbol: sym,
            companyId: null,
            identityStatus: 'UNRESOLVED_PUBLIC_IDENTITY',
        };
    }

    function loadGuestIntoState() {
        const guest = Storage.readGuestWatchlist(_localStorageRef);
        _state.user = null;
        _state.accountEpoch = null;
        _state.revision = 0;
        _state.serverObservedRevision = 0;
        _state.notes = [];
        _state.legacyPreview = null;
        _state.lastError = null;
        _state.watchlist = guest.symbols.map((sym) => {
            const ref = resolveSymbolIdentity(sym);
            return {
                itemId: ref.companyId || `SYM_${sym}`,
                symbol: sym,
                companyId: ref.companyId,
                identityStatus: ref.identityStatus,
            };
        });
        _state.lifecycleState = Contract.STATES.GUEST;
        _state.syncStatus = Contract.SYNC_STATUS.LOCAL;
        _state.syncMessage = 'Saved on this browser (guest limit: 3 companies)';
    }

    function clearSignedInMemoryToGuest() {
        _state.user = null;
        _state.accountEpoch = null;
        _state.revision = 0;
        _state.serverObservedRevision = 0;
        _state.notes = [];
        _state.legacyPreview = null;
        loadGuestIntoState();
        notify();
    }

    function setIdentityCatalog(catalogPayload) {
        if (!catalogPayload || typeof catalogPayload !== 'object') return;
        const map = new Map();
        const companies = catalogPayload.companies || {};
        for (const [sym, info] of Object.entries(companies)) {
            if (!info || !info.company_id || info.identity_status !== 'RESOLVED') continue;
            map.set(Contract.normalizeSymbol(sym), {
                companyId: info.company_id,
                companyName: info.company_name || sym,
                isin: info.isin || null,
                series: info.series || null,
                securityId: info.security_id || null,
                status: 'RESOLVED',
            });
        }
        _state.identityIndex = map;
        _state.identityMappingVersion = catalogPayload.release_id || catalogPayload.version || 'PUBLIC_IDENTITY_V1';
        if (!_state.user) {
            loadGuestIntoState();
            notify();
        }
    }

    async function loadIdentityCatalogFromUrl(url) {
        if (!url || typeof root.fetch !== 'function') return false;
        try {
            const resp = await root.fetch(url, { cache: 'no-cache' });
            if (!resp.ok) return false;
            const data = await resp.json();
            setIdentityCatalog(data);
            return true;
        } catch (_) {
            return false;
        }
    }

    function refreshSyncLabelFromRevision() {
        if (_state.lifecycleState === Contract.STATES.UNAVAILABLE) {
            _state.syncStatus = Contract.SYNC_STATUS.UNAVAILABLE;
            _state.syncMessage = 'Private saving unavailable';
            return;
        }
        if (!_state.user) {
            _state.syncStatus = Contract.SYNC_STATUS.LOCAL;
            _state.syncMessage = 'Saved on this browser (guest limit: 3 companies)';
            return;
        }
        if (_state.lifecycleState === Contract.STATES.SAVING || _inFlightOps > 0) {
            _state.syncStatus = Contract.SYNC_STATUS.SAVING;
            _state.syncMessage = 'Saving changes...';
            return;
        }
        if (_state.lifecycleState === Contract.STATES.UNAVAILABLE) {
            _state.syncStatus = Contract.SYNC_STATUS.UNAVAILABLE;
            _state.syncMessage = 'Private saving unavailable';
            return;
        }
        if (_state.lifecycleState === Contract.STATES.CONFLICT) {
            _state.syncStatus = Contract.SYNC_STATUS.CONFLICT;
            _state.syncMessage = 'Version conflict — refresh required';
            return;
        }
        if (_state.lifecycleState === Contract.STATES.UNSAVED) {
            _state.syncStatus = Contract.SYNC_STATUS.UNSAVED;
            _state.syncMessage = 'Unsaved changes';
            return;
        }
        if (_loaded.profile && _loaded.watchlist && _loaded.notes && _state.serverObservedRevision >= _state.revision && _state.revision >= 0) {
            _state.syncStatus = Contract.SYNC_STATUS.SYNCED;
            _state.syncMessage = 'Synced to your private account';
        } else {
            _state.syncStatus = Contract.SYNC_STATUS.SAVED;
            _state.syncMessage = 'Saved to server';
        }
    }

    function inspectLegacyImportOpportunity(uid) {
        const legacy = Storage.inspectLegacyBrowserWatchlist(_localStorageRef);
        if (legacy.status === 'EMPTY') {
            _state.legacyPreview = null;
            return;
        }
        const prior = legacy.digest ? Storage.getLocalMigrationDecision(uid, legacy.digest, _localStorageRef) : null;
        if (prior) {
            _state.legacyPreview = null;
            return;
        }
        _state.legacyPreview = {
            ...legacy,
            resolvedItems: (legacy.items || []).map((sym) => resolveSymbolIdentity(sym)),
        };
    }

    async function handleAuthChanged(user) {
        const gen = ++_sessionGeneration;
        _loaded = {}; _pendingViewRevision = -1;
        _retryEnvelopes.clear();
        detachAllListenersAndTimers();
        _inFlightOps = 0;
        _state.lastError = null;

        if (!user || !user.uid) {
            clearSignedInMemoryToGuest();
            return;
        }

        // Immediately hide any prior account's records before loading the new account.
        _state.watchlist = [];
        _state.notes = [];
        _state.legacyPreview = null;
        _state.accountEpoch = null;
        _state.revision = 0;
        _state.serverObservedRevision = 0;
        _state.user = {
            uid: user.uid,
            email: user.email || '',
            displayName: user.displayName || '',
            photoURL: user.photoURL || '',
        };
        _state.lifecycleState = Contract.STATES.ACCOUNT_LOADING;
        _state.syncStatus = Contract.SYNC_STATUS.LOADING;
        _state.syncMessage = 'Loading your private account...';
        notify();

        try {
            const boot = await _authDeps.callManaged('bootstrapAccount', {
                protocolVersion: Contract.PROTOCOL_VERSION,
                identityMappingVersion: _state.identityMappingVersion,
            });
            if (gen !== _sessionGeneration || !_state.user || _state.user.uid !== user.uid) return;

            if (boot.lifecycle === 'DELETING' || boot.lifecycle === 'DELETED') {
                _state.lifecycleState = Contract.STATES.DELETING;
                _state.syncStatus = Contract.SYNC_STATUS.UNAVAILABLE;
                _state.syncMessage = boot.lifecycle === 'DELETED' ? 'Account deleted' : 'Account deletion in progress';
                notify();
                return;
            }

            _state.accountEpoch = boot.accountEpoch;
            _state.revision = boot.revision || 0;
            if (boot.lifecycle === 'MIGRATING') {
                _state.lifecycleState = Contract.STATES.UNAVAILABLE;
                _state.lastError = boot.migrationError || 'LEGACY_MIGRATION_REVIEW_REQUIRED';
                _state.syncStatus = Contract.SYNC_STATUS.UNAVAILABLE;
                _state.syncMessage = 'Legacy data needs review. Export remains available in Settings.';
                notify(); return;
            }
            _state.serverObservedRevision = -1;
            _state.lifecycleState = Contract.STATES.READY;
            inspectLegacyImportOpportunity(user.uid);
            attachOwnerListeners(user.uid, gen);
            refreshSyncLabelFromRevision();
            notify();
        } catch (err) {
            if (gen !== _sessionGeneration) return;
            _state.lifecycleState = Contract.STATES.UNAVAILABLE;
            _state.syncStatus = Contract.SYNC_STATUS.UNAVAILABLE;
            _state.syncMessage = 'Private account service unavailable';
            _state.lastError = (err && err.message) || 'BOOTSTRAP_FAILED';
            notify();
        }
    }

    function listenerFailed(err, gen) {
        if (gen !== _sessionGeneration) return;
        _state.lifecycleState = Contract.STATES.UNAVAILABLE;
        _state.lastError = err?.code || 'LISTENER_UNAVAILABLE';
        refreshSyncLabelFromRevision(); notify();
    }

    function attachOwnerListeners(uid, gen) {
        if (!_authDeps || !_authDeps.db) return;
        const db = _authDeps.db;

        const userDocUnsub = db.collection('users').doc(uid).onSnapshot({includeMetadataChanges:true}, (snap) => {
            if (gen !== _sessionGeneration) return;
            if (!snap.exists) return;
            const d = snap.data() || {};
            if (d.lifecycle === 'DELETING' || d.lifecycle === 'DELETED') {
                _sessionGeneration += 1;
                detachAllListenersAndTimers();
                _state.watchlist = [];
                _state.notes = [];
                _state.lifecycleState = Contract.STATES.DELETING;
                _state.syncStatus = Contract.SYNC_STATUS.UNAVAILABLE;
                notify();
                return;
            }
            _loaded.profile = !snap.metadata?.fromCache;
            if (Number.isInteger(d.revision) && _loaded.profile) {
                _pendingViewRevision = d.revision;
                if (d.revision > _state.revision) {
                    _state.revision = d.revision;
                }
                refreshSyncLabelFromRevision();
                notify();
            }
        }, (err) => listenerFailed(err, gen));
        _unsubscribes.push(userDocUnsub);

        const wlUnsub = db.collection('users').doc(uid).collection('watchlistItems').where('accountEpoch', '==', _state.accountEpoch).onSnapshot({includeMetadataChanges:true}, (snap) => {
            if (gen !== _sessionGeneration) return;
            const items = [];
            snap.forEach((doc) => {
                const d = doc.data() || {};
                if (d.symbol) {
                    items.push({ itemId: doc.id, ...d });
                }
            });
            items.sort((a, b) => String(a.symbol).localeCompare(String(b.symbol)));
            _state.watchlist = items;
            _loaded.watchlist = !snap.metadata?.fromCache;
            refreshSyncLabelFromRevision();
            notify();
        }, (err) => {
            if (gen !== _sessionGeneration) return;
            listenerFailed(err, gen);
        });
        _unsubscribes.push(wlUnsub);

        const notesUnsub = db.collection('users').doc(uid).collection('notes').where('accountEpoch', '==', _state.accountEpoch).onSnapshot({includeMetadataChanges:true}, (snap) => {
            if (gen !== _sessionGeneration) return;
            const notes = [];
            snap.forEach((doc) => {
                notes.push({ noteId: doc.id, ...(doc.data() || {}) });
            });
            notes.sort((a, b) => String(b.updatedAtMs || '').localeCompare(String(a.updatedAtMs || '')));
            _state.notes = notes;
            _loaded.notes = !snap.metadata?.fromCache;
            refreshSyncLabelFromRevision();
            notify();
        }, (err) => listenerFailed(err, gen));
        _unsubscribes.push(notesUnsub);
        if (typeof db.onSnapshotsInSync === 'function') {
            _unsubscribes.push(db.onSnapshotsInSync(() => {
                if (gen !== _sessionGeneration || !_loaded.profile || !_loaded.notes || !_loaded.watchlist) return;
                _state.serverObservedRevision = _pendingViewRevision;
                refreshSyncLabelFromRevision(); notify();
            }));
        }
    }

    function init(options) {
        if (_firebaseInitialized && !options?.forceReinit) return getSnapshot();
        const opts = options || {};
        _localStorageRef = opts.storage || null;
        setupBroadcastChannel();
        if (opts.identityCatalog) {
            setIdentityCatalog(opts.identityCatalog);
        }
        const config = root.StockerboardPersonalConfig || opts.config || (root.APP_DATA && root.APP_DATA.auth_config) || { enabled: false, mode: 'DISABLED' };
        const fbRes = (opts.firebaseAdapter || FirebaseAdapter).initOnce(config, opts.firebaseSdk);
        _state.mode = fbRes.mode;
        _firebaseInitialized = true;

        if (!fbRes.ok && _state.mode !== Contract.MODES.DISABLED) {
            _authDeps = null;
            loadGuestIntoState();
            _state.lifecycleState = Contract.STATES.UNAVAILABLE;
            _state.syncStatus = Contract.SYNC_STATUS.UNAVAILABLE;
            _state.syncMessage = 'Private account configuration unavailable';
            _state.lastError = fbRes.error;
            notify();
            return getSnapshot();
        }

        if (_state.mode === Contract.MODES.DISABLED || !fbRes.auth) {
            _authDeps = null;
            loadGuestIntoState();
            notify();
            return getSnapshot();
        }

        _authDeps = {
            auth: fbRes.auth,
            db: fbRes.db,
            callManaged: opts.callManaged || (opts.firebaseAdapter || FirebaseAdapter).callManaged,
        };
        loadGuestIntoState();
        _state.lifecycleState = Contract.STATES.AUTH_LOADING;
        _state.syncStatus = Contract.SYNC_STATUS.LOADING;
        notify();

        if (typeof _authUnsubscribe === 'function') {
            try { _authUnsubscribe(); } catch (_) {}
            _authUnsubscribe = null;
        }
        const adapter = opts.firebaseAdapter || FirebaseAdapter;
        Promise.resolve(adapter.ready ? adapter.ready() : undefined).then(() => {
            _authUnsubscribe = fbRes.auth.onAuthStateChanged(handleAuthChanged);
        }).catch(err => listenerFailed(err, _sessionGeneration));
        return getSnapshot();
    }

    async function signInWithEmailPassword(email, password) {
        if (!_authDeps || !_authDeps.auth) throw new Error('Authentication unavailable');
        return _authDeps.auth.signInWithEmailAndPassword(email, password);
    }

    async function signOut() {
        const uid = _state.user && _state.user.uid;
        _sessionGeneration += 1;
        detachAllListenersAndTimers();
        _inFlightOps = 0;
        clearSignedInMemoryToGuest();
        if (uid) broadcastInvalidation(uid);
        if (_authDeps && _authDeps.auth && typeof _authDeps.auth.signOut === 'function') {
            await _authDeps.auth.signOut();
        }
    }

    async function toggleWatchlistSymbol(symbol) {
        const sym = Contract.normalizeSymbol(symbol);
        if (!Contract.isValidSymbol(sym)) {
            return { ok: false, code: 'INVALID_SYMBOL' };
        }

        // Guest path: strict 3-company limit via versioned guest key
        if (!_state.user) {
            const cur = Storage.readGuestWatchlist(_localStorageRef).symbols;
            const exists = cur.includes(sym);
            const next = exists ? cur.filter((s) => s !== sym) : [...cur, sym];
            if (!exists && cur.length >= Contract.BUDGETS.GUEST_WATCHLIST_MAX) {
                return { ok: false, code: 'GUEST_LIMIT_REACHED', limit: Contract.BUDGETS.GUEST_WATCHLIST_MAX };
            }
            const writeRes = Storage.writeGuestWatchlist(next, _localStorageRef);
            loadGuestIntoState();
            notify();
            return { ok: writeRes.ok, watched: !exists, count: _state.watchlist.length };
        }

        if (![Contract.STATES.READY, Contract.STATES.UNSAVED, Contract.STATES.CONFLICT].includes(_state.lifecycleState)) {
            return { ok: false, code: 'ACCOUNT_NOT_READY', state: _state.lifecycleState };
        }

        const gen = _sessionGeneration;
        const uid = _state.user.uid;
        const existing = _state.watchlist.find((w) => w.symbol === sym);
        const retry = _retryEnvelopes.get('wl:' + sym);
        const command = retry ? retry.command : existing ? 'WATCHLIST_REMOVE' : 'WATCHLIST_ADD';
        const ref = resolveSymbolIdentity(sym);

        const envelope = retry || Contract.createMutationEnvelope({
            operationId: makeOperationId('wl'),
            accountEpoch: _state.accountEpoch,
            expectedRevision: _state.revision,
            command,
            payload: existing
                ? { itemId: existing.itemId, symbol: sym }
                : {
                    symbol: sym,
                    companyId: ref.companyId,
                    securityId: ref.securityId || null,
                    isin: ref.isin || null,
                    identityStatus: ref.identityStatus,
                    identityMappingVersion: _state.identityMappingVersion,
                },
        });

        _retryEnvelopes.set('wl:' + sym, envelope);
        _inFlightOps += 1;
        _state.lifecycleState = Contract.STATES.SAVING;
        refreshSyncLabelFromRevision();
        notify();

        try {
            const res = await _authDeps.callManaged('mutatePersonalResearch', envelope);
            if (gen !== _sessionGeneration || !_state.user || _state.user.uid !== uid) {
                return { ok: false, code: 'STALE_SESSION_DISCARDED' };
            }
            _inFlightOps = Math.max(0, _inFlightOps - 1);
            _state.revision = Math.max(_state.revision, res.revision);
            if (Array.isArray(res.watchlist)) {
                _state.watchlist = res.watchlist;
            } else if (command === 'WATCHLIST_ADD' && !_state.watchlist.some(w => w.itemId === res.itemId)) {
                _state.watchlist = [..._state.watchlist, { itemId: res.itemId || ref.companyId || `SYM_${sym}`, symbol: sym, companyId: ref.companyId, identityStatus: ref.identityStatus }];
            } else if (command === 'WATCHLIST_REMOVE') {
                _state.watchlist = _state.watchlist.filter((w) => w.symbol !== sym);
            }
            _state.lifecycleState = Contract.STATES.READY;
            refreshSyncLabelFromRevision();
            notify();
            _retryEnvelopes.delete('wl:' + sym);
            return { ok: true, watched: command === 'WATCHLIST_ADD', revision: res.revision };
        } catch (err) {
            if (gen !== _sessionGeneration) return { ok: false, code: 'STALE_SESSION_DISCARDED' };
            _inFlightOps = Math.max(0, _inFlightOps - 1);
            const code = (err && err.code) || 'MUTATION_FAILED';
            _state.lifecycleState = String(code).toLowerCase().replace('functions/', '') === 'failed-precondition' ? Contract.STATES.CONFLICT : Contract.STATES.UNSAVED;
            _state.lastError = (err && err.message) || code;
            refreshSyncLabelFromRevision();
            notify();
            return { ok: false, code, message: _state.lastError };
        }
    }

    async function saveNote(draft) {
        if (!_state.user) return { ok: false, code: 'SIGN_IN_REQUIRED' };
        if (![Contract.STATES.READY, Contract.STATES.UNSAVED, Contract.STATES.CONFLICT].includes(_state.lifecycleState)) {
            return { ok: false, code: 'ACCOUNT_NOT_WRITABLE' };
        }
        const validated = Contract.validateNoteDraft(draft);
        if (!validated.ok) return validated;

        const gen = _sessionGeneration;
        const uid = _state.user.uid;
        const isUpdate = Boolean(validated.value.noteId);
        const draftKey = 'note:' + JSON.stringify(validated.value);
        const envelope = _retryEnvelopes.get(draftKey) || Contract.createMutationEnvelope({
            operationId: makeOperationId('note'),
            accountEpoch: _state.accountEpoch,
            expectedRevision: _state.revision,
            command: isUpdate ? 'NOTE_UPDATE' : 'NOTE_CREATE',
            payload: validated.value,
        });

        _retryEnvelopes.set(draftKey, envelope);
        _inFlightOps += 1;
        _state.lifecycleState = Contract.STATES.SAVING;
        refreshSyncLabelFromRevision();
        notify();

        try {
            const res = await _authDeps.callManaged('mutatePersonalResearch', envelope);
            if (gen !== _sessionGeneration || !_state.user || _state.user.uid !== uid) {
                return { ok: false, code: 'STALE_SESSION_DISCARDED' };
            }
            _inFlightOps = Math.max(0, _inFlightOps - 1);
            _state.revision = Math.max(_state.revision, res.revision);
            _state.lifecycleState = Contract.STATES.READY;
            refreshSyncLabelFromRevision();
            notify();
            _retryEnvelopes.delete(draftKey);
            return { ok: true, noteId: res.noteId, revision: res.revision };
        } catch (err) {
            if (gen !== _sessionGeneration) return { ok: false, code: 'STALE_SESSION_DISCARDED' };
            _inFlightOps = Math.max(0, _inFlightOps - 1);
            _state.lifecycleState = Contract.STATES.UNSAVED;
            _state.lastError = (err && err.message) || 'NOTE_SAVE_FAILED';
            refreshSyncLabelFromRevision();
            notify();
            return { ok: false, code: (err && err.code) || 'NOTE_SAVE_FAILED', message: _state.lastError };
        }
    }

    async function deleteNote(noteId) {
        if (!_state.user || !Contract.isSafeId(noteId)) return { ok: false, code: 'INVALID_REQUEST' };
        const gen = _sessionGeneration;
        const uid = _state.user.uid;
        const envelope = Contract.createMutationEnvelope({
            operationId: makeOperationId('ndel'),
            accountEpoch: _state.accountEpoch,
            expectedRevision: _state.revision,
            command: 'NOTE_DELETE',
            payload: { noteId },
        });
        _inFlightOps += 1;
        _state.lifecycleState = Contract.STATES.SAVING;
        refreshSyncLabelFromRevision();
        notify();
        try {
            const res = await _authDeps.callManaged('mutatePersonalResearch', envelope);
            if (gen !== _sessionGeneration || !_state.user || _state.user.uid !== uid) {
                return { ok: false, code: 'STALE_SESSION_DISCARDED' };
            }
            _inFlightOps = Math.max(0, _inFlightOps - 1);
            _state.revision = Math.max(_state.revision, res.revision);
            _state.notes = _state.notes.filter((n) => n.noteId !== noteId);
            _state.lifecycleState = Contract.STATES.READY;
            refreshSyncLabelFromRevision();
            notify();
            return { ok: true, revision: res.revision };
        } catch (err) {
            if (gen !== _sessionGeneration) return { ok: false, code: 'STALE_SESSION_DISCARDED' };
            _inFlightOps = Math.max(0, _inFlightOps - 1);
            _state.lifecycleState = Contract.STATES.UNSAVED;
            _state.lastError = (err && err.message) || 'NOTE_DELETE_FAILED';
            refreshSyncLabelFromRevision();
            notify();
            return { ok: false, message: _state.lastError };
        }
    }

    async function importLegacySelected(selectedSymbols) {
        if (!_state.user || !_state.legacyPreview) return { ok: false, code: 'NO_LEGACY_SOURCE' };
        const gen = _sessionGeneration;
        const uid = _state.user.uid;
        const sourceDigest = _state.legacyPreview.digest;
        const items = (selectedSymbols || _state.legacyPreview.items || []).map((s) => resolveSymbolIdentity(s));
        const res = await _authDeps.callManaged('importLegacyWatchlist', {
            protocolVersion: Contract.PROTOCOL_VERSION,
            accountEpoch: _state.accountEpoch,
            expectedRevision: _state.revision,
            sourceDigest,
            identityMappingVersion: _state.identityMappingVersion,
            items,
        });
        if (gen !== _sessionGeneration || !_state.user || _state.user.uid !== uid) {
            return { ok: false, code: 'STALE_SESSION_DISCARDED' };
        }
        Storage.setLocalMigrationDecision(uid, sourceDigest, 'IMPORTED', _localStorageRef);
        _state.legacyPreview = null;
        if (Number.isInteger(res.revision)) {
            _state.revision = Math.max(_state.revision, res.revision);
            // A callable acknowledgement is Saved; listeners establish Synced.
        }
        refreshSyncLabelFromRevision();
        notify();
        return { ok: true, ...res };
    }

    function skipLegacyImport() {
        if (!_state.user || !_state.legacyPreview) return;
        if (_state.legacyPreview.digest) {
            Storage.setLocalMigrationDecision(_state.user.uid, _state.legacyPreview.digest, 'SKIPPED', _localStorageRef);
        }
        _state.legacyPreview = null;
        notify();
    }

    async function exportAccountData() {
        if (!_state.user || !_authDeps) throw new Error('Sign in required');
        const uid = _state.user.uid, gen = _sessionGeneration;
        const result = await _authDeps.callManaged('exportAccountData', {protocolVersion: Contract.PROTOCOL_VERSION, accountEpoch: _state.accountEpoch});
        if (gen !== _sessionGeneration || _state.user?.uid !== uid) throw new Error('STALE_SESSION_DISCARDED');
        return result;
    }

    async function deleteAccount({ mode = 'CLEAR_CLOUD_DATA' } = {}) {
        if (!_state.user || !_authDeps) throw new Error('Sign in required');
        const uid = _state.user.uid;
        if (!_deleteRequest || _deleteRequest.uid !== uid || _deleteRequest.confirmScope !== mode) {
            _deleteRequest = {uid, protocolVersion: Contract.PROTOCOL_VERSION, accountEpoch: _state.accountEpoch, confirmScope: mode};
        }
        const gen = ++_sessionGeneration;
        detachAllListenersAndTimers(); _inFlightOps = 0;
        _state.lifecycleState = Contract.STATES.DELETING;
        _state.syncStatus = Contract.SYNC_STATUS.LOADING;
        _state.syncMessage = 'Deleting cloud research data...'; notify();
        try {
            const {uid: ignored, ...payload} = _deleteRequest;
            const res = await _authDeps.callManaged('deleteAccountData', payload);
            if (gen !== _sessionGeneration || _state.user?.uid !== uid) return {ok:false,code:'STALE_SESSION_DISCARDED'};
            broadcastInvalidation(uid); _deleteRequest = null;
            clearSignedInMemoryToGuest(); await _authDeps.auth.signOut(); return res;
        } catch (err) {
            if (gen !== _sessionGeneration || _state.user?.uid !== uid) return {ok:false,code:'STALE_SESSION_DISCARDED'};
            _state.lifecycleState = Contract.STATES.UNAVAILABLE; _state.lastError = err.code || err.message;
            refreshSyncLabelFromRevision(); notify(); throw err;
        }
    }

    async function replaceWatchlist(symbols) {
        const uid = _state.user?.uid || null, gen = _sessionGeneration;
        const normalized = [...new Set(symbols.map(Contract.normalizeSymbol))];
        if (!uid) {
            const result = Storage.writeGuestWatchlist(normalized, _localStorageRef);
            if (result.ok) {loadGuestIntoState();notify();} return result;
        }
        for (const current of [..._state.watchlist]) {
            if (!normalized.includes(current.symbol)) {
                const result = await toggleWatchlistSymbol(current.symbol); if (!result.ok) return result;
                if (gen !== _sessionGeneration || _state.user?.uid !== uid) return {ok:false,code:'STALE_SESSION_DISCARDED'};
            }
        }
        for (const symbol of normalized) {
            if (!_state.watchlist.some(w => w.symbol === symbol)) {
                const result = await toggleWatchlistSymbol(symbol); if (!result.ok) return result;
                if (gen !== _sessionGeneration || _state.user?.uid !== uid) return {ok:false,code:'STALE_SESSION_DISCARDED'};
            }
        }
        return {ok:true};
    }

    async function startFresh() {
        if (!_state.user) throw new Error('Sign in required');
        await _authDeps.callManaged('bootstrapAccount', {protocolVersion:Contract.PROTOCOL_VERSION,startFresh:true});
        return handleAuthChanged(_state.user);
    }

    function resetForTests() {
        _sessionGeneration += 1;
        detachAllListenersAndTimers();
        if (typeof _authUnsubscribe === 'function') {
            try { _authUnsubscribe(); } catch (_) {}
            _authUnsubscribe = null;
        }
        if (_broadcast && typeof _broadcast.close === 'function') {
            try { _broadcast.close(); } catch (_) {}
            _broadcast = null;
        }
        _inFlightOps = 0;
        _loaded = {}; _retryEnvelopes.clear(); _deleteRequest = null;
        _firebaseInitialized = false;
        _authDeps = null;
        _state = DEFAULT_STATE();
        if (FirebaseAdapter && typeof FirebaseAdapter.resetForTests === 'function') {
            FirebaseAdapter.resetForTests();
        }
    }

    return {
        init,
        subscribe,
        getSnapshot,
        setIdentityCatalog,
        loadIdentityCatalogFromUrl,
        resolveSymbolIdentity,
        signInWithEmailPassword,
        signOut,
        toggleWatchlistSymbol,
        replaceWatchlist,
        startFresh,
        saveNote,
        deleteNote,
        importLegacySelected,
        skipLegacyImport,
        exportAccountData,
        deleteAccount,
        getSessionGeneration: () => _sessionGeneration,
        resetForTests,
    };
});
