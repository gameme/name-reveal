// Debug logger — resolved once after config loads. No-op in production.
window.App = window.App || {};
App.dbg = function() {};
App.dbgw = function() {};
App.dbge = function() {};

window._showError = function(msg, stack) {
    if (window.App && App.Config && !App.Config.DEBUG) return;
    let el = document.getElementById('error-overlay');
    if (!el) {
        el = document.createElement('pre');
        el.id = 'error-overlay';
        el.style.cssText = 'position:fixed;top:0;left:0;right:0;max-height:50vh;overflow:auto;z-index:9999;background:rgba(0,0,0,0.95);color:#f44;font:14px monospace;padding:16px;white-space:pre-wrap;word-break:break-all;cursor:text;-webkit-user-select:text;user-select:text;pointer-events:auto;';
        document.body.appendChild(el);
    }
    el.textContent += (el.textContent ? '\n\n' : '') + msg + (stack ? '\n' + stack : '');
};

window.onerror = function(msg, src, line, col, err) {
    if (window._errorLog) window._errorLog.push('[ERROR] ' + msg + ' (' + src + ':' + line + ')');
    window._showError(msg + ' (' + src + ':' + line + ':' + col + ')', err && err.stack);
};

window.addEventListener('unhandledrejection', function(e) {
    if (window._errorLog) window._errorLog.push('[REJECT] ' + e.reason);
    window._showError('Unhandled rejection: ' + e.reason, e.reason && e.reason.stack);
});

// Debug logging and remote beacon — only active when Config.DEBUG is true
(function() {
    window.addEventListener('DOMContentLoaded', function() {
        if (!window.App || !App.Config || !App.Config.DEBUG) return;

        window._errorLog = [];
        var orig = { log: console.log, warn: console.warn, error: console.error };
        var MAX_ENTRIES = App.Config.LOG_MAX_ENTRIES;

        function capture(level, args) {
            var msg = '[' + level + '] ' + Array.from(args).map(function(a) {
                try { return typeof a === 'object' ? JSON.stringify(a) : String(a); }
                catch(e) { return String(a); }
            }).join(' ');
            window._errorLog.push(msg);
            if (window._errorLog.length > MAX_ENTRIES) window._errorLog.shift();
        }

        console.log = function() { capture('LOG', arguments); orig.log.apply(console, arguments); };
        console.warn = function() { capture('WARN', arguments); orig.warn.apply(console, arguments); };
        console.error = function() { capture('ERROR', arguments); orig.error.apply(console, arguments); };

        // Re-bind after override so dbg() also feeds the beacon
        App.dbg = console.log.bind(console);
        App.dbgw = console.warn.bind(console);
        App.dbge = console.error.bind(console);

        setInterval(function() {
            if (window._errorLog.length === 0) return;
            var payload = window._errorLog.join('\n');
            window._errorLog = [];
            try { fetch('/log', { method: 'POST', body: payload, keepalive: true }).catch(function(){}); } catch(e) {}
        }, App.Config.LOG_FLUSH_INTERVAL_MS);

        App.dbg('BEACON_INIT: ' + App._envSummary() + ' DPR=' + window.devicePixelRatio + ' screen=' + screen.width + 'x' + screen.height + ' viewport=' + window.innerWidth + 'x' + window.innerHeight + ' ua="' + navigator.userAgent + '"');
    });
})();
