window.App = window.App || {};

App.WaveModels = {
    states: null,

    init() {
        this.states = [];
        for (let s = 0; s < App.Config.NUM_STRINGS; s++) {
            this.states.push({ waves: [] });
        }
    },

    strum(stringIdx, normalizedY, intensity) {
        const C = App.Config;
        const state = this.states[stringIdx];
        const baseFreq = C.STRUM_WAVE_FREQ_MIN + Math.random() * C.STRUM_WAVE_FREQ_RANGE;
        const amp = intensity * C.STRUM_WAVE_AMP_SCALE;
        const speed = C.STRUM_WAVE_SPEED_MIN + intensity * C.STRUM_WAVE_SPEED_INTENSITY_GAIN;
        state.waves.push(
            { age: 0, amp, freq: baseFreq, dir: 1, speed, pos: normalizedY },
            { age: 0, amp, freq: baseFreq, dir: -1, speed, pos: normalizedY }
        );
        if (state.waves.length > C.STRUM_WAVE_CAP) state.waves.splice(0, 2);
    },

    update() {
        const C = App.Config;
        for (const state of this.states) {
            for (let i = state.waves.length - 1; i >= 0; i--) {
                const w = state.waves[i];
                w.age += 1;
                w.amp *= C.STRUM_WAVE_DECAY;
                w.pos += w.dir * w.speed;
                if (w.pos > 1.0) { w.pos = 2.0 - w.pos; w.dir *= -1; }
                else if (w.pos < 0.0) { w.pos = -w.pos; w.dir *= -1; }
                if (w.amp < 0.001) state.waves.splice(i, 1);
            }
        }
    },

    // t: normalized position [0,1] along string; time: animation clock (seconds);
    // freq: spatial frequency multiplier; phase: offset (radians); baseAmplitude: pixels
    getDisplacement(stringIdx, t, time, baseAmplitude, freq, phase) {
        const C = App.Config;
        const state = this.states[stringIdx];
        const animSpeed = App.STRING_ANIM_SPEED;
        let d = Math.sin(t * freq * Math.PI * 4 + time * animSpeed + phase) * baseAmplitude;

        const range = C.STRUM_WAVE_FALLOFF_HALF_WIDTH;
        const invRangeSq = 1 / (range * range);
        for (let i = 0, len = state.waves.length; i < len; i++) {
            const w = state.waves[i];
            const dist = t - w.pos;
            if (dist > range || dist < -range) continue;
            const distSq = dist * dist;
            const falloff = 1 - distSq * invRangeSq;
            if (falloff <= 0) continue;
            d += Math.sin(t * w.freq * Math.PI + w.age * 0.3) * w.amp * baseAmplitude * falloff;
        }

        return d;
    }
};
