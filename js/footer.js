window.App = window.App || {};

App.Footer = (function() {
    const STATE = {
        HIDDEN: 0,
        REVEALING_PRIMARY: 1,
        PRIMARY_VISIBLE: 2,
        SHIFTING: 3,
        COMPLETE: 4,
    };

    const TIMING = {
        primaryDelay: 3.0,
        primaryFadeDuration: 1.5,
        shiftDelay: 2,
        shiftDuration: 1.5,
        revealDuration: 2.0,
        envelopeDuration: 0.8,
    };

    const SEGMENTS = {
        made: 'Made ',
        withText: 'with ',
        heart: '❣️',
        space: ' ',
        main: 'in California by Shruti ',
        vinod: '& Vinod',
    };

    let state = STATE.HIDDEN;
    let stateTimer = 0;
    let entryTimer = 0;
    let lastTime = -1;
    let activeThisFrame = false;
    let activeLastFrame = false;
    let shrutiGlowP = 0;
    let vinodGlowP = 0;

    let widths = null;
    let heartCanvas = null;

    function advance(newState) {
        if (newState > state) {
            state = newState;
            stateTimer = 0;
        }
    }

    function computeProgress() {
        switch (state) {
            case STATE.HIDDEN: {
                if (stateTimer > TIMING.primaryDelay) {
                    advance(STATE.REVEALING_PRIMARY);
                    return computeProgress();
                }
                return { primaryP: 0, shiftP: 0, revealP: 0, shrutiP: 0, vinodP: 0, settled: false };
            }
            case STATE.REVEALING_PRIMARY: {
                const primaryP = App.easeOutQuint(Math.min(1, stateTimer / TIMING.primaryFadeDuration));
                if (primaryP >= 1) {
                    advance(STATE.PRIMARY_VISIBLE);
                    return computeProgress();
                }
                return { primaryP, shiftP: 0, revealP: 0, shrutiP: 0, vinodP: 0, settled: false };
            }
            case STATE.PRIMARY_VISIBLE: {
                if (stateTimer > TIMING.shiftDelay) {
                    advance(STATE.SHIFTING);
                    return computeProgress();
                }
                const DESCENT = 0.4;
                const EMANATION = 1.0;
                const shrutiP = Math.min(1, Math.max(0, (stateTimer - DESCENT) / EMANATION));
                return { primaryP: 1, shiftP: 0, revealP: 0, shrutiP, vinodP: 0, settled: false };
            }
            case STATE.SHIFTING: {
                const shiftP = App.easeOutQuint(Math.min(1, stateTimer / TIMING.shiftDuration));
                const revealRaw = Math.min(1, stateTimer / TIMING.revealDuration);
                const revealP = revealRaw * revealRaw * (3 - 2 * revealRaw);
                const DESCENT = 0.4;
                const EMANATION = 1.0;
                const vinodP = Math.min(1, Math.max(0, (stateTimer - DESCENT) / EMANATION));
                if (shiftP >= 1 && revealRaw >= 1) {
                    advance(STATE.COMPLETE);
                    return computeProgress();
                }
                return { primaryP: 1, shiftP, revealP, shrutiP: 1, vinodP, settled: false };
            }
            case STATE.COMPLETE:
                return { primaryP: 1, shiftP: 1, revealP: 1, shrutiP: 1, vinodP: 1, settled: true };
            default:
                return { primaryP: 1, shiftP: 1, revealP: 1, shrutiP: 1, vinodP: 1, settled: true };
        }
    }

    function measureWidths(ctx, font) {
        if (widths) return widths;
        ctx.font = font;
        heartCanvas = App.Cache.text(font, SEGMENTS.heart);
        widths = {
            made: ctx.measureText(SEGMENTS.made).width,
            withText: ctx.measureText(SEGMENTS.withText).width,
            heart: heartCanvas.width,
            space: ctx.measureText(SEGMENTS.space).width,
            main: ctx.measureText(SEGMENTS.main).width,
            vinod: ctx.measureText(SEGMENTS.vinod).width,
        };
        widths.withHeart = widths.withText + widths.heart + widths.space;

        // Per-character data for emanation
        widths._prefix = ctx.measureText('in California by ').width;
        const shrutiChars = 'Shruti'.split('');
        const vinodChars = '& Vinod'.split('');
        widths._shrutiChars = shrutiChars.map(c => ({ char: c, w: ctx.measureText(c).width }));
        widths._vinodChars = vinodChars.map(c => ({ char: c, w: ctx.measureText(c).width }));
        // 'i' index within each name
        widths._shrutiIIndex = 5;
        widths._vinodIIndex = 3;

        return widths;
    }

    // Renders characters emanating from the 'i' position
    function drawEmanating(ctx, chars, iIndex, startX, y, progress, baseAlpha) {
        if (progress <= 0) return;
        // Compute char centers relative to start
        let offsets = [];
        let xOff = 0;
        for (let i = 0; i < chars.length; i++) {
            offsets.push(xOff + chars[i].w / 2);
            xOff += chars[i].w;
        }
        const iCenter = offsets[iIndex];
        const maxDist = Math.max(iCenter, xOff - iCenter);

        xOff = 0;
        for (let i = 0; i < chars.length; i++) {
            const charCenter = xOff + chars[i].w / 2;
            const dist = Math.abs(charCenter - iCenter);
            const charDelay = maxDist > 0 ? (dist / maxDist) * 0.7 : 0;
            const charAlpha = Math.min(1, Math.max(0, (progress - charDelay) / (1 - charDelay)));
            if (charAlpha > 0) {
                ctx.globalAlpha = charAlpha * baseAlpha;
                ctx.fillText(chars[i].char, startX + xOff, y);
            }
            xOff += chars[i].w;
        }
    }

    function invalidate() {
        widths = null;
        heartCanvas = null;
    }

    window.addEventListener('resize', invalidate);

    function draw(ctx, time, textP, fontSize, cx, H) {
        // Detect re-entry (first call after a frame where draw wasn't called)
        const isReentry = !activeLastFrame;
        activeThisFrame = true;

        // Compute dt (clamped to prevent tab-resume state jumps)
        const rawDt = (lastTime < 0 || isReentry) ? 0 : time - lastTime;
        const dt = Math.min(rawDt, 0.1);
        lastTime = time;

        // On re-entry: reset timers for current state (restart animation)
        if (isReentry && state < STATE.COMPLETE) {
            stateTimer = 0;
            entryTimer = 0;
        }

        // Advance timers
        stateTimer += dt;
        entryTimer += dt;

        // For COMPLETE state with persistent render, skip timer logic
        if (state === STATE.COMPLETE) {
            entryTimer = 999;
        }

        // Compute progress from state machine
        const { primaryP, shiftP, revealP, shrutiP, vinodP, settled } = computeProgress();

        // Nothing to render if primary hasn't started
        if (primaryP <= 0) return;

        // Envelope: smooth fade-in on re-entry
        const envelope = state === STATE.COMPLETE ? textP : Math.min(1, entryTimer / TIMING.envelopeDuration) * textP;

        const DPR = App.DPR;
        const footerSize = fontSize * App.Config.FONT_CAPTION;
        const footerY = H - fontSize * 0.6;
        const font = `200 ${footerSize}px -apple-system, "SF Pro Display", "Helvetica Neue", sans-serif`;
        ctx.font = font;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        const w = measureWidths(ctx, font);

        const totalW = w.made + w.withHeart * shiftP + w.main + w.vinod * shiftP;
        let xPos = Math.round(cx - totalW / 2);

        // "Made"
        ctx.globalAlpha = primaryP * envelope * 0.6;
        ctx.fillStyle = 'rgba(255, 240, 210, 1)';
        ctx.fillText(SEGMENTS.made, xPos, footerY);
        xPos += w.made;

        // "with ❣️ "
        if (revealP > 0) {
            ctx.globalAlpha = revealP * primaryP * envelope * 0.6;
            ctx.fillStyle = 'rgba(255, 220, 200, 1)';
            ctx.fillText(SEGMENTS.withText, xPos, footerY);

            const heartX = xPos + w.withText;
            const heartRaw = settled ? Math.abs(Math.sin(time * 2.5)) * 0.3 : 0;
            const heartbeat = heartRaw * Math.min(1, shrutiGlowP * 5);
            const hScale = 1 + heartbeat * 0.4;
            const hW = w.heart * hScale;
            const hH = heartCanvas.height * hScale;
            const hCenterX = heartX + w.heart / 2;
            ctx.globalAlpha = revealP * primaryP * envelope * (0.6 + heartbeat);
            ctx.shadowColor = `rgba(255, 100, 100, ${0.6 + heartbeat})`;
            ctx.shadowBlur = (8 + heartbeat * 12) * DPR;
            ctx.drawImage(heartCanvas, hCenterX - hW / 2, footerY - hH / 2, hW, hH);
            ctx.shadowBlur = 0;
        }
        xPos += w.withHeart * shiftP;

        // "in California by " (uniform fade) + "Shruti" (emanating from 'i')
        ctx.fillStyle = 'rgba(255, 240, 210, 1)';
        ctx.globalAlpha = primaryP * envelope * 0.6;
        ctx.fillText('in California by ', xPos, footerY);
        const shrutiStartX = xPos + w._prefix;

        // Persistent glow behind names (starts only after everything is settled)
        if (settled && shrutiGlowP < 1) {
            shrutiGlowP = Math.min(1, shrutiGlowP + dt * 0.12);
        }

        if (shrutiP > 0) {
            const eased = shrutiGlowP * shrutiGlowP;
            if (eased > 0) {
                ctx.shadowColor = `rgba(255, 180, 80, ${eased * envelope * 0.7})`;
                ctx.shadowBlur = footerSize * 0.8 * eased;
            }
            ctx.fillStyle = 'rgba(255, 240, 210, 1)';
            drawEmanating(ctx, w._shrutiChars, w._shrutiIIndex, shrutiStartX, footerY, shrutiP, envelope * 0.6);
            ctx.shadowBlur = 0;
        }
        xPos += w.main;

        if (settled && vinodGlowP < 1) {
            vinodGlowP = Math.min(1, vinodGlowP + dt * 0.12);
        }

        // "& Vinod" (emanating from 'i')
        if (vinodP > 0) {
            const eased = vinodGlowP * vinodGlowP;
            if (eased > 0) {
                ctx.shadowColor = `rgba(150, 180, 255, ${eased * envelope * 0.7})`;
                ctx.shadowBlur = footerSize * 0.8 * eased;
            }
            ctx.fillStyle = 'rgba(255, 220, 200, 1)';
            drawEmanating(ctx, w._vinodChars, w._vinodIIndex, xPos, footerY, vinodP, primaryP * envelope * 0.6);
            ctx.shadowBlur = 0;
        }

        ctx.globalAlpha = 1;
    }

    // Called once per frame from main loop — bookmarks whether draw was called last frame
    function markInactive() {
        activeLastFrame = activeThisFrame;
        activeThisFrame = false;
    }

    function getTargets(fontSize, cx, H) {
        const footerSize = fontSize * App.Config.FONT_CAPTION;
        const footerY = H - fontSize * 0.6;
        const font = `200 ${footerSize}px -apple-system, "SF Pro Display", "Helvetica Neue", sans-serif`;
        if (!widths) {
            const tmpCtx = document.getElementById('tanpura').getContext('2d');
            measureWidths(tmpCtx, font);
        }
        const w = widths;
        if (!w._shrutiWidth) {
            const tmpCtx = document.getElementById('tanpura').getContext('2d');
            tmpCtx.font = font;
            w._prefixWidth = tmpCtx.measureText('in California by ').width;
            w._shrutiWidth = tmpCtx.measureText('Shruti').width;
            // 'i' dot positions within each name
            w._shrutiIOffset = tmpCtx.measureText('Shrut').width + tmpCtx.measureText('i').width / 2;
            w._vinodIOffset = tmpCtx.measureText('& V').width + tmpCtx.measureText('i').width / 2;
        }
        const totalW = w.made + w.withHeart + w.main + w.vinod;
        const baseX = cx - totalW / 2;

        // Flight targets (above name)
        const shrutiNameX = baseX + w.made + w.withHeart + w._prefixWidth + w._shrutiWidth / 2;
        const vinodNameX = baseX + w.made + w.withHeart + w.main + w.vinod / 2;
        const coreOffsetY = footerSize * 1.5;

        // 'i' dot targets (at the dot position of the letter 'i')
        const shrutiDotX = baseX + w.made + w.withHeart + w._prefixWidth + w._shrutiIOffset;
        const vinodDotX = baseX + w.made + w.withHeart + w.main + w._vinodIOffset;
        const dotY = footerY - footerSize * 0.35;

        return {
            shruti: { x: shrutiNameX, y: footerY - coreOffsetY },
            vinod: { x: vinodNameX, y: footerY - coreOffsetY },
            shrutiDot: { x: shrutiDotX, y: dotY },
            vinodDot: { x: vinodDotX, y: dotY },
        };
    }

    function isPrimaryDone() { return state >= STATE.PRIMARY_VISIBLE; }
    function isSecondaryStarted() { return state >= STATE.SHIFTING; }
    function isComplete() { return state >= STATE.COMPLETE; }

    return { draw, markInactive, getTargets, isPrimaryDone, isSecondaryStarted, isComplete, TIMING };
})();
