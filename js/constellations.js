window.App = window.App || {};

App.Constellations = (function() {
    const C = App.Config;
    const TWO_PI = Math.PI * 2;

    // MARK: - Per-constellation states
    const STATE = Object.freeze({
        HIDDEN: 0,
        APPEARING: 1,
        SETTLED: 2,
        GLOWING: 3,           // compression-phase intensification
        BURST_SCATTERING: 4,
        BURST_CONVERGING: 5,
        BURST_LINGERING: 6,
        DISSOLVING: 7,
        DONE: 8,
    });

    // MARK: - Constellation Data
    // Each constellation is a unit-square layout (~30px). Coordinates are relative to the
    // constellation's center, which is positioned at its letter slot. Color names index into
    // COLOR_RGB. Exactly one dot per constellation carries isAnchor:true — it is the brightest
    // "named" star and drives the appearance sequence (anchor fades in first, fillers follow).
    const CONSTELLATION_DATA = Object.freeze([
        // Sa: 1 dot + 2 halo rings — the foundation note
        {
            swara: 'Sa',
            swaraText: 'Sa · ',
            noteType: 'whole',
            dots: [
                { x: 0, y: 0, size: 1.6, color: 'white', isAnchor: true },
            ],
            lines: [],
            halos: [{ r: 11 }, { r: 6 }],
            anchorIdx: 0,
        },
        // Re: 2 dots, vertical pair joined by a line — ascending interval
        {
            swara: 'Re',
            swaraText: 'Re · ',
            noteType: 'half',
            dots: [
                { x: 0, y: -8, size: 1.4, color: 'gold',  isAnchor: false },
                { x: 0, y:  8, size: 1.6, color: 'white', isAnchor: true  },
            ],
            lines: [{ from: 0, to: 1 }],
            halos: [],
            anchorIdx: 1,
        },
        // Ga: 3 dots, upward triangle — the third
        {
            swara: 'Ga',
            swaraText: 'Ga · ',
            noteType: 'quarter',
            dots: [
                { x: -9, y:  6, size: 1.4, color: 'gold',  isAnchor: false },
                { x:  9, y:  6, size: 1.4, color: 'gold',  isAnchor: false },
                { x:  0, y: -9, size: 1.7, color: 'blue',  isAnchor: true  },
            ],
            lines: [
                { from: 0, to: 2 },
                { from: 1, to: 2 },
                { from: 0, to: 1 },
            ],
            halos: [],
            anchorIdx: 2,
        },
        // Ma: 4 dots, square — balance
        {
            swara: 'Ma',
            swaraText: 'Ma · ',
            noteType: 'eighth',
            dots: [
                { x: -8, y: -8, size: 1.6, color: 'white', isAnchor: true  },
                { x:  8, y: -8, size: 1.4, color: 'gold',  isAnchor: false },
                { x:  8, y:  8, size: 1.4, color: 'blue',  isAnchor: false },
                { x: -8, y:  8, size: 1.4, color: 'white', isAnchor: false },
            ],
            lines: [
                { from: 0, to: 1 },
                { from: 1, to: 2 },
                { from: 2, to: 3 },
                { from: 3, to: 0 },
            ],
            halos: [],
            anchorIdx: 0,
        },
        // Pa: 5 dots, pentagon — the dominant
        {
            swara: 'Pa',
            swaraText: 'Pa · ',
            noteType: 'sixteenth',
            dots: [
                { x:    0, y: -10, size: 1.7, color: 'white', isAnchor: true  },
                { x:  9.5, y:  -3, size: 1.4, color: 'blue',  isAnchor: false },
                { x:    6, y:   9, size: 1.4, color: 'gold',  isAnchor: false },
                { x:   -6, y:   9, size: 1.4, color: 'white', isAnchor: false },
                { x: -9.5, y:  -3, size: 1.4, color: 'blue',  isAnchor: false },
            ],
            lines: [
                { from: 0, to: 1 },
                { from: 1, to: 2 },
                { from: 2, to: 3 },
                { from: 3, to: 4 },
                { from: 4, to: 0 },
            ],
            halos: [],
            anchorIdx: 0,
        },
    ]);

    // Real-star colors. RGB arrays for canvas rgba() string composition.
    const COLOR_RGB = Object.freeze({
        gold:  [255, 214, 128],
        white: [255, 248, 232],
        blue:  [168, 216, 255],
    });

    // MARK: - Runtime state
    let runtimeState = []; // Per-constellation runtime; initialized in init()
    let burstTriggerTime = -1;

    // MARK: - Public API

    function init() {
        runtimeState = CONSTELLATION_DATA.map((cdata, idx) => {
            const rayCount = C.CONSTELLATIONS.RAY_COUNT;
            const rayFR = C.CONSTELLATIONS.RAY_FREQ_RANGE;
            const rayAR = C.CONSTELLATIONS.RAY_AMP_RANGE;
            return {
                slotIdx: idx,
                state: STATE.HIDDEN,
                appearTime: -1,
                // Per-dot multi-component twinkle randomization (filler stars only; anchor breathes subtly)
                twinkleFreqs: cdata.dots.map(() =>
                    randInRange(C.CONSTELLATIONS.TWINKLE_FREQ_RANGE[0], C.CONSTELLATIONS.TWINKLE_FREQ_RANGE[1])),
                twinklePhases: cdata.dots.map(() => Math.random() * TWO_PI),
                // Per-dot flare offsets — staggers when each star's next flare event happens
                flareOffsets: cdata.dots.map(() => Math.random() * 6),
                // Per-dot color jitter (saturation/lightness multiplier ±10%/±5%)
                colorJitter: cdata.dots.map(() => ({
                    sat:   0.9  + Math.random() * 0.2,
                    light: 0.95 + Math.random() * 0.1,
                })),
                // Per-dot diffraction-spike ray params — each dot's six rays pulse independently
                rayBaseAngles: cdata.dots.map(() => Math.random() * TWO_PI),
                rayFreqs: cdata.dots.map(() =>
                    Array.from({ length: rayCount }, () => randInRange(rayFR[0], rayFR[1]))),
                rayPhases: cdata.dots.map(() =>
                    Array.from({ length: rayCount }, () => Math.random() * TWO_PI)),
                rayAmps: cdata.dots.map(() =>
                    Array.from({ length: rayCount }, () => randInRange(rayAR[0], rayAR[1]))),
            };
        });
    }

    // Populate runtimeState at module load so it is ready before main.js fires its first draw.
    init();

    function draw(ctx, revealProgress, formationElapsed, compressionElapsed, burstElapsed) {
        // Outer alpha multiplier per spec §5.6 — pre-burst gates rendering by revealProgress.
        if (revealProgress <= 0) return;

        const now = formationElapsed;
        const isBursting = burstTriggerTime >= 0;
        updateStates(now, isBursting);

        // Letter slot positions are sourced from main.js's cachedLetterPositions via
        // App.getCachedLetterSlots (added in Task 10). If unavailable, this draw is a no-op
        // until Task 10 wires it in.
        const rawSlots = App.getCachedLetterSlots ? App.getCachedLetterSlots() : null;
        if (!rawSlots || rawSlots.length < 5) return;

        // Y-position for the constellation row (set by main.js in Task 14).
        const cy = App.constellationCenterY || (App.H / 2);
        // Horizontal spread: letters spread out from cached centers during formation
        // (spreadX > 1) and converge during compression (spreadX → 1). Constellations
        // must follow the same spread so they sit exactly where letters will render.
        const cxRef = App.constellationCenterX !== undefined ? App.constellationCenterX : (App.W / 2);
        const spreadX = App.constellationSpreadX !== undefined ? App.constellationSpreadX : 1;
        const slots = rawSlots.map(s => ({
            x: cxRef + (s.x - cxRef) * spreadX,
            y: cy,
            joints: s.joints,
        }));

        // Scale: each constellation must fit within its letter's slot width.
        // Use the narrowest slot to size all constellations uniformly — Pa (the widest, 19 units)
        // becomes ~76% of the narrowest letter's width, leaving margin so adjacent constellations
        // never touch even when letters are uneven (e.g. 'R' vs 'a'). Multiplied by SIZE_SCALE
        // (Config) so the whole row can be tuned bigger without re-deriving the slot math.
        const minSlotWidth = rawSlots.reduce((m, s) => Math.min(m, s.w), Infinity);
        const unitToPx = (minSlotWidth / 25) * C.CONSTELLATIONS.SIZE_SCALE;

        for (let i = 0; i < 5; i++) {
            drawConstellation(ctx, i, slots[i], unitToPx, revealProgress, now);
        }

        // Option E label transmutation — text + inline note glyphs in formation,
        // notes lift to staff during compression, drift toward orb late-compression.
        // Rendered in absolute canvas coords (post per-constellation pass).
        drawLabelsOptionE(ctx, slots, cy, unitToPx, revealProgress, now);
        // No post-burst rendering — triggerBurst() flips every constellation to DONE
        // so drawConstellation skips them; the supernova flash owns the transition
        // and the settled name carries the rest.
    }

    function triggerBurst() {
        // The flash + shockwave own this beat now. Constellations vanish instantly
        // behind the white-out and never reappear; the settled name carries the rest.
        // burstTriggerTime is still set so updateStates() honors the isBursting guard
        // and won't roll DONE constellations back into GLOWING on the next frame.
        burstTriggerTime = App._scaledTime;
        for (let i = 0; i < runtimeState.length; i++) {
            runtimeState[i].state = STATE.DONE;
        }
        if (App.dbg) App.dbg('CONSTELLATION: triggerBurst at t=' + burstTriggerTime.toFixed(2));
    }

    function getDotPositions() {
        // For debug HUD; returns flat array of {x, y, color} for visible dots.
        return [];
    }

    function reset() {
        burstTriggerTime = -1;
        for (let i = 0; i < runtimeState.length; i++) {
            const rs = runtimeState[i];
            rs.state = STATE.HIDDEN;
            rs.appearTime = -1;
        }
    }

    // MARK: - State machine

    // Per-constellation slot interval — derives from existing letter-formation cadence.
    const SLOT_INTERVAL = 1.5; // seconds; matches Config.LETTER_DURATION

    // Total formation duration (5 slots × 1.5s)
    const FORMATION_DURATION = SLOT_INTERVAL * 5;

    function updateStates(formationElapsed, isBursting) {
        if (isBursting) return; // burst transition manages its own state externally

        if (formationElapsed < 0) {
            // Pre-reveal — everything HIDDEN
            for (let i = 0; i < runtimeState.length; i++) runtimeState[i].state = STATE.HIDDEN;
            return;
        }

        for (let i = 0; i < runtimeState.length; i++) {
            const rs = runtimeState[i];
            const slotStart = i * SLOT_INTERVAL;

            if (formationElapsed < slotStart) {
                rs.state = STATE.HIDDEN;
                rs.appearTime = -1;
                continue;
            }

            // Slot has appeared (or is appearing). Capture appearTime once.
            if (rs.appearTime < 0) rs.appearTime = slotStart;

            const sinceAppear = formationElapsed - slotStart;

            // APPEARING window: 0 → max(ANCHOR_FADE_IN, FILLER_FADE_IN) seconds
            const appearWindowSec = Math.max(
                C.CONSTELLATIONS.ANCHOR_FADE_IN,
                C.CONSTELLATIONS.FILLER_FADE_IN
            ) / 1000;

            if (formationElapsed >= FORMATION_DURATION) {
                // Compression has begun — all constellations transition to GLOWING
                rs.state = STATE.GLOWING;
            } else if (sinceAppear < appearWindowSec) {
                rs.state = STATE.APPEARING;
            } else {
                rs.state = STATE.SETTLED;
            }
        }
    }

    // MARK: - Rendering helpers

    function colorString(name, alpha, jitter) {
        const rgb = COLOR_RGB[name];
        if (!rgb) return `rgba(255,255,255,${alpha})`;
        // Apply jitter (sat/light multipliers): we approximate by scaling channels by jitter.light
        const r = Math.min(255, Math.round(rgb[0] * jitter.light));
        const g = Math.min(255, Math.round(rgb[1] * jitter.light));
        const b = Math.min(255, Math.round(rgb[2] * jitter.light));
        return `rgba(${r},${g},${b},${alpha})`;
    }

    // Draws a single star (filled circle).
    // sizeUnits is the "size" scalar from CONSTELLATION_DATA (typically 1.4–1.7),
    // unitToPx is the per-constellation scale (px per unit-coordinate).
    function drawStar(ctx, x, y, sizeUnits, unitToPx, color, alpha) {
        const r = sizeUnits * unitToPx * C.CONSTELLATIONS.DOT_RADIUS_FACTOR;
        ctx.fillStyle = color;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TWO_PI);
        ctx.fill();
    }

    function clamp01(x) {
        return x < 0 ? 0 : (x > 1 ? 1 : x);
    }

    // Draws six diffraction-spike rays radiating from a star center. Each ray pulses on
    // its own freq/phase, so the pattern is non-uniform — sometimes prominent rays in some
    // directions, sometimes others. The whole cluster slowly rotates with time, and each
    // ray has a per-star random max-length (rayAmps) so spikes are visibly lopsided.
    function drawStarRays(ctx, cx, cy, baseR, brightness, colorName, jitter, time, rs, di, compFraction, outerAlpha) {
        const C_C = C.CONSTELLATIONS;
        const slowRot = time * C_C.RAY_ROTATION_SPEED + rs.rayBaseAngles[di];
        const baseLength = baseR * C_C.RAY_LENGTH_MUL;
        const rayWidth = baseR * C_C.RAY_WIDTH_FACTOR;
        const angleStep = TWO_PI / C_C.RAY_COUNT;

        for (let r = 0; r < C_C.RAY_COUNT; r++) {
            const angle = slowRot + r * angleStep;
            const rayFreq = rs.rayFreqs[di][r] * (1 + compFraction * C_C.RAY_COMPRESSION_MUL);
            const rayWave = Math.sin(time * rayFreq * TWO_PI + rs.rayPhases[di][r]) * 0.5 + 0.5; // [0,1]
            const length = baseLength * rs.rayAmps[di][r] * (0.4 + rayWave * 1.0);
            const alpha = brightness * 0.5 * rayWave * outerAlpha;
            if (alpha < 0.015) continue;

            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(angle);
            const grad = ctx.createLinearGradient(0, 0, length, 0);
            grad.addColorStop(0,    colorString(colorName, alpha,        jitter));
            grad.addColorStop(0.25, colorString(colorName, alpha * 0.55, jitter));
            grad.addColorStop(1,    colorString(colorName, 0,            jitter));
            ctx.fillStyle = grad;
            // Tapered diffraction spike: thin at center, peak at ~22%, sharp point at end
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(length * 0.22, -rayWidth);
            ctx.lineTo(length, 0);
            ctx.lineTo(length * 0.22, rayWidth);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
    }

    // Sonar rings — every star periodically emits expanding fading rings during
    // compression, like sonar pings or stones-in-water. Anchor rings ride at full
    // intensity; filler rings shrink in radius and dim to keep the constellation
    // cohesive without becoming visual noise. Per-star phase offset desynchronizes
    // the pings within a constellation so the row breathes organically.
    function drawSonarRings(ctx, ax, ay, colorName, jitter, time, compFraction, unitToPx, outerAlpha, intensityScale, phaseOffset) {
        if (compFraction < 0.02) return;
        const scale = intensityScale === undefined ? 1.0 : intensityScale;
        if (scale <= 0) return;
        const C_C = C.CONSTELLATIONS;
        const cycle = C_C.SONAR_RING_PERIOD_BASE - compFraction * C_C.SONAR_RING_PERIOD_REDUCTION;
        const ringMaxR = C_C.SONAR_RING_MAX_R_MUL * unitToPx * scale;
        const ringMinR = C_C.SONAR_RING_MIN_R_MUL * unitToPx * scale;
        const offset = phaseOffset || 0;
        for (let i = 0; i < C_C.SONAR_RING_COUNT; i++) {
            const phase = ((time + offset + i * cycle / C_C.SONAR_RING_COUNT) % cycle) / cycle;
            const r = ringMinR + (ringMaxR - ringMinR) * phase;
            const alpha = (1 - phase) * 0.5 * compFraction * outerAlpha * scale;
            if (alpha < 0.005) continue;
            ctx.strokeStyle = colorString(colorName, alpha, jitter);
            ctx.lineWidth = 0.9;
            ctx.beginPath();
            ctx.arc(ax, ay, r, 0, TWO_PI);
            ctx.stroke();
        }
    }

    // Draws a single musical note. Five types ascend in rhythmic intensity:
    //   whole — hollow oval, no stem (longest sustain)
    //   half — hollow oval + stem
    //   quarter — filled oval + stem
    //   eighth — filled + stem + single curved flag
    //   sixteenth — filled + stem + double curved flag (busiest)
    function drawNote(ctx, x, y, type, alpha, scale) {
        if (alpha <= 0.005) return;
        const headW = 9 * scale;
        const headH = 6.5 * scale;
        const stemX = 7 * scale;
        const stemLen = 32 * scale;
        const fillCol = `rgba(255, 232, 180, ${alpha})`;
        ctx.fillStyle = fillCol;
        ctx.strokeStyle = fillCol;
        // Note head — tilted ellipse
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(-0.32);
        ctx.beginPath();
        ctx.ellipse(0, 0, headW, headH, 0, 0, TWO_PI);
        if (type === 'whole' || type === 'half') {
            ctx.lineWidth = 2 * scale;
            ctx.stroke();
        } else {
            ctx.fill();
        }
        ctx.restore();
        // Stem extends UP from the head (none for whole)
        if (type !== 'whole') {
            ctx.lineWidth = 1.4 * scale;
            ctx.beginPath();
            ctx.moveTo(x + stemX, y);
            ctx.lineTo(x + stemX, y - stemLen);
            ctx.stroke();
        }
        // Flags attach at the top of the stem (eighth: 1 flag, sixteenth: 2)
        function drawFlag(yOffsetFromTop) {
            ctx.lineWidth = 1.4 * scale;
            ctx.beginPath();
            ctx.moveTo(x + stemX, y - stemLen + yOffsetFromTop);
            ctx.quadraticCurveTo(
                x + stemX + 11 * scale, y - stemLen + yOffsetFromTop + 4 * scale,
                x + stemX + 9 * scale,  y - stemLen + yOffsetFromTop + 14 * scale
            );
            ctx.stroke();
        }
        if (type === 'eighth' || type === 'sixteenth') drawFlag(0);
        if (type === 'sixteenth') drawFlag(8 * scale);
    }

    // Draws three faint horizontal staff lines spanning the constellation row,
    // for use during the mid-compression "notes-on-staff" window in Option E.
    function drawStaffLines(ctx, slots, staffCenterY, staffHeight, alpha) {
        if (alpha <= 0.005) return;
        ctx.strokeStyle = `rgba(255, 224, 168, ${alpha})`;
        ctx.lineWidth = 0.8;
        const xLeft = slots[0].x - 30, xRight = slots[4].x + 30;
        for (let line = -1; line <= 1; line++) {
            const yLine = staffCenterY + line * (staffHeight / 4) - staffHeight * 0.25;
            ctx.beginPath();
            ctx.moveTo(xLeft, yLine);
            ctx.lineTo(xRight, yLine);
            ctx.stroke();
        }
    }

    function drawLineWithProgress(ctx, fromDot, toDot, unitToPx, progress, outerAlpha, fadeBase, alphaMul, widthMul) {
        // Tween the line from fromDot toward toDot, drawing only `progress` portion.
        // Apply easeOutQuint to make the draw feel pen-stroke-like.
        const eased = App.easeOutQuint(progress);
        const x1 = fromDot.x * unitToPx;
        const y1 = fromDot.y * unitToPx;
        const x2 = toDot.x * unitToPx;
        const y2 = toDot.y * unitToPx;
        const tx = x1 + (x2 - x1) * eased;
        const ty = y1 + (y2 - y1) * eased;
        const c1 = COLOR_RGB[fromDot.color];
        const c2 = COLOR_RGB[toDot.color];
        const mr = Math.round((c1[0] + c2[0]) / 2);
        const mg = Math.round((c1[1] + c2[1]) / 2);
        const mb = Math.round((c1[2] + c2[2]) / 2);
        const alpha = 0.4 * fadeBase * outerAlpha * (alphaMul || 1.0);
        ctx.strokeStyle = `rgba(${mr},${mg},${mb},${alpha})`;
        ctx.lineWidth = 0.6 * unitToPx * (widthMul || 1.0);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(tx, ty);
        ctx.stroke();
    }

    // Option E label transmutation. Renders all five labels in absolute canvas coords
    // (called from main draw() after the per-constellation rendering loop).
    //
    // Phases (per constellation, where labelFade is the per-slot formation fade-in):
    //   formation (compFraction = 0)        — text + inline note glyph at full alpha
    //   compression onset (0 → 0.30)        — text fades, note glyph lifts off & grows
    //   mid-compression (0.30 → 0.70)       — notes settled on staff, faint staff lines
    //   late compression (0.70 → 1.00)      — notes drift toward orb and fade
    function drawLabelsOptionE(ctx, slots, cy, unitToPx, outerAlpha, now) {
        if (!slots || slots.length < 5) return;
        const C_C = C.CONSTELLATIONS;

        // Global compression fraction — all five constellations transmute uniformly during
        // compression. Use the same formula drawConstellation uses (clamp at 1.0).
        const compFraction = clamp01((now - FORMATION_DURATION) / 6.0);

        // Label baseline must clear the constellation's lowest extent (Sa halo at r=11) PLUS
        // the upward-stem reach (32px) PLUS Pa's rise toward staff top (28px) PLUS margin.
        // Anchored at constellation_bottom + 75px so stems never poke into the constellation
        // even with small unitToPx (when the constellation is small but stems are fixed-px).
        const baseLabelY = cy + 11 * unitToPx + 75;
        const staffCenterY = baseLabelY + 28;
        const staffHeight = 56;
        const orbX = App.W / 2;
        const orbY = App.H / 2;
        const inlineNoteWidth = 30;

        const liftProgress = clamp01((compFraction - 0.05) / 0.25);
        // Notes stay fully visible all the way to the orb — they're meant to be seen
        // reaching the singularity. Fade only in the final 5% so they vanish cleanly
        // exactly as the burst fires (compFraction reaches 1.0 at burst trigger).
        const notationFadeOut = 1 - clamp01((compFraction - 0.95) / 0.05);
        const noteCompAlpha = 0.95 * notationFadeOut;
        const textCompAlpha = clamp01((0.30 - compFraction) / 0.25);
        const driftAmt = clamp01((compFraction - 0.70) / 0.30);

        ctx.font = `${C_C.LABEL_SIZE_BASE * unitToPx}px ${C_C.LABEL_FONT}`;
        ctx.textBaseline = 'top';

        for (let i = 0; i < 5; i++) {
            const rs = runtimeState[i];
            // Skip pre-formation (HIDDEN) and post-burst (BURST_*, DONE) constellations.
            if (rs.state === STATE.HIDDEN ||
                rs.state === STATE.DONE ||
                rs.state === STATE.BURST_SCATTERING ||
                rs.state === STATE.BURST_CONVERGING ||
                rs.state === STATE.BURST_LINGERING ||
                rs.state === STATE.DISSOLVING) continue;

            // Per-slot formation fade-in
            const slotStart = i * SLOT_INTERVAL;
            const sinceSlot = now - slotStart;
            // Why: label start is anchored to the zoom-pop overshoot peak (mid-window of APPEARING)
            // so the name lands as the constellation finishes settling, not on a separate delay.
            const appearWindowSec = Math.max(C_C.ANCHOR_FADE_IN, C_C.FILLER_FADE_IN) / 1000;
            const labelStartSec = appearWindowSec / 2;
            const labelFadeSec = C_C.LABEL_FADE_IN / 1000;
            const labelFade = clamp01((sinceSlot - labelStartSec) / labelFadeSec);
            if (labelFade <= 0) continue;

            // Label pop-and-settle: same smoothstep + overshoot recipe as the
            // constellation pop, parameterised on labelFade so the name lands with a
            // matching punch (peak ~1.16× near labelPopP=0.7) before settling at 1.0.
            // Asymmetric pacing matches the constellation: rise quickly, settle slowly.
            const labelTime = sinceSlot - labelStartSec;
            const labelPeakSec = labelFadeSec * 0.7;
            const labelSettleSec = labelPeakSec + labelFadeSec * 0.7;
            let labelPopP;
            if (labelTime >= labelSettleSec) {
                labelPopP = 1.0;
            } else if (labelTime < labelPeakSec) {
                labelPopP = (labelTime / labelPeakSec) * 0.7;
            } else {
                labelPopP = 0.7 + ((labelTime - labelPeakSec) / (labelSettleSec - labelPeakSec)) * 0.3;
            }
            const labelPopEased = labelPopP * labelPopP * (3 - 2 * labelPopP);
            const labelPopOvershoot = 1 + 0.3 * Math.sin(labelPopP * Math.PI);
            const labelPopScale = labelPopP < 1 ? (0.7 + labelPopEased * 0.3) * labelPopOvershoot : 1.0;

            const cdata = CONSTELLATION_DATA[i];
            const slotX = slots[i].x;
            const swaraText = cdata.swaraText;
            const noteType = cdata.noteType;

            // Layout: text + inline note centered on slotX
            ctx.textAlign = 'left';
            const textWidth = ctx.measureText(swaraText).width;
            const totalWidth = textWidth + inlineNoteWidth;
            const labelLeftX = slotX - totalWidth / 2;

            // Pop-scale wrap: scales the entire label (text + note glyph) around
            // (slotX, baseLabelY) during the appear window. Identity transform
            // once labelPopScale == 1.0 so compression-phase rendering is unchanged.
            ctx.save();
            ctx.translate(slotX, baseLabelY);
            ctx.scale(labelPopScale, labelPopScale);
            ctx.translate(-slotX, -baseLabelY);

            // Text portion (faded by formation fade-in × compression text fade)
            const textAlpha = labelFade * outerAlpha * C_C.LABEL_BASE_ALPHA * textCompAlpha;
            if (textAlpha > 0.005) {
                ctx.fillStyle = `rgba(255, 214, 128, ${textAlpha})`;
                ctx.fillText(swaraText, labelLeftX, baseLabelY);
            }

            // Note glyph: starts inline (right after text), lifts to ascending staff position.
            // Sa is lowest (noteFrac=0), Pa is highest (noteFrac=1).
            const inlineNoteX = labelLeftX + textWidth + inlineNoteWidth / 2;
            const inlineNoteY = baseLabelY + 16;
            const noteFrac = i / 4;
            const targetX = slotX;
            const targetY = staffCenterY - noteFrac * staffHeight;

            const eased = App.easeOutQuint(liftProgress);
            let nx = inlineNoteX + (targetX - inlineNoteX) * eased;
            let ny = inlineNoteY + (targetY - inlineNoteY) * eased;
            // Base scale is intentionally larger than typical particles (~17px max)
            // so notes remain readable as anchored melodic events amidst the swarm.
            let noteScale = 0.7 + 0.4 * eased;

            // Drift to orb: gravitational pull (easeInCubic — gentle then accelerating).
            // The lerp `p + (orb - p) * t` arrives at the orb exactly when t = 1, which
            // happens at compFraction = 1.0 — the same moment the burst is triggered.
            // Each note's per-frame travel is proportional to its remaining distance,
            // so notes from farther staff positions naturally cover more pixels per
            // frame and all five arrive together at peak compression.
            let driftGlow = 0;
            if (driftAmt > 0) {
                const easedDrift = driftAmt * driftAmt * driftAmt;
                nx = nx + (orbX - nx) * easedDrift;
                ny = ny + (orbY - ny) * easedDrift;
                // Gentle compression into the singularity in the final stretch.
                // Holds full size for most of the journey so notes stay legible.
                const shrink = clamp01((driftAmt - 0.6) / 0.4);
                noteScale *= (1 - shrink * 0.55);
                driftGlow = driftAmt;
            }

            const noteAlpha = labelFade * outerAlpha * noteCompAlpha;
            // Halo behind the note brightens as it approaches the orb, ensuring it
            // stands out from vortex particles and reads as a discrete musical event
            // being absorbed into the singularity.
            if (driftGlow > 0.05 && noteAlpha > 0.005) {
                const glowR = 26 * noteScale * (1 + driftGlow * 1.8);
                const glowAlpha = noteAlpha * (0.25 + driftGlow * 0.55);
                const glowGrad = ctx.createRadialGradient(nx, ny, 0, nx, ny, glowR);
                glowGrad.addColorStop(0,    `rgba(255, 240, 190, ${glowAlpha})`);
                glowGrad.addColorStop(0.4,  `rgba(255, 220, 150, ${glowAlpha * 0.5})`);
                glowGrad.addColorStop(1,    'rgba(255, 200, 110, 0)');
                ctx.fillStyle = glowGrad;
                ctx.beginPath();
                ctx.arc(nx, ny, glowR, 0, TWO_PI);
                ctx.fill();
            }
            drawNote(ctx, nx, ny, noteType, noteAlpha, noteScale);
            ctx.restore();
        }

        // Staff fades out during the first half of drift as the notes lift away
        // from it. Decoupled from notationFadeOut now that notes themselves stay
        // visible until the very last moment of compression.
        if (liftProgress > 0.5) {
            const staffFadeOut = 1 - clamp01(driftAmt / 0.5);
            const staffAlpha = 0.4 * clamp01((liftProgress - 0.5) / 0.2) * staffFadeOut * outerAlpha;
            drawStaffLines(ctx, slots, staffCenterY, staffHeight, staffAlpha);
        }
    }

    function drawConstellation(ctx, slotIdx, slotCenterPx, unitToPx, outerAlpha, now) {
        const rs = runtimeState[slotIdx];
        const cdata = CONSTELLATION_DATA[slotIdx];
        const C_C = C.CONSTELLATIONS;

        if (rs.state === STATE.HIDDEN ||
            rs.state === STATE.DONE ||
            rs.state === STATE.BURST_SCATTERING ||
            rs.state === STATE.BURST_CONVERGING ||
            rs.state === STATE.BURST_LINGERING ||
            rs.state === STATE.DISSOLVING) return;

        const slotStart = rs.slotIdx * SLOT_INTERVAL;
        const sinceSlot = now - slotStart;

        // Anchor fade-in duration (seconds)
        const anchorFade = clamp01(sinceSlot / (C_C.ANCHOR_FADE_IN / 1000));
        // fillerFadeSec used inline per-dot to apply per-dot stagger
        const fillerFadeSec = C_C.FILLER_FADE_IN / 1000;

        // Compression-phase modifiers (active when rs.state === GLOWING)
        const isGlowing = rs.state === STATE.GLOWING;
        const orbPulse = isGlowing ? Math.sin(now * 6) * 0.5 + 0.5 : 0;  // 6 rad/s pulse during compression

        // Compression-phase line glow-up (linear ramp 0→1 across 6s compression window)
        const compFraction = isGlowing ? clamp01((now - FORMATION_DURATION) / 6.0) : 0;
        const lineAlphaMul = 1.0 + compFraction * (C_C.COMPRESSION_LINE_ALPHA_END / 0.4 - 1.0);
        const lineWidthMul = 1.0 + compFraction * (C_C.COMPRESSION_LINE_WIDTH_END / 0.6 - 1.0);

        // Pop-in scale: starts at 0.7, peaks ~1.16× near popInP=0.7, settles to 1.0
        // via asymmetric smoothstep + sine overshoot. Once popInP reaches 1 the scale
        // collapses to exactly 1.0, keeping SETTLED/GLOWING rendering byte-identical
        // to the pre-pop path.
        const appearWindowSec = Math.max(C_C.ANCHOR_FADE_IN, C_C.FILLER_FADE_IN) / 1000;
        // Asymmetric pacing: rise to peak in `appearWindowSec * 0.7`, then linger longer on
        // the way back to 1.0 so the settle reads as a relax rather than a snap.
        const peakSec = appearWindowSec * 0.7;
        const settleSec = peakSec + appearWindowSec * 0.7;
        let popInP;
        if (sinceSlot >= settleSec) {
            popInP = 1.0;
        } else if (sinceSlot < peakSec) {
            popInP = (sinceSlot / peakSec) * 0.7;
        } else {
            popInP = 0.7 + ((sinceSlot - peakSec) / (settleSec - peakSec)) * 0.3;
        }
        const popEased = popInP * popInP * (3 - 2 * popInP);                 // smoothstep
        const popOvershoot = 1 + 0.3 * Math.sin(popInP * Math.PI);           // peak overshoot 1.3× at popInP=0.5
        const popScale = popInP < 1 ? (0.7 + popEased * 0.3) * popOvershoot : 1.0; // peaks ~1.16× near popInP=0.7

        ctx.save();
        ctx.translate(slotCenterPx.x, slotCenterPx.y);
        ctx.scale(popScale, popScale);

        // Draw halo rings (Sa only) — fade in with anchor, then brighten + thicken
        // during compression so Sa's halos energize alongside the line-glow that the
        // other constellations get. Without this, Sa visually deflates while the rest
        // of the row charges up.
        const haloCompBoost = 1 + compFraction * 2.5;
        for (let hi = 0; hi < cdata.halos.length; hi++) {
            const halo = cdata.halos[hi];
            const haloAlpha = anchorFade * outerAlpha * (0.25 - hi * 0.08) * haloCompBoost;
            if (haloAlpha <= 0) continue;
            ctx.strokeStyle = `rgba(255, 248, 232, ${haloAlpha})`;
            ctx.lineWidth = (0.6 + compFraction * 0.6) * unitToPx;
            // Compression: rings expand/contract subtly with orb pulse
            const haloR = halo.r * unitToPx * (1.0 + (isGlowing ? 0.05 * orbPulse : 0));
            ctx.beginPath();
            ctx.arc(0, 0, haloR, 0, TWO_PI);
            ctx.stroke();
        }

        // Sonar rings — every star emits expanding rings during compression, all at
        // equal intensity (no anchor distinction). Per-star phase offset desyncs the
        // pings within a constellation so the row breathes organically rather than
        // pulsing in mechanical lockstep.
        if (compFraction > 0.02) {
            for (let di = 0; di < cdata.dots.length; di++) {
                const dot = cdata.dots[di];
                const ax = dot.x * unitToPx;
                const ay = dot.y * unitToPx;
                const dotJitter = rs.colorJitter[di];
                // twinklePhases is in radians; sonar cycle is in seconds. Scale to seconds
                // so each star's pings start at a different point in the cycle.
                const phaseOffset = rs.twinklePhases[di] / TWO_PI * 1.8;
                drawSonarRings(ctx, ax, ay, dot.color, dotJitter, now, compFraction, unitToPx, outerAlpha, 1.0, phaseOffset);
            }
        }

        // Draw connecting lines in declaration order, with an 80ms stagger per line
        // for a "pen-stroke" cascade. No anchor-outward reordering — every star is
        // peer; lines simply tween from `line.from` to `line.to` as authored.
        if (cdata.lines.length > 0) {
            const lineStartSec = C.CONSTELLATIONS.LINE_DRAW_DELAY / 1000;
            const lineDurSec = C.CONSTELLATIONS.LINE_DRAW_DURATION / 1000;

            for (let li = 0; li < cdata.lines.length; li++) {
                const line = cdata.lines[li];
                const lineStaggerSec = li * 0.08;
                const lineProgress = clamp01((sinceSlot - lineStartSec - lineStaggerSec) / lineDurSec);
                if (lineProgress <= 0) continue;

                drawLineWithProgress(
                    ctx, cdata.dots[line.from], cdata.dots[line.to],
                    unitToPx, lineProgress, outerAlpha, anchorFade,
                    lineAlphaMul, lineWidthMul
                );
            }
        }

        // Draw each dot — layered star rendering: halo + diffraction spikes + colored core + white-hot center
        for (let di = 0; di < cdata.dots.length; di++) {
            const dot = cdata.dots[di];
            // Staggered cascade entry (60ms per dot) so the constellation builds
            // organically without any single star being privileged.
            const staggerSec = di * 0.06;
            const baseFade = clamp01((sinceSlot - staggerSec) / fillerFadeSec);
            if (baseFade <= 0) continue;

            // === Brightness + size pulse ===
            // Real stars scintillate from layered atmospheric refraction: multi-frequency
            // (slow envelope + fast shimmer + high-freq glint) plus occasional flare spikes.
            // Every star runs the same scintillation — there is no "anchor" distinction.
            let brightness, sizeMul;
            if (baseFade < 1.0) {
                // Still fading in — simple ramp; twinkle takes over once fully visible.
                brightness = baseFade;
                sizeMul = 1.0;
            } else {
                const freq = rs.twinkleFreqs[di];
                const phase = rs.twinklePhases[di];
                const freqMul = 1 + compFraction * C.CONSTELLATIONS.TWINKLE_COMPRESSION_MUL;
                const slow    = Math.sin(now * freq * freqMul * 2.0  * TWO_PI / 2 + phase);
                const fast    = Math.sin(now * freq * freqMul * 4.7  * TWO_PI / 2 + phase * 1.7);
                const shimmer = Math.sin(now * freq * freqMul * 11.3 * TWO_PI / 2 + phase * 2.4);
                const combined = (slow * 0.55 + fast * 0.30 + shimmer * 0.15) * 0.5 + 0.5; // [0,1]
                const lo = C.CONSTELLATIONS.TWINKLE_ALPHA_RANGE[0];
                const hi = C.CONSTELLATIONS.TWINKLE_ALPHA_RANGE[1];
                brightness = lo + combined * (hi - lo);
                sizeMul = 0.92 + combined * 0.10;

                // Occasional flare: a brief brightness + size spike. Period shrinks with compression.
                const flarePeriod = C.CONSTELLATIONS.FLARE_PERIOD_BASE - compFraction * C.CONSTELLATIONS.FLARE_PERIOD_REDUCTION;
                const flareDur = C.CONSTELLATIONS.FLARE_DURATION;
                const flareTime = (now + rs.flareOffsets[di]) % flarePeriod;
                if (flareTime < flareDur) {
                    const flareCurve = Math.sin(flareTime / flareDur * Math.PI);
                    brightness = Math.min(1.0, brightness + flareCurve * C.CONSTELLATIONS.FLARE_BRIGHTNESS_BOOST);
                    sizeMul += flareCurve * C.CONSTELLATIONS.FLARE_SIZE_BOOST;
                }
            }

            // === Render: halo + rays + colored core + white-hot center ===
            const dx = dot.x * unitToPx;
            const dy = dot.y * unitToPx;
            const baseR = dot.size * unitToPx * C.CONSTELLATIONS.DOT_RADIUS_FACTOR * sizeMul;
            const haloR = baseR * C.CONSTELLATIONS.HALO_RADIUS_MUL;
            const jitter = rs.colorJitter[di];
            const finalAlpha = brightness * outerAlpha;
            if (finalAlpha <= 0) continue;

            // 1. Soft outer halo (radial gradient, fades fast for sharp star feel)
            const haloGrad = ctx.createRadialGradient(dx, dy, 0, dx, dy, haloR);
            haloGrad.addColorStop(0,    colorString(dot.color, finalAlpha * 0.55, jitter));
            haloGrad.addColorStop(0.25, colorString(dot.color, finalAlpha * 0.18, jitter));
            haloGrad.addColorStop(1,    colorString(dot.color, 0,                  jitter));
            ctx.fillStyle = haloGrad;
            ctx.beginPath();
            ctx.arc(dx, dy, haloR, 0, TWO_PI);
            ctx.fill();

            // 2. Diffraction-spike rays (skipped during fade-in to avoid bursty appearance)
            if (baseFade >= 1.0) {
                drawStarRays(ctx, dx, dy, baseR, brightness, dot.color, jitter, now, rs, di, compFraction, outerAlpha);
            }

            // 3. Colored core
            ctx.fillStyle = colorString(dot.color, finalAlpha, jitter);
            ctx.beginPath();
            ctx.arc(dx, dy, baseR, 0, TWO_PI);
            ctx.fill();

            // 4. White-hot center — saturated diamond core that real stars have in photos
            ctx.fillStyle = `rgba(255, 255, 255, ${finalAlpha * 0.85})`;
            ctx.beginPath();
            ctx.arc(dx, dy, baseR * C.CONSTELLATIONS.WHITE_CORE_FACTOR, 0, TWO_PI);
            ctx.fill();
        }

        // Labels are NOT rendered here — drawLabelsOptionE in the main draw() loop renders
        // all five labels in absolute canvas coords (so it can lift notes to staff positions
        // and drift them toward the orb during compression).

        ctx.restore();
    }

    function lowestDotY(cdata) {
        let y = -Infinity;
        for (const d of cdata.dots) if (d.y > y) y = d.y;
        return y;
    }

    // MARK: - Helpers

    function randInRange(a, b) {
        return a + Math.random() * (b - a);
    }

    return {
        init,
        draw,
        triggerBurst,
        getDotPositions,
        reset,
        CONSTELLATION_DATA,
        _internal: {
            getRuntimeState: () => runtimeState,
            updateStates,
            STATE,
        },
    };
})();
