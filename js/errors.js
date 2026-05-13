window._showError = function(msg, stack) {
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
    window._showError(msg + ' (' + src + ':' + line + ':' + col + ')', err && err.stack);
};

window.addEventListener('unhandledrejection', function(e) {
    window._showError('Unhandled rejection: ' + e.reason, e.reason && e.reason.stack);
});
