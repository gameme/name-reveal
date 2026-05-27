// Auto-mode driver — runs the experience hands-free when ?auto=1 is in the URL.
// Lets the Playwright harness avoid simulated input (which the security guard
// blocks). The page navigates to /?auto=1, this script taps awaken, scrolls
// through to trigger reveal, optionally does a scroll-up scenario, then logs
// AUTO:DONE so the harness knows to stop capturing.
(function() {
    if (!location.search.includes('auto=1')) return;
    var params = new URLSearchParams(location.search);

    // Test-only beacon namespacing: when ?session=<id> is in the URL the harness
    // wants per-session log files (so multiple scenarios can run in parallel
    // without trampling mobile-debug.log). We monkey-patch window.fetch HERE in
    // auto.js — production never sets ?session, and errors.js stays unchanged.
    var sessionId = params.get('session');
    if (sessionId && /^[A-Za-z0-9_-]{1,64}$/.test(sessionId)) {
        var origFetch = window.fetch;
        window.fetch = function(url, init) {
            if (typeof url === 'string' && url.indexOf('/log') === 0 && url.indexOf('session=') < 0) {
                url = url + (url.indexOf('?') < 0 ? '?' : '&') + 'session=' + encodeURIComponent(sessionId);
            }
            return origFetch.call(this, url, init);
        };
    }

    var doScrollup = params.get('scrollup') === '1';
    // Early-scrollup mode: scrolls up shortly after burst, BEFORE cores settle,
    // so they transition FLYING → ORBITING_OUTSIDE (matches the user's "cores
    // rotating around the orb" scenario where the flicker also reproduces).
    var doEarlyScrollup = params.get('earlyScrollup') === '1';
    // Mid-scrollup: scrolls up after Core A (Shruti) has SETTLED but before Core B
    // (Vinod) reaches its 'i'. Vinod's core enters ORBITING_OUTSIDE; Shruti stays as flame.
    var doMidScrollup = params.get('midScrollup') === '1';
    // Pre-burst scrollup: scrolls partway (~50%), then back to 0, then forward to max.
    // Reveal state should rewind cleanly when scrolled to 0; burst fires only on the
    // second forward pass.
    var doPreBurstScrollup = params.get('preBurstScrollup') === '1';
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
        log('auto-mode armed; scrollup=' + doScrollup + ' earlyScrollup=' + doEarlyScrollup + ' midScrollup=' + doMidScrollup + ' preBurstScrollup=' + doPreBurstScrollup);
        setTimeout(function() {
            var overlay = document.getElementById('startOverlay');
            if (!overlay) { log('no overlay; abort'); return; }
            log('clicking awaken');
            overlay.click();
            // 600ms post-click is enough for Audio.init / melody pre-start;
            // overlay removal is delayed independently in main.js.
            setTimeout(beginScroll, 600);
        }, 200);
    });

    function beginScroll() {
        if (doPreBurstScrollup) {
            runPreBurstScrollup();
            return;
        }
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
        if (doMidScrollup) {
            // Wait long enough for Core A (Shruti) to SETTLE but Core B (Vinod) to still be FLYING.
            // Burst fires ~3s into scroll; Core A SETTLES ~3s post-burst; Core B SETTLES ~7s post-burst.
            // 4s after scroll completion (= ~5s post-burst) hits the window: A SETTLED, B FLYING.
            setTimeout(runScrollup, 4000);
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

    function runPreBurstScrollup() {
        // Pre-supernova scroll-up: full forward → wait briefly so a few SWARA/SPARK fire,
        // scroll back to 0 (triggers State.reset since revealProgress drops below
        // REVEAL_RESET_THRESHOLD), then forward again for full reveal + burst.
        // Exercises the lastSwaraIndex / lastSparkleIndex / lastBurstIndex reset paths.
        var max = document.documentElement.scrollHeight - window.innerHeight;
        var steps = 40;
        var perStep = (scrollSeconds * 1000) / steps;
        var preBurstHoldMs = 3000;  // ~3s post-scroll: Sa/Re/Ga fire, well before burst (~13s revealElapsed)
        log('preBurst: pass 1 — scrolling 0 -> max');
        var i = 0;
        var iv1 = setInterval(function() {
            i++;
            window.scrollTo(0, Math.round(max * (i / steps)));
            if (i >= steps) {
                clearInterval(iv1);
                setTimeout(function() {
                    log('preBurst: scrolling back to 0 (mid-reveal, pre-burst)');
                    var j = 0;
                    var iv2 = setInterval(function() {
                        j++;
                        window.scrollTo(0, Math.round(max * (1 - j / steps)));
                        if (j >= steps) {
                            clearInterval(iv2);
                            setTimeout(function() {
                                log('preBurst: pass 2 — scrolling forward to max');
                                var k = 0;
                                var iv3 = setInterval(function() {
                                    k++;
                                    window.scrollTo(0, Math.round(max * (k / steps)));
                                    if (k >= steps) {
                                        clearInterval(iv3);
                                        log('scroll complete; awaiting burst');
                                        setTimeout(afterReveal, revealWaitMs);
                                    }
                                }, perStep);
                            }, 2000);
                        }
                    }, perStep);
                }, preBurstHoldMs);
            }
        }, perStep);
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
