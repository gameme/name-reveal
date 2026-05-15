window.App = window.App || {};

(function() {
    const C = App.Config;
    const { easeOutQuint, smoothstep } = App;

    const canvas = document.getElementById('tanpura');
    const ctx = canvas.getContext('2d');
    const hint = document.querySelector('.scroll-hint');
    const watermark = document.querySelector('.watermark');

    // Low-res offscreen canvas for bloom (1/4 resolution — 16× less fill)
    const bloomCanvas = document.createElement('canvas');
    const bloomCtx = bloomCanvas.getContext('2d');
    const BLOOM_SCALE = 0.25;
    function resizeBloomCanvas() {
        bloomCanvas.width = Math.ceil(App.W * BLOOM_SCALE);
        bloomCanvas.height = Math.ceil(App.H * BLOOM_SCALE);
    }
    const muteBtn = document.getElementById('muteBtn');
    const DPR = App.DPR;

    function resize() {
        const newW = window.innerWidth * DPR;
        const vvH = window.visualViewport ? window.visualViewport.height : window.innerHeight;
        const newH = vvH * DPR;

        App.W = canvas.width = newW;
        canvas.height = newH;
        canvas.style.width = window.innerWidth + 'px';
        canvas.style.height = vvH + 'px';

        App.H = newH;
        resizeBloomCanvas();
    }
    resize();
    window.addEventListener('resize', resize);
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', resize);
    }

    // Init subsystems
    App.Audio.preload();
    App.Strings.init();
    App.WaveModels.init();
    App.Particles.init();
    App.Input.bindEvents(canvas);

    // Selectable HUD overlay for LAN URL
    const debugHud = document.getElementById('debugHud');
    if (C.DEBUG && debugHud) {
        debugHud.style.display = 'block';
        function updateHudUrl() {
            debugHud.textContent = window._lanUrl || 'resolving...';
        }
        updateHudUrl();
        var hudInterval = setInterval(function() {
            if (window._lanUrl) { updateHudUrl(); clearInterval(hudInterval); }
        }, 500);
    }

    // Scroll tracking
    let currentScroll = 0;
    let _lastLoggedProgress = -1;
    let _touchCount = 0;
    let _scrollCount = 0;
    let _lastCorrelationCheck = 0;
    function onScroll() {
        currentScroll = window.scrollY || window.pageYOffset || document.documentElement.scrollTop;
        _scrollCount++;
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // Log scroll progress at key thresholds
    function logScrollProgress(progress) {
        const bucket = Math.round(progress * 20) / 20;
        if (bucket !== _lastLoggedProgress && bucket > 0) {
            _lastLoggedProgress = bucket;
            App.dbg('SCROLL: progress=' + progress.toFixed(3) + ' scroll=' + currentScroll + '/' + (document.documentElement.scrollHeight - window.innerHeight));
        }
        // Check touch vs scroll correlation every 3 seconds
        const now = Date.now();
        if (now - _lastCorrelationCheck > 3000 && _touchCount > 0) {
            if (_touchCount > 10 && _scrollCount === 0 && progress < 0.98 && progress > 0.01) {
                App.dbgw('SCROLL_STUCK: ' + _touchCount + ' touch events but 0 scroll events in last 3s, scroll=' + currentScroll + ' maxScroll=' + (document.documentElement.scrollHeight - window.innerHeight) + ' progress=' + progress.toFixed(3));
            }
            _touchCount = 0;
            _scrollCount = 0;
            _lastCorrelationCheck = now;
        }
    }

    // Track vertical touch movement for scroll correlation
    let _lastTouchY = 0;
    document.addEventListener('touchstart', function(e) { _lastTouchY = e.touches[0].clientY; }, { passive: true });
    document.addEventListener('touchmove', function(e) {
        if (Math.abs(e.touches[0].clientY - _lastTouchY) > 10) _touchCount++;
    }, { passive: true });

    // --- Idle scroll hint: tiered escalation ---
    let _lastScrollTime = 0;
    let _hintGlow = 0;
    const _breadcrumbs = [];
    const HINT_TIER1_DELAY = 5;
    const HINT_TIER2_DELAY = 10;
    const HINT_TIER3_DELAY = 15;
    const BREADCRUMB_CAP = 30;

    function getHintTargetY() { return App.H * 0.88; }
    // Reset idle timer on any scroll
    window.addEventListener('scroll', function() {
        _lastScrollTime = Date.now();
        if (_hintGlow > 0) {
            _hintGlow = 0;
            hint.style.filter = '';
            hint.style.textShadow = '';
        }
    }, { passive: true });

    function updateIdleHint(progress, cx, cy, hintVisible) {
        if (State.isComplete || _experienceStartTime === 0 || !hintVisible) return;

        const W = App.W, H = App.H;
        const idleSec = (Date.now() - Math.max(_experienceStartTime, _lastScrollTime)) / 1000;

        // Tier 1 (5s): hint brightens
        if (idleSec > HINT_TIER1_DELAY) {
            const t1 = Math.min(1, (idleSec - HINT_TIER1_DELAY) / 3);
            _hintGlow = t1;
            hint.style.filter = `brightness(${1 + t1 * 0.8})`;
        } else {
            _hintGlow = 0;
            hint.style.filter = '';
        }

        // Tier 2 (10s): warm glow aura
        if (idleSec > HINT_TIER2_DELAY) {
            const t2 = Math.min(1, (idleSec - HINT_TIER2_DELAY) / 3);
            hint.style.textShadow = `0 0 ${8 + t2 * 12}px rgba(255, 200, 100, ${t2 * 0.6})`;
        } else {
            hint.style.textShadow = '';
        }

        // Arrow position (center-bottom of viewport, matching CSS .scroll-hint bottom:40px)
        const arrowX = cx;
        const arrowY = H - 40 * DPR;

        // Tier 3 (15s): spawn scattered notes in bottom region
        // Tier 3 (15s): spawn scattered notes in bottom region
        // Urgency increases with idle time — faster and denser
        const urgency = Math.min(1, (idleSec - HINT_TIER3_DELAY) / 20);
        if (idleSec > HINT_TIER3_DELAY && _breadcrumbs.length < BREADCRUMB_CAP) {
            const density = 0.1 + urgency * 0.2;
            if (Math.random() < density) {
                _breadcrumbs.push({
                    x: (0.1 + Math.random() * 0.8) * W,
                    y: (0.65 + Math.random() * 0.2) * H,
                    vx: 0,
                    vy: 0,
                    life: 1.0,
                    age: 0,
                    size: C.PARTICLE_SIZE_MIN + Math.random() * (C.PARTICLE_SIZE_MAX - C.PARTICLE_SIZE_MIN),
                    colorIdx: Math.floor(Math.random() * App.STRING_COLORS.length),
                    noteIdx: Math.floor(Math.random() * App.NOTE_SYMBOLS.length),
                    rotation: Math.floor(Math.random() * App.Particles.SPRITE_ROTATIONS.length),
                    seed: Math.random() * 100,
                });
            }
        }

        // Physics + draw
        const CELL = App.Particles.SPRITE_CELL;
        const ROTS = App.Particles.SPRITE_ROTATIONS;
        const SIZES = App.Particles.SPRITE_SIZES;

        for (let i = _breadcrumbs.length - 1; i >= 0; i--) {
            const b = _breadcrumbs[i];
            b.age += 0.016;

            // --- Forces (scale with urgency) ---
            // 1. Gravity: pull toward arrow Y
            const gravityPull = (0.02 + urgency * 0.04) * DPR;
            b.vy += gravityPull;

            // 2. Funnel: horizontal pull toward arrow X, stronger near arrow
            const proximity = Math.max(0, 1 - Math.abs(arrowY - b.y) / (H * 0.4));
            const funnelStrength = proximity * proximity * (0.04 + urgency * 0.06) * DPR;
            const dx = arrowX - b.x;
            b.vx += Math.sign(dx) * Math.min(Math.abs(dx) * 0.002, funnelStrength);

            // Damping
            b.vx *= 0.97;
            b.vy *= 0.98;

            // Ambient drift (before pull dominates)
            b.x += b.vx + Math.sin(b.seed + b.age * 1.5) * 0.2 * DPR * (1 - proximity);
            b.y += b.vy;

            // Fade out below arrow
            if (b.y > arrowY) {
                b.life -= 0.04;
            }

            if (b.life <= 0 || b.y > H) {
                _breadcrumbs.splice(i, 1);
                continue;
            }

            // Draw as note sprite — matching main particle pipeline
            const fadeIn = Math.min(1, b.age / 0.6);
            const twinkle = 1.0 + 0.4 * Math.sin(b.seed * 3 + b.age * 4);
            const baseAlpha = b.life * fadeIn * 0.65;
            const drawAlpha = Math.min(1, baseAlpha * twinkle);
            const size = b.size * DPR;
            const noteSize = size * C.NOTE_DRAW_SCALE;
            const drawSz = noteSize * 2;
            if (drawSz < 2 || drawAlpha < 0.01) continue;

            const row = App.Particles.getSpriteRow(noteSize);
            const srcX = (b.noteIdx * ROTS.length + b.rotation) * CELL;
            const srcY = (b.colorIdx * SIZES.length + row) * CELL;

            ctx.globalAlpha = drawAlpha * 0.9;
            ctx.drawImage(App.Particles.spriteSheet, srcX, srcY, CELL, CELL, b.x - drawSz / 2, b.y - drawSz / 2, drawSz, drawSz);
            ctx.globalAlpha = 1;
        }
    }

    // Scroll reaction for breadcrumbs
    let _prevScroll = 0;
    window.addEventListener('scroll', function() {
        if (_breadcrumbs.length === 0) return;
        const scrollDelta = currentScroll - _prevScroll;
        _prevScroll = currentScroll;

        if (scrollDelta > 0) {
            // Scroll DOWN: job done — fade out gracefully
            for (const b of _breadcrumbs) {
                b.life -= 0.1;
            }
        } else if (scrollDelta < 0) {
            // Scroll UP: scatter outward from arrow
            const arrowX = App.W / 2;
            for (const b of _breadcrumbs) {
                const away = b.x - arrowX;
                b.vx += Math.sign(away) * 3 * DPR;
                b.vy -= 2 * DPR;
                b.life -= 0.06;
            }
        }
    }, { passive: true });

    // Audio + experience gated by start overlay tap
    const startOverlay = document.getElementById('startOverlay');
    let _experienceStartTime = 0;
    if (startOverlay) {
        startOverlay.addEventListener('click', function() {
            App.dbg('MILESTONE: user tapped start overlay — initializing audio');
            App.Audio.init(muteBtn);
            window.scrollTo(0, 0);
            document.body.style.overflowY = 'auto';
            document.body.style.overflowX = 'hidden';
            startOverlay.classList.add('dismiss');
            _experienceStartTime = Date.now();
            setTimeout(function() { startOverlay.remove(); }, 2000);
        }, { once: true });
    }

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
        const fs = App.baseFont(W, H);
        const orbMax = Math.min(W * C.ORB_MAX_RADIUS_PCT, H * C.ORB_MAX_RADIUS_PCT);
        const nameY = H * (0.5 - C.ORB_VERTICAL_SHIFT) + orbMax + fs * C.NAME_OFFSET_Y;
        if (Math.abs(x - W / 2) < fs * 2.5 && Math.abs(y - nameY) < fs * 0.8) {
            const segDur = C.FONT_HOLD_DURATION + C.FONT_TRANSITION_DURATION;
            const totalCycle = segDur * C.CYCLE_FONTS.length;
            const revElapsed = State.startTime > 0 ? _scaledTime - State.startTime : 0;
            const formTime = App.NAME_LETTERS.length * C.LETTER_DURATION;
            const raw = Math.max(0, revElapsed - formTime - C.PHOTO_DELAY_AFTER_FORMATION) + fontCycleOffset;
            const cycleT = raw % totalCycle;
            const segT = cycleT % segDur;
            // Jump to transition start so the scale-out/scale-in animation plays
            if (segT < C.FONT_HOLD_DURATION) {
                fontCycleOffset += C.FONT_HOLD_DURATION - segT;
            } else {
                fontCycleOffset += segDur - segT + C.FONT_HOLD_DURATION;
            }
        }

        const count = C.TAP_BURST_COUNT_MIN + Math.floor(Math.random() * C.TAP_BURST_COUNT_RANGE);
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2 + Math.random() * C.TAP_BURST_ANGLE_JITTER;
            const speed = (C.TAP_BURST_SPEED_MIN + Math.random() * C.TAP_BURST_SPEED_RANGE) * DPR;
            App.Particles.spawn(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, App.randomColor());
        }
    });
    babyImg.src = 'baby.png';

    // Letter metrics cache
    let cachedLetterPositions = null;
    let cachedFontSize = 0;
    window.addEventListener('resize', () => { cachedFontSize = 0; });

    function cacheLetterMetrics() {
        const W = App.W;
        const fs = App.baseFont(W, App.H);
        if (fs === cachedFontSize && cachedLetterPositions) return;
        cachedFontSize = fs;
        ctx.font = `${fs * C.FONT_HERO}px Nistha, Georgia, serif`;
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
    const PHASE = { IDLE: 0, REVEALING: 1, COMPLETE: 2 };
    const PHASE_NAME = ['idle', 'revealing', 'complete'];

    const State = {
        phase: PHASE.IDLE,
        startTime: -1,
        lastBurstIndex: -1,
        lastSwaraIndex: -1,
        photoBurst: false,

        get isComplete() { return this.phase === PHASE.COMPLETE; },
        get phaseName() { return PHASE_NAME[this.phase]; },

        enter(time, formationTime) {
            if (this.phase === PHASE.COMPLETE) {
                const photoDelay = formationTime + App.Config.PHOTO_DELAY_AFTER_FORMATION;
                this.startTime = time - photoDelay - App.Config.PHOTO_FADE_DURATION;
                this.lastBurstIndex = App.NAME_LETTERS.length - 1;
                this.lastSwaraIndex = 7;
                this.photoBurst = true;
            } else {
                this.startTime = time;
                this.phase = PHASE.REVEALING;
            }
        },

        markComplete() {
            this.phase = PHASE.COMPLETE;
        },

        reset() {
            this.startTime = -1;
            if (!this.isComplete) {
                this.lastBurstIndex = -1;
                this.lastSwaraIndex = -1;
                this.photoBurst = false;
                sparkles.length = 0;
                App.DualCore.reset();
                App.Audio.stopRevealSounds();
            }
        }
    };

    const sparkles = [];
    const trailPrev = new Map();
    let orbEnergy = 0;

    function updateAndDrawSparkles() {
        let len = sparkles.length;
        for (let si = len - 1; si >= 0; si--) {
            const sp = sparkles[si];
            sp.life -= C.SPARKLE_DECAY;
            if (sp.life <= 0) {
                sparkles[si] = sparkles[len - 1];
                len--;
                continue;
            }
            sp.x += sp.vx; sp.y += sp.vy; sp.vx *= 0.96; sp.vy *= 0.96;
            ctx.beginPath(); ctx.arc(sp.x, sp.y, sp.size * sp.life, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 240, 200, ${sp.life * sp.life * 0.9})`; ctx.fill();
        }
        sparkles.length = len;
    }
    let lastTime = Date.now();
    let _scaledTime = 0;

    let _burstFrame = 0;

    function draw() {
        const now = Date.now();
        const rawDt = Math.min(32, now - lastTime);
        const dt = rawDt * C.TIME_SCALE;
        App.Footer.markInactive();

        if (C.DEBUG && _burstFrame > 0 && _burstFrame <= 30) {
            App.dbgw('FRAME[' + _burstFrame + ']: dt=' + rawDt + 'ms gap=' + (now - lastTime) + 'ms particles=' + App.Particles.aliveCount + ' sparkles=' + sparkles.length + ' flash=' + App.Supernova.flash.toFixed(3) + ' orbScale=' + App.Supernova._smoothOrbScale.toFixed(3));
            _burstFrame++;
        }
        if (C.DEBUG && rawDt > 32 && _burstFrame === 0) {
            App.dbgw('SLOW_FRAME: dt=' + rawDt + 'ms energy=' + orbEnergy.toFixed(1) + ' particles=' + App.Particles.aliveCount + ' progress=' + (currentScroll / (document.documentElement.scrollHeight - window.innerHeight || 1)).toFixed(3));
        }

        lastTime = now;

        const W = App.W, H = App.H;
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        const progress = (maxScroll > 0 && _experienceStartTime > 0) ? Math.min(1, Math.max(0, currentScroll / maxScroll)) : 0;
        logScrollProgress(progress);
        _scaledTime += (rawDt * 0.001) * C.TIME_SCALE;
        const time = _scaledTime;

        try {

        const _t = C.DEBUG ? [performance.now()] : null;
        function _m() { if (_t) _t.push(performance.now()); }

        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#050505';
        ctx.fillRect(0, 0, W, H);

        // Screen shake
        App.Supernova.applyShake(ctx);
        _m();

        const watermarkOpacity = State.isComplete ? Math.max(0, 1 - progress / 0.03) : 0;
        watermark.style.opacity = watermarkOpacity;
        const hintOpacity = State.isComplete ? 0 : Math.max(0, 1 - smoothstep(C.REVEAL[0] - 0.05, C.REVEAL[0], progress));
        hint.style.opacity = hintOpacity;

        // Idle hint escalation (breadcrumbs rendered on canvas)
        updateIdleHint(progress, W / 2, H * 0.5, hintOpacity > 0);

        App.Audio.update(progress);

        // Progress phases
        const introElapsed = _experienceStartTime > 0 ? Date.now() - _experienceStartTime : 0;
        const introFade = (_experienceStartTime > 0 && !State.isComplete && introElapsed > 1200) ? Math.min(1, (introElapsed - 1200) / 1000) : 0;
        const stringAppear = Math.max(introFade * 0.6, smoothstep(C.STRING_APPEAR[0], C.STRING_APPEAR[1], progress));
        const vibration = smoothstep(C.VIBRATION[0], C.VIBRATION[1], progress);
        const intensity = vibration * vibration;
        const orbForm = smoothstep(C.ORB_FORM[0], C.ORB_FORM[1], progress);
        const orbGrow = smoothstep(C.ORB_GROW[0], C.ORB_GROW[1], progress);
        const stringsFade = smoothstep(C.STRINGS_FADE[0], C.STRINGS_FADE[1], progress);
        const revealProgress = smoothstep(C.REVEAL[0], C.REVEAL[1], progress);

        App.Audio.auroraBlend = orbGrow * orbGrow;

        // Orb properties
        const cx = W / 2;
        const cy = H * (0.5 - orbGrow * C.ORB_VERTICAL_SHIFT);
        const orbMinRadius = C.ORB_MIN_RADIUS_PX * DPR;
        const orbMaxRadius = Math.min(W * C.ORB_MAX_RADIUS_PCT, H * C.ORB_MAX_RADIUS_PCT);
        const orbRadius = orbMinRadius + (orbMaxRadius - orbMinRadius) * easeOutQuint(orbGrow);

        // Orb pulse (computed early so god rays can use the pulsed radius)
        const rawPulse = 1 + Math.sin(time * C.ORB_PULSE_SPEED_1) * C.ORB_PULSE_AMP_1 + Math.sin(time * C.ORB_PULSE_SPEED_2) * C.ORB_PULSE_AMP_2;
        const pulseDampen = (revealProgress > 0 && !State.photoBurst) ? revealProgress : 0;
        const pulse = rawPulse + (1 - rawPulse) * pulseDampen;

        // Supernova compression (must be computed before orbScale)
        const supernovaCompression = App.Supernova.computeCompression(time, State, revealProgress, C.LETTER_DURATION, C.PHOTO_DELAY_AFTER_FORMATION);
        if (supernovaCompression > 0.01) {
            App.Audio.startCompression();
            App.Audio.updateCompression(supernovaCompression);
        }
        const orbScale = App.Supernova.getOrbScale();
        const orbPulsedRadius = orbRadius * pulse * orbScale;

        // God Rays — driven by orb energy (previous frame)
        App.Supernova.updateRays();
        const energyRayIntensity = Math.min(1, orbEnergy * C.ENERGY_BRIGHTNESS_SCALE * 1.5);
        const effectiveRayIntensity = App.Supernova.getRayIntensity(energyRayIntensity);
        if (effectiveRayIntensity > 0) drawGodRays(cx, cy, orbPulsedRadius, effectiveRayIntensity, time);
        _m();

        // Strings
        const spacing = W / (C.NUM_STRINGS + 1);
        App.Strings.decayPlucks();
        App.WaveModels.update();

        for (let s = 0; s < C.NUM_STRINGS; s++) {
            const baseX = spacing * (s + 1);
            const freq = App.STRING_FREQS[s];
            const phase = App.STRING_PHASES[s];
            const color = App.STRING_COLORS[s];

            const amplitude = vibration * (C.STRING_AMPLITUDE_BASE + s * C.STRING_AMPLITUDE_STEP) * DPR * (1 - stringsFade * 0.6);
            const alpha = stringAppear * (0.4 + intensity * 0.4) * (1 - stringsFade);

            if (alpha <= 0.03) continue;

            const actualBaseX = App.Strings.draw(ctx, s, baseX, freq, phase, time, amplitude, alpha, orbGrow, orbForm, stringsFade, cx, cy, orbPulsedRadius, W, H);

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

        if (C.DEBUG) App.Strings.drawProfileBar(ctx, W, H);

        // TODO: Replace scattered timing constants with a phase-timeline abstraction
        // so formation, convergence, burst, and cycling don't drift out of sync.
        const fontSize = App.baseFont(W, H);
        const belowY = cy + orbMaxRadius + fontSize * C.NAME_OFFSET_Y;
        const letters = App.NAME_LETTERS;
        const letterDuration = C.LETTER_DURATION;
        const formationTime = letters.length * letterDuration;
        cacheLetterMetrics();

        // Letter convergence (used by both target and drawing)
        const convergence = supernovaCompression * supernovaCompression * supernovaCompression;
        const spreadX = 1 + (1 - convergence) * C.LETTER_SPREAD;
        const offsetY = (1 - convergence) * fontSize * C.NAME_OFFSET_Y;
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
                if (speed > C.POINTER_TRAIL_SPEED_MIN * DPR && Math.random() < C.POINTER_TRAIL_CHANCE) {
                    const spread = (Math.random() - 0.5) * Math.PI * 0.6;
                    const drift = C.POINTER_TRAIL_DRIFT_MIN + Math.random() * C.POINTER_TRAIL_DRIFT_RANGE;
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

        // Sync pointer prev positions so speed is only non-zero on event frames
        App.Input.syncPrev();

        // Update + draw particles
        const effectivePull = State.isComplete ? -0.3 : orbGrow;
        App.Particles.update(dt, time, cx, cy, orbPulsedRadius, orbMaxRadius, effectivePull, orbPull, letterTarget, letterSwarmPhase, intensity);
        App.Particles.draw(ctx, time, intensity);
        _m();

        // Orb energy: driven by particle absorption + strum activity
        const absorbed = App.Particles.consumeAbsorbed();
        const strummed = App.Strings.consumeStrumEnergy();
        const inReveal = revealProgress > 0 && !State.photoBurst;
        orbEnergy = orbEnergy * (inReveal ? C.ENERGY_DECAY_REVEAL : C.ENERGY_DECAY)
                  + (inReveal ? 0 : absorbed * C.ENERGY_GAIN_ABSORB)
                  + strummed * C.ENERGY_GAIN_STRUM;
        if (State.photoBurst) orbEnergy = Math.max(orbEnergy, C.ENERGY_FLOOR_POST_BURST);
        const energyBrightness = C.ENERGY_BRIGHTNESS_MIN + Math.min(C.ENERGY_BRIGHTNESS_RANGE, orbEnergy * C.ENERGY_BRIGHTNESS_SCALE);
        const energyIntensity = Math.min(C.ENERGY_INTENSITY_MAX, 1.0 + orbEnergy * C.ENERGY_INTENSITY_SCALE);

        // Orb
        if (orbForm > 0) {
            const _orbStart = C.DEBUG ? performance.now() : 0;
            const r = orbPulsedRadius;
            const orbAlpha = orbForm * energyBrightness;
            const breathe = 0.85 + 0.15 * Math.sin(time * 1.2);

            // Stellar compression: gold → yellow-white → blue-white
            const heat = App.Supernova.getHeat();
            const ei = energyIntensity;
            const whiteShift = Math.min(1, (ei - 1) * 0.8);
            const coreR = Math.min(255, Math.round((255 - heat * 60) * ei));
            const coreG = Math.min(255, Math.round((240 - heat * 20 + whiteShift * 15) * ei));
            const coreB = Math.min(255, Math.round((200 + heat * 55 + whiteShift * 55) * ei));
            const brightnessMult = 1 + heat * 2;

            // Disc — bright opaque center, smooth limb darkening
            const discA = Math.min(1, orbAlpha * 1.5 * brightnessMult);
            const discGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
            discGrad.addColorStop(0, `rgba(${Math.min(255, coreR + 30)}, ${Math.min(255, coreG + 20)}, ${Math.min(255, coreB + 10)}, ${discA})`);
            discGrad.addColorStop(0.4, `rgba(${coreR}, ${coreG}, ${coreB}, ${discA * 0.95})`);
            discGrad.addColorStop(0.7, `rgba(${Math.min(255, Math.round(240 * ei))}, ${Math.min(255, Math.round(200 * ei))}, ${Math.min(255, Math.round(120 * ei))}, ${discA * 0.85})`);
            discGrad.addColorStop(0.88, `rgba(${Math.min(255, Math.round(220 * ei))}, ${Math.min(255, Math.round(170 * ei))}, ${Math.min(255, Math.round(80 * ei))}, ${discA * 0.6})`);
            discGrad.addColorStop(1, `rgba(200, 140, 60, ${discA * 0.2})`);
            ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = discGrad; ctx.fill();

            // Corona — tight warm halo just beyond the disc
            const coronaR = r * 1.5;
            const coronaA = orbAlpha * breathe * 0.5;
            const coronaGrad = ctx.createRadialGradient(cx, cy, r * 0.7, cx, cy, coronaR);
            coronaGrad.addColorStop(0, `rgba(255, 210, 130, ${coronaA})`);
            coronaGrad.addColorStop(0.4, `rgba(255, 190, 100, ${coronaA * 0.4})`);
            coronaGrad.addColorStop(0.7, `rgba(255, 170, 80, ${coronaA * 0.12})`);
            coronaGrad.addColorStop(1, 'rgba(255, 150, 60, 0)');
            ctx.beginPath(); ctx.arc(cx, cy, coronaR, 0, Math.PI * 2); ctx.fillStyle = coronaGrad; ctx.fill();

            // Additive bloom — rendered at 1/4 resolution then composited (game engine trick)
            // The upscale acts as a natural Gaussian blur, making the bloom softer
            if (App.Supernova.flash < 0.3) {
            const _bloomStart = C.DEBUG ? performance.now() : 0;
            const bs = BLOOM_SCALE;
            const bw = bloomCanvas.width, bh = bloomCanvas.height;
            bloomCtx.clearRect(0, 0, bw, bh);

            const bcx = cx * bs, bcy = cy * bs, br = r * bs;

            // Inner bloom
            const bloom1A = Math.min(0.5, orbAlpha * 0.3 * breathe);
            const bloom1R = br * (1.6 + Math.min(1.5, orbEnergy * 0.1));
            const bloomGrad1 = bloomCtx.createRadialGradient(bcx, bcy, 0, bcx, bcy, bloom1R);
            bloomGrad1.addColorStop(0, `rgba(${coreR}, ${coreG}, ${coreB}, ${bloom1A})`);
            bloomGrad1.addColorStop(0.3, `rgba(255, 220, 160, ${bloom1A * 0.5})`);
            bloomGrad1.addColorStop(0.6, `rgba(255, 200, 120, ${bloom1A * 0.15})`);
            bloomGrad1.addColorStop(1, 'rgba(255, 180, 100, 0)');
            bloomCtx.beginPath(); bloomCtx.arc(bcx, bcy, bloom1R, 0, Math.PI * 2);
            bloomCtx.fillStyle = bloomGrad1; bloomCtx.fill();

            // Outer bloom
            const outerBloomA = Math.min(0.3, orbEnergy * C.ENERGY_BLOOM_ALPHA);
            if (outerBloomA > 0.005) {
                const bloom2R = br * (2.5 + Math.min(5, orbEnergy * C.ENERGY_BLOOM_SCALE));
                const bloomGrad2 = bloomCtx.createRadialGradient(bcx, bcy, br * 0.3, bcx, bcy, bloom2R);
                bloomGrad2.addColorStop(0, `rgba(255, 230, 180, ${outerBloomA})`);
                bloomGrad2.addColorStop(0.3, `rgba(255, 210, 150, ${outerBloomA * 0.4})`);
                bloomGrad2.addColorStop(0.6, `rgba(255, 190, 120, ${outerBloomA * 0.1})`);
                bloomGrad2.addColorStop(1, 'rgba(255, 170, 100, 0)');
                bloomCtx.beginPath(); bloomCtx.arc(bcx, bcy, bloom2R, 0, Math.PI * 2);
                bloomCtx.fillStyle = bloomGrad2; bloomCtx.fill();
            }

            // Composite the low-res bloom onto main canvas with additive blending
            const prevComp = ctx.globalCompositeOperation;
            ctx.globalCompositeOperation = 'lighter';
            ctx.drawImage(bloomCanvas, 0, 0, bw, bh, 0, 0, W, H);
            ctx.globalCompositeOperation = prevComp;

            if (C.DEBUG) {
                const _bloomMs = performance.now() - _bloomStart;
                if (_bloomMs > 1 || orbEnergy > 3) App.dbgw('BLOOM: ' + _bloomMs.toFixed(2) + 'ms energy=' + orbEnergy.toFixed(1) + ' bloom1R=' + (bloom1R/bs/App.DPR).toFixed(0) + 'px bloom2R=' + (outerBloomA > 0.005 ? (br * (2.5 + Math.min(5, orbEnergy * C.ENERGY_BLOOM_SCALE))/bs/App.DPR).toFixed(0) : '0') + 'px particles=' + App.Particles.aliveCount + ' dt=' + rawDt + 'ms');
            }
            }

            if (C.DEBUG && !window._orbBloomMs) window._orbBloomMs = 0;
            if (C.DEBUG) window._orbBloomMs = performance.now() - _orbStart;

            // Dual-core: pre-burst orbiting inside the orb
            if (!State.photoBurst) {
                App.DualCore.draw(ctx, cx, cy, r, orbAlpha, time, App.Supernova.compression, false, 0, null);

                // Core collision — expel particles when the two cores pass near each other
                const cores = App.DualCore.getCorePositions();
                const cdx = cores[1].x - cores[0].x;
                const cdy = cores[1].y - cores[0].y;
                const coreDist = Math.sqrt(cdx * cdx + cdy * cdy);
                const threshold = r * C.CORE_COLLISION_THRESHOLD_PCT;
                if (orbGrow > C.CORE_COLLISION_ORB_GROW_MIN && coreDist < threshold && coreDist > 0) {
                    const proximity = 1 - coreDist / threshold;
                    const midX = (cores[0].x + cores[1].x) / 2;
                    const midY = (cores[0].y + cores[1].y) / 2;

                    // Collision flash — always visible when cores are near
                    const flashR = r * 0.4 * proximity;
                    const flashGrad = ctx.createRadialGradient(midX, midY, 0, midX, midY, flashR);
                    flashGrad.addColorStop(0, `rgba(255, 255, 240, ${proximity * proximity * 0.9})`);
                    flashGrad.addColorStop(0.3, `rgba(255, 230, 180, ${proximity * 0.5})`);
                    flashGrad.addColorStop(0.7, `rgba(255, 200, 120, ${proximity * 0.15})`);
                    flashGrad.addColorStop(1, 'rgba(255, 180, 100, 0)');
                    ctx.beginPath(); ctx.arc(midX, midY, flashR, 0, Math.PI * 2);
                    ctx.fillStyle = flashGrad; ctx.fill();

                    if (Math.random() < proximity * C.CORE_COLLISION_EXPEL_CHANCE) {
                        const outAngle = Math.atan2(midY - cy, midX - cx);
                        const burstCount = C.CORE_COLLISION_BURST_MIN + Math.floor(proximity * C.CORE_COLLISION_BURST_RANGE);
                        const escapeBoost = 1 + orbPull * C.CORE_COLLISION_ESCAPE_BOOST;
                        for (let b = 0; b < burstCount; b++) {
                            const angle = outAngle + (Math.random() - 0.5) * 1.2;
                            const spd = (C.CORE_COLLISION_SPEED_MIN + Math.random() * C.CORE_COLLISION_SPEED_RANGE) * DPR * escapeBoost;
                            App.Particles.spawn(midX, midY, Math.cos(angle) * spd, Math.sin(angle) * spd, App.randomColor());
                        }
                    }
                }
            }

            if (orbGrow > 0.3 || State.isComplete) {
                const ringAlpha = State.isComplete ? energyBrightness : easeOutQuint((orbGrow - 0.3) / 0.7) * energyBrightness;
                const limbWidth = 8 * DPR;
                const limbInner = r - limbWidth * 0.3;
                const limbOuter = r + limbWidth;
                const limbGrad = ctx.createRadialGradient(cx, cy, limbInner, cx, cy, limbOuter);
                limbGrad.addColorStop(0, `rgba(255, 230, 170, 0)`);
                limbGrad.addColorStop(0.25, `rgba(255, 220, 150, ${ringAlpha * 0.35})`);
                limbGrad.addColorStop(0.5, `rgba(255, 200, 120, ${ringAlpha * 0.2})`);
                limbGrad.addColorStop(0.75, `rgba(255, 180, 100, ${ringAlpha * 0.08})`);
                limbGrad.addColorStop(1, `rgba(255, 160, 80, 0)`);
                ctx.beginPath(); ctx.arc(cx, cy, limbOuter, 0, Math.PI * 2);
                ctx.fillStyle = limbGrad; ctx.fill();

                if (State.photoBurst) {
                    const pulseOffset = pulse - 1;
                    const peakness = Math.max(0, (pulseOffset - 0.02) / 0.035);
                    if (peakness > 0 && Math.random() < peakness * 0.3) {
                        const angle = Math.random() * Math.PI * 2;
                        const spd = (0.5 + peakness * 2) * DPR;
                        App.Particles.spawn(
                            cx + Math.cos(angle) * r,
                            cy + Math.sin(angle) * r,
                            Math.cos(angle) * spd,
                            Math.sin(angle) * spd,
                            App.randomColor()
                        );
                    }
                }
            }
        }

        // Space-time ripples during compression
        App.Supernova.renderRipples(ctx, cx, cy, orbMaxRadius, time);
        _m();

        // Dual-core: post-burst flight to footer names (rendered outside orb block)
        if (State.photoBurst) {
            const footerTargets = App.Footer.getTargets(fontSize, cx, H);
            const coreAlpha = Math.min(1, orbForm * 3);
            const coresActive = progress > 0.88;
            App.DualCore.draw(ctx, cx, cy, orbPulsedRadius, coreAlpha, time, 0, true, coresActive, footerTargets, orbMaxRadius);

            if (App.DualCore.areBothOrbiting()) {
                const cores = App.DualCore.getCorePositions();
                const cdx = cores[1].x - cores[0].x;
                const cdy = cores[1].y - cores[0].y;
                const coreDist = Math.sqrt(cdx * cdx + cdy * cdy);
                const threshold = orbPulsedRadius * 0.4;
                if (coreDist < threshold && coreDist > 0) {
                    const proximity = 1 - coreDist / threshold;
                    const midX = (cores[0].x + cores[1].x) / 2;
                    const midY = (cores[0].y + cores[1].y) / 2;

                    const flashR = orbPulsedRadius * 0.35 * proximity;
                    const flashGrad = ctx.createRadialGradient(midX, midY, 0, midX, midY, flashR);
                    flashGrad.addColorStop(0, `rgba(255, 255, 240, ${proximity * proximity * 0.8})`);
                    flashGrad.addColorStop(0.3, `rgba(255, 230, 180, ${proximity * 0.4})`);
                    flashGrad.addColorStop(0.7, `rgba(255, 200, 120, ${proximity * 0.12})`);
                    flashGrad.addColorStop(1, 'rgba(255, 180, 100, 0)');
                    ctx.beginPath(); ctx.arc(midX, midY, flashR, 0, Math.PI * 2);
                    ctx.fillStyle = flashGrad; ctx.fill();

                    if (Math.random() < proximity * 0.5) {
                        const outAngle = Math.atan2(midY - cy, midX - cx);
                        const burstCount = 1 + Math.floor(proximity * 4);
                        for (let b = 0; b < burstCount; b++) {
                            const angle = outAngle + (Math.random() - 0.5) * 1.4;
                            const spd = (2 + Math.random() * 4) * DPR;
                            App.Particles.spawn(midX, midY, Math.cos(angle) * spd, Math.sin(angle) * spd, App.randomColor());
                        }
                        App.Audio.playCollisionChime(proximity);
                    }
                }
            }
        }
        _m();

        // Reveal
        const footerWasComplete = App.Footer.isComplete();
        if (revealProgress <= 0) { State.reset(); }
        if (revealProgress > 0) {
            if (State.startTime < 0) {
                App.dbg('MILESTONE: reveal started, phase=' + State.phaseName);
                State.enter(time, formationTime);
            }
            const _r = C.DEBUG ? [performance.now()] : null;
            const textP = easeOutQuint(Math.min(1, revealProgress / C.TEXT_FADE_PROGRESS));
            const photoDelay = formationTime + C.PHOTO_DELAY_AFTER_FORMATION;
            const photoP = revealElapsed > photoDelay ? easeOutQuint(Math.min(1, (revealElapsed - photoDelay) / C.PHOTO_FADE_DURATION)) : 0;
            const glowPulse = 0.85 + 0.15 * Math.sin(time * 1.5);

            // "Meet" — appears instantly with the photo reveal; rendered flat (no glow) so the name + date carry the visual weight.
            if (photoP > 0) {
                const meetSize = fontSize * C.FONT_TITLE;
                ctx.font = `200 ${meetSize}px -apple-system, "SF Pro Display", "Helvetica Neue", sans-serif`;
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillStyle = `rgba(255, 240, 210, ${C.MEET_OPACITY})`;
                ctx.fillText('Meet', cx, cy - orbMaxRadius - meetSize * 1.2);
            }
            if (_r) _r.push(performance.now());

            const letterPositions = cachedLetterPositions;

            // Timed swara sequence: Sa Re Ga Ma Pa Dha Ni Sa' spread across formation
            if (revealElapsed > 0 && revealElapsed < formationTime) {
                const swaraInterval = formationTime / 8;
                const swaraIdx = Math.floor(revealElapsed / swaraInterval);
                if (swaraIdx < 8 && swaraIdx > State.lastSwaraIndex) {
                    State.lastSwaraIndex = swaraIdx;
                    App.dbg('SWARA: ' + ['Sa','Re','Ga','Ma','Pa','Dha','Ni','Sa\''][swaraIdx] + ' (' + swaraIdx + ')');
                    App.Audio.playLetterChime(swaraIdx);
                }
            }

            if (revealElapsed < formationTime && letterPositions) {
                const activeIndex = Math.min(letters.length - 1, Math.floor(revealElapsed / letterDuration));
                const letterProgress = (revealElapsed - activeIndex * letterDuration) / letterDuration;
                const targetX = cx + (letterPositions[activeIndex].x - cx) * spreadX;
                const targetY = belowY + offsetY;

                ctx.font = `${fontSize * C.FONT_HERO}px Nistha, Georgia, serif`;
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillStyle = `rgba(255, 248, 230, ${textP})`;
                for (let i = 0; i < activeIndex; i++) {
                    const lx = cx + (letterPositions[i].x - cx) * spreadX;
                    drawGlowText(letters[i], lx, belowY + offsetY, textP);
                }

                const swarmPhase = Math.min(1, letterProgress / C.LETTER_SWARM_PHASE_END);
                // Clamp denom so MATERIALIZE_PHASE_START=1 doesn't divide-by-zero.
                const matDenom = Math.max(1e-6, 1 - C.LETTER_MATERIALIZE_PHASE_START);
                const materializePhase = Math.max(0, (letterProgress - C.LETTER_MATERIALIZE_PHASE_START) / matDenom);

                if (Math.random() < C.LETTER_SWARM_SPAWN_CHANCE && textP > 0.2 && App.Particles.aliveCount < C.LETTER_SWARM_ALIVE_CAP) {
                    const angle = Math.random() * Math.PI * 2;
                    const dist = fontSize * (C.LETTER_SPAWN_DIST_MIN + Math.random() * (C.LETTER_SPAWN_DIST_MAX - C.LETTER_SPAWN_DIST_MIN));
                    const sx = targetX + Math.cos(angle) * dist;
                    const sy = targetY + Math.sin(angle) * dist;
                    const speed = C.LETTER_SWARM_SPEED_BASE + swarmPhase * C.LETTER_SWARM_SPEED_PHASE_GAIN;
                    App.Particles.spawn(sx, sy, (targetX - sx) * speed, (targetY - sy) * speed, App.randomColor());
                }

                if (materializePhase > 0) {
                    const mAlpha = textP * easeOutQuint(materializePhase);
                    const popScale = 1 + C.LETTER_POP_SCALE * Math.sin(materializePhase * Math.PI);
                    ctx.font = `${fontSize * C.FONT_HERO * popScale}px Nistha, Georgia, serif`;
                    ctx.fillStyle = `rgba(255, 248, 230, ${mAlpha})`;
                    drawGlowText(letters[activeIndex], targetX, belowY + offsetY, mAlpha);

                    if (materializePhase > C.LETTER_BURST_TRIGGER_PHASE && activeIndex > State.lastBurstIndex) {
                        State.lastBurstIndex = activeIndex;
                        App.dbg('LETTER: "' + letters[activeIndex] + '" materialized (' + activeIndex + '/' + (letters.length - 1) + ')');
                        const sparkN = C.LETTER_SPARKLE_COUNT;
                        for (let sp = 0; sp < sparkN; sp++) {
                            const a = (sp / sparkN) * Math.PI * 2 + Math.random() * C.LETTER_SPARKLE_ANGLE_JITTER;
                            const spd = C.LETTER_SPARKLE_SPEED_MIN + Math.random() * C.LETTER_SPARKLE_SPEED_RANGE;
                            sparkles.push({ x: targetX, y: belowY + offsetY, vx: Math.cos(a) * spd * DPR, vy: Math.sin(a) * spd * DPR, life: 1.0, size: (C.LETTER_SPARKLE_SIZE_MIN + Math.random() * C.LETTER_SPARKLE_SIZE_RANGE) * DPR });
                        }
                    }
                }
            }

            // Sparkles
            if (_r) _r.push(performance.now());
            updateAndDrawSparkles();
            if (_r) _r.push(performance.now());

            if (revealElapsed >= formationTime && !State.photoBurst && letterPositions) {
                ctx.font = `${fontSize * C.FONT_HERO}px Nistha, Georgia, serif`;
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

                // Burst reaction: flash bright + scale punch
                const burstFlash = App.Supernova.flash;
                const burstScale = 1 + burstFlash * C.BURST_TEXT_SCALE;
                const flashR = Math.round(255);
                const flashG = Math.round(248 + burstFlash * 7);
                const flashB = Math.round(230 + burstFlash * 25);
                const flashColor = `rgba(${flashR}, ${flashG}, ${flashB},`;
                const burstGlow = burstFlash * C.BURST_TEXT_GLOW;

                function setFont(f, sizeMult) {
                    ctx.font = `${f.weight}${fontSize * C.FONT_HERO * f.scale * sizeMult * burstScale}px ${f.family}`;
                }

                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                if (segT < holdDuration) {
                    setFont(currFont, 1);
                    ctx.fillStyle = `${flashColor} ${textP})`;
                    drawGlowText(currFont.text, cx, belowY + currFont.y * DPR, textP * glowPulse + burstGlow);
                } else {
                    const p = (segT - holdDuration) / transitionDuration;
                    // Outgoing: scale-up + fade over first 60%
                    if (p < 0.6) {
                        const outP = p / 0.6;
                        const fade = 1 - outP * outP;
                        setFont(currFont, 1 + outP * (C.FONT_SCALE_OUT_MAX - 1));
                        ctx.fillStyle = `${flashColor} ${textP * fade})`;
                        drawGlowText(currFont.text, cx, belowY + currFont.y * DPR, textP * fade + burstGlow);
                    }
                    // Incoming: scale-in from 35%, overshoots then settles
                    const inP = Math.max(0, (p - 0.35) / 0.65);
                    if (inP > 0) {
                        const eased = inP * inP * (3 - 2 * inP);
                        const overshoot = 1 + 0.14 * Math.sin(inP * Math.PI);
                        setFont(nextFont, (0.7 + eased * 0.3) * overshoot);
                        ctx.fillStyle = `${flashColor} ${textP * eased})`;
                        drawGlowText(nextFont.text, cx, belowY + nextFont.y * DPR, textP * eased + burstGlow);
                    }
                }
            }
            if (_r) _r.push(performance.now());

            // Photo
            const _rp = C.DEBUG ? performance.now() : 0;
            if (photoP > 0 && babyImg.complete) {
                if (!State.photoBurst) {
                    State.photoBurst = true;
                    State.markComplete();
                    if (C.DEBUG) _burstFrame = 1;
                    if (C.DEBUG) {
                        const _b0 = performance.now();
                        App.Audio.stopCompression();
                        const _b1 = performance.now();
                        App.Audio.playBurst();
                        const _b2 = performance.now();
                        App.Audio.playSingingBowl();
                        const _b3 = performance.now();
                        App.Audio.startMelody();
                        const _b4 = performance.now();
                        App.Supernova.trigger(cx, cy, orbMaxRadius, sparkles);
                        const _b5 = performance.now();
                        App.dbg('BURST_TIMING: stopComp=' + (_b1-_b0).toFixed(2) + ' playBurst=' + (_b2-_b1).toFixed(2) + ' bowl=' + (_b3-_b2).toFixed(2) + ' melody=' + (_b4-_b3).toFixed(2) + ' trigger=' + (_b5-_b4).toFixed(2) + ' total=' + (_b5-_b0).toFixed(2) + 'ms');
                    } else {
                        App.Audio.stopCompression();
                        App.Audio.playBurst();
                        App.Audio.playSingingBowl();
                        App.Audio.startMelody();
                        App.Supernova.trigger(cx, cy, orbMaxRadius, sparkles);
                    }
                }
                ctx.globalAlpha = photoP * textP;
                const photoRadius = orbMaxRadius * C.PHOTO_RADIUS_PCT;
                if (C.DEBUG) {
                    const _pc0 = performance.now();
                    const photo = App.Cache.circularPhoto(babyImg, photoRadius);
                    const _pc1 = performance.now();
                    if (_pc1 - _pc0 > 1) App.dbgw('PHOTO_CACHE: ' + (_pc1-_pc0).toFixed(2) + 'ms (first render or resize)');
                    ctx.drawImage(photo, cx - photoRadius, cy - photoRadius);
                } else {
                    const photo = App.Cache.circularPhoto(babyImg, photoRadius);
                    ctx.drawImage(photo, cx - photoRadius, cy - photoRadius);
                }
                ctx.globalAlpha = 1;
            }
            const _rd = C.DEBUG ? performance.now() : 0;

            // Birth date — revealed by the cores as they pass through; carries the glow that "Meet" used to.
            if (photoP >= 1) {
                const dateSize = fontSize * C.FONT_BODY;
                const dateY = belowY + fontSize * C.DATE_OFFSET_Y;
                const coreProgress = App.DualCore.getFlightProgress();
                const dateP = easeOutQuint(Math.min(1, Math.max(0, (coreProgress - C.DATE_FADE_START) / C.DATE_FADE_DURATION)));
                if (dateP > 0) {
                    ctx.font = `300 ${dateSize}px -apple-system, "SF Pro Display", "Helvetica Neue", sans-serif`;
                    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillStyle = `rgba(255, 240, 210, ${textP * dateP * 0.7})`;
                    drawGlowText(C.BIRTH_DATE, cx, dateY, textP * dateP * 0.6);
                }
            }

            // Footer
            if (!App.Footer.isComplete() && (photoP >= 1 || App.Footer.isPrimaryDone())) {
                App.Footer.draw(ctx, time, textP, fontSize, cx, H);
            }
            const _re = C.DEBUG ? performance.now() : 0;
            if (_r) _r.push(_re);

            // Reveal sub-timing HUD
            if (C.DEBUG) {
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

        // Footer: persistent once reveal milestone is reached
        if (State.isComplete && (footerWasComplete || !(revealProgress > 0))) {
            App.Footer.draw(ctx, time, 1, fontSize, cx, H);
        }

        // Sparkles (outside reveal — handles tap bursts when scrolled away)
        if (State.isComplete && !(revealProgress > 0) && sparkles.length > 0) {
            updateAndDrawSparkles();
        }

        // Supernova flash + shockwave ring
        App.Supernova.renderEffects(ctx, cx, cy, W, H);

        _m();
        if (C.DEBUG) {
            const sections = ['clear', 'rays+str', 'particles', 'orb', 'dualcore', 'reveal'];
            const times = []; for (let i = 1; i < _t.length; i++) times.push(_t[i] - _t[i-1]);
            const total = _t[_t.length - 1] - _t[0];
            const fps = 1000 / Math.max(1, dt);
            if (!window._perfHistory) window._perfHistory = { totals: [], sections: [], _lastSpike: 0 };
            window._perfHistory.totals.push(total); window._perfHistory.sections.push(times);
            if (window._perfHistory.totals.length > 60) { window._perfHistory.totals.shift(); window._perfHistory.sections.shift(); }

            // Log spikes: any section >1ms, throttled to once per second
            if (now - (window._perfHistory._lastSpike || 0) > 1000) {
                for (let si = 0; si < sections.length; si++) {
                    if (times[si] > 1.5) {
                        window._perfHistory._lastSpike = now;
                        App.dbgw('PERF_SPIKE: ' + sections[si] + '=' + times[si].toFixed(2) + 'ms'
                            + ' | frame=' + total.toFixed(2) + 'ms'
                            + ' fps=' + fps.toFixed(0)
                            + ' particles=' + App.Particles.aliveCount
                            + ' sparkles=' + sparkles.length
                            + ' compression=' + App.Supernova.compression.toFixed(3)
                            + ' flash=' + App.Supernova.flash.toFixed(3)
                            + ' progress=' + progress.toFixed(3)
                            + ' revealElapsed=' + (State.startTime > 0 ? (time - State.startTime).toFixed(2) : '0')
                            + ' phase=' + State.phaseName
                        );
                        break;
                    }
                }
            }

            const avgTotal = window._perfHistory.totals.reduce((a,b) => a+b, 0) / window._perfHistory.totals.length;
            const avgSections = sections.map((_, idx) => { let sum = 0, count = 0; window._perfHistory.sections.forEach(s => { if (s[idx] !== undefined) { sum += s[idx]; count++; } }); return count > 0 ? sum / count : 0; });
            let worstIdx = 0; avgSections.forEach((v, i) => { if (v > avgSections[worstIdx]) worstIdx = i; });
            ctx.font = `${11 * DPR}px monospace`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
            ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, 0, 320 * DPR, 100 * DPR);
            ctx.fillStyle = fps > 50 ? '#4a4' : fps > 30 ? '#aa4' : '#a44';
            ctx.fillText(`FPS: ${fps.toFixed(0)}  Frame: ${total.toFixed(1)}ms  Avg: ${avgTotal.toFixed(1)}ms  Particles: ${App.Particles.aliveCount}  Energy: ${orbEnergy.toFixed(1)}`, 8 * DPR, 6 * DPR);

            // GPU-bound indicator: CPU is fast but frames are slow → GPU fill bottleneck
            const gpuBound = rawDt > 32 && total < 8;
            const gpuLabel = gpuBound ? 'GPU-BOUND' : 'gpu ok';
            const bloomR2 = orbEnergy > 0 ? Math.round((orbPulsedRadius * (2.5 + Math.min(5, orbEnergy * C.ENERGY_BLOOM_SCALE))) / DPR) : 0;
            ctx.fillStyle = gpuBound ? '#f44' : '#6a6';
            ctx.fillText(`${gpuLabel}  dt=${rawDt}ms  bloom=${bloomR2}px  orbScale=${App.Supernova._smoothOrbScale.toFixed(2)}`, 8 * DPR, 18 * DPR);

            let y = 34 * DPR;
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
