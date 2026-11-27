(function (root) {
    'use strict';
    function boot() {
        if (!root.StockerboardAccount) return;
        const config = root.StockerboardPersonalConfig || {mode:'DISABLED',enabled:false};
        root.StockerboardAccount.init({config});
        if (config.mode === 'EMULATOR' && config.identityUrl) {
            root.StockerboardAccount.loadIdentityCatalogFromUrl(config.identityUrl);
        }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})(globalThis);
