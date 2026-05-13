window.App = window.App || {};

(function() {
    const C = App.Config;
    const { easeOutQuint, smoothstep } = App;

    const canvas = document.getElementById('tanpura');
    const ctx = canvas.getContext('2d');
    const hint = document.querySelector('.scroll-hint');
    const watermark = document.querySelector('.watermark');
    const muteBtn = document.getElementById('muteBtn');
    const DPR = App.DPR;

    function resize() {
        App.W = canvas.width = window.innerWidth * DPR;
        App.H = canvas.height = window.innerHeight * DPR;
        canvas.style.width = window.innerWidth + 'px';
        canvas.style.height = window.innerHeight + 'px';
    }
    resize();
    window.addEventListener('resize', resize);

    // Init subsystems
    App.Audio.preload();
    App.Strings.init();
    App.WaveModels.init();
    App.Particles.init();
    App.Input.bindEvents(canvas);

    // Scroll tracking
    let currentScroll = 0;
    function onScroll() {
        currentScroll = window.scrollY || window.pageYOffset || document.documentElement.scrollTop;
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // Audio on first scroll
    window.addEventListener('scroll', function startOnScroll() {
        App.Audio.init(muteBtn);
        window.removeEventListener('scroll', startOnScroll);
    }, { once: true });

    // Mute toggle
    muteBtn.addEventListener('click', () => {
        const muted = App.Audio.toggleMute();
        document.getElementById('muteIcon').innerHTML = muted
            ? '<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>'
            : '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>';
    });

    // Preload photo
    const babyImg = new Image();

    // Font cycle advance on tap — jumps to transition start of current segment
    let fontCycleOffset = 0;

    // Tap burst (post-reveal interactive)
    canvas.addEventListener('pointerdown', (e) => {
        if (!State.isComplete) return;
        if (e.target === muteBtn || muteBtn.contains(e.target)) return;
        const x = e.clientX * DPR;
        const y = e.clientY * DPR;

        // Hit test on name text area
        const W = App.W, H = App.H;
        const fs = Math.min(W * 0.09, H * 0.11);
        const orbMax = Math.min(W * C.ORB_MAX_RADIUS_PCT, H * C.ORB_MAX_RADIUS_PCT);
        const nameY = H * (0.5 - C.ORB_VERTICAL_SHIFT) + orbMax + fs * 0.8;
        if (Math.abs(x - W / 2) < fs * 2.5 && Math.abs(y - nameY) < fs * 0.8) {
            const segDur = C.FONT_HOLD_DURATION + C.FONT_TRANSITION_DURATION;
            const totalCycle = segDur * C.CYCLE_FONTS.length;
            const now = Date.now() * 0.001;
            const revElapsed = State.startTime > 0 ? now - State.startTime : 0;
            const formTime = App.NAME_LETTERS.length * C.LETTER_DURATION;
            const raw = Math.max(0, revElapsed - formTime - C.PHOTO_DELAY_AFTER_FORMATION) + fontCycleOffset;
            const cycleT = raw % totalCycle;
            const segT = cycleT % segDur;
            // Skip remaining hold time to start the transition immediately
            if (segT < C.FONT_HOLD_DURATION) {
                fontCycleOffset += C.FONT_HOLD_DURATION - segT;
            }
        }

        const count = 20 + Math.floor(Math.random() * 15);
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
            const speed = (2 + Math.random() * 4) * DPR;
            sparkles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1.0,
                size: (2 + Math.random() * 3) * DPR
            });
        }
    });
    babyImg.src = 'baby.png';

    // Letter metrics cache
    let cachedLetterPositions = null;
    let cachedFontSize = 0;
    window.addEventListener('resize', () => { cachedFontSize = 0; });

    function cacheLetterMetrics() {
        const W = App.W;
        const fs = Math.min(W * 0.09, App.H * 0.11);
        if (fs === cachedFontSize && cachedLetterPositions) return;
        cachedFontSize = fs;
        ctx.font = `${fs}px Nistha, Georgia, serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const letters = App.NAME_LETTERS;
        const widths = letters.map(l => ctx.measureText(l).width);
        const totalWidth = widths.reduce((a, b) => a + b, 0);
        const startX = W / 2 - totalWidth / 2;
        cachedLetterPositions = [];
        let xOff = 0;
        for (let i = 0; i < letters.length; i++) {
            cachedLetterPositions.push({ x: startX + xOff + widths[i] / 2, w: widths[i] });
            xOff += widths[i];
        }
    }

    // Two-pass glow: soft outer halo + crisp inner glow, consistent across all phases.
    // `intensity` 0–1 controls glow strength (use for fade-in/out).
    function drawGlowText(text, x, y, intensity) {
        if (intensity <= 0) return;
        const r = C.TEXT_GLOW_RADIUS * DPR;
        const gc = C.TEXT_GLOW_COLOR;
        // Outer halo
        ctx.shadowColor = `rgba(${gc}, ${0.3 * intensity})`;
        ctx.shadowBlur = r * 2;
        ctx.fillText(text, x, y);
        // Inner glow
        ctx.shadowColor = `rgba(${gc}, ${0.7 * intensity})`;
        ctx.shadowBlur = r * 0.6;
        ctx.fillText(text, x, y);
        ctx.shadowBlur = 0;
    }

    // Single-pass glow for steady-state text (hold/cycling) — half the draw calls.
    function drawGlowTextLight(text, x, y, intensity) {
        if (intensity <= 0) return;
        const r = C.TEXT_GLOW_RADIUS * DPR;
        ctx.shadowColor = `rgba(${C.TEXT_GLOW_COLOR}, ${0.5 * intensity})`;
        ctx.shadowBlur = r;
        ctx.fillText(text, x, y);
        ctx.shadowBlur = 0;
    }

    // God rays
    function drawGodRays(cx, cy, radius, intensity, time) {
        const numRays = C.NUM_RAYS;
        const rayScale = App.Supernova.getRayScale();
        const maxLen = Math.max(App.W, App.H) * C.RAY_LENGTH_PCT * rayScale;
        const breathe = 0.85 + 0.15 * Math.sin(time * 1.2);
        ctx.save();
        for (let i = 0; i < numRays; i++) {
            const angle = (i / numRays) * Math.PI * 2;
            const wobble = Math.sin(time * 0.8 + i * 1.1) * 0.04;
            const finalAngle = angle + wobble;
            const width = 0.03 + Math.sin(time * 0.6 + i * 0.7) * 0.01;
            const len = maxLen * intensity;

            const tipX = cx + Math.cos(finalAngle) * len;
            const tipY = cy + Math.sin(finalAngle) * len;

            const grad = ctx.createLinearGradient(cx, cy, tipX, tipY);
            grad.addColorStop(0, `rgba(255, 200, 80, ${intensity * C.RAY_OPACITY * breathe})`);
            grad.addColorStop(0.3, `rgba(230, 170, 50, ${intensity * C.RAY_OPACITY * 0.5 * breathe})`);
            grad.addColorStop(1, 'rgba(200, 140, 30, 0)');

            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(finalAngle - width) * radius, cy + Math.sin(finalAngle - width) * radius);
            ctx.lineTo(tipX, tipY);
            ctx.lineTo(cx + Math.cos(finalAngle + width) * radius, cy + Math.sin(finalAngle + width) * radius);
            ctx.closePath();
            ctx.fillStyle = grad;
            ctx.fill();
        }
        ctx.restore();
    }

    // State machine for reveal lifecycle
    const State = {
        IDLE: 'idle',
        REVEALING: 'revealing',
        COMPLETE: 'complete',

        phase: 'idle',
        startTime: -1,
        letterBursts: new Array(App.NAME_LETTERS.length).fill(false),
        photoBurst: false,
        extraTones: [false, false, false], // Dha, Ni, Sa'
        swaraTones: new Array(8).fill(false), // Sa Re Ga Ma Pa Dha Ni Sa'

        get isComplete() { return this.phase === this.COMPLETE; },

        enter(time, formationTime, holdAfterFormation) {
            if (this.phase === this.COMPLETE) {
                // Skip past photo delay so photo shows immediately on re-scroll
                const photoDelay = formationTime + App.Config.PHOTO_DELAY_AFTER_FORMATION;
                this.startTime = time - photoDelay - App.Config.PHOTO_FADE_DURATION;
                this.letterBursts.fill(true);
                this.extraTones = [true, true, true];
                this.photoBurst = true;
            } else {
                this.startTime = time;
                this.phase = this.REVEALING;
            }
        },

        markComplete() {
            this.phase = this.COMPLETE;
        },

        reset() {
            this.startTime = -1;
            if (!this.isComplete) {
                this.letterBursts.fill(false);
                this.extraTones = [false, false, false];
                this.swaraTones.fill(false);
                this.photoBurst = false;
                sparkles.length = 0;
                App.DualCore.reset();
                App.Audio.stopRevealSounds();
            }
        }
    };

    const sparkles = [];
    const trailPrev = new Map();
    let lastTime = Date.now();

    function draw() {
        const now = Date.now();
        const dt = Math.min(32, now - lastTime);
        App.Footer.markInactive();
        lastTime = now;

        const W = App.W, H = App.H;
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        const progress = maxScroll > 0 ? Math.min(1, Math.max(0, currentScroll / maxScroll)) : 0;
        const time = now * 0.001;

        try {

        const _t = [performance.now()];
        function _m() { _t.push(performance.now()); }

        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#050505';
        ctx.fillRect(0, 0, W, H);

        // Screen shake
        App.Supernova.applyShake(ctx);
        _m();

        const watermarkOpacity = Math.max(0, 1 - progress / 0.03);
        watermark.style.opacity = watermarkOpacity;
        const hintOpacity = State.isComplete ? 0 : Math.max(0, 1 - smoothstep(C.STRINGS_FADE[0], C.STRINGS_FADE[1], progress));
        hint.style.opacity = hintOpacity;

        App.Audio.update(progress);

        // Progress phases
        const stringAppear = smoothstep(C.STRING_APPEAR[0], C.STRING_APPEAR[1], progress);
        const vibration = smoothstep(C.VIBRATION[0], C.VIBRATION[1], progress);
        const intensity = vibration * vibration;
        const orbForm = smoothstep(C.ORB_FORM[0], C.ORB_FORM[1], progress);
        const orbGrow = smoothstep(C.ORB_GROW[0], C.ORB_GROW[1], progress);
        const stringsFade = smoothstep(C.STRINGS_FADE[0], C.STRINGS_FADE[1], progress);
        const rayIntensity = smoothstep(C.RAY_INTENSITY[0], C.RAY_INTENSITY[1], progress);
        const revealProgress = smoothstep(C.REVEAL[0], C.REVEAL[1], progress);

        // Orb properties
        const cx = W / 2;
        const cy = H * (0.5 - orbGrow * C.ORB_VERTICAL_SHIFT);
        const orbMinRadius = C.ORB_MIN_RADIUS_PX * DPR;
        const orbMaxRadius = Math.min(W * C.ORB_MAX_RADIUS_PCT, H * C.ORB_MAX_RADIUS_PCT);
        const orbRadius = orbMinRadius + (orbMaxRadius - orbMinRadius) * easeOutQuint(orbGrow);

        // Orb pulse (computed early so god rays can use the pulsed radius)
        const pulse = 1 + Math.sin(time * C.ORB_PULSE_SPEED_1) * C.ORB_PULSE_AMP_1 + Math.sin(time * C.ORB_PULSE_SPEED_2) * C.ORB_PULSE_AMP_2;

        // Supernova compression (must be computed before orbScale)
        const supernovaCompression = App.Supernova.computeCompression(time, State, revealProgress, C.LETTER_DURATION, C.PHOTO_DELAY_AFTER_FORMATION);
        if (supernovaCompression > 0.01) {
            App.Audio.startCompression();
            App.Audio.updateCompression(supernovaCompression);
        }
        const orbScale = App.Supernova.getOrbScale();
        const orbPulsedRadius = orbRadius * pulse * orbScale;

        // God Rays
        App.Supernova.updateRays();
        const effectiveRayIntensity = App.Supernova.getRayIntensity(rayIntensity);
        if (effectiveRayIntensity > 0) drawGodRays(cx, cy, orbPulsedRadius, effectiveRayIntensity, time);
        _m();

        // Strings
        const spacing = W / (C.NUM_STRINGS + 1);
        App.Strings.decayPlucks();
        App.WaveModels.update(time);

        for (let s = 0; s < C.NUM_STRINGS; s++) {
            const baseX = spacing * (s + 1);
            const freq = App.STRING_FREQS[s];
            const phase = App.STRING_PHASES[s];
            const color = App.STRING_COLORS[s];

            const amplitude = vibration * (C.STRING_AMPLITUDE_BASE + s * C.STRING_AMPLITUDE_STEP) * DPR * (1 - stringsFade * 0.6);
            const alpha = stringAppear * (0.4 + intensity * 0.4) * (1 - stringsFade);

            if (alpha <= 0.03) continue;

            const actualBaseX = App.Strings.draw(ctx, s, baseX, freq, phase, time, amplitude, alpha, orbGrow, stringsFade, cx, W, H);

            // Spawn particles from strings
            const envelope_max = vibration;
            const spawnIntensity = vibration * envelope_max * C.STRING_SPAWN_CHANCE;
            if (vibration > 0.1 && alpha > 0.05 && Math.random() < spawnIntensity) {
                const spawnT = 0.2 + Math.random() * 0.6;
                const spawnDisplacement = App.WaveModels.getDisplacement(s, spawnT, time, amplitude, freq, phase);
                const spawnX = actualBaseX + spawnDisplacement;
                const spawnY = spawnT * H;
                const spawnEnvelope = Math.sin(spawnT * Math.PI);
                const ejectSpeed = (0.5 + vibration * 2) * spawnEnvelope * DPR;
                const ejectDir = spawnDisplacement > 0 ? 1 : -1;
                const vx = ejectDir * ejectSpeed * (0.8 + Math.random() * 0.4);
                const vy = (Math.random() - 0.5) * ejectSpeed * 0.3;
                App.Particles.spawn(spawnX, spawnY, vx, vy, color);
            }

            App.Strings.checkInteraction(s, actualBaseX, freq, s, time, phase, amplitude, alpha, color);
        }

        if (C.SHOW_PERF_HUD) App.Strings.drawProfileBar(ctx, W, H);

        // TODO: Replace scattered timing constants with a phase-timeline abstraction
        // so formation, convergence, burst, and cycling don't drift out of sync.
        const fontSize = Math.min(W * 0.09, H * 0.11);
        const belowY = cy + orbMaxRadius + fontSize * 0.8;
        const letters = App.NAME_LETTERS;
        const letterDuration = C.LETTER_DURATION;
        const formationTime = letters.length * letterDuration;
        cacheLetterMetrics();

        // Letter convergence (used by both target and drawing)
        const convergence = supernovaCompression * supernovaCompression * supernovaCompression;
        const spreadX = 1 + (1 - convergence) * 0.6;
        const offsetY = (1 - convergence) * fontSize * 0.8;
        const revealElapsed = State.startTime > 0 ? time - State.startTime : 0;

        // Letter formation target
        let letterTarget = null;
        let letterSwarmPhase = 0;
        if (revealProgress > 0 && revealElapsed > 0 && cachedLetterPositions) {
            if (revealElapsed < formationTime) {
                const activeIndex = Math.min(letters.length - 1, Math.floor(revealElapsed / letterDuration));
                const spreadLetterX = cx + (cachedLetterPositions[activeIndex].x - cx) * spreadX;
                letterTarget = { x: spreadLetterX, y: belowY + offsetY };
                letterSwarmPhase = Math.min(1, (revealElapsed - activeIndex * letterDuration) / (letterDuration * 0.6));
            }
        }

        // Ambient particles
        const orbPull = orbGrow * orbGrow;
        if (stringsFade > 0.5 && orbGrow > 0.3 && Math.random() < C.AMBIENT_SPAWN_CHANCE + orbGrow * C.AMBIENT_SPAWN_GROW) {
            const angle = Math.random() * Math.PI * 2;
            const spawnDist = orbRadius * (C.AMBIENT_SPAWN_DIST_MIN + Math.random() * (C.AMBIENT_SPAWN_DIST_MAX - C.AMBIENT_SPAWN_DIST_MIN));
            App.Particles.spawn(cx + Math.cos(angle) * spawnDist, cy + Math.sin(angle) * spawnDist, 0, 0, App.randomColor());
        }

        // Inward vortex during supernova compression
        App.Supernova.spawnVortex(cx, cy, orbMaxRadius);

        // Pointer trail particles (unlocked after reveal)
        if (State.isComplete) {
            for (const [id, ptr] of App.Input.pointers) {
                const prev = trailPrev.get(id) || { x: ptr.x, y: ptr.y };
                const dx = ptr.x - prev.x;
                const dy = ptr.y - prev.y;
                const speed = Math.sqrt(dx * dx + dy * dy);
                if (speed > 2 * DPR && Math.random() < 0.6) {
                    const spread = (Math.random() - 0.5) * Math.PI * 0.6;
                    const drift = 0.3 + Math.random() * 0.5;
                    const trailVx = Math.cos(spread) * drift * DPR * (Math.random() - 0.5);
                    const trailVy = -drift * DPR * (0.5 + Math.random() * 0.5);
                    const color = App.randomColor();
                    const trailSize = C.POINTER_TRAIL_SIZE_MIN + Math.random() * (C.POINTER_TRAIL_SIZE_MAX - C.POINTER_TRAIL_SIZE_MIN);
                    App.Particles.spawn(
                        ptr.x + (Math.random() - 0.5) * 4 * DPR,
                        ptr.y + (Math.random() - 0.5) * 4 * DPR,
                        trailVx, trailVy, color, trailSize
                    );
                }
                trailPrev.set(id, { x: ptr.x, y: ptr.y });
            }
            // Clean up stale entries
            for (const id of trailPrev.keys()) {
                if (!App.Input.pointers.has(id)) trailPrev.delete(id);
            }
        }

        // Update + draw particles
        const effectivePull = State.isComplete ? -0.3 : orbGrow;
        App.Particles.update(dt, time, cx, cy, orbPulsedRadius, orbMaxRadius, effectivePull, orbPull, letterTarget, letterSwarmPhase, intensity);
        App.Particles.draw(ctx, time, intensity);
        _m();

        // Orb
        if (orbForm > 0) {
            const r = orbPulsedRadius;
            const orbAlpha = orbForm * (1 - revealProgress * 0.5);
            const breathe = 0.7 + 0.3 * Math.sin(time * 1.2);
            const atmoRadius = r * (2.5 + Math.sin(time * 0.8) * 0.4);

            // Stellar compression: gold → yellow-white → blue-white, increasing brightness
            const heat = App.Supernova.getHeat();
            const coreR = Math.round(255 - heat * 60);
            const coreG = Math.round(240 - heat * 20);
            const coreB = Math.round(200 + heat * 55);
            const brightnessMult = 1 + heat * 2;

            const atmoGrad = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, atmoRadius);
            atmoGrad.addColorStop(0, `rgba(${coreR}, ${coreG}, ${coreB}, ${Math.min(1, orbAlpha * (0.25 + heat * 0.6) * breathe * brightnessMult)})`);
            atmoGrad.addColorStop(0.5, `rgba(${Math.round(200 - heat * 50)}, ${Math.round(150 + heat * 50)}, ${Math.round(50 + heat * 180)}, ${orbAlpha * (0.08 + heat * 0.15) * breathe})`);
            atmoGrad.addColorStop(1, `rgba(${Math.round(200 - heat * 80)}, ${Math.round(120 + heat * 60)}, ${Math.round(30 + heat * 200)}, 0)`);
            ctx.beginPath(); ctx.arc(cx, cy, atmoRadius, 0, Math.PI * 2); ctx.fillStyle = atmoGrad; ctx.fill();

            const discGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
            discGrad.addColorStop(0, `rgba(${coreR}, ${coreG}, ${coreB}, ${Math.min(1, orbAlpha * 0.95 * brightnessMult)})`);
            discGrad.addColorStop(0.6, `rgba(${Math.round(220 - heat * 40)}, ${Math.round(200 + heat * 20)}, ${Math.round(100 + heat * 120)}, ${Math.min(1, orbAlpha * 0.7 * brightnessMult)})`);
            discGrad.addColorStop(1, `rgba(${Math.round(200 - heat * 50)}, ${Math.round(160 + heat * 40)}, ${Math.round(60 + heat * 160)}, ${orbAlpha * 0.3})`);
            ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = discGrad; ctx.fill();

            // Dual-core: pre-burst orbiting inside the orb
            if (!State.photoBurst) {
                App.DualCore.draw(ctx, cx, cy, r, orbAlpha, time, App.Supernova.compression, false, 0, null);
            }

            if (orbGrow > 0.3) {
                const ringAlpha = easeOutQuint((orbGrow - 0.3) / 0.7) * (1 - revealProgress * 0.3);
                ctx.beginPath(); ctx.arc(cx, cy, r + 1 * DPR, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(255, 220, 150, ${ringAlpha * 0.4})`; ctx.lineWidth = 2 * DPR; ctx.stroke();
            }
        }

        // Space-time ripples during compression
        App.Supernova.renderRipples(ctx, cx, cy, orbMaxRadius, time);
        _m();

        // Dual-core: post-burst flight to footer names (rendered outside orb block)
        if (State.photoBurst) {
            const footerTargets = App.Footer.getTargets(fontSize, cx, H);
            const coreAlpha = Math.min(1, orbForm * 3);
            App.DualCore.draw(ctx, cx, cy, orbPulsedRadius, coreAlpha, time, 0, true, revealProgress > 0, footerTargets);
        }
        _m();

        // Reveal
        const footerWasComplete = App.Footer.isComplete();
        if (revealProgress <= 0) { State.reset(); }
        if (revealProgress > 0) {
            if (State.startTime < 0) {
                State.enter(time, formationTime, C.HOLD_AFTER_FORMATION);
            }
            const _r = [performance.now()];
            const textP = easeOutQuint(Math.min(1, revealProgress / 0.5));
            const photoDelay = formationTime + C.PHOTO_DELAY_AFTER_FORMATION;
            const photoP = revealElapsed > photoDelay ? easeOutQuint(Math.min(1, (revealElapsed - photoDelay) / C.PHOTO_FADE_DURATION)) : 0;
            const glowPulse = 0.85 + 0.15 * Math.sin(time * 1.5);

            // "Meet"
            const meetSize = fontSize * 0.35;
            ctx.font = `200 ${meetSize}px -apple-system, "SF Pro Display", "Helvetica Neue", sans-serif`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = `rgba(255, 240, 210, ${textP * C.MEET_OPACITY})`;
            drawGlowText('Meet', cx, cy - orbMaxRadius - meetSize * 1.2, textP * 0.6);
            _r.push(performance.now());

            const holdAfterFormation = C.HOLD_AFTER_FORMATION;
            const letterPositions = cachedLetterPositions;

            // Timed swara sequence: Sa Re Ga Ma Pa Dha Ni Sa' spread across formation
            if (revealElapsed > 0 && revealElapsed < formationTime) {
                const swaraInterval = formationTime / 8;
                const swaraIdx = Math.floor(revealElapsed / swaraInterval);
                if (swaraIdx < 8 && !State.swaraTones[swaraIdx]) {
                    State.swaraTones[swaraIdx] = true;
                    App.Audio.playLetterChime(swaraIdx);
                }
            }

            if (revealElapsed < formationTime && letterPositions) {
                const activeIndex = Math.min(letters.length - 1, Math.floor(revealElapsed / letterDuration));
                const letterProgress = (revealElapsed - activeIndex * letterDuration) / letterDuration;
                const targetX = cx + (letterPositions[activeIndex].x - cx) * spreadX;
                const targetY = belowY + offsetY;

                ctx.font = `${fontSize}px Nistha, Georgia, serif`;
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillStyle = `rgba(255, 248, 230, ${textP})`;
                for (let i = 0; i < activeIndex; i++) {
                    const lx = cx + (letterPositions[i].x - cx) * spreadX;
                    drawGlowText(letters[i], lx, belowY + offsetY, textP);
                }

                const swarmPhase = Math.min(1, letterProgress / 0.6);
                const materializePhase = Math.max(0, (letterProgress - 0.4) / 0.6);

                if (Math.random() < C.LETTER_SWARM_SPAWN_CHANCE && textP > 0.2 && App.Particles.aliveCount < C.LETTER_SWARM_ALIVE_CAP) {
                    const angle = Math.random() * Math.PI * 2;
                    const dist = fontSize * (C.LETTER_SPAWN_DIST_MIN + Math.random() * (C.LETTER_SPAWN_DIST_MAX - C.LETTER_SPAWN_DIST_MIN));
                    const sx = targetX + Math.cos(angle) * dist;
                    const sy = targetY + Math.sin(angle) * dist;
                    const speed = 0.015 + swarmPhase * 0.02;
                    App.Particles.spawn(sx, sy, (targetX - sx) * speed, (targetY - sy) * speed, App.randomColor());
                }

                if (materializePhase > 0) {
                    const mAlpha = textP * easeOutQuint(materializePhase);
                    ctx.fillStyle = `rgba(255, 248, 230, ${mAlpha})`;
                    drawGlowText(letters[activeIndex], targetX, belowY + offsetY, mAlpha);

                    if (materializePhase > 0.5 && !State.letterBursts[activeIndex]) {
                        State.letterBursts[activeIndex] = true;
                        for (let sp = 0; sp < 30; sp++) {
                            const a = (sp / 30) * Math.PI * 2 + Math.random() * 0.4;
                            const spd = 3 + Math.random() * 5;
                            sparkles.push({ x: targetX, y: belowY + offsetY, vx: Math.cos(a) * spd * DPR, vy: Math.sin(a) * spd * DPR, life: 1.0, size: (2.5 + Math.random() * 3) * DPR });
                        }
                    }
                }
            }

            // Sparkles
            _r.push(performance.now());
            for (let si = sparkles.length - 1; si >= 0; si--) {
                const sp = sparkles[si];
                sp.life -= C.SPARKLE_DECAY;
                if (sp.life <= 0) { sparkles.splice(si, 1); continue; }
                sp.x += sp.vx; sp.y += sp.vy; sp.vx *= 0.96; sp.vy *= 0.96;
                ctx.beginPath(); ctx.arc(sp.x, sp.y, sp.size * sp.life, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255, 240, 200, ${sp.life * sp.life * 0.9})`; ctx.fill();
            }
            _r.push(performance.now());

            if (revealElapsed >= formationTime && !State.photoBurst && letterPositions) {
                ctx.font = `${fontSize}px Nistha, Georgia, serif`;
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillStyle = `rgba(255, 248, 230, ${textP})`;
                for (let i = 0; i < letters.length; i++) {
                    const lx = cx + (letterPositions[i].x - cx) * spreadX;
                    drawGlowText(letters[i], lx, belowY + offsetY, textP * glowPulse);
                }
            } else if (State.photoBurst) {
                const fonts = C.CYCLE_FONTS;
                const holdDuration = C.FONT_HOLD_DURATION;
                const transitionDuration = C.FONT_TRANSITION_DURATION;
                const segmentDuration = holdDuration + transitionDuration;
                const totalCycle = segmentDuration * fonts.length;
                const cycleElapsed = Math.max(0, revealElapsed - formationTime - C.PHOTO_DELAY_AFTER_FORMATION) + fontCycleOffset;
                const cycleT = cycleElapsed % totalCycle;
                const segIndex = Math.floor(cycleT / segmentDuration);
                const segT = cycleT - segIndex * segmentDuration;
                const currFont = fonts[segIndex];
                const nextFont = fonts[(segIndex + 1) % fonts.length];

                function setFont(f, sizeMult) {
                    ctx.font = `${f.weight}${fontSize * f.scale * sizeMult}px ${f.family}`;
                }

                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                if (segT < holdDuration) {
                    setFont(currFont, 1);
                    ctx.fillStyle = `rgba(255, 248, 230, ${textP})`;
                    drawGlowText(currFont.text, cx, belowY + currFont.y * DPR, textP * glowPulse);
                } else {
                    const p = (segT - holdDuration) / transitionDuration;
                    // Outgoing: smooth scale-up + fade
                    if (p < 0.45) {
                        const outP = p / 0.45;
                        const fade = 1 - outP * outP;
                        setFont(currFont, 1 + outP * (C.FONT_SCALE_OUT_MAX - 1));
                        ctx.fillStyle = `rgba(255, 248, 230, ${textP * fade})`;
                        drawGlowText(currFont.text, cx, belowY + currFont.y * DPR, textP * fade);
                    }
                    // Incoming: grows in after a brief gap
                    const inP = Math.max(0, (p - 0.5) / 0.5);
                    if (inP > 0) {
                        const eased = inP * inP * (3 - 2 * inP);
                        setFont(nextFont, eased);
                        ctx.fillStyle = `rgba(255, 248, 230, ${textP * eased})`;
                        drawGlowText(nextFont.text, cx, belowY + nextFont.y * DPR, textP * eased);
                    }
                }
            }
            _r.push(performance.now());

            // Photo
            const _rp = performance.now();
            if (photoP > 0 && babyImg.complete) {
                if (!State.photoBurst) {
                    State.photoBurst = true;
                    State.markComplete();
                    App.Audio.stopCompression();
                    App.Audio.playBurst();
                    App.Audio.playSingingBowl();
                    App.Audio.startMelody();
                    App.Supernova.trigger(cx, cy, orbMaxRadius, sparkles);
                }
                ctx.globalAlpha = photoP * textP;
                const photo = App.Cache.circularPhoto(babyImg, orbMaxRadius);
                ctx.drawImage(photo, cx - orbMaxRadius, cy - orbMaxRadius);
                ctx.globalAlpha = 1;

                // Soft ambient glow around the photo
                const glowR = orbMaxRadius * 1.6;
                const photoGlow = ctx.createRadialGradient(cx, cy, orbMaxRadius * 0.8, cx, cy, glowR);
                photoGlow.addColorStop(0, `rgba(255, 200, 100, ${photoP * 0.08})`);
                photoGlow.addColorStop(0.5, `rgba(255, 180, 80, ${photoP * 0.04})`);
                photoGlow.addColorStop(1, 'rgba(255, 150, 50, 0)');
                ctx.beginPath(); ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
                ctx.fillStyle = photoGlow; ctx.fill();
            }
            const _rd = performance.now();

            // Birth date — revealed by the cores as they pass through
            if (photoP >= 1) {
                const dateSize = fontSize * 0.22;
                const dateY = belowY + fontSize * 0.7;
                const coreProgress = App.DualCore.getFlightProgress();
                const dateP = easeOutQuint(Math.min(1, Math.max(0, (coreProgress - 0.25) / 0.3)));
                if (dateP > 0) {
                    ctx.font = `200 ${dateSize}px -apple-system, "SF Pro Display", "Helvetica Neue", sans-serif`;
                    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillStyle = `rgba(255, 240, 210, ${textP * dateP * 0.5})`;
                    ctx.fillText(C.BIRTH_DATE, cx, dateY);
                }
            }

            // Footer
            if (!App.Footer.isComplete() && (photoP >= 1 || App.Footer.isPrimaryDone())) {
                App.Footer.draw(ctx, time, textP, fontSize, cx, H);
            }
            const _re = performance.now();
            _r.push(_re);

            // Reveal sub-timing HUD
            if (C.SHOW_PERF_HUD) {
                const rLabels = ['meet', 'formation', 'sparkles', 'hold/cycle', 'photo', 'footer'];
                const rTimes = [_r[1]-_r[0], _r[2]-_r[1], _r[3]-_r[2], _r[4]-_r[3], _rd-_rp, _re-_rd];
                const rY = 120 * DPR;
                ctx.font = `${10 * DPR}px monospace`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
                for (let ri = 0; ri < rLabels.length; ri++) {
                    const ms = rTimes[ri];
                    ctx.fillStyle = ms > 0.3 ? '#f84' : '#8a8';
                    ctx.fillText(`${rLabels[ri]}: ${ms.toFixed(2)}ms`, 8 * DPR, rY + ri * 12 * DPR);
                }
            }
        }

        // Footer: persistent once fully revealed (skip if reveal-block already drew it)
        if (App.Footer.isComplete() && (footerWasComplete || !(revealProgress > 0))) {
            App.Footer.draw(ctx, time, 1, fontSize, cx, H);
        }

        // Sparkles (outside reveal — handles tap bursts when scrolled away)
        if (State.isComplete && !(revealProgress > 0) && sparkles.length > 0) {
            for (let si = sparkles.length - 1; si >= 0; si--) {
                const sp = sparkles[si];
                sp.life -= C.SPARKLE_DECAY;
                if (sp.life <= 0) { sparkles.splice(si, 1); continue; }
                sp.x += sp.vx; sp.y += sp.vy; sp.vx *= 0.96; sp.vy *= 0.96;
                ctx.beginPath(); ctx.arc(sp.x, sp.y, sp.size * sp.life, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255, 240, 200, ${sp.life * sp.life * 0.9})`; ctx.fill();
            }
        }

        // Supernova flash + shockwave ring
        App.Supernova.renderEffects(ctx, cx, cy, W, H);

        _m();
        if (C.SHOW_PERF_HUD) {
            const sections = ['clear', 'rays+str', 'particles', 'orb', 'dualcore', 'reveal'];
            const times = []; for (let i = 1; i < _t.length; i++) times.push(_t[i] - _t[i-1]);
            const total = _t[_t.length - 1] - _t[0];
            const fps = 1000 / Math.max(1, dt);
            if (!window._perfHistory) window._perfHistory = { totals: [], sections: [] };
            window._perfHistory.totals.push(total); window._perfHistory.sections.push(times);
            if (window._perfHistory.totals.length > 60) { window._perfHistory.totals.shift(); window._perfHistory.sections.shift(); }
            const avgTotal = window._perfHistory.totals.reduce((a,b) => a+b, 0) / window._perfHistory.totals.length;
            const avgSections = sections.map((_, idx) => { let sum = 0, count = 0; window._perfHistory.sections.forEach(s => { if (s[idx] !== undefined) { sum += s[idx]; count++; } }); return count > 0 ? sum / count : 0; });
            let worstIdx = 0; avgSections.forEach((v, i) => { if (v > avgSections[worstIdx]) worstIdx = i; });
            ctx.font = `${11 * DPR}px monospace`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
            ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, 0, 320 * DPR, 85 * DPR);
            ctx.fillStyle = fps > 50 ? '#4a4' : fps > 30 ? '#aa4' : '#a44';
            ctx.fillText(`FPS: ${fps.toFixed(0)}  Frame: ${total.toFixed(1)}ms  Avg: ${avgTotal.toFixed(1)}ms  Particles: ${App.Particles.aliveCount}`, 8 * DPR, 6 * DPR);
            let y = 22 * DPR;
            sections.forEach((name, i) => { const ms = avgSections[i] || 0; const bar = Math.min(200, ms * 20); const isW = i === worstIdx && ms > 1; ctx.fillStyle = isW ? '#f84' : '#8a8'; ctx.fillRect(8 * DPR, y, bar * DPR, 9 * DPR); ctx.fillStyle = isW ? '#fca' : '#cec'; ctx.fillText(`${name}: ${ms.toFixed(1)}ms`, (bar + 12) * DPR + 8 * DPR, y - 1); y += 12 * DPR; });
        }

        ctx.setTransform(1, 0, 0, 1, 0, 0);

        } catch(e) {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            window._showError('Draw error: ' + e.message, e.stack);
        }
        requestAnimationFrame(draw);
    }

    requestAnimationFrame(draw);
})();
