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
        primaryDelay: 2.0,
        primaryFadeDuration: 1.0,
        shiftDelay: 3.5,
        shiftDuration: 1.5,
        revealDuration: 1.0,
    };

    const SEGMENTS = {
        made: 'Made ',
        withText: 'with ',
        heart: '❣️',
        space: ' ',
        prefix: 'in California by ',
        shruti: 'Shruti',
        amp: '& ',
        vinod: 'Vinod',
    };

    const COLORS = {
        plain: 'rgba(255, 240, 210, 1)',
        warm: 'rgba(255, 220, 200, 1)',
        shrutiGlowRGB: '255,180,80',
        vinodGlowRGB: '150,180,255',
        heartGlowRGB: '255,100,100',
    };

    const GLOW_RAMP_RATE = 0.20;

    // Glow accumulators are the only stateful pieces. They tick from the moment
    // `settled` becomes true per core. The state machine itself is fully derived
    // from `elapsed`, so scroll-up never freezes or rewinds it — `_lastElapsed`
    // is just a cache for query APIs (isPrimaryDone, etc.) consumed by DualCore.
    let _lastElapsed = -1;
    let _shrutiGlowP = 0;
    let _vinodGlowP = 0;
    let _layout = null;

    // Per-name offscreen canvas targets. Each holds its own glow rendering so
    // the main ctx's shadowBlur/shadowColor are structurally never written by
    // footer — eliminating halo bleed and phantom glow at the source.
    let _shrutiGlow = { canvas: document.createElement('canvas'), lastBakeKey: '', baseX: 0, baseY: 0 };
    let _vinodGlow  = { canvas: document.createElement('canvas'), lastBakeKey: '', baseX: 0, baseY: 0 };

    // Pure function: state at a given elapsed time. No mutation, no recursion.
    function deriveProgress(elapsed) {
        if (elapsed < 0) {
            return { state: STATE.HIDDEN, primaryP: 0, shiftP: 0, revealP: 0, shrutiP: 0, vinodP: 0, settled: false };
        }

        if (elapsed < TIMING.primaryDelay) {
            return { state: STATE.HIDDEN, primaryP: 0, shiftP: 0, revealP: 0, shrutiP: 0, vinodP: 0, settled: false };
        }

        let t = elapsed - TIMING.primaryDelay;
        if (t < TIMING.primaryFadeDuration) {
            const primaryP = App.easeOutQuint(t / TIMING.primaryFadeDuration);
            const shrutiP = primaryP > 0.7 ? Math.min(1, (primaryP - 0.7) / 0.3) : 0;
            return { state: STATE.REVEALING_PRIMARY, primaryP, shiftP: 0, revealP: 0, shrutiP, vinodP: 0, settled: false };
        }

        t -= TIMING.primaryFadeDuration;
        if (t < TIMING.shiftDelay) {
            return { state: STATE.PRIMARY_VISIBLE, primaryP: 1, shiftP: 0, revealP: 0, shrutiP: 1, vinodP: 0, settled: false };
        }

        t -= TIMING.shiftDelay;
        const shiftEnd = Math.max(TIMING.shiftDuration, TIMING.revealDuration);
        if (t < shiftEnd) {
            const shiftP = App.easeOutQuint(Math.min(1, t / TIMING.shiftDuration));
            const revealRaw = Math.min(1, t / TIMING.revealDuration);
            const revealP = revealRaw * revealRaw * (3 - 2 * revealRaw);
            const DESCENT = 0.4;
            const EMANATION = 1.0;
            const vinodP = Math.min(1, Math.max(0, (t - DESCENT) / EMANATION));
            return { state: STATE.SHIFTING, primaryP: 1, shiftP, revealP, shrutiP: 1, vinodP, settled: false };
        }

        return { state: STATE.COMPLETE, primaryP: 1, shiftP: 1, revealP: 1, shrutiP: 1, vinodP: 1, settled: true };
    }

    // Called every frame post-burst. Refreshes elapsed cache and advances each
    // name's glow once its core has landed. Ramp rate 0.12/s matches original.
    function tick(elapsed, dt, shrutiSettled, vinodSettled) {
        _lastElapsed = elapsed;
        if (elapsed < 0) return;
        if (shrutiSettled && _shrutiGlowP < 1) _shrutiGlowP = Math.min(1, _shrutiGlowP + dt * GLOW_RAMP_RATE);
        if (vinodSettled  && _vinodGlowP  < 1) _vinodGlowP  = Math.min(1, _vinodGlowP  + dt * GLOW_RAMP_RATE);
    }

    // Single source of truth for all measurements, replacing the old split between
    // measureWidths and the lazy second pass inside getTargets.
    function measureLayout(ctx, font, footerSize) {
        if (_layout && _layout.font === font && _layout.footerSize === footerSize) return _layout;

        ctx.font = font;
        const heartCanvas = App.Cache.text(font, SEGMENTS.heart);

        const space = ctx.measureText(SEGMENTS.space).width;
        const made = ctx.measureText(SEGMENTS.made).width;
        const withText = ctx.measureText(SEGMENTS.withText).width;
        const heart = heartCanvas.width;
        const prefix = ctx.measureText(SEGMENTS.prefix).width;
        const shruti = ctx.measureText(SEGMENTS.shruti).width;
        const amp = ctx.measureText(SEGMENTS.amp).width;
        const vinod = ctx.measureText(SEGMENTS.vinod).width;

        // shrutiTrailingSpace is the unscaled gap between "Shruti" and "& Vinod".
        // Current code bakes it into `w.main` (includes trailing space) so the
        // gap stays fixed regardless of shiftP. Preserved here as an explicit field.
        const shrutiTrailingSpace = space;

        const withHeart = withText + heart + space;

        const shrutiChars = SEGMENTS.shruti.split('').map(c => ({ char: c, w: ctx.measureText(c).width }));
        const vinodChars  = SEGMENTS.vinod.split('').map(c => ({ char: c, w: ctx.measureText(c).width }));

        const shrutiIIndex = 5; // 'i' is the 6th char of "Shruti"
        const vinodIIndex  = 1; // 'i' is the 2nd char of "Vinod"

        const shrutiTextWidth = shrutiChars.reduce((s, c) => s + c.w, 0);
        const vinodTextWidth  = vinodChars.reduce((s, c)  => s + c.w, 0);

        // Offset to the horizontal center of each 'i', used for dot targets.
        let sOff = 0;
        for (let i = 0; i < shrutiIIndex; i++) sOff += shrutiChars[i].w;
        const shrutiIDotOffset = sOff + shrutiChars[shrutiIIndex].w / 2;

        let vOff = 0;
        for (let i = 0; i < vinodIIndex; i++) vOff += vinodChars[i].w;
        const vinodIDotOffset = vOff + vinodChars[vinodIIndex].w / 2;

        _layout = {
            font, footerSize, heartCanvas,
            widths: { made, withText, heart, space, prefix, shruti, shrutiTrailingSpace, amp, vinod, withHeart },
            shrutiChars, shrutiIIndex, shrutiTextWidth,
            vinodChars,  vinodIIndex,  vinodTextWidth,
            shrutiIDotOffset, vinodIDotOffset,
        };
        return _layout;
    }

    // Renders characters emanating outward from the 'i' position.
    function drawEmanating(ctx, chars, iIndex, startX, y, progress, baseAlpha) {
        if (progress <= 0) return;
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

    // Quantizes a value to `steps` buckets to limit offscreen canvas rebakes.
    function quantize(v, steps) { return Math.round(v * steps) / steps; }

    // Lazily renders a name + its glow into `target.canvas`. The offscreen ctx
    // owns all shadowBlur usage, keeping the main ctx's shadow state untouched.
    // PAD covers the Gaussian tail of the max shadowBlur (footerSize * 0.8).
    function bakeGlowCanvas(target, chars, iIndex, glowP, emanateP, intensity, fillColor, glowColorRGB, font, footerSize, textWidth) {
        // 256 buckets keeps the rebake rate above ~30/sec at the 0.12/s glow ramp,
        // so the alpha/blur step (~0.003 per bucket) is imperceptible. 64 buckets
        // produced visible stepping that read as a "switch" rather than a soft fade.
        const bakeKey = `${footerSize.toFixed(2)}|${quantize(glowP, 256)}|${quantize(emanateP, 32)}|${intensity.toFixed(2)}`;
        if (bakeKey === target.lastBakeKey) return;

        const PAD = Math.ceil(footerSize * 1.5);
        const w = Math.ceil(textWidth) + 2 * PAD;
        const h = Math.ceil(footerSize * 1.6) + 2 * PAD;

        const cvs = target.canvas;
        if (cvs.width !== w || cvs.height !== h) {
            cvs.width  = w;
            cvs.height = h;
        }
        const octx = cvs.getContext('2d');
        octx.clearRect(0, 0, w, h);
        octx.font = font;
        octx.textAlign = 'left';
        octx.textBaseline = 'middle';
        octx.fillStyle = fillColor;

        // Linear ramp on both halo AND letter brightness gives even-paced change
        // throughout the 5s window — no back-loading. Letters lerp from 0.6 alpha
        // (greyed pre-flame) to 1.0 (vivid post-flame), so the "grey → yellow-ish
        // white" transition the user described tracks proportionally with the halo.
        if (glowP > 0) {
            octx.shadowColor = `rgba(${glowColorRGB}, ${glowP * intensity * 0.7})`;
            octx.shadowBlur  = footerSize * 0.8 * glowP;
        }
        const letterAlpha = intensity * (0.6 + 0.4 * glowP);

        drawEmanating(octx, chars, iIndex, PAD, h / 2, emanateP, letterAlpha);

        target.lastBakeKey = bakeKey;
        target.baseX = PAD;
        target.baseY = h / 2;
    }

    // Heart uses save()/restore() to scope its shadow state. The canvas spec
    // guarantees save/restore covers shadowBlur, shadowColor, shadowOffset*,
    // globalAlpha, fillStyle, and font — so no manual cleanup is needed.
    function drawHeart(ctx, heartX, footerY, time, shrutiGlowP, alpha, footerSize, DPR, heartCanvas) {
        ctx.save();
        const heartRaw = shrutiGlowP > 0 ? Math.abs(Math.sin(time * 2.5)) * 0.3 : 0;
        const heartbeat = heartRaw * Math.min(1, shrutiGlowP * 5);
        const hScale = 1 + heartbeat * 0.4;
        const hW = heartCanvas.width  * hScale;
        const hH = heartCanvas.height * hScale;
        const hCenterX = heartX + heartCanvas.width / 2;
        ctx.globalAlpha  = alpha * (0.6 + heartbeat);
        ctx.shadowColor  = `rgba(${COLORS.heartGlowRGB}, ${0.6 + heartbeat})`;
        ctx.shadowBlur   = (8 + heartbeat * 12) * DPR;
        ctx.drawImage(heartCanvas, hCenterX - hW / 2, footerY - hH / 2, hW, hH);
        ctx.restore();
    }

    function invalidate() {
        _layout = null;
        _shrutiGlow.lastBakeKey = '';
        _vinodGlow.lastBakeKey  = '';
    }

    window.addEventListener('resize', invalidate);

    function draw(ctx, time, intensity, fontSize, cx, H) {
        if (_lastElapsed < 0) return;
        const { state, primaryP, shiftP, revealP, shrutiP, vinodP } = deriveProgress(_lastElapsed);
        if (primaryP <= 0) return;

        const DPR = App.DPR;
        const footerSize = fontSize * App.Config.FONT_CAPTION;
        const footerY = H - fontSize * 0.6;
        const font = `200 ${footerSize}px -apple-system, "SF Pro Display", "Helvetica Neue", sans-serif`;

        ctx.font = font;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        const layout = measureLayout(ctx, font, footerSize);
        const w = layout.widths;

        // Unscaled trailing space preserves the "Shruti & Vinod" gap regardless
        // of shiftP, matching the old w.main = measureText('...Shruti ').width.
        const totalW = w.made + w.withHeart * shiftP + w.prefix + w.shruti + w.shrutiTrailingSpace + (w.amp + w.vinod) * shiftP;
        let xPos = Math.round(cx - totalW / 2);

        // "Made "
        ctx.globalAlpha = primaryP * intensity * 0.6;
        ctx.fillStyle = COLORS.plain;
        ctx.fillText(SEGMENTS.made, xPos, footerY);
        xPos += w.made;

        // "with ❣️ "
        if (revealP > 0) {
            ctx.globalAlpha = revealP * primaryP * intensity * 0.6;
            ctx.fillStyle = COLORS.warm;
            ctx.fillText(SEGMENTS.withText, xPos, footerY);
            drawHeart(ctx, xPos + w.withText, footerY, time, _shrutiGlowP, revealP * primaryP * intensity, footerSize, DPR, layout.heartCanvas);
        }
        xPos += w.withHeart * shiftP;

        // "in California by "
        ctx.fillStyle = COLORS.plain;
        ctx.globalAlpha = primaryP * intensity * 0.6;
        ctx.fillText(SEGMENTS.prefix, xPos, footerY);
        xPos += w.prefix;

        // "Shruti" — offscreen canvas holds text + glow; main ctx only blits.
        if (shrutiP > 0) {
            bakeGlowCanvas(
                _shrutiGlow,
                layout.shrutiChars, layout.shrutiIIndex,
                _shrutiGlowP, shrutiP, intensity,
                COLORS.plain, COLORS.shrutiGlowRGB,
                font, footerSize, layout.shrutiTextWidth
            );
            ctx.globalAlpha = primaryP;
            ctx.drawImage(_shrutiGlow.canvas, xPos - _shrutiGlow.baseX, footerY - _shrutiGlow.baseY);
            xPos += w.shruti + w.shrutiTrailingSpace; // unscaled — gap stays fixed
        }

        // "& Vinod" — "&" connector never glows; "Vinod" gets its own offscreen canvas.
        if (vinodP > 0) {
            const ampAlpha = Math.min(1, Math.max(0, (vinodP - 0.7) / 0.3));
            if (ampAlpha > 0) {
                ctx.fillStyle = COLORS.plain;
                ctx.globalAlpha = ampAlpha * primaryP * intensity * 0.6;
                ctx.fillText(SEGMENTS.amp, xPos, footerY);
            }
            bakeGlowCanvas(
                _vinodGlow,
                layout.vinodChars, layout.vinodIIndex,
                _vinodGlowP, vinodP, intensity,
                COLORS.warm, COLORS.vinodGlowRGB,
                font, footerSize, layout.vinodTextWidth
            );
            ctx.globalAlpha = primaryP;
            ctx.drawImage(_vinodGlow.canvas, (xPos + w.amp) - _vinodGlow.baseX, footerY - _vinodGlow.baseY);
        }

        ctx.globalAlpha = 1;

        // Per-frame diagnostic sampled at ~10 Hz in the critical window.
        if (App.Config && App.Config.DEBUG && _lastElapsed >= 5 && _lastElapsed <= 20) {
            const frameIdx = Math.floor(_lastElapsed * 60);
            if (frameIdx % 6 === 0) {
                App.dbg('FOOTER_DIAG: el=' + _lastElapsed.toFixed(3)
                    + ' st=' + state
                    + ' P[shi=' + shiftP.toFixed(2) + ' rev=' + revealP.toFixed(2) + ' shrP=' + shrutiP.toFixed(2) + ' vinP=' + vinodP.toFixed(2) + ']'
                    + ' G[shrG=' + _shrutiGlowP.toFixed(3) + ' vinG=' + _vinodGlowP.toFixed(3) + ']'
                    + ' settled=' + (state === STATE.COMPLETE));
            }
        }
    }

    function getTargets(fontSize, cx, H) {
        const footerSize = fontSize * App.Config.FONT_CAPTION;
        const footerY = H - fontSize * 0.6;
        const font = `200 ${footerSize}px -apple-system, "SF Pro Display", "Helvetica Neue", sans-serif`;

        let layout = _layout;
        if (!layout || layout.font !== font || layout.footerSize !== footerSize) {
            const tmpCtx = document.getElementById('tanpura').getContext('2d');
            layout = measureLayout(tmpCtx, font, footerSize);
        }
        const w = layout.widths;

        // Cursor walk uses the CURRENT shiftP from the footer's elapsed clock so
        // dot targets track where Shruti and Vinod are actually rendered each frame.
        // Pre-shift (shiftP=0): "Made in California by Shruti " is centred — Shruti
        // sits further right. As shiftP ramps to 1 the layout reflows and Shruti
        // slides left to make room for "with ❣️ " and "& Vinod". DualCore reads
        // dotTarget live every frame, so cores follow the slide instead of landing
        // at the post-shift position while text is still pre-shift.
        const shiftP = _lastElapsed >= 0 ? deriveProgress(_lastElapsed).shiftP : 1;
        const totalW = w.made + w.withHeart * shiftP + w.prefix + w.shruti + w.shrutiTrailingSpace + (w.amp + w.vinod) * shiftP;
        const baseX = Math.round(cx - totalW / 2);

        const xWith   = baseX + w.made;
        const xPrefix = xWith  + w.withHeart * shiftP;
        const xShruti = xPrefix + w.prefix;
        const xAmp    = xShruti + w.shruti + w.shrutiTrailingSpace; // trailing space unscaled
        const xVinod  = xAmp   + w.amp;                              // amp unscaled — matches draw cursor

        const coreOffsetY = footerSize * 1.5;
        const dotY = footerY - footerSize * 0.35;

        return {
            shruti:    { x: xShruti + layout.shrutiTextWidth / 2, y: footerY - coreOffsetY },
            vinod:     { x: xVinod  + layout.vinodTextWidth  / 2, y: footerY - coreOffsetY },
            shrutiDot: { x: xShruti + layout.shrutiIDotOffset,    y: dotY },
            vinodDot:  { x: xVinod  + layout.vinodIDotOffset,     y: dotY },
        };
    }

    function isPrimaryStarting() {
        if (_lastElapsed < 0) return false;
        const s = deriveProgress(_lastElapsed);
        return s.state >= STATE.REVEALING_PRIMARY && s.primaryP > 0.5;
    }
    function isPrimaryDone() {
        if (_lastElapsed < 0) return false;
        return deriveProgress(_lastElapsed).state >= STATE.PRIMARY_VISIBLE;
    }
    function isSecondaryStarted() {
        if (_lastElapsed < 0) return false;
        return deriveProgress(_lastElapsed).state >= STATE.SHIFTING;
    }
    function isComplete() {
        if (_lastElapsed < 0) return false;
        return deriveProgress(_lastElapsed).state >= STATE.COMPLETE;
    }

    return { tick, draw, getTargets, isPrimaryStarting, isPrimaryDone, isSecondaryStarted, isComplete, TIMING, getElapsed() { return _lastElapsed; } };
})();
