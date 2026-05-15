window.App = window.App || {};

App.Strings = {
    plucks: null,
    locks: new Map(),
    strumEnergy: 0,

    init() {
        const C = App.Config;
        this.plucks = Array.from({ length: C.NUM_STRINGS }, () => ({ y: 0, offset: 0, glow: 0, glowSpread: 0 }));
        this._trails = Array.from({ length: C.NUM_STRINGS }, () => []);
        this._trailFrame = 0;
    },

    getLockKey(pointerId, stringIdx) {
        return `${pointerId}-${stringIdx}`;
    },

    clearLocksForPointer(pointerId) {
        for (const key of [...this.locks.keys()]) {
            if (key.startsWith(`${pointerId}-`)) this.locks.delete(key);
        }
    },

    decayPlucks() {
        const C = App.Config;
        for (const pluck of this.plucks) {
            pluck.offset *= C.STRING_PLUCK_DECAY;
            if (Math.abs(pluck.offset) < C.STRING_PLUCK_THRESHOLD) pluck.offset = 0;
            if (pluck.glow > 0) {
                pluck.glow *= C.STRING_GLOW_DECAY;
                pluck.glowSpread += C.STRING_GLOW_SPEED * App.DPR;
                if (pluck.glow < 0.01) pluck.glow = 0;
            }
        }
    },

    getPluck(stringIdx) {
        return this.plucks[stringIdx];
    },

    consumeStrumEnergy() {
        const e = this.strumEnergy;
        this.strumEnergy = 0;
        return e;
    },

    checkInteraction(stringIdx, baseX, freq, stringIndex, time, phase, amplitude, alpha, color) {
        if (alpha <= 0.03) return;
        const C = App.Config;
        const DPR = App.DPR;
        const H = App.H;
        const pluck = this.plucks[stringIdx];

        for (const [pointerId, ptr] of App.Input.pointers) {
            const lockKey = this.getLockKey(pointerId, stringIdx);
            const pointerT = ptr.y / H;
            if (pointerT < 0.05 || pointerT > 0.95) continue;

            const displacement = App.WaveModels.getDisplacement(stringIdx, pointerT, time, amplitude, freq, phase);
            const stringX = baseX + displacement;

            const crossedOver = (ptr.prevX - stringX) * (ptr.x - stringX) < 0;
            const dist = Math.abs(ptr.x - stringX);
            const hit = dist < C.STRING_HIT_RADIUS * DPR || crossedOver;

            const pointerMoved = Math.abs(ptr.x - ptr.prevX) > 2 * DPR;
            if (crossedOver && pointerMoved) this.locks.delete(lockKey);

            if (hit) {
                if (this.locks.has(lockKey)) continue;

                const speed = Math.abs(ptr.x - ptr.prevX) + Math.abs(ptr.y - ptr.prevY);
                if (speed < C.STRING_PLUCK_MIN_SPEED * DPR) continue;

                this.locks.set(lockKey, true);
                const moveDir = (ptr.x - ptr.prevX) > 0 ? 1 : -1;
                const force = moveDir * Math.min(C.STRING_PLUCK_MAX_FORCE * DPR, speed * 1.5);
                pluck.y = ptr.y;
                pluck.offset += force;
                pluck.offset = Math.max(-C.STRING_PLUCK_CLAMP * DPR, Math.min(C.STRING_PLUCK_CLAMP * DPR, pluck.offset));
                pluck.glow = 1;
                pluck.glowSpread = 0;

                const normalizedY = ptr.y / H;
                const normalizedSpeed = Math.min(1, (speed / DPR - C.STRING_PLUCK_MIN_SPEED) / (C.STRING_PLUCK_MAX_FORCE - C.STRING_PLUCK_MIN_SPEED));
                App.dbg('STRUM: string=' + stringIdx + ' y=' + normalizedY.toFixed(2) + ' speed=' + normalizedSpeed.toFixed(2));
                App.WaveModels.strum(stringIdx, normalizedY, normalizedSpeed);
                App.Audio.playNote(normalizedY, normalizedSpeed, stringIdx);
                this.strumEnergy += normalizedSpeed;

                const burstCount = C.STRING_BURST_COUNT_MIN + Math.floor(Math.random() * C.STRING_BURST_COUNT_RANGE);
                for (let b = 0; b < burstCount; b++) {
                    const spd = (C.STRING_BURST_SPEED + speed * 0.05) * DPR;
                    const angle = (Math.random() - 0.5) * C.STRING_BURST_ANGLE;
                    App.Particles.spawn(stringX, ptr.y, moveDir * spd * Math.cos(angle), spd * Math.sin(angle), color);
                }
            } else {
                this.locks.delete(lockKey);
            }
        }
    },

    draw(ctx, s, baseX, freq, phase, time, amplitude, alpha, orbGrow, orbForm, stringsFade, cx, cy, orbRadius, W, H) {
        const C = App.Config;
        const DPR = App.DPR;

        // Orb pushes strings outward into pairs at the edges
        // On narrow screens, start pushing at orbForm (earlier) to prevent overlap
        const edgeInset = W * C.STRING_PUSH_EDGE;
        const pairGap = W * C.STRING_PAIR_GAP;
        const pairTargets = [
            edgeInset,
            edgeInset + pairGap,
            W - edgeInset - pairGap,
            W - edgeInset,
        ];
        const aspect = W / H;
        const mobileBlend = Math.max(0, Math.min(1, 1 - aspect * 1.5));
        const desktopPush = App.easeOutQuint(orbGrow);
        const mobilePush = App.easeOutQuint(Math.max(orbForm, orbGrow));
        const pushAmount = desktopPush + (mobilePush - desktopPush) * mobileBlend;
        const actualBaseX = baseX + (pairTargets[s] - baseX) * pushAmount;

        const pluck = this.getPluck(s);
        const color = App.STRING_COLORS[s];

        // Aurora evolution: as orb grows, waves slow down and glow widens
        const auroraBlend = orbGrow * orbGrow;
        const effectiveFreq = freq * (1 - auroraBlend * (1 - C.STRING_AURORA_FREQ_MULT));

        const path = new Path2D();
        let started = false;
        for (let y = 0; y <= H; y += C.STRING_STEP_PX) {
            const t = y / H;

            let displacement = App.WaveModels.getDisplacement(s, t, time, amplitude, effectiveFreq, phase);

            let pluckDisp = 0;
            if (pluck.offset !== 0) {
                const dy = (y - pluck.y) / (H * 0.08);
                pluckDisp = pluck.offset * Math.exp(-dy * dy);
            }

            const x = actualBaseX + displacement + pluckDisp;
            if (!started) { path.moveTo(x, y); started = true; }
            else { path.lineTo(x, y); }
        }

        // During fade: string becomes more translucent
        const fadeAlpha = alpha * (1 - stringsFade * 0.7);

        // Visual echo trails: ghost afterimages when aurora is active
        if (auroraBlend > 0.3) {
            const trails = this._trails[s];
            this._trailFrame++;
            if (this._trailFrame % C.AURORA_TRAIL_FRAME_SKIP === 0) {
                trails.push(path);
                if (trails.length > C.AURORA_TRAIL_COUNT) trails.shift();
            }
            for (let ti = 0; ti < trails.length; ti++) {
                const trailAge = (trails.length - ti) / trails.length;
                const trailAlpha = C.AURORA_TRAIL_ALPHA_BASE * (1 - trailAge) * auroraBlend * fadeAlpha;
                if (trailAlpha < 0.005) continue;
                ctx.strokeStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${trailAlpha})`;
                ctx.lineWidth = (3 + auroraBlend * 2) * DPR * (1 - trailAge * 0.5);
                ctx.stroke(trails[ti]);
            }
        } else if (this._trails[s].length > 0) {
            this._trails[s].length = 0;
        }

        // Aurora glow: multi-layer bloom widens with orbGrow
        const auroraGlow = C.STRING_AURORA_GLOW_MAX * auroraBlend * DPR;
        if (auroraGlow > 1) {
            // Outermost diffuse halo
            ctx.strokeStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${fadeAlpha * 0.03})`;
            ctx.lineWidth = auroraGlow * 1.8;
            ctx.lineCap = 'round';
            ctx.stroke(path);
            // Mid glow
            ctx.strokeStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${fadeAlpha * 0.07})`;
            ctx.lineWidth = auroraGlow;
            ctx.stroke(path);
        }

        // Standard 3-layer rendering (grows more luminous with aurora)
        const baseGlow = (6 + auroraBlend * 6) * DPR;
        ctx.strokeStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${fadeAlpha * (0.15 + auroraBlend * 0.1)})`;
        ctx.lineWidth = baseGlow;
        ctx.stroke(path);
        ctx.strokeStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${fadeAlpha * (0.35 + auroraBlend * 0.2)})`;
        ctx.lineWidth = (3 + auroraBlend * 1.5) * DPR;
        ctx.stroke(path);
        ctx.strokeStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${fadeAlpha * (0.8 + auroraBlend * 0.2)})`;
        ctx.lineWidth = (1.5 + auroraBlend * 0.5) * DPR;
        ctx.stroke(path);

        // White-hot highlight core (ribbon catching light)
        if (auroraBlend > 0.3) {
            const hlAlpha = fadeAlpha * (auroraBlend - 0.3) * 0.5;
            ctx.strokeStyle = `rgba(255, 245, 220, ${hlAlpha})`;
            ctx.lineWidth = (1 + auroraBlend * 0.5) * DPR;
            ctx.stroke(path);
        }

        // Dissolve particles: string sheds itself toward the orb during fade
        if (stringsFade > 0.05) {
            const emitChance = C.STRING_DISSOLVE_CHANCE * stringsFade * (1 + stringsFade);
            if (Math.random() < emitChance) {
                const spawnT = 0.1 + Math.random() * 0.8;
                const spawnY = spawnT * H;
                const disp = App.WaveModels.getDisplacement(s, spawnT, time, amplitude, freq, phase);
                const spawnX = actualBaseX + disp;

                const angle = Math.atan2(cy - spawnY, cx - spawnX) + (Math.random() - 0.5) * 0.6;
                const speed = (0.8 + Math.random() * 2) * DPR * (0.5 + stringsFade);
                App.Particles.spawn(spawnX, spawnY, Math.cos(angle) * speed, Math.sin(angle) * speed, color);
            }
        }

        // Pluck glow
        if (pluck.glow > 0) {
            const bandWidth = 35 * DPR;
            const topEdge = Math.max(0, pluck.y - pluck.glowSpread);
            const botEdge = Math.min(H, pluck.y + pluck.glowSpread);
            const topBandStart = Math.max(0, topEdge - bandWidth);
            const botBandEnd = Math.min(H, botEdge + bandWidth);

            const grad = ctx.createLinearGradient(0, 0, 0, H);
            const glowAlpha = pluck.glow * fadeAlpha;
            const colorStr = `${color[0]}, ${color[1]}, ${color[2]}`;

            const stops = [];
            stops.push([0, 'rgba(0,0,0,0)']);
            if (topBandStart / H > 0.002) stops.push([topBandStart / H, 'rgba(0,0,0,0)']);
            stops.push([topEdge / H, `rgba(${colorStr}, ${glowAlpha * 0.9})`]);
            if (pluck.glowSpread > bandWidth) {
                stops.push([pluck.y / H, `rgba(${colorStr}, ${glowAlpha * 0.25})`]);
            }
            stops.push([botEdge / H, `rgba(${colorStr}, ${glowAlpha * 0.9})`]);
            if (botBandEnd / H < 0.998) stops.push([botBandEnd / H, 'rgba(0,0,0,0)']);
            stops.push([1, 'rgba(0,0,0,0)']);

            let prev = -1;
            for (const [offset, col] of stops) {
                const clamped = Math.min(1, Math.max(prev + 0.001, Math.min(offset, 0.999)));
                grad.addColorStop(clamped, col);
                prev = clamped;
            }

            ctx.strokeStyle = grad;
            ctx.lineWidth = 8 * DPR;
            ctx.stroke(path);

            const whiteGrad = ctx.createLinearGradient(0, 0, 0, H);
            prev = -1;
            const whiteStops = [];
            whiteStops.push([0, 'rgba(0,0,0,0)']);
            if (topBandStart / H > 0.002) whiteStops.push([topBandStart / H, 'rgba(0,0,0,0)']);
            whiteStops.push([topEdge / H, `rgba(255,255,255, ${glowAlpha * 0.5})`]);
            if (pluck.glowSpread > bandWidth) {
                whiteStops.push([pluck.y / H, `rgba(255,255,255, ${glowAlpha * 0.08})`]);
            }
            whiteStops.push([botEdge / H, `rgba(255,255,255, ${glowAlpha * 0.5})`]);
            if (botBandEnd / H < 0.998) whiteStops.push([botBandEnd / H, 'rgba(0,0,0,0)']);
            whiteStops.push([1, 'rgba(0,0,0,0)']);

            for (const [offset, col] of whiteStops) {
                const clamped = Math.min(1, Math.max(prev + 0.001, Math.min(offset, 0.999)));
                whiteGrad.addColorStop(clamped, col);
                prev = clamped;
            }

            ctx.strokeStyle = whiteGrad;
            ctx.lineWidth = 3 * DPR;
            ctx.stroke(path);
        }

        return actualBaseX;
    },

    drawProfileBar(ctx, W, H) {
        const C = App.Config;
        const DPR = App.DPR;
        const barW = 120 * DPR;
        const barH = 10 * DPR;
        const gap = 3 * DPR;
        const barX = W - (barW + 8 * DPR);
        const barY = 8 * DPR;

        ctx.font = `${8 * DPR}px monospace`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';

        for (let s = 0; s < C.NUM_STRINGS; s++) {
            const pluck = this.plucks[s];
            const y = barY + s * (barH + gap);
            const color = App.STRING_COLORS[s];

            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(barX, y, barW, barH);

            if (pluck.glow > 0) {
                const spreadPct = Math.min(1, pluck.glowSpread / (H * 0.5));
                const halfBar = barW * 0.5 * spreadPct;
                const midX = barX + barW * 0.5;
                ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${pluck.glow * 0.8})`;
                ctx.fillRect(midX - halfBar, y, halfBar * 2, barH);

                ctx.fillStyle = `rgba(255, 255, 255, ${pluck.glow})`;
                ctx.fillRect(midX - halfBar - 1 * DPR, y, 2 * DPR, barH);
                ctx.fillRect(midX + halfBar - 1 * DPR, y, 2 * DPR, barH);
            }

            const offsetPct = pluck.offset / (C.STRING_PLUCK_CLAMP * DPR);
            const offsetX = barX + barW * 0.5 + offsetPct * barW * 0.4;
            ctx.fillStyle = `rgba(255, 255, 255, 0.9)`;
            ctx.fillRect(offsetX - 1 * DPR, y, 2 * DPR, barH);

            ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.9)`;
            ctx.textAlign = 'right';
            ctx.fillText(`S${s + 1}`, barX - 4 * DPR, y + 1 * DPR);
            ctx.textAlign = 'left';
        }
    }
};
