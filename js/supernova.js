window.App = window.App || {};

App.Supernova = {
    flash: 0,
    ring: 0,
    ringRadius: 0,
    screenShake: 0,
    compression: 0,
    rayBurst: 0,
    _ripples: [],
    _lastRippleTime: 0,

    computeCompression(time, state, revealProgress, letterDuration, photoDelayAfterFormation) {
        this.compression = 0;
        if (revealProgress > 0 && state.startTime > 0 && !state.photoBurst) {
            const elapsed = time - state.startTime;
            const formationTime = App.NAME_LETTERS.length * letterDuration;
            const photoDelay = formationTime + photoDelayAfterFormation;
            const buildUpStart = formationTime;
            const buildUpDuration = photoDelayAfterFormation;
            if (elapsed > buildUpStart && elapsed <= photoDelay) {
                const raw = Math.min(1, (elapsed - buildUpStart) / buildUpDuration);
                // Aggressive ease-out: reaches 0.87 at 50% time, lingers in dramatic zone
                this.compression = 1 - (1 - raw) * (1 - raw) * (1 - raw);
            }
        }
        return this.compression;
    },

    _smoothOrbScale: 1,

    getOrbScale() {
        let target;
        if (this.compression > 0) {
            const curved = this.compression * this.compression * this.compression;
            target = 1 - curved * App.Config.COMPRESSION_COLLAPSE_FACTOR;
        } else if (this.flash > 0) {
            target = 1 + this.flash * 0.4;
        } else {
            // Compression and flash both zero — return to full size. Lerp handles the smoothing
            // so a reveal that gets interrupted mid-compression and re-entered finds the orb back
            // at full scale, instead of stuck at the collapsed radius.
            target = 1;
        }
        const prev = this._smoothOrbScale;
        this._smoothOrbScale += (target - this._smoothOrbScale) * App.Config.BLAST_ORB_LERP;
        if (App.Config.DEBUG) {
            const jump = Math.abs(this._smoothOrbScale - prev);
            if (jump > 0.1) App.dbgw('ORB_SCALE_JUMP: ' + prev.toFixed(3) + ' → ' + this._smoothOrbScale.toFixed(3) + ' (target=' + target.toFixed(3) + ' jump=' + jump.toFixed(3) + ')');
        }
        return this._smoothOrbScale;
    },

    spawnVortex(cx, cy, orbMaxRadius) {
        const C = App.Config;
        if (this.compression <= C.VORTEX_THRESHOLD) return;
        const DPR = App.DPR;
        const curved = this.compression * this.compression * this.compression;
        // Last quarter: particle pull accelerates dramatically. Clamp denom so threshold=1 doesn't divide-by-zero.
        const rushDenom = Math.max(1e-6, 1 - C.VORTEX_FINAL_RUSH_THRESHOLD);
        const finalRush = Math.max(0, (this.compression - C.VORTEX_FINAL_RUSH_THRESHOLD) / rushDenom);
        const spawnRate = Math.floor(curved * 5 + finalRush * finalRush * 10);
        for (let i = 0; i < spawnRate; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = orbMaxRadius * (2 + Math.random() * 3 - finalRush * 1.5);
            const sx = cx + Math.cos(angle) * dist;
            const sy = cy + Math.sin(angle) * dist;
            const inwardSpeed = (3 + this.compression * 8 + finalRush * finalRush * 20) * DPR;
            const color = App.randomColor();
            App.Particles.spawn(sx, sy, -Math.cos(angle) * inwardSpeed, -Math.sin(angle) * inwardSpeed, color);
        }
    },

    trigger(cx, cy, orbMaxRadius, sparkles) {
        const C = App.Config;
        const DPR = App.DPR;
        this.flash = 1.0;
        this.ring = 1.0;
        this.rayBurst = 1.0;
        this.ringRadius = orbMaxRadius;
        this.screenShake = C.SHAKE_INITIAL;

        // Clear vortex particles to free the pool — they're invisible post-flash anyway
        App.Particles.clearAll();

        const burstCount = C.BURST_PARTICLE_COUNT_MIN + Math.floor(Math.random() * C.BURST_PARTICLE_COUNT_RANGE);
        for (let sp = 0; sp < burstCount; sp++) {
            const a = (sp / burstCount) * Math.PI * 2 + Math.random() * 0.5;
            const spd = (C.BURST_PARTICLE_SPEED_MIN + Math.random() * C.BURST_PARTICLE_SPEED_RANGE) * DPR;
            const color = App.randomColor();
            App.Particles.spawn(
                cx + Math.cos(a) * orbMaxRadius * (C.BURST_PARTICLE_DIST_BASE + Math.random() * C.BURST_PARTICLE_DIST_RANGE),
                cy + Math.sin(a) * orbMaxRadius * (C.BURST_PARTICLE_DIST_BASE + Math.random() * C.BURST_PARTICLE_DIST_RANGE),
                Math.cos(a) * spd, Math.sin(a) * spd, color
            );
        }

        const sparkCount = C.BURST_SPARKLE_COUNT;
        for (let sp = 0; sp < sparkCount; sp++) {
            const a = (sp / sparkCount) * Math.PI * 2 + Math.random() * 0.2;
            const spd = C.BURST_SPARKLE_SPEED_MIN + Math.random() * C.BURST_SPARKLE_SPEED_RANGE;
            sparkles.push({
                x: cx + Math.cos(a) * orbMaxRadius,
                y: cy + Math.sin(a) * orbMaxRadius,
                vx: Math.cos(a) * spd * DPR,
                vy: Math.sin(a) * spd * DPR,
                life: 1.0,
                size: (C.BURST_SPARKLE_SIZE_MIN + Math.random() * C.BURST_SPARKLE_SIZE_RANGE) * DPR
            });
        }
    },

    applyShake(ctx) {
        if (this.screenShake > 0.01) {
            const C = App.Config;
            const DPR = App.DPR;
            const shakeX = (Math.random() - 0.5) * this.screenShake * C.SHAKE_MAGNITUDE_PX * DPR;
            const shakeY = (Math.random() - 0.5) * this.screenShake * C.SHAKE_MAGNITUDE_PX * DPR;
            ctx.translate(shakeX, shakeY);
            this.screenShake *= C.SHAKE_DECAY;
        } else {
            this.screenShake = 0;
        }
    },

    renderRipples(ctx, cx, cy, orbRadius, time) {
        const C = App.Config;
        if (this.compression < C.RIPPLE_THRESHOLD) return;
        const DPR = App.DPR;

        // Spawn ripples at increasing frequency as compression approaches 1.
        // Clamp denom so threshold=1 doesn't produce NaN (which would never expire from _ripples).
        const denom = Math.max(1e-6, 1 - C.RIPPLE_THRESHOLD);
        const intensity = (this.compression - C.RIPPLE_THRESHOLD) / denom;
        if (!isFinite(intensity)) return;
        const interval = 0.8 - intensity * 0.6;
        if (time - this._lastRippleTime > interval) {
            this._ripples.push({ radius: orbRadius * this.getOrbScale() * 1.2, alpha: intensity * 0.4 });
            this._lastRippleTime = time;
        }

        // Update and draw ripples
        for (let i = this._ripples.length - 1; i >= 0; i--) {
            const r = this._ripples[i];
            r.radius += DPR * (2 + intensity * 4);
            r.alpha *= C.RIPPLE_DECAY;
            if (r.alpha < 0.01) { this._ripples.splice(i, 1); continue; }
            ctx.beginPath();
            ctx.arc(cx, cy, r.radius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(200, 220, 255, ${r.alpha})`;
            ctx.lineWidth = (1 + intensity) * DPR;
            ctx.stroke();
        }
    },

    renderEffects(ctx, cx, cy, W, H) {
        const C = App.Config;
        const DPR = App.DPR;
        if (this.flash > 0) {
            this.flash *= C.BURST_FLASH_DECAY;
            if (this.flash < 0.01) this.flash = 0;
            ctx.fillStyle = `rgba(255, 250, 230, ${this.flash * 0.6})`;
            ctx.fillRect(0, 0, W, H);
        }
        if (this.ring > 0) {
            this.ring *= C.BURST_RING_DECAY;
            this.ringRadius += C.BURST_RING_GROWTH_PX * DPR;
            if (this.ring < 0.01) this.ring = 0;
            ctx.beginPath();
            ctx.arc(cx, cy, this.ringRadius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255, 220, 150, ${this.ring * 0.5})`;
            ctx.lineWidth = 4 * DPR * this.ring;
            ctx.stroke();
        }
    },

    // Three-act god rays: compress → burst → fade to zero
    updateRays() {
        if (this.rayBurst > 0) {
            this.rayBurst *= App.Config.RAY_BURST_DECAY;
            if (this.rayBurst < 0.01) {
                this.rayBurst = 0;
            }
        }
    },

    getRayIntensity(baseIntensity) {
        if (this.rayBurst > 0) return this.rayBurst;
        return baseIntensity;
    },

    getRayScale() {
        // During compression: collapse to near-zero
        if (this.compression > 0) {
            const curved = this.compression * this.compression * this.compression;
            return Math.max(0.05, 1 - curved * App.Config.COMPRESSION_COLLAPSE_FACTOR);
        }
        // During burst: expand outward
        if (this.rayBurst > 0) return 1 + this.rayBurst * App.Config.RAY_BURST_SCALE;
        return 1;
    },

    getHeat() {
        return this.compression * this.compression * this.compression;
    }
};
