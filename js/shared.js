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

App.NAME_LETTERS = ['G', 'r', 'a', 'h', 'ya'];

// Fetch LAN IP from dev server for mobile testing
(function() {
    window._lanUrl = '';
    fetch('/ip').then(function(r) { return r.text(); }).then(function(ip) {
        window._lanUrl = 'http://' + ip + ':' + (location.port || '8080');
    }).catch(function() {
        window._lanUrl = location.origin;
    });
})();

