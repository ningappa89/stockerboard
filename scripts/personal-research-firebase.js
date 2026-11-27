(function (root, factory) {
    'use strict';
    const contract = root.StockerboardPersonalContract || (typeof require === 'function' ? require('./personal-research-contract.js') : null);
    const api = factory(contract, root);
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }
    root.StockerboardPersonalFirebase = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Contract, root) {
    'use strict';

    let _initialized = false;
    let _mode = 'DISABLED';
    let _auth = null;
    let _db = null;
    let _functions = null;
    let _initError = null;
    let _emulatorsConnected = false;
    let _ready = Promise.resolve();

    const PRODUCTION_BLOCKED_HOSTS = [
        'identitytoolkit.googleapis.com',
        'securetoken.googleapis.com',
        'firestore.googleapis.com',
        'accounts.google.com',
        'cloudfunctions.net',
    ];

    function resetForTests() {
        _initialized = false;
        _mode = 'DISABLED';
        _auth = null;
        _db = null;
        _functions = null;
        _initError = null;
        _emulatorsConnected = false;
    }

    function installEmulatorNetworkFence(config) {
        if (!config || config.mode !== 'EMULATOR' || typeof root.fetch !== 'function') return;
        if (root.__SB_EMULATOR_FETCH_FENCED__) return;
        const origFetch = root.fetch.bind(root);
        root.fetch = function fencedFetch(resource, init) {
            const urlStr = typeof resource === 'string' ? resource : (resource && resource.url) || '';
            try {
                const parsed = new URL(urlStr, (root.location && root.location.href) || 'http://127.0.0.1:18081');
                if (PRODUCTION_BLOCKED_HOSTS.some((h) => parsed.hostname === h || parsed.hostname.endsWith('.' + h))) {
                    return Promise.reject(new Error(`EMULATOR_NETWORK_FENCE_BLOCKED: ${parsed.hostname}`));
                }
            } catch (_) {}
            return origFetch(resource, init);
        };
        root.__SB_EMULATOR_FETCH_FENCED__ = true;
    }

    function initOnce(config, firebaseSdk) {
        if (_initialized) {
            return { ok: !_initError, mode: _mode, error: _initError, auth: _auth, db: _db, functions: _functions, emulatorsConnected: _emulatorsConnected };
        }
        const check = Contract.validateModeConfig(config);
        _mode = check.mode;
        if (!check.ok) {
            _initialized = true;
            _initError = check.reason;
            return { ok: false, mode: _mode, error: _initError, auth: null, db: null, functions: null, emulatorsConnected: false };
        }
        if (_mode === 'DISABLED') {
            _initialized = true;
            return { ok: true, mode: _mode, error: null, auth: null, db: null, functions: null, emulatorsConnected: false };
        }
        const sdk = firebaseSdk || root.firebase;
        if (!sdk || typeof sdk.initializeApp !== 'function') {
            _initialized = true;
            _initError = 'FIREBASE_SDK_UNAVAILABLE';
            return { ok: false, mode: _mode, error: _initError, auth: null, db: null, functions: null, emulatorsConnected: false };
        }

        try {
            if (_mode === 'EMULATOR') {
                installEmulatorNetworkFence(config);
            }
            if (!sdk.apps || !sdk.apps.length) {
                sdk.initializeApp(config.firebaseConfig);
            } else if (_mode === 'EMULATOR' && sdk.app().options && sdk.app().options.projectId !== Contract.DEMO_PROJECT_ID) {
                _initialized = true;
                _initError = 'PREBOUND_REAL_PROJECT_CONFLICT';
                return { ok: false, mode: _mode, error: _initError, auth: null, db: null, functions: null, emulatorsConnected: false };
            }

            _auth = typeof sdk.auth === 'function' ? sdk.auth() : null;
            _db = typeof sdk.firestore === 'function' ? sdk.firestore() : null;
            _functions = typeof sdk.functions === 'function' ? sdk.functions() : null;

            if (_mode === 'EMULATOR') {
                const em = config.emulators;
                if (!_auth || !_db || !_functions) {
                    _initialized = true;
                    _initError = 'EMULATOR_SERVICES_INCOMPLETE';
                    return { ok: false, mode: _mode, error: _initError, auth: null, db: null, functions: null, emulatorsConnected: false };
                }
                if (!_emulatorsConnected) {
                    if (typeof _auth.useEmulator !== 'function' || typeof _db.useEmulator !== 'function' || typeof _functions.useEmulator !== 'function') throw new Error('EMULATOR_CONNECTOR_MISSING');
                    if (typeof _auth.useEmulator === 'function') {
                        _auth.useEmulator(em.authUrl, { disableWarnings: true });
                    }
                    if (typeof _db.useEmulator === 'function') {
                        _db.useEmulator(em.firestoreHost, Number(em.firestorePort));
                    }
                    if (typeof _functions.useEmulator === 'function') {
                        const fnUrl = new URL(em.functionsUrl);
                        _functions.useEmulator(fnUrl.hostname, Number(fnUrl.port));
                    }
                    _emulatorsConnected = true;
                }
            }

            // Use session-scoped Auth persistence for the MVP (explicit sign-in survives same-tab navigation/refresh cleanly).
            if (_auth && typeof _auth.setPersistence === 'function' && sdk.auth && sdk.auth.Auth && sdk.auth.Auth.Persistence) {
                _ready = _auth.setPersistence(sdk.auth.Auth.Persistence.SESSION);
            }

            // Do not enable persistent Firestore offline queueing for V1.
            _initialized = true;
            return { ok: true, mode: _mode, error: null, auth: _auth, db: _db, functions: _functions, emulatorsConnected: _emulatorsConnected };
        } catch (err) {
            _initialized = true;
            _initError = err && err.message ? err.message : 'FIREBASE_INIT_ERROR';
            return { ok: false, mode: _mode, error: _initError, auth: null, db: null, functions: null, emulatorsConnected: false };
        }
    }

    async function callManaged(name, payload) {
        if (!_functions || typeof _functions.httpsCallable !== 'function') {
            const err = new Error('Private account service is unavailable.');
            err.code = 'UNAVAILABLE';
            throw err;
        }
        const fn = _functions.httpsCallable(name);
        const res = await fn(payload);
        return res && res.data !== undefined ? res.data : res;
    }

    return {
        initOnce,
        callManaged,
        resetForTests,
        ready: () => _ready,
        getState: () => ({ initialized: _initialized, mode: _mode, error: _initError, emulatorsConnected: _emulatorsConnected }),
    };
});
