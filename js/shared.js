window.App = window.App || {};

App.NOTE_SYMBOLS = ['♩', '♪', '♫', '♬', '𝄞'];
App.STRING_COLORS = [
    [210, 160, 120],
    [230, 180, 100],
    [200, 140, 110],
    [220, 170, 130],
];
App.STRING_FREQS = [1.0, 1.15, 1.3, 1.45];
App.STRING_PHASES = [0, 1.1, 2.5, 3.8];
App.STRING_ANIM_SPEED = 2.2;
App.DPR = Math.min(window.devicePixelRatio, 2);
App.W = 0;
App.H = 0;

App.easeOutQuint = function(t) { return 1 - Math.pow(1 - t, 5); };
App.smoothstep = function(a, b, t) { const x = Math.max(0, Math.min(1, (t-a)/(b-a))); return x*x*(3-2*x); };
App.randomColor = function() { return App.STRING_COLORS[Math.floor(Math.random() * App.STRING_COLORS.length)]; };

App.baseFont = function(W, H) { return Math.min(W * App.Config.FONT_BASE_W, H * App.Config.FONT_BASE_H); };

// Brief environment summary for the log beacon. Lets us correlate iOS-version-
// specific WebKit regressions (e.g. 26.5 measureText drift) with logged data.
App._envSummary = function() {
    const ua = navigator.userAgent;
    const platform = navigator.platform || '?';
    // iOS version is reported as "OS 17_5" / "OS 26_5_1" inside the UA string.
    const m = ua.match(/OS (\d+)[._](\d+)(?:[._](\d+))?/);
    const iosVer = m ? (m[1] + '.' + m[2] + (m[3] ? '.' + m[3] : '')) : 'n/a';
    // All iOS browsers wrap WebKit, but each uses a distinct UA token.
    let browser = 'unknown';
    if (/CriOS\//.test(ua)) browser = 'CriOS';
    else if (/FxiOS\//.test(ua)) browser = 'FxiOS';
    else if (/EdgiOS\//.test(ua)) browser = 'EdgiOS';
    else if (/iPhone|iPad|iPod/.test(ua) && /Safari\//.test(ua)) browser = 'MobileSafari';
    else if (/Chrome\//.test(ua)) browser = 'Chrome';
    else if (/Firefox\//.test(ua)) browser = 'Firefox';
    else if (/Safari\//.test(ua) && /Version\//.test(ua)) browser = 'Safari';
    return 'iOS=' + iosVer + ' browser=' + browser + ' platform=' + platform;
};

App.NAME_LETTERS = ['R', 'a', 'a', 'g', 'a'];

// Per-font ink measurement cache for the cycle-font name renderer. Safari/WebKit
// 26.5 (iOS 18.7) regressed measureText() for emoji + Devanagari/Kannada shaping,
// returning fallback values that break textAlign='center'. We pixel-scan once at
// a base size and scale linearly to the current draw size.
App._cycleFontInk = new Map();

App.getCycleFontInk = function(f) {
    const key = f.family + '|' + f.weight + '|' + f.text;
    const cached = App._cycleFontInk.get(key);
    if (cached) return cached;

    const baseSize = 100;
    const PAD = 50;
    // Tight scratch: PAD + ~4× base width covers any cycle-font text; 1.8× base
    // height covers Devanagari shirorekha + matras above + descender below.
    // Smaller than naive sizing because the pixel-scan is hot on iOS CPUs.
    const W = PAD + Math.ceil(baseSize * 4);
    const H = Math.ceil(baseSize * 1.8);
    const scratch = document.createElement('canvas');
    scratch.width = W;
    scratch.height = H;
    const sctx = scratch.getContext('2d');
    sctx.font = f.weight + baseSize + 'px ' + f.family;
    sctx.textAlign = 'left';
    sctx.textBaseline = 'middle';
    sctx.fillStyle = 'white';
    sctx.fillText(f.text, PAD, H / 2);

    // Uint32 view: one element per pixel, alpha in the high byte on little-endian.
    // ~3× faster than reading byte-by-byte off a Uint8ClampedArray on mobile WebKit.
    const data32 = new Uint32Array(sctx.getImageData(0, 0, W, H).data.buffer);
    let minX = W, maxX = -1;
    // Column-major scan from the left until we hit ink, then column-major from
    // the right. Empty padding columns short-circuit at the first non-zero row.
    outerL: for (let x = 0; x < W; x++) {
        for (let y = 0; y < H; y++) {
            if ((data32[y * W + x] >>> 24) > 8) { minX = x; break outerL; }
        }
    }
    outerR: for (let x = W - 1; x >= 0; x--) {
        for (let y = 0; y < H; y++) {
            if ((data32[y * W + x] >>> 24) > 8) { maxX = x; break outerR; }
        }
    }

    const result = maxX < 0
        ? { inkWidth: 0, leftOffset: 0, baseSize }
        : { inkWidth: maxX - minX + 1, leftOffset: minX - PAD, baseSize };
    App._cycleFontInk.set(key, result);
    if (App.dbg) App.dbg('INK: ' + key + ' inkW=' + result.inkWidth + ' leftOff=' + result.leftOffset + ' baseSize=' + result.baseSize);
    return result;
};

// Compute the x to pass to fillText (with textAlign='left') so that the
// rendered ink lands centered on cx at the current rendered size.
App.getCycleFontCenterX = function(f, currentSize, cx) {
    const ink = App.getCycleFontInk(f);
    if (ink.inkWidth === 0) return cx;
    const ratio = currentSize / ink.baseSize;
    return cx - ink.leftOffset * ratio - (ink.inkWidth * ratio) / 2;
};

// After custom fonts load, drop any cache entries that were populated against
// the serif fallback, then pre-warm all cycle fonts so the first post-burst
// cycle frame doesn't pay the pixel-scan cost (12ms+ on iOS). Pre-warm runs
// during the start-overlay idle window — no rendering, no visible jank.
if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function() {
        App._cycleFontInk.clear();
        const fonts = (App.Config && App.Config.CYCLE_FONTS) || [];
        const prewarm = function() { fonts.forEach(function(f) { App.getCycleFontInk(f); }); };
        if (window.requestIdleCallback) requestIdleCallback(prewarm, { timeout: 1000 });
        else setTimeout(prewarm, 0);
    });
}

// Fetch LAN IP from dev server for mobile testing
(function() {
    window._lanUrl = '';
    fetch('/ip').then(function(r) { return r.text(); }).then(function(ip) {
        window._lanUrl = 'http://' + ip + ':' + (location.port || '8080');
    }).catch(function() {
        window._lanUrl = location.origin;
    });
})();

