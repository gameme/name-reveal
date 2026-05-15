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
            target = 1 - curved * 0.95;
        } else if (this.flash > 0) {
            target = 1 + this.flash * 0.4;
        } else if (this._smoothOrbScale < 0.15) {
            target = this._smoothOrbScale;
        } else {
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
        if (this.compression <= 0.3) return;
        const DPR = App.DPR;
        const curved = this.compression * this.compression * this.compression;
        // Last 25%: particle pull accelerates dramatically
        const finalRush = Math.max(0, (this.compression - 0.75) / 0.25);
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
        const DPR = App.DPR;
        this.flash = 1.0;
        this.ring = 1.0;
        this.rayBurst = 1.0;
        this.ringRadius = orbMaxRadius;
        this.screenShake = 1.5;

        // Clear vortex particles to free the pool — they're invisible post-flash anyway
        App.Particles.clearAll();

        const burstCount = 450 + Math.floor(Math.random() * 100);
        for (let sp = 0; sp < burstCount; sp++) {
            const a = (sp / burstCount) * Math.PI * 2 + Math.random() * 0.5;
            const spd = (3 + Math.random() * 14) * DPR;
            const color = App.randomColor();
            App.Particles.spawn(
                cx + Math.cos(a) * orbMaxRadius * (0.8 + Math.random() * 0.5),
                cy + Math.sin(a) * orbMaxRadius * (0.8 + Math.random() * 0.5),
                Math.cos(a) * spd, Math.sin(a) * spd, color
            );
        }

        for (let sp = 0; sp < 60; sp++) {
            const a = (sp / 60) * Math.PI * 2 + Math.random() * 0.2;
            const spd = 4 + Math.random() * 6;
            sparkles.push({
                x: cx + Math.cos(a) * orbMaxRadius,
                y: cy + Math.sin(a) * orbMaxRadius,
                vx: Math.cos(a) * spd * DPR,
                vy: Math.sin(a) * spd * DPR,
                life: 1.0,
                size: (3 + Math.random() * 4) * DPR
            });
        }
    },

    applyShake(ctx) {
        if (this.screenShake > 0.01) {
            const DPR = App.DPR;
            const shakeX = (Math.random() - 0.5) * this.screenShake * 20 * DPR;
            const shakeY = (Math.random() - 0.5) * this.screenShake * 20 * DPR;
            ctx.translate(shakeX, shakeY);
            this.screenShake *= 0.9;
        } else {
            this.screenShake = 0;
        }
    },

    renderRipples(ctx, cx, cy, orbRadius, time) {
        if (this.compression < 0.5) return;
        const DPR = App.DPR;

        // Spawn ripples at increasing frequency as compression approaches 1
        const intensity = (this.compression - 0.5) * 2;
        const interval = 0.8 - intensity * 0.6;
        if (time - this._lastRippleTime > interval) {
            this._ripples.push({ radius: orbRadius * this.getOrbScale() * 1.2, alpha: intensity * 0.4 });
            this._lastRippleTime = time;
        }

        // Update and draw ripples
        for (let i = this._ripples.length - 1; i >= 0; i--) {
            const r = this._ripples[i];
            r.radius += DPR * (2 + intensity * 4);
            r.alpha *= 0.96;
            if (r.alpha < 0.01) { this._ripples.splice(i, 1); continue; }
            ctx.beginPath();
            ctx.arc(cx, cy, r.radius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(200, 220, 255, ${r.alpha})`;
            ctx.lineWidth = (1 + intensity) * DPR;
            ctx.stroke();
        }
    },

    renderEffects(ctx, cx, cy, W, H) {
        const DPR = App.DPR;
        if (this.flash > 0) {
            this.flash *= 0.945;
            if (this.flash < 0.01) this.flash = 0;
            ctx.fillStyle = `rgba(255, 250, 230, ${this.flash * 0.6})`;
            ctx.fillRect(0, 0, W, H);
        }
        if (this.ring > 0) {
            this.ring *= 0.96;
            this.ringRadius += 12 * DPR;
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
            this.rayBurst *= 0.94;
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
            return Math.max(0.05, 1 - curved * 0.95);
        }
        // During burst: expand outward
        if (this.rayBurst > 0) return 1 + this.rayBurst * 2.5;
        return 1;
    },

    getHeat() {
        return this.compression * this.compression * this.compression;
    }
};
