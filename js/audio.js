window.App = window.App || {};

App.Audio = {
    audioCtx: null,
    droneGain: null,
    melodyGain: null,
    droneFilter: null,
    masterGain: null,
    started: false,
    muted: false,
    _melodyPlaying: false,
    lastUpdate: 0,
    droneAudio: null,
    melodyAudio: null,

    // Sa Re Ga Ma Pa Dha Ni Sa' — just intonation ratios
    SWARA_RATIOS: [1, 9/8, 5/4, 4/3, 3/2, 5/3, 15/8, 2],
    SWARA_BASE: 240,
    // Post-reveal sound: pentatonic + shimmer wash
    // Pentatonic scale (Sa, Ga, Pa, Sa') — only consonant intervals
    PENTATONIC_RATIOS: [1, 5/4, 3/2, 2, 5/2, 3, 4],

    // Compression sound state
    _compressionActive: false,
    _noiseSource: null,
    _noiseBP: null,
    _noiseGain: null,
    _subOsc: null,
    _subGain: null,
    _lastPulseTime: 0,
    _pulseInterval: 1.0,
    _harmonicGain: null,
    _harmonicOscs: [],
    _harmonicsSpawned: 0,

    preload() {
        this.droneAudio = new Audio('audio/tanpura-drone.mp3');
        this.droneAudio.loop = true;
        this.droneAudio.preload = 'auto';

        this.melodyAudio = new Audio('audio/melody.mp3');
        this.melodyAudio.loop = true;
        this.melodyAudio.preload = 'auto';
    },

    async init(muteBtn) {
        if (this.started) return;
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();

        if (this.audioCtx.state === 'suspended') {
            await this.audioCtx.resume();
        }

        this.masterGain = this.audioCtx.createGain();
        this.masterGain.gain.value = 1.0;
        this.masterGain.connect(this.audioCtx.destination);

        this.droneGain = this.audioCtx.createGain();
        this.droneGain.gain.value = 0.1;
        this.droneFilter = this.audioCtx.createBiquadFilter();
        this.droneFilter.type = 'lowpass';
        this.droneFilter.frequency.value = App.Config.DRONE_FILTER_MIN;

        const droneSource = this.audioCtx.createMediaElementSource(this.droneAudio);
        droneSource.connect(this.droneFilter);
        this.droneFilter.connect(this.droneGain);
        this.droneGain.connect(this.masterGain);

        this.melodyGain = this.audioCtx.createGain();
        this.melodyGain.gain.value = 0;
        const melodySource = this.audioCtx.createMediaElementSource(this.melodyAudio);
        melodySource.connect(this.melodyGain);
        this.melodyGain.connect(this.masterGain);

        this.droneAudio.play();
        // this.melodyAudio.play(); // temporarily disabled to hear synth effects

        this.started = true;
        if (muteBtn) muteBtn.classList.add('visible');
    },

    // Per-string octave offsets (low to high) and timbre brightness
    STRING_OCTAVES: [0.5, 0.75, 1, 1.5],
    STRING_BRIGHTNESS: [0.05, 0.15, 0.3, 0.5],

    playNote(normalizedY, velocity, stringIdx) {
        if (!this.started || this.muted) return;
        if (this._melodyPlaying) {
            this._playShimmerNote(normalizedY, velocity, stringIdx);
        } else {
            this._playBaseNote(normalizedY, velocity, stringIdx);
        }
    },

    _playBaseNote(normalizedY, velocity, stringIdx) {
        const ctx = this.audioCtx;
        const t = ctx.currentTime;

        const idx = Math.min(7, Math.floor(normalizedY * 8));
        const octave = this.STRING_OCTAVES[stringIdx] || 1;
        const brightness = this.STRING_BRIGHTNESS[stringIdx] || 0.15;
        const freq = this.SWARA_BASE * this.SWARA_RATIOS[idx] * octave;

        const vol = 0.12 + velocity * 0.18;
        const decay = 0.8 + (1 - velocity) * 0.6;

        const osc1 = ctx.createOscillator();
        osc1.type = stringIdx < 2 ? 'sine' : 'triangle';
        osc1.frequency.value = freq;

        const osc2 = ctx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.value = freq * 2.01;

        const osc3 = ctx.createOscillator();
        osc3.type = 'sine';
        osc3.frequency.value = freq * 3;

        const osc4 = ctx.createOscillator();
        osc4.type = 'sine';
        osc4.frequency.value = freq * 4.02;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(vol, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(vol * 0.3, t + decay * 0.4);
        gain.gain.exponentialRampToValueAtTime(0.001, t + decay);

        const g1 = ctx.createGain(); g1.gain.value = 1.0;
        const g2 = ctx.createGain(); g2.gain.value = 0.2 + brightness * 0.4;
        const g3 = ctx.createGain(); g3.gain.value = brightness * 0.5;
        const g4 = ctx.createGain(); g4.gain.value = brightness * 0.3;

        osc1.connect(g1); g1.connect(gain);
        osc2.connect(g2); g2.connect(gain);
        osc3.connect(g3); g3.connect(gain);
        osc4.connect(g4); g4.connect(gain);
        gain.connect(this.masterGain);

        osc1.start(t); osc2.start(t); osc3.start(t); osc4.start(t);
        osc1.stop(t + decay + 0.05);
        osc2.stop(t + decay + 0.05);
        osc3.stop(t + decay + 0.05);
        osc4.stop(t + decay + 0.05);
    },

    // Pentatonic + shimmer wash: long decay, octave doubling, consonant only
    _playShimmerNote(normalizedY, velocity, stringIdx) {
        const ctx = this.audioCtx;
        const t = ctx.currentTime;

        // Map to pentatonic (7 positions across the string)
        const idx = Math.min(6, Math.floor(normalizedY * 7));
        const octave = this.STRING_OCTAVES[stringIdx] || 1;
        const freq = this.SWARA_BASE * this.PENTATONIC_RATIOS[idx] * octave;

        const vol = 0.06 + velocity * 0.08;
        const decay = 3.0 + (1 - velocity) * 2.0;

        // Root
        const osc1 = ctx.createOscillator();
        osc1.type = 'sine';
        osc1.frequency.value = freq;

        // Octave above (shimmer)
        const osc2 = ctx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.value = freq * 2.003;

        // Detuned pair for beating
        const osc3 = ctx.createOscillator();
        osc3.type = 'sine';
        osc3.frequency.value = freq * 1.002;

        // Fifth above (adds fullness)
        const osc4 = ctx.createOscillator();
        osc4.type = 'sine';
        osc4.frequency.value = freq * 1.498;

        // Long wash envelope
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(vol, t + 0.05);
        gain.gain.setValueAtTime(vol, t + 0.3);
        gain.gain.exponentialRampToValueAtTime(vol * 0.4, t + decay * 0.5);
        gain.gain.exponentialRampToValueAtTime(0.001, t + decay);

        const g2 = ctx.createGain(); g2.gain.value = 0.5;
        const g3 = ctx.createGain(); g3.gain.value = 0.6;
        const g4 = ctx.createGain(); g4.gain.value = 0.35;

        osc1.connect(gain);
        osc2.connect(g2); g2.connect(gain);
        osc3.connect(g3); g3.connect(gain);
        osc4.connect(g4); g4.connect(gain);
        gain.connect(this.masterGain);

        osc1.start(t); osc2.start(t); osc3.start(t); osc4.start(t);
        osc1.stop(t + decay + 0.1);
        osc2.stop(t + decay + 0.1);
        osc3.stop(t + decay + 0.1);
        osc4.stop(t + decay + 0.1);
    },

    // Sustained drone tones from letter reveals (persist until compression ends)
    _letterDrones: [],

    // Letter reveal — percussive impact + sustained drone layer
    playLetterChime(letterIndex) {
        if (!this.started || this.muted) return;
        const ctx = this.audioCtx;
        const t = ctx.currentTime;

        const ratios = [1, 9/8, 5/4, 4/3, 3/2, 5/3, 15/8, 2];
        const freq = 220 * ratios[Math.min(letterIndex, 7)];

        // Sub thump (gets deeper with each letter)
        const subFreq = 60 - letterIndex * 5;
        const sub = ctx.createOscillator();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(subFreq * 2, t);
        sub.frequency.exponentialRampToValueAtTime(subFreq, t + 0.08);
        const subGain = ctx.createGain();
        const hitVol = 0.2 + letterIndex * 0.04;
        subGain.gain.setValueAtTime(hitVol, t);
        subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        sub.connect(subGain);
        subGain.connect(this.masterGain);
        sub.start(t);
        sub.stop(t + 0.35);

        // Sustained drone layer
        const droneOsc = ctx.createOscillator();
        droneOsc.type = 'sine';
        droneOsc.frequency.value = freq;

        const droneOsc2 = ctx.createOscillator();
        droneOsc2.type = 'sine';
        droneOsc2.frequency.value = freq * 1.002; // slight beating

        const droneGain = ctx.createGain();
        droneGain.gain.setValueAtTime(0, t);
        droneGain.gain.linearRampToValueAtTime(0.06, t + 0.3);

        const g2 = ctx.createGain();
        g2.gain.value = 0.7;

        droneOsc.connect(droneGain);
        droneOsc2.connect(g2);
        g2.connect(droneGain);
        droneGain.connect(this.masterGain);

        droneOsc.start(t);
        droneOsc2.start(t);

        this._letterDrones.push({ osc: droneOsc, osc2: droneOsc2, gain: droneGain });
    },

    // Fade out and stop all letter drones (called when compression ends / burst fires)
    _stopLetterDrones() {
        const ctx = this.audioCtx;
        const t = ctx.currentTime;
        for (const d of this._letterDrones) {
            d.gain.gain.setTargetAtTime(0, t, 0.1);
            d.osc.stop(t + 0.5);
            d.osc2.stop(t + 0.5);
        }
        this._letterDrones = [];
    },

    // Stop all reveal sounds (called on scroll-away reset)
    stopRevealSounds() {
        if (!this.started) return;
        this._stopLetterDrones();
        if (this._compressionActive) this.stopCompression();
    },

    // Compression build — reverse swell + accelerating pulse + harmonic stacking
    startCompression() {
        if (!this.started || this.muted || this._compressionActive) return;
        const ctx = this.audioCtx;
        const t = ctx.currentTime;
        this._compressionActive = true;

        // Rising noise sweep
        const bufferSize = ctx.sampleRate * 8;
        const noiseBuf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const nd = noiseBuf.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) nd[i] = Math.random() * 2 - 1;
        this._noiseSource = ctx.createBufferSource();
        this._noiseSource.buffer = noiseBuf;
        this._noiseSource.loop = true;

        this._noiseBP = ctx.createBiquadFilter();
        this._noiseBP.type = 'bandpass';
        this._noiseBP.frequency.value = 100;
        this._noiseBP.Q.value = 3;

        this._noiseGain = ctx.createGain();
        this._noiseGain.gain.value = 0;

        this._noiseSource.connect(this._noiseBP);
        this._noiseBP.connect(this._noiseGain);
        this._noiseGain.connect(this.masterGain);
        this._noiseSource.start(t);

        // Sub pulse oscillator
        this._subOsc = ctx.createOscillator();
        this._subOsc.type = 'sine';
        this._subOsc.frequency.value = 40;
        this._subGain = ctx.createGain();
        this._subGain.gain.value = 0;
        this._subOsc.connect(this._subGain);
        this._subGain.connect(this.masterGain);
        this._subOsc.start(t);

        // Harmonic stacking — oscillators added progressively
        this._harmonicGain = ctx.createGain();
        this._harmonicGain.gain.value = 0;
        this._harmonicGain.connect(this.masterGain);
        this._harmonicOscs = [];
        this._harmonicsSpawned = 0;

        this._lastPulseTime = 0;
        this._pulseInterval = 1.0;
    },

    updateCompression(compression) {
        if (!this._compressionActive) return;
        const ctx = this.audioCtx;
        const t = ctx.currentTime;

        // Noise sweep: frequency and volume rise with compression
        const noiseFreq = 100 + compression * compression * 4000;
        const noiseVol = compression * compression * 0.18;
        this._noiseBP.frequency.setTargetAtTime(noiseFreq, t, 0.1);
        this._noiseGain.gain.setTargetAtTime(noiseVol, t, 0.1);
        this._noiseBP.Q.setTargetAtTime(3 + compression * 8, t, 0.1);

        // Accelerating sub pulse
        const targetInterval = Math.max(0.12, 1.0 - compression * compression * 0.88);
        this._pulseInterval = targetInterval;
        if (t - this._lastPulseTime > this._pulseInterval) {
            this._lastPulseTime = t;
            const pulseVol = 0.1 + compression * 0.2;
            this._subGain.gain.setValueAtTime(pulseVol, t);
            this._subGain.gain.exponentialRampToValueAtTime(0.001, t + targetInterval * 0.6);
        }

        // Harmonic stacking — add a new oscillator at each threshold
        const baseFreq = 110;
        const harmonicFreqs = [1, 1.5, 2, 2.67, 3, 3.5, 4, 4.5, 5.33, 6];
        const targetCount = Math.floor(compression * harmonicFreqs.length);

        while (this._harmonicsSpawned < targetCount) {
            const i = this._harmonicsSpawned;
            const osc = ctx.createOscillator();
            osc.type = i < 3 ? 'sine' : 'triangle';
            osc.frequency.value = baseFreq * harmonicFreqs[i];
            // Progressive detuning — gets more dissonant as it builds
            osc.detune.value = i * i * 3;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0, t);
            g.gain.linearRampToValueAtTime(0.04 / Math.sqrt(i + 1), t + 0.3);
            osc.connect(g);
            g.connect(this._harmonicGain);
            osc.start(t);
            this._harmonicOscs.push({ osc, gain: g });
            this._harmonicsSpawned++;
        }

        // Overall harmonic volume rises with compression
        const hVol = compression * compression * 0.5;
        this._harmonicGain.gain.setTargetAtTime(hVol, t, 0.15);

        // Pitch bend all harmonics upward as compression approaches 1
        const bend = compression * compression * compression * 200;
        for (const h of this._harmonicOscs) {
            h.osc.detune.setTargetAtTime(h.osc.detune.value + bend, t, 0.2);
        }
    },

    stopCompression() {
        if (!this._compressionActive) return;
        this._compressionActive = false;
        const ctx = this.audioCtx;
        const t = ctx.currentTime;

        if (this._noiseGain) this._noiseGain.gain.setTargetAtTime(0, t, 0.02);
        if (this._subGain) this._subGain.gain.setTargetAtTime(0, t, 0.02);
        if (this._noiseSource) this._noiseSource.stop(t + 0.1);
        if (this._subOsc) this._subOsc.stop(t + 0.1);
        this._noiseSource = null;
        this._subOsc = null;

        // Kill all harmonics
        if (this._harmonicGain) this._harmonicGain.gain.setTargetAtTime(0, t, 0.02);
        for (const h of this._harmonicOscs) h.osc.stop(t + 0.1);
        this._harmonicOscs = [];
        this._harmonicsSpawned = 0;

        this._stopLetterDrones();
    },

    // Supernova burst — layered impact: sub boom + crack + shimmer
    playBurst() {
        if (!this.started || this.muted) return;
        const ctx = this.audioCtx;
        const t = ctx.currentTime;

        // Sub boom (40Hz sine, fast decay)
        const boom = ctx.createOscillator();
        boom.type = 'sine';
        boom.frequency.value = 40;
        boom.frequency.exponentialRampToValueAtTime(25, t + 0.5);
        const boomGain = ctx.createGain();
        boomGain.gain.setValueAtTime(0.4, t);
        boomGain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
        boom.connect(boomGain);
        boomGain.connect(this.masterGain);
        boom.start(t);
        boom.stop(t + 0.9);

        // Crack (noise burst, bandpass swept)
        const bufferSize = ctx.sampleRate * 0.3;
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1);

        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuffer;
        const bandpass = ctx.createBiquadFilter();
        bandpass.type = 'bandpass';
        bandpass.frequency.setValueAtTime(6000, t);
        bandpass.frequency.exponentialRampToValueAtTime(400, t + 0.3);
        bandpass.Q.value = 2;
        const crackGain = ctx.createGain();
        crackGain.gain.setValueAtTime(0.3, t);
        crackGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        noise.connect(bandpass);
        bandpass.connect(crackGain);
        crackGain.connect(this.masterGain);
        noise.start(t);
        noise.stop(t + 0.35);

        // Shimmer tail (detuned high oscillators, long release)
        const shimmerFreqs = [880, 887, 1320, 1327, 1760];
        shimmerFreqs.forEach(freq => {
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = freq;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0, t);
            g.gain.linearRampToValueAtTime(0.04, t + 0.05);
            g.gain.exponentialRampToValueAtTime(0.001, t + 2.5);
            osc.connect(g);
            g.connect(this.masterGain);
            osc.start(t);
            osc.stop(t + 2.6);
        });
    },

    // Singing bowl — peaceful resolution after burst
    playSingingBowl() {
        if (!this.started || this.muted) return;
        const ctx = this.audioCtx;
        const t = ctx.currentTime;

        // Two slightly detuned sines for beating effect (Sa + Pa)
        const freqs = [240, 240.8, 360, 360.6];
        freqs.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = freq;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0, t);
            g.gain.linearRampToValueAtTime(i < 2 ? 0.08 : 0.04, t + 1.5);
            g.gain.setValueAtTime(i < 2 ? 0.08 : 0.04, t + 4);
            g.gain.exponentialRampToValueAtTime(0.001, t + 7);
            osc.connect(g);
            g.connect(this.masterGain);
            osc.start(t);
            osc.stop(t + 7.1);
        });
    },

    // Start melody playback after supernova
    startMelody() {
        if (!this.started || this.muted) return;
        this.melodyAudio.currentTime = 0;
        this.melodyAudio.play();
        const t = this.audioCtx.currentTime;
        this.melodyGain.gain.setValueAtTime(0, t);
        this.melodyGain.gain.linearRampToValueAtTime(0.6, t + 2.0);
        this._melodyPlaying = true;
    },

    update(progress) {
        if (!this.started) return;
        const C = App.Config;
        const now = Date.now();
        if (now - this.lastUpdate < C.AUDIO_UPDATE_INTERVAL) return;
        this.lastUpdate = now;

        const t = this.audioCtx.currentTime;
        // Duck drone heavily once melody is playing
        const revealDuck = this._melodyPlaying ? 0.08 : (progress > 0.85 ? 0.15 : 1.0);
        const droneVol = Math.min(0.7, progress * 3 + 0.1) * revealDuck;
        this.droneGain.gain.setTargetAtTime(droneVol, t, 0.3);
        const filterFreq = C.DRONE_FILTER_MIN + progress * (C.DRONE_FILTER_MAX - C.DRONE_FILTER_MIN);
        this.droneFilter.frequency.setTargetAtTime(filterFreq, t, 0.3);
        const melodyVol = Math.max(0, Math.min(0.8, (progress - C.MELODY_FADE_START) / (C.MELODY_FADE_END - C.MELODY_FADE_START)));
        this.melodyGain.gain.setTargetAtTime(melodyVol, t, 0.5);
    },

    toggleMute() {
        this.muted = !this.muted;
        if (this.masterGain) {
            this.masterGain.gain.setTargetAtTime(this.muted ? 0 : 1, this.audioCtx.currentTime, 0.1);
        }
        return this.muted;
    }
};
