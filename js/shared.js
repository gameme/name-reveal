window.App = window.App || {};

App.NOTE_SYMBOLS = ['♩', '♪', '♫', '♬', '𝄞'];
App.STRING_COLORS = [
    [210, 160, 120],
    [230, 180, 100],
    [200, 140, 110],
    [220, 170, 130],
];
App.STRING_FREQS = [1.0, 1.5, 2.0, 2.5];
App.STRING_PHASES = [0, 0.8, 1.6, 2.4];
App.DPR = Math.min(window.devicePixelRatio, 2);
App.W = 0;
App.H = 0;

App.easeOutQuint = function(t) { return 1 - Math.pow(1 - t, 5); };
App.smoothstep = function(a, b, t) { const x = Math.max(0, Math.min(1, (t-a)/(b-a))); return x*x*(3-2*x); };
App.randomColor = function() { return App.STRING_COLORS[Math.floor(Math.random() * App.STRING_COLORS.length)]; };

App.NAME_LETTERS = ['R', 'a', 'a', 'g', 'a'];
