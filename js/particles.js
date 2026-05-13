window.App = window.App || {};

App.Particles = {
    pool: null,
    aliveCount: 0,
    spriteSheet: null,
    SPRITE_SIZES: [10, 20, 36, 56],
    SPRITE_ROTATIONS: [-0.5, -0.25, 0, 0.25, 0.5],
    SPRITE_CELL: 60,

    init() {
        const C = App.Config;
        const POOL_SIZE = Math.ceil(C.MAX_PARTICLES * 1.25);
        this.POOL_SIZE = POOL_SIZE;
        this.pool = new Array(POOL_SIZE);
        for (let i = 0; i < POOL_SIZE; i++) {
            this.pool[i] = { alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, decay: 0, size: 0, colorIdx: 0, noteIdx: 0, rotation: 0, tx: new Float32Array(5), ty: new Float32Array(5), tLen: 0, tIdx: 0, seed: i * 0.73 };
        }
        this._buildSpriteSheet();
    },

    _buildSpriteSheet() {
        const CELL = this.SPRITE_CELL;
        const SIZES = this.SPRITE_SIZES;
        const ROTS = this.SPRITE_ROTATIONS;
        const NOTES = App.NOTE_SYMBOLS;
        const COLORS = App.STRING_COLORS;

        this.spriteSheet = document.createElement('canvas');
        this.spriteSheet.width = CELL * NOTES.length * ROTS.length;
        this.spriteSheet.height = CELL * SIZES.length * COLORS.length;
        const sCtx = this.spriteSheet.getContext('2d');

        for (let c = 0; c < COLORS.length; c++) {
            const [r, g, b] = COLORS[c];
            for (let row = 0; row < SIZES.length; row++) {
                const sz = SIZES[row];
                const yCenter = (c * SIZES.length + row) * CELL + CELL / 2;
                for (let col = 0; col < NOTES.length; col++) {
                    for (let ri = 0; ri < ROTS.length; ri++) {
                        const xCenter = (col * ROTS.length + ri) * CELL + CELL / 2;
                        sCtx.save();
                        sCtx.translate(xCenter, yCenter);
                        sCtx.rotate(ROTS[ri]);
                        sCtx.font = `${sz}px serif`;
                        sCtx.textAlign = 'center';
                        sCtx.textBaseline = 'middle';
                        sCtx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                        sCtx.fillText(NOTES[col], 0, 0);
                        sCtx.restore();
                    }
                }
            }
        }
    },

    getSpriteRow(targetSize) {
        const SIZES = this.SPRITE_SIZES;
        let best = 0;
        for (let i = 1; i < SIZES.length; i++) {
            if (Math.abs(SIZES[i] - targetSize) < Math.abs(SIZES[best] - targetSize)) best = i;
        }
        return best;
    },

    spawn(x, y, vx, vy, color, sizeOverride) {
        const C = App.Config;
        const POOL_SIZE = this.POOL_SIZE;
        const pool = this.pool;

        if (this.aliveCount >= C.MAX_PARTICLES) {
            let weakest = -1, weakestLife = Infinity;
            for (let i = 0; i < POOL_SIZE; i++) {
                if (pool[i].alive && pool[i].life < weakestLife) {
                    weakestLife = pool[i].life;
                    weakest = i;
                }
            }
            if (weakest >= 0) { pool[weakest].alive = false; this.aliveCount--; }
        }

        for (let i = 0; i < POOL_SIZE; i++) {
            if (!pool[i].alive) {
                const p = pool[i];
                p.alive = true;
                p.x = x; p.y = y; p.vx = vx; p.vy = vy;
                p.life = 1.0;
                p.decay = C.PARTICLE_DECAY_MIN + Math.random() * (C.PARTICLE_DECAY_MAX - C.PARTICLE_DECAY_MIN);
                p.size = sizeOverride || (C.PARTICLE_SIZE_MIN + Math.random() * (C.PARTICLE_SIZE_MAX - C.PARTICLE_SIZE_MIN));
                p.colorIdx = App.STRING_COLORS.indexOf(color);
                if (p.colorIdx < 0) p.colorIdx = Math.floor(Math.random() * App.STRING_COLORS.length);
                p.noteIdx = Math.floor(Math.random() * App.NOTE_SYMBOLS.length) % App.NOTE_SYMBOLS.length;
                p.rotation = Math.floor(Math.random() * this.SPRITE_ROTATIONS.length);
                p.tLen = 0;
                p.tIdx = 0;
                this.aliveCount++;
                return;
            }
        }
    },

    update(dt, time, cx, cy, orbRadius, orbMaxRadius, pullStrength, orbPull, letterTarget, letterSwarmPhase, intensity) {
        const C = App.Config;
        const DPR = App.DPR;
        const pool = this.pool;

        for (let i = 0; i < this.POOL_SIZE; i++) {
            const p = pool[i];
            if (!p.alive) continue;

            p.life -= p.decay;
            if (p.life <= 0) { p.alive = false; this.aliveCount = Math.max(0, this.aliveCount - 1); continue; }

            if (letterTarget) {
                const dx = letterTarget.x - p.x;
                const dy = letterTarget.y - p.y;
                const dist = dx * dx + dy * dy;
                if (dist < orbMaxRadius * orbMaxRadius * 0.04) {
                    p.alive = false; this.aliveCount = Math.max(0, this.aliveCount - 1); continue;
                }
                const force = C.LETTER_PULL_BASE + letterSwarmPhase * C.LETTER_PULL_SWARM;
                p.vx += dx * force;
                p.vy += dy * force;
            } else if (pullStrength > 0) {
                const dx = cx - p.x;
                const dy = cy - p.y;
                const dist = dx * dx + dy * dy;
                if (dist < orbRadius * orbRadius * 0.36) {
                    p.alive = false; this.aliveCount = Math.max(0, this.aliveCount - 1); continue;
                }
                const strength = pullStrength * (C.ORB_PULL_BASE + orbPull * C.ORB_PULL_GROW);
                p.vx += dx * strength;
                p.vy += dy * strength;
            } else if (pullStrength < 0) {
                // Post-reveal: gentle outward drift
                const dx = p.x - cx;
                const dy = p.y - cy;
                const distSq = dx * dx + dy * dy;
                if (distSq > 1) {
                    const invDist = 1 / Math.sqrt(distSq);
                    const push = -pullStrength * 0.15;
                    p.vx += dx * invDist * push;
                    p.vy += dy * invDist * push;
                }
            }

            const speedSq = p.vx * p.vx + p.vy * p.vy;
            const maxSpeedSq = C.MAX_SPEED * C.MAX_SPEED * DPR * DPR;
            if (speedSq > maxSpeedSq) {
                const scale = Math.sqrt(maxSpeedSq / speedSq);
                p.vx *= scale;
                p.vy *= scale;
            }

            p.vx *= C.DAMPING;
            p.vy *= C.DAMPING;
            p.x += p.vx * dt * 0.06;
            p.y += p.vy * dt * 0.06;

            p.tx[p.tIdx] = p.x;
            p.ty[p.tIdx] = p.y;
            p.tIdx = (p.tIdx + 1) % 5;
            if (p.tLen < 5) p.tLen++;
        }
    },

    draw(ctx, time, intensity) {
        const C = App.Config;
        const DPR = App.DPR;
        const pool = this.pool;
        const CELL = this.SPRITE_CELL;
        const ROTS = this.SPRITE_ROTATIONS;
        const SIZES = this.SPRITE_SIZES;
        const COLORS = App.STRING_COLORS;

        for (let i = 0; i < this.POOL_SIZE; i++) {
            const p = pool[i];
            if (!p.alive) continue;

            const alpha = p.life * (0.5 + intensity * 0.5);
            const age = 1 - p.life;
            const birthScale = Math.min(1, age / 0.08);
            const sizePulse = 1.0 + 0.04 * Math.sin(time * 1.5 + p.seed);
            const size = p.size * DPR * sizePulse * birthScale;
            if (size <= 0) continue;

            // Trail
            if (p.tLen > 2) {
                const startIdx = (p.tIdx - p.tLen + 5) % 5;
                ctx.beginPath();
                ctx.moveTo(p.tx[startIdx], p.ty[startIdx]);
                for (let t = 1; t < p.tLen; t++) {
                    ctx.lineTo(p.tx[(startIdx + t) % 5], p.ty[(startIdx + t) % 5]);
                }
                const [cr, cg, cb] = COLORS[p.colorIdx] || COLORS[0];
                ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${alpha * 0.25})`;
                ctx.lineWidth = size * 0.5;
                ctx.lineCap = 'round';
                ctx.stroke();
            }

            // Speed streak
            const speedSqDraw = p.vx * p.vx + p.vy * p.vy;
            if (speedSqDraw > 4 * DPR * DPR) {
                const speed = Math.sqrt(speedSqDraw);
                const streakLen = Math.min(speed * 3, size * 8);
                const nx = -p.vx / speed;
                const ny = -p.vy / speed;
                const [sr, sg, sb] = COLORS[p.colorIdx] || COLORS[0];
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(p.x + nx * streakLen, p.y + ny * streakLen);
                ctx.strokeStyle = `rgba(${sr}, ${sg}, ${sb}, ${alpha * 0.15})`;
                ctx.lineWidth = size * 0.3;
                ctx.lineCap = 'round';
                ctx.stroke();
            }

            // Twinkle + sprite
            const twinkle = 1.0 + 0.4 * Math.sin(time * 3 + p.seed * 2.3);
            const drawAlpha = Math.min(1, alpha * twinkle);
            const noteSize = size * C.NOTE_DRAW_SCALE;
            const drawSz = noteSize * 2;
            if (drawSz < 2) continue;
            const row = this.getSpriteRow(noteSize);
            const srcX = (p.noteIdx * ROTS.length + p.rotation) * CELL;
            const srcY = (p.colorIdx * SIZES.length + row) * CELL;

            ctx.globalAlpha = drawAlpha * 0.9;
            ctx.drawImage(this.spriteSheet, srcX, srcY, CELL, CELL, p.x - drawSz/2, p.y - drawSz/2, drawSz, drawSz);
            ctx.globalAlpha = 1;
        }
    }
};
