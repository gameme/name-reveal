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
        const state = this.states[stringIdx];
        const baseFreq = 6 + Math.random() * 4;
        // Amplitude scales with velocity: gentle strum = subtle wave, fast strum = strong wave
        const amp = intensity * 0.015;
        state.waves.push(
            { origin: normalizedY, age: 0, amp, freq: baseFreq, dir: 1, speed: 0.012 + intensity * 0.008, pos: normalizedY },
            { origin: normalizedY, age: 0, amp, freq: baseFreq, dir: -1, speed: 0.012 + intensity * 0.008, pos: normalizedY }
        );
        if (state.waves.length > 16) state.waves.splice(0, 2);
    },

    update() {
        for (const state of this.states) {
            for (let i = state.waves.length - 1; i >= 0; i--) {
                const w = state.waves[i];
                w.age += 1;
                w.amp *= 0.997;
                // Pre-compute position and phase for this frame
                w.pos = w.origin + w.dir * w.speed * w.age;
                if (w.pos > 1.0 || w.pos < 0.0) w.dir *= -1;
                w.sinPhase = Math.sin(w.age * 0.3);
                if (w.amp < 0.001) state.waves.splice(i, 1);
            }
        }
    },

    getDisplacement(stringIdx, t, time, baseAmplitude, freq, phase) {
        const state = this.states[stringIdx];
        const envelope = Math.sin(t * Math.PI);
        let d = Math.sin(t * freq * Math.PI * 4 + time * (2 + stringIdx * 0.5) + phase) * baseAmplitude * envelope;

        for (let i = 0, len = state.waves.length; i < len; i++) {
            const w = state.waves[i];
            const dist = t - w.pos;
            // Tight pulse — narrow width like a real string perturbation
            if (dist > 0.08 || dist < -0.08) continue;
            const distSq = dist * dist;
            const falloff = 1 - distSq * 156; // ~0 at dist=0.08
            if (falloff <= 0) continue;
            d += Math.sin(t * w.freq * Math.PI + w.age * 0.3) * w.amp * baseAmplitude * falloff;
        }

        return d;
    },

    // Backup: Harmonics model (not active)
    // strumHarmonics(state, normalizedY, force) {
    //     const harmonic = Math.max(1, Math.round(1 / Math.max(0.05, Math.min(normalizedY, 1 - normalizedY))));
    //     const clampedHarmonic = Math.min(harmonic, 8);
    //     state.harmonics.push({
    //         freq: clampedHarmonic,
    //         amp: Math.abs(force) * 0.015,
    //         phase: Math.random() * Math.PI * 2,
    //         decay: 0.9992,
    //     });
    //     if (state.harmonics.length > 12) state.harmonics.shift();
    // },

    getModelLabel() {
        return 'Traveling';
    }
};
