window.App = window.App || {};

App.DualCore = (function() {
    const C = App.Config;
    const TWO_PI = Math.PI * 2;

    const ORBIT_SPEED_A = C.DUAL_CORE_ORBIT_SPEED_A;
    const ORBIT_SPEED_B = C.DUAL_CORE_ORBIT_SPEED_B;
    const PHASE_OFFSET = Math.PI;
    const INNER_ORBIT = C.DUAL_CORE_INNER_ORBIT_PCT;
    const OUTER_ORBIT = C.DUAL_CORE_OUTER_ORBIT_PCT;
    const CORE_SIZE = C.DUAL_CORE_SIZE_PCT;
    const TRAIL_COUNT = C.DUAL_CORE_TRAIL_COUNT;
    const EXPEL_ANGLE_A = Math.PI + 0.3;
    const EXPEL_ANGLE_B = -0.3;
    const SETTLED_DOT_SCALE = C.DUAL_CORE_SETTLED_DOT_SCALE;

    const STATE = { ORBITING_INSIDE: 0, ORBITING_OUTSIDE: 1, FLYING: 2, DESCENDING: 3, SETTLED: 4, DONE: 5 };

    function makeCore() {
        return {
            state: STATE.ORBITING_INSIDE,
            startX: 0, startY: 0,
            cpX: 0, cpY: 0,
            startTime: 0,
            flightDuration: 1,
            transitionX: 0, transitionY: 0,
            transitionP: 1,
            _renderedX: 0, _renderedY: 0,
            _lastTime: -1,
            _orbitPhaseOffset: 0,
            _descentStart: 0, _descentFromX: 0, _descentFromY: 0,
            _settledTime: 0,
        };
    }

    let coreA = makeCore();
    let coreB = makeCore();
    let mergeFlash = 0;

    function reset() {
        coreA = makeCore();
        coreB = makeCore();
        mergeFlash = 0;
    }

    function easeOut(t) { return 1 - (1 - t) * (1 - t) * (1 - t) * (1 - t); }

    function bezierVal(t, p0, cp, p1) {
        const u = 1 - t;
        return u * u * p0 + 2 * u * t * cp + t * t * p1;
    }

    function drawFlame(ctx, x, y, coreR, colorInner, colorMid, alpha, time, seed, kindle) {
        if (alpha <= 0) return;
        const k = kindle !== undefined ? kindle : 1;
        const flameH = coreR * 5.5 * k;
        const flameW = coreR * 1.8 * k;

        // Independent flicker per flame using seed offset
        const t = time + seed * 17.3;
        const flickX = (Math.sin(t * 6.1) * coreR * 0.25 + Math.sin(t * 9.7) * coreR * 0.12) * k;
        const flickH = 1 + (Math.sin(t * 4.3) * 0.12 + Math.sin(t * 7.9) * 0.08) * k;
        const lean = Math.sin(t * 3.2) * coreR * 0.4 * k;

        const tipX = x + flickX + lean;
        const tipY = y - flameH * flickH;

        // Outer flame — rounded teardrop
        ctx.beginPath();
        ctx.moveTo(x, y + coreR * 0.5);
        ctx.bezierCurveTo(
            x - flameW * 1.1, y - flameH * 0.15,
            x - flameW * 0.5, y - flameH * 0.7,
            tipX, tipY
        );
        ctx.bezierCurveTo(
            x + flameW * 0.5, y - flameH * 0.7,
            x + flameW * 1.1, y - flameH * 0.15,
            x, y + coreR * 0.5
        );
        const outerGrad = ctx.createLinearGradient(x, y + coreR, tipX, tipY);
        outerGrad.addColorStop(0, `rgba(${colorMid}, ${alpha * 0.6})`);
        outerGrad.addColorStop(0.4, `rgba(${colorInner}, ${alpha * 0.5})`);
        outerGrad.addColorStop(0.8, `rgba(${colorMid}, ${alpha * 0.2})`);
        outerGrad.addColorStop(1, `rgba(${colorMid}, 0)`);
        ctx.fillStyle = outerGrad;
        ctx.fill();

        // Inner flame — smaller, brighter, slightly offset
        const innerH = flameH * 0.45 * flickH;
        const innerW = flameW * 0.45;
        const innerTipX = x + flickX * 0.6;
        const innerTipY = y - innerH;

        ctx.beginPath();
        ctx.moveTo(x, y + coreR * 0.2);
        ctx.bezierCurveTo(
            x - innerW, y - innerH * 0.2,
            x - innerW * 0.4, y - innerH * 0.7,
            innerTipX, innerTipY
        );
        ctx.bezierCurveTo(
            x + innerW * 0.4, y - innerH * 0.7,
            x + innerW, y - innerH * 0.2,
            x, y + coreR * 0.2
        );
        const innerGrad = ctx.createLinearGradient(x, y, innerTipX, innerTipY);
        innerGrad.addColorStop(0, `rgba(255, 250, 235, ${alpha * 0.9})`);
        innerGrad.addColorStop(0.5, `rgba(${colorInner}, ${alpha * 0.7})`);
        innerGrad.addColorStop(1, `rgba(${colorInner}, 0)`);
        ctx.fillStyle = innerGrad;
        ctx.fill();

        // Base glow
        const baseGrad = ctx.createRadialGradient(x, y, 0, x, y, coreR * 1.2);
        baseGrad.addColorStop(0, `rgba(255, 245, 210, ${alpha * 0.6})`);
        baseGrad.addColorStop(0.6, `rgba(${colorInner}, ${alpha * 0.2})`);
        baseGrad.addColorStop(1, `rgba(${colorMid}, 0)`);
        ctx.beginPath();
        ctx.arc(x, y, coreR * 1.2, 0, TWO_PI);
        ctx.fillStyle = baseGrad;
        ctx.fill();
    }

    function drawCoreGlow(ctx, x, y, coreR, colorInner, colorMid, alpha) {
        if (alpha <= 0) return;
        const grad = ctx.createRadialGradient(x, y, 0, x, y, coreR * 2);
        grad.addColorStop(0, `rgba(${colorInner}, ${alpha * 0.9})`);
        grad.addColorStop(0.4, `rgba(${colorMid}, ${alpha * 0.5})`);
        grad.addColorStop(1, `rgba(${colorMid}, 0)`);
        ctx.beginPath(); ctx.arc(x, y, coreR * 2, 0, TWO_PI); ctx.fillStyle = grad; ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, coreR * 0.5, 0, TWO_PI);
        ctx.fillStyle = `rgba(${colorInner}, ${alpha})`; ctx.fill();
    }

    function drawTrail(ctx, getX, getY, progress, coreR, alpha, color) {
        if (alpha <= 0 || progress < 0.01) return;
        for (let ti = TRAIL_COUNT; ti > 0; ti--) {
            const tFrac = ti / TRAIL_COUNT;
            const trailT = Math.max(0, progress - tFrac * 0.05);
            const tR = coreR * (1 - tFrac * 0.6);
            ctx.beginPath(); ctx.arc(getX(trailT), getY(trailT), tR, 0, TWO_PI);
            ctx.fillStyle = `rgba(${color}, ${alpha * 0.12 * (1 - tFrac)})`;
            ctx.fill();
        }
    }

    // Picks the perpendicular side of start→target that's furthest from orb center
    function computeSafeControlPoint(fromX, fromY, targetX, targetY, cx, cy, orbRadius) {
        const midX = (fromX + targetX) / 2;
        const midY = (fromY + targetY) / 2;
        const dx = targetX - fromX;
        const dy = targetY - fromY;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const perpX = -dy / len;
        const perpY = dx / len;
        const offset = orbRadius * 1.5;

        const cp1x = midX + perpX * offset;
        const cp1y = midY + perpY * offset;
        const cp2x = midX - perpX * offset;
        const cp2y = midY - perpY * offset;

        const dist1Sq = (cp1x - cx) * (cp1x - cx) + (cp1y - cy) * (cp1y - cy);
        const dist2Sq = (cp2x - cx) * (cp2x - cx) + (cp2y - cy) * (cp2y - cy);

        const chosen = dist1Sq > dist2Sq ? { x: cp1x, y: cp1y } : { x: cp2x, y: cp2y };

        // Clamp to screen bounds so curves don't fly off edges on mobile
        const margin = orbRadius * 0.5;
        chosen.x = Math.max(margin, Math.min(App.W - margin, chosen.x));
        chosen.y = Math.max(margin, Math.min(App.H - margin, chosen.y));

        return chosen;
    }

    function launchFlight(core, fromX, fromY, targetX, targetY, cx, cy, orbRadius, time, duration) {
        core.state = STATE.FLYING;
        core.startX = fromX;
        core.startY = fromY;
        core.startTime = time;
        core.flightDuration = Math.max(0.5, duration);
        const cp = computeSafeControlPoint(fromX, fromY, targetX, targetY, cx, cy, orbRadius);
        core.cpX = cp.x;
        core.cpY = cp.y;
    }

    function initCoreFlight(core, cx, cy, orbRadius, expelAngle, time, duration, targetX, targetY) {
        core.state = STATE.FLYING;
        // Start at orb edge, not center — avoids overlapping the photo
        core.startX = cx + Math.cos(expelAngle) * orbRadius * 1.1;
        core.startY = cy + Math.sin(expelAngle) * orbRadius * 1.1;
        core.startTime = time;
        core.flightDuration = duration;
        // Control point arcs away from the orb
        const cp = computeSafeControlPoint(core.startX, core.startY, targetX, targetY, cx, cy, orbRadius);
        core.cpX = cp.x;
        core.cpY = cp.y;
    }

    function draw(ctx, cx, cy, orbRadius, orbAlpha, time, compression, hasBurst, revealActive, footerTargets, expelRadius) {
        if (orbRadius <= 0) return;
        const coreR = orbRadius * CORE_SIZE;
        // expelRadius pins the burst-moment expel position to a stable border (orbMaxRadius).
        // At the burst frame, orbRadius (= orbPulsedRadius) is still small from compression collapse,
        // so without this the cores would launch from inside the photo instead of its border.
        // Falls back to orbRadius if not provided so pre-burst rendering is unaffected.
        const expelR = expelRadius !== undefined ? expelRadius : orbRadius;

        // --- Pre-burst: orbiting inside ---
        if (!hasBurst) {
            coreA.state = STATE.ORBITING_INSIDE;
            coreB.state = STATE.ORBITING_INSIDE;

            const curved = compression * compression * compression;
            const separation = 1 - curved * C.COMPRESSION_COLLAPSE_FACTOR;
            const orbitR = orbRadius * INNER_ORBIT * separation;

            const angleA = time * ORBIT_SPEED_A;
            const xA = cx + Math.cos(angleA) * orbitR;
            const yA = cy + Math.sin(angleA) * orbitR;

            const angleB = time * ORBIT_SPEED_B + PHASE_OFFSET;
            const xB = cx + Math.cos(angleB) * orbitR;
            const yB = cy + Math.sin(angleB) * orbitR;

            const trailAlpha = orbAlpha * 0.12;
            for (let t = TRAIL_COUNT; t > 0; t--) {
                const tFrac = t / TRAIL_COUNT;
                const tTime = time - t * 0.03;
                const tR = coreR * (1 - tFrac * 0.6);
                const tA = trailAlpha * (1 - tFrac);
                ctx.beginPath(); ctx.arc(cx + Math.cos(tTime * ORBIT_SPEED_A) * orbitR, cy + Math.sin(tTime * ORBIT_SPEED_A) * orbitR, tR, 0, TWO_PI);
                ctx.fillStyle = `rgba(255, 200, 120, ${tA})`; ctx.fill();
                ctx.beginPath(); ctx.arc(cx + Math.cos(tTime * ORBIT_SPEED_B + PHASE_OFFSET) * orbitR, cy + Math.sin(tTime * ORBIT_SPEED_B + PHASE_OFFSET) * orbitR, tR, 0, TWO_PI);
                ctx.fillStyle = `rgba(180, 200, 255, ${tA})`; ctx.fill();
            }

            drawCoreGlow(ctx, xA, yA, coreR, '255, 220, 140', '255, 180, 80', orbAlpha);
            drawCoreGlow(ctx, xB, yB, coreR, '200, 220, 255', '150, 180, 255', orbAlpha);
            coreA._renderedX = xA; coreA._renderedY = yA;
            coreB._renderedX = xB; coreB._renderedY = yB;

            if (separation < 0.8) {
                const DPR = App.DPR;
                const lineAlpha = orbAlpha * (1 - separation) * 0.6;
                ctx.beginPath(); ctx.moveTo(xA, yA); ctx.lineTo(xB, yB);
                ctx.strokeStyle = `rgba(255, 230, 200, ${lineAlpha})`;
                ctx.lineWidth = 1.5 * DPR * (1 - separation);
                ctx.stroke();
            }
            return;
        }

        // --- Post-burst setup (once) ---
        if (coreA.state === STATE.ORBITING_INSIDE && footerTargets) {
            if (App.Footer.isPrimaryDone()) { coreA.state = STATE.DONE; }
            else {
                const T = App.Footer.TIMING;
                const photoFade = App.Config.PHOTO_FADE_DURATION;
                initCoreFlight(coreA, cx, cy, expelR, EXPEL_ANGLE_A, time, photoFade + T.primaryDelay + T.primaryFadeDuration * 0.6, footerTargets.shruti.x, footerTargets.shruti.y);
            }

            if (App.Footer.isSecondaryStarted()) { coreB.state = STATE.DONE; }
            else {
                const T = App.Footer.TIMING;
                const photoFade = App.Config.PHOTO_FADE_DURATION;
                initCoreFlight(coreB, cx, cy, expelR, EXPEL_ANGLE_B, time, photoFade + T.primaryDelay + T.shiftDelay + T.revealDuration * 0.6, footerTargets.vinod.x, footerTargets.vinod.y);
            }

            mergeFlash = 1.0;
        }

        // Merge flash
        if (mergeFlash > 0.01) {
            mergeFlash *= 0.9;
            const mR = orbRadius * CORE_SIZE * (1 + mergeFlash * 3);
            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, mR);
            grad.addColorStop(0, `rgba(255, 255, 240, ${mergeFlash})`);
            grad.addColorStop(1, `rgba(255, 200, 100, 0)`);
            ctx.beginPath(); ctx.arc(cx, cy, mR, 0, TWO_PI); ctx.fillStyle = grad; ctx.fill();
        }

        if (!footerTargets) return;

        const T = App.Footer.TIMING;
        const photoFade = App.Config.PHOTO_FADE_DURATION;

        renderCore(ctx, coreA, cx, cy, orbRadius, coreR, time, revealActive, footerTargets.shruti, footerTargets.shrutiDot,
            App.Footer.isPrimaryDone(), ORBIT_SPEED_A, 0,
            '255, 220, 140', '255, 180, 80', '255, 200, 120',
            photoFade + T.primaryDelay + T.primaryFadeDuration * 0.6, orbAlpha);

        renderCore(ctx, coreB, cx, cy, orbRadius, coreR, time, revealActive, footerTargets.vinod, footerTargets.vinodDot,
            App.Footer.isSecondaryStarted(), ORBIT_SPEED_B, PHASE_OFFSET,
            '200, 220, 255', '150, 180, 255', '180, 200, 255',
            photoFade + T.primaryDelay + T.shiftDelay + T.revealDuration * 0.6, orbAlpha);
    }

    function renderCore(ctx, core, cx, cy, orbRadius, coreR, time, revealActive, target, dotTarget, isDone, orbitSpeed, phaseOff, colorInner, colorMid, trailColor, totalFlightTime, parentAlpha) {
        if (core.state === STATE.DONE) return;
        if (parentAlpha <= 0) return;

        // First-frame dt guard
        const dt = core._lastTime < 0 ? 0 : time - core._lastTime;
        core._lastTime = time;
        const lastX = core._renderedX || cx;
        const lastY = core._renderedY || cy;

        // Trigger descent only from FLYING — orbiting cores wait until the user scrolls back down
        if (isDone && core.state === STATE.FLYING) {
            core._descentStart = time;
            core._descentFromX = lastX;
            core._descentFromY = lastY;
            core.state = STATE.DESCENDING;
        }

        // FLYING → ORBITING_OUTSIDE (reveal lost)
        if (core.state === STATE.FLYING && !revealActive) {
            core.transitionX = lastX;
            core.transitionY = lastY;
            core.transitionP = 0;
            core._orbitPhaseOffset = Math.atan2(lastY - cy, lastX - cx) - time * orbitSpeed * 0.5;
            core.state = STATE.ORBITING_OUTSIDE;
        }

        // ORBITING_OUTSIDE → FLYING or direct descent (reveal resumed)
        if (core.state === STATE.ORBITING_OUTSIDE && revealActive) {
            if (isDone) {
                core._descentStart = time;
                core._descentFromX = lastX;
                core._descentFromY = lastY;
                core.state = STATE.DESCENDING;
            } else {
                launchFlight(core, lastX, lastY, target.x, target.y, cx, cy, orbRadius, time, totalFlightTime);
            }
        }

        // --- Compute position ---
        let x, y, alpha = 1;

        if (core.state === STATE.DESCENDING) {
            const dx = dotTarget.x - core._descentFromX;
            const dy = dotTarget.y - core._descentFromY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const descentDuration = Math.min(3.5, Math.max(1.0, dist / (orbRadius * 0.7)));
            const elapsed = time - core._descentStart;
            const p = Math.min(1, elapsed / descentDuration);
            const eased = easeOut(p);
            x = core._descentFromX + dx * eased;
            y = core._descentFromY + dy * eased;
            // Shrink to dot size
            coreR = coreR * (1 - eased * (1 - SETTLED_DOT_SCALE));
            alpha = 1 - eased * 0.3;
            if (p >= 1) {
                core.state = STATE.SETTLED;
                core._settledTime = time;
            }
        } else if (core.state === STATE.SETTLED) {
            x = dotTarget.x;
            y = dotTarget.y;
            coreR = coreR * SETTLED_DOT_SCALE;
            const kindle = Math.min(1, (time - core._settledTime) / 1.5);
            alpha = (0.6 + kindle * 0.15) + 0.15 * Math.sin(time * 2.5) * kindle;
        } else if (core.state === STATE.FLYING) {
            const elapsed = time - core.startTime;
            const progress = Math.min(1, elapsed / core.flightDuration);
            const eased = easeOut(progress);
            x = bezierVal(eased, core.startX, core.cpX, target.x);
            y = bezierVal(eased, core.startY, core.cpY, target.y);

            // Dim over last 20% of flight (arriving gently)
            alpha = progress > 0.8 ? 1 - (progress - 0.8) / 0.2 * 0.4 : 1;

            const getX = (t) => bezierVal(t, core.startX, core.cpX, target.x);
            const getY = (t) => bezierVal(t, core.startY, core.cpY, target.y);
            drawTrail(ctx, getX, getY, eased, coreR, alpha, trailColor);

        } else if (core.state === STATE.ORBITING_OUTSIDE) {
            core.transitionP = Math.min(1, core.transitionP + dt * 1.0);
            const orbitR = orbRadius * OUTER_ORBIT;
            const orbitAngle = time * orbitSpeed * 0.5 + core._orbitPhaseOffset;
            const orbitX = cx + Math.cos(orbitAngle) * orbitR;
            const orbitY = cy + Math.sin(orbitAngle) * orbitR;

            if (core.transitionP < 1) {
                const t = easeOut(core.transitionP);
                x = core.transitionX + (orbitX - core.transitionX) * t;
                y = core.transitionY + (orbitY - core.transitionY) * t;
            } else {
                x = orbitX;
                y = orbitY;
            }
        }

        if (x !== undefined) {
            core._renderedX = x;
            core._renderedY = y;
            const finalAlpha = alpha * parentAlpha;
            if (finalAlpha > 0) {
                if (core.state === STATE.SETTLED) {
                    const kindle = Math.min(1, (time - core._settledTime) / 1.5);
                    drawFlame(ctx, x, y, coreR, colorInner, colorMid, finalAlpha, time, phaseOff, kindle);
                } else {
                    drawCoreGlow(ctx, x, y, coreR, colorInner, colorMid, finalAlpha);
                }
            }
        }
    }

    function getFlightProgress() {
        const now = Date.now() * 0.001;
        const aP = coreA.state === STATE.FLYING ? Math.min(1, (now - coreA.startTime) / coreA.flightDuration) : (coreA.state > STATE.FLYING ? 1 : 0);
        const bP = coreB.state === STATE.FLYING ? Math.min(1, (now - coreB.startTime) / coreB.flightDuration) : (coreB.state > STATE.FLYING ? 1 : 0);
        return Math.max(aP, bP);
    }

    return {
        draw, reset, getFlightProgress,
        getCorePositions() { return [{ x: coreA._renderedX, y: coreA._renderedY }, { x: coreB._renderedX, y: coreB._renderedY }]; },
        areBothOrbiting() { return coreA.state === STATE.ORBITING_OUTSIDE && coreB.state === STATE.ORBITING_OUTSIDE; }
    };
})();
