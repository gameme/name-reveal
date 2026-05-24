// Auto-mode driver — runs the experience hands-free when ?auto=1 is in the URL.
// Lets the Playwright harness avoid simulated input (which the security guard
// blocks). The page navigates to /?auto=1, this script taps awaken, scrolls
// through to trigger reveal, optionally does a scroll-up scenario, then logs
// AUTO:DONE so the harness knows to stop capturing.
(function() {
    if (!location.search.includes('auto=1')) return;
    var params = new URLSearchParams(location.search);
    var doScrollup = params.get('scrollup') === '1';
    // Early-scrollup mode: scrolls up shortly after burst, BEFORE cores settle,
    // so they transition FLYING → ORBITING_OUTSIDE (matches the user's "cores
    // rotating around the orb" scenario where the flicker also reproduces).
    var doEarlyScrollup = params.get('earlyScrollup') === '1';
    var scrollSeconds = parseFloat(params.get('scrollS') || '4');
    var revealWaitMs = parseInt(params.get('revealMs') || '15000', 10);
    var holdMs = parseInt(params.get('holdMs') || '10000', 10);

    function log(msg) {
        // App.dbg is the rebound console.log when DEBUG=true (errors.js sets that
        // up), so a single call covers both the in-page console AND the beacon.
        if (window.App && App.dbg) App.dbg('AUTO: ' + msg);
        else console.log('AUTO:', msg);
    }

    window.addEventListener('load', function() {
        log('auto-mode armed; scrollup=' + doScrollup + ' earlyScrollup=' + doEarlyScrollup);
        setTimeout(function() {
            var overlay = document.getElementById('startOverlay');
            if (!overlay) { log('no overlay; abort'); return; }
            log('clicking awaken');
            overlay.click();
            setTimeout(beginScroll, 1500);
        }, 500);
    });

    function beginScroll() {
        var max = document.documentElement.scrollHeight - window.innerHeight;
        var steps = 40;
        var perStep = (scrollSeconds * 1000) / steps;
        log('scrolling 0->' + max + 'px over ' + scrollSeconds + 's');
        var i = 0;
        var iv = setInterval(function() {
            i++;
            window.scrollTo(0, Math.round(max * (i / steps)));
            if (i >= steps) {
                clearInterval(iv);
                log('scroll complete; awaiting burst');
                setTimeout(afterReveal, revealWaitMs);
            }
        }, perStep);
    }

    function afterReveal() {
        log('reveal phase done; holding for ' + holdMs + 'ms');
        if (doEarlyScrollup) {
            // Scroll up immediately so cores transition to ORBITING_OUTSIDE
            // before they have a chance to settle into flames.
            runScrollup();
            return;
        }
        setTimeout(function() {
            if (doScrollup) {
                runScrollup();
            } else {
                log('DONE');
            }
        }, holdMs);
    }

    function runScrollup() {
        var max = document.documentElement.scrollHeight - window.innerHeight;
        log('scrolling up partway');
        var i = 0;
        var n = 20;
        var iv = setInterval(function() {
            i++;
            window.scrollTo(0, Math.round(max * (1 - i / n) * 0.5));
            if (i >= n) {
                clearInterval(iv);
                setTimeout(function() {
                    log('scrolling back down');
                    window.scrollTo(0, max);
                    setTimeout(function() { log('DONE'); }, 3000);
                }, 1500);
            }
        }, 80);
    }
})();
