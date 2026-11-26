(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }
    root.StockerboardPersonalContract = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const PROTOCOL_VERSION = 'PERSONAL_RESEARCH_V1';
    const SCHEMA_VERSION = 1;
    const DEMO_PROJECT_ID = 'demo-stockerboard-personal-local';

    const MODES = Object.freeze({
        DISABLED: 'DISABLED',
        EMULATOR: 'EMULATOR',
        PRODUCTION: 'PRODUCTION',
    });

    const STATES = Object.freeze({
        GUEST: 'GUEST',
        AUTH_LOADING: 'AUTH_LOADING',
        ACCOUNT_LOADING: 'ACCOUNT_LOADING',
        READY: 'READY',
        SAVING: 'SAVING',
        UNSAVED: 'UNSAVED',
        CONFLICT: 'CONFLICT',
        DELETING: 'DELETING',
        UNAVAILABLE: 'UNAVAILABLE',
    });

    const SYNC_STATUS = Object.freeze({
        LOCAL: 'LOCAL',
        LOADING: 'LOADING',
        SAVING: 'SAVING',
        SAVED: 'SAVED',
        SYNCED: 'SYNCED',
        UNSAVED: 'UNSAVED',
        CONFLICT: 'CONFLICT',
        UNAVAILABLE: 'UNAVAILABLE',
    });

    const BUDGETS = Object.freeze({
        GUEST_WATCHLIST_MAX: 3,
        ACCOUNT_WATCHLIST_MAX: 500,
        ACCOUNT_NOTES_MAX: 200,
        NOTE_TITLE_MAX_CHARS: 160,
        NOTE_BODY_MAX_UTF8_BYTES: 8192,
        EXPORT_MAX_BYTES: 2 * 1024 * 1024,
        LEGACY_IMPORT_MAX_BYTES: 512 * 1024,
        LEGACY_IMPORT_MAX_ITEMS: 1000,
        RECENT_AUTH_MAX_AGE_SECONDS: 900, // 15-minute internal policy
    });

    const ERROR_CLASSES = Object.freeze({
        AUTHENTICATION: 'authentication',
        PERMISSION: 'permission',
        VALIDATION: 'validation',
        IDENTITY_UNAVAILABLE: 'identity_unavailable',
        REVISION_CONFLICT: 'revision_conflict',
        QUOTA: 'quota',
        TRANSPORT: 'transport',
        MIGRATION: 'migration',
        DELETION: 'deletion',
    });

    const SAFE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
    const SAFE_SYMBOL_RE = /^[A-Z0-9&_.-]{1,40}$/;

    function utf8ByteLength(str) {
        if (typeof str !== 'string') return 0;
        if (typeof TextEncoder !== 'undefined') {
            return new TextEncoder().encode(str).length;
        }
        return Buffer.byteLength(str, 'utf8');
    }

    function isSafeId(value) {
        return typeof value === 'string' && SAFE_ID_RE.test(value);
    }

    function normalizeSymbol(value) {
        if (typeof value !== 'string') return '';
        return value.trim().toUpperCase();
    }

    function isValidSymbol(value) {
        return typeof value === 'string' && SAFE_SYMBOL_RE.test(value);
    }

    function validateModeConfig(config) {
        if (!config || typeof config !== 'object') {
            return { ok: false, mode: MODES.DISABLED, reason: 'MISSING_CONFIG' };
        }
        const mode = config.mode || (config.enabled ? MODES.PRODUCTION : MODES.DISABLED);
        if (!Object.values(MODES).includes(mode)) {
            return { ok: false, mode: MODES.DISABLED, reason: 'INVALID_MODE' };
        }
        if (mode === MODES.DISABLED) {
            return { ok: true, mode: MODES.DISABLED, reason: null };
        }
        const fb = config.firebaseConfig;
        if (!fb || typeof fb !== 'object' || !fb.projectId || !fb.apiKey) {
            return { ok: false, mode, reason: 'INCOMPLETE_FIREBASE_CONFIG' };
        }
        if (mode === MODES.EMULATOR) {
            if (fb.projectId !== DEMO_PROJECT_ID) {
                return { ok: false, mode, reason: 'EMULATOR_PROJECT_ID_MISMATCH' };
            }
            const em = config.emulators;
            if (!em || !em.authUrl || !em.firestoreHost || !em.firestorePort || !em.functionsUrl) {
                return { ok: false, mode, reason: 'INCOMPLETE_EMULATOR_ENDPOINTS' };
            }
            if (config.one_tap_enabled) {
                return { ok: false, mode, reason: 'ONE_TAP_MUST_BE_DISABLED_IN_EMULATOR' };
            }
        }
        return { ok: true, mode, reason: null };
    }

    function validateNoteDraft(draft) {
        if (!draft || typeof draft !== 'object') {
            return { ok: false, code: 'INVALID_NOTE_PAYLOAD', message: 'Note payload must be an object.' };
        }
        const title = typeof draft.title === 'string' ? draft.title.trim() : '';
        const body = typeof draft.body === 'string' ? draft.body : '';
        if (!title) {
            return { ok: false, code: 'EMPTY_NOTE_TITLE', message: 'Note title is required.' };
        }
        if (title.length > BUDGETS.NOTE_TITLE_MAX_CHARS) {
            return {
                ok: false,
                code: 'NOTE_TITLE_TOO_LONG',
                message: `Note title exceeds ${BUDGETS.NOTE_TITLE_MAX_CHARS} characters.`,
            };
        }
        const bytes = utf8ByteLength(body);
        if (!body.trim()) {
            return { ok: false, code: 'EMPTY_NOTE_BODY', message: 'Note body is required.' };
        }
        if (bytes > BUDGETS.NOTE_BODY_MAX_UTF8_BYTES) {
            return {
                ok: false,
                code: 'NOTE_BODY_TOO_LARGE',
                message: `Note body exceeds ${BUDGETS.NOTE_BODY_MAX_UTF8_BYTES} UTF-8 bytes.`,
            };
        }
        if (draft.noteId !== undefined && draft.noteId !== null && !isSafeId(draft.noteId)) {
            return { ok: false, code: 'INVALID_NOTE_ID', message: 'Invalid note identifier.' };
        }
        return {
            ok: true,
            value: {
                noteId: draft.noteId || null,
                title,
                body,
                companyId: typeof draft.companyId === 'string' ? draft.companyId.trim() : null,
                symbol: normalizeSymbol(draft.symbol || ''),
                releaseRef: typeof draft.releaseRef === 'string' ? draft.releaseRef.trim().slice(0, 128) : null,
            },
        };
    }

    function createMutationEnvelope({ operationId, accountEpoch, expectedRevision, command, payload }) {
        if (!isSafeId(operationId)) throw new Error('Invalid operationId');
        if (!Number.isInteger(accountEpoch) || accountEpoch < 0) throw new Error('Invalid accountEpoch');
        if (!Number.isInteger(expectedRevision) || expectedRevision < 0) throw new Error('Invalid expectedRevision');
        if (typeof command !== 'string' || !command) throw new Error('Invalid command');
        if (payload && typeof payload === 'object' && ('uid' in payload || 'ownerUid' in payload)) {
            throw new Error('Client payload must not specify uid');
        }
        return {
            protocolVersion: PROTOCOL_VERSION,
            operationId,
            accountEpoch,
            expectedRevision,
            command,
            payload: payload || {},
        };
    }

    return {
        PROTOCOL_VERSION,
        SCHEMA_VERSION,
        DEMO_PROJECT_ID,
        MODES,
        STATES,
        SYNC_STATUS,
        BUDGETS,
        ERROR_CLASSES,
        SAFE_ID_RE,
        SAFE_SYMBOL_RE,
        utf8ByteLength,
        isSafeId,
        normalizeSymbol,
        isValidSymbol,
        validateModeConfig,
        validateNoteDraft,
        createMutationEnvelope,
    };
});
