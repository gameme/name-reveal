window.App = window.App || {};

const AUDIO_PHASE = { UNINITIALIZED: 0, PLAYING: 1, COMPRESSION: 2, MELODY: 3 };
const AUDIO_PHASE_NAME = ['uninitialized', 'playing', 'compression', 'melody'];

App.Audio = {
    audioCtx: null,
    droneGain: null,
    melodyGain: null,
    droneFilter: null,
    masterGain: null,
    phase: AUDIO_PHASE.UNINITIALIZED,
    muted: false,
    lastUpdate: 0,
    auroraBlend: 0,
    droneAudio: null,
    melodyAudio: null,

    get phaseName() { return AUDIO_PHASE_NAME[this.phase]; },

    // Sa Re Ga Ma Pa Dha Ni Sa' — just intonation ratios
    SWARA_RATIOS: [1, 9/8, 5/4, 4/3, 3/2, 5/3, 15/8, 2],
    SWARA_BASE: 240,
    // Post-reveal sound: pentatonic + shimmer wash
    // Pentatonic scale (Sa, Ga, Pa, Sa') — only consonant intervals
    PENTATONIC_RATIOS: [1, 5/4, 3/2, 2, 5/2, 3, 4],

    // Compression sound state
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

    init(muteBtn) {
        if (this.phase !== AUDIO_PHASE.UNINITIALIZED) { App.dbg('AUDIO: init skipped — already started'); return; }
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        App.dbg('AUDIO: AudioContext created, state=' + this.audioCtx.state);

        // Resume immediately (synchronous call inside gesture handler)
        this.audioCtx.resume();
        App.dbg('AUDIO: resume called, state=' + this.audioCtx.state);

        this.audioCtx.addEventListener('statechange', function() {
            App.dbg('AUDIO: state changed to ' + this.state);
        }.bind(this.audioCtx));

        this.masterGain = this.audioCtx.createGain();
        this.masterGain.gain.value = 1.0;

        this.limiter = this.audioCtx.createDynamicsCompressor();
        this.limiter.threshold.value = -6;
        this.limiter.knee.value = 3;
        this.limiter.ratio.value = 12;
        this.limiter.attack.value = 0.002;
        this.limiter.release.value = 0.1;

        this.masterGain.connect(this.limiter);
        this.limiter.connect(this.audioCtx.destination);

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

        this.droneAudio.play().then(function() {
            App.dbg('AUDIO: drone playing');
        }).catch(function(e) {
            App.dbge('AUDIO: drone play FAILED — ' + e.message);
        });

        // Pre-start melody silently (iOS requires media play inside gesture)
        this.melodyAudio.play().then(function() {
            App.dbg('AUDIO: melody pre-started (silent)');
        }).catch(function(e) {
            App.dbge('AUDIO: melody pre-start FAILED — ' + e.message);
        });

        this.phase = AUDIO_PHASE.PLAYING;
        this._ensureChimeReverb();
        this._reverbSendGain = this.audioCtx.createGain();
        this._reverbSendGain.gain.value = 0;
        this._reverbSendGain.connect(this._chimeReverb);

        // Echo delay line for aurora strings
        this._echoDelay = this.audioCtx.createDelay(1.0);
        this._echoDelay.delayTime.value = 0.18;
        this._echoFeedback = this.audioCtx.createGain();
        this._echoFeedback.gain.value = 0.35;
        this._echoSend = this.audioCtx.createGain();
        this._echoSend.gain.value = 0;
        this._echoFilter = this.audioCtx.createBiquadFilter();
        this._echoFilter.type = 'lowpass';
        this._echoFilter.frequency.value = 3000;
        this._echoSend.connect(this._echoDelay);
        this._echoDelay.connect(this._echoFilter);
        this._echoFilter.connect(this._echoFeedback);
        this._echoFeedback.connect(this._echoDelay);
        this._echoFilter.connect(this.masterGain);

        App.dbg('AUDIO: initialized, sampleRate=' + this.audioCtx.sampleRate + ' state=' + this.audioCtx.state);
        if (muteBtn) muteBtn.classList.add('visible');
    },

    STRING_OCTAVES: [0.5, 0.75, 1, 1.5],
    STRING_BRIGHTNESS: [0.05, 0.15, 0.3, 0.5],

    playNote(normalizedY, velocity, stringIdx) {
        if (this.phase === AUDIO_PHASE.UNINITIALIZED || this.muted) {
            App.dbg('AUDIO: playNote blocked — phase=' + this.phaseName + ' muted=' + this.muted + ' ctxState=' + (this.audioCtx ? this.audioCtx.state : 'none'));
            return;
        }
        if (this.phase === AUDIO_PHASE.MELODY) {
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

        if (this.auroraBlend > 0.3 && this._echoSend) {
            const sendLevel = (this.auroraBlend - 0.3) / 0.7 * App.Config.AURORA_ECHO_SEND_MAX;
            this._echoSend.gain.setValueAtTime(sendLevel, t);
            gain.connect(this._echoSend);
        }

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

    // Shared reverb for letter chimes (created once, reused)
    _chimeReverb: null,
    _chimeReverbGain: null,

    _ensureChimeReverb() {
        if (this._chimeReverb) return;
        const ctx = this.audioCtx;
        const length = ctx.sampleRate * 2.5;
        const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
            const data = buffer.getChannelData(ch);
            for (let i = 0; i < length; i++) {
                const t = i / ctx.sampleRate;
                data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 1.8) * 0.35;
            }
        }
        this._chimeReverb = ctx.createConvolver();
        this._chimeReverb.buffer = buffer;
        this._chimeReverbGain = ctx.createGain();
        this._chimeReverbGain.gain.value = 0.4;
        this._chimeReverb.connect(this._chimeReverbGain);
        this._chimeReverbGain.connect(this.masterGain);
    },

    // Letter reveal — heartbeat morphing into tone, panning left→right with letters
    playLetterChime(letterIndex) {
        if (this.phase === AUDIO_PHASE.UNINITIALIZED || this.muted) {
            App.dbg('AUDIO: playLetterChime blocked — phase=' + this.phaseName + ' muted=' + this.muted);
            return;
        }
        App.dbg('AUDIO: playLetterChime(' + letterIndex + ') ctxState=' + this.audioCtx.state);
        const ctx = this.audioCtx;
        const t = ctx.currentTime;
        this._ensureChimeReverb();

        const idx = Math.min(letterIndex, 7);
        const freq = 240 * this.SWARA_RATIOS[idx];
        const toneBlend = idx / 7; // 0 = pure heartbeat, 1 = pure tone

        // Spatial position: left → right following letter positions
        const pan = (idx / 7) * 1.4 - 0.7; // -0.7 to +0.7
        const panner = ctx.createStereoPanner();
        panner.pan.value = pan;

        // --- Heartbeat (fades out across the sequence) ---
        const beatVol = 0.25 * (1 - toneBlend * 0.8);
        const beat = ctx.createOscillator();
        beat.type = 'sine';
        beat.frequency.setValueAtTime(80, t);
        beat.frequency.exponentialRampToValueAtTime(40, t + 0.1);
        const beatGain = ctx.createGain();
        // Double-thump envelope (lub-dub)
        beatGain.gain.setValueAtTime(beatVol, t);
        beatGain.gain.exponentialRampToValueAtTime(beatVol * 0.5, t + 0.08);
        beatGain.gain.setValueAtTime(beatVol * 0.6, t + 0.15);
        beatGain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        beat.connect(beatGain);
        beatGain.connect(panner);
        beat.start(t);
        beat.stop(t + 0.45);

        // --- Tonal layer (fades in across the sequence) ---
        const toneVol = 0.18 * toneBlend + 0.04;

        const osc1 = ctx.createOscillator();
        osc1.type = 'sine';
        osc1.frequency.value = freq;

        const osc2 = ctx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.value = freq * 1.003;

        const osc3 = ctx.createOscillator();
        osc3.type = 'sine';
        osc3.frequency.value = freq * 2;

        // Fifth for warmth (tanpura-like)
        const osc4 = ctx.createOscillator();
        osc4.type = 'sine';
        osc4.frequency.value = freq * 1.5;

        const toneGain = ctx.createGain();
        // Attack softens as tone increases (heartbeat is punchy, tone is smooth)
        const attackTime = 0.02 + toneBlend * 0.06;
        toneGain.gain.setValueAtTime(0, t);
        toneGain.gain.linearRampToValueAtTime(toneVol, t + attackTime);
        toneGain.gain.setValueAtTime(toneVol, t + 0.3);
        toneGain.gain.exponentialRampToValueAtTime(toneVol * 0.4, t + 1.2);
        toneGain.gain.exponentialRampToValueAtTime(0.001, t + 2.5 + toneBlend);

        const g2 = ctx.createGain(); g2.gain.value = 0.5;
        const g3 = ctx.createGain(); g3.gain.value = 0.15 + toneBlend * 0.15;
        const g4 = ctx.createGain(); g4.gain.value = 0.15;

        osc1.connect(toneGain);
        osc2.connect(g2); g2.connect(toneGain);
        osc3.connect(g3); g3.connect(toneGain);
        osc4.connect(g4); g4.connect(toneGain);
        toneGain.connect(panner);
        toneGain.connect(this._chimeReverb);

        // Panner → master
        panner.connect(this.masterGain);

        osc1.start(t); osc2.start(t); osc3.start(t); osc4.start(t);
        osc1.stop(t + 3.6); osc2.stop(t + 3.6); osc3.stop(t + 3.6); osc4.stop(t + 3.6);

        // --- Sustained drone layer ---
        const droneOsc = ctx.createOscillator();
        droneOsc.type = 'sine';
        droneOsc.frequency.value = freq;

        const droneOsc2 = ctx.createOscillator();
        droneOsc2.type = 'sine';
        droneOsc2.frequency.value = freq * 1.002;

        const droneGain = ctx.createGain();
        droneGain.gain.setValueAtTime(0, t);
        droneGain.gain.linearRampToValueAtTime(0.07, t + 0.4);

        const dg2 = ctx.createGain();
        dg2.gain.value = 0.7;

        droneOsc.connect(droneGain);
        droneOsc2.connect(dg2);
        dg2.connect(droneGain);
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
        if (this.phase === AUDIO_PHASE.UNINITIALIZED) return;
        this._stopLetterDrones();
        if (this.phase === AUDIO_PHASE.COMPRESSION) this.stopCompression();
    },

    // Compression build — reverse swell + accelerating pulse + harmonic stacking
    startCompression() {
        if (this.phase !== AUDIO_PHASE.PLAYING || this.muted) return;
        const ctx = this.audioCtx;
        const t = ctx.currentTime;
        this.phase = AUDIO_PHASE.COMPRESSION;
        App.dbg('AUDIO: compression build started');

        // Rising noise sweep (reuse cached buffer)
        if (!this._cachedNoiseBuf) {
            const bufferSize = ctx.sampleRate * 8;
            this._cachedNoiseBuf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const nd = this._cachedNoiseBuf.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) nd[i] = Math.random() * 2 - 1;
        }
        this._noiseSource = ctx.createBufferSource();
        this._noiseSource.buffer = this._cachedNoiseBuf;
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
        if (this.phase !== AUDIO_PHASE.COMPRESSION) return;
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
            this._harmonicOscs.push({ osc, gain: g, baseDetune: i * i * 3 });
            this._harmonicsSpawned++;
        }

        // Overall harmonic volume rises with compression
        const hVol = compression * compression * 0.5;
        this._harmonicGain.gain.setTargetAtTime(hVol, t, 0.15);

        // Pitch bend all harmonics upward as compression approaches 1
        const bend = compression * compression * compression * 200;
        for (const h of this._harmonicOscs) {
            h.osc.detune.setTargetAtTime(h.baseDetune + bend, t, 0.2);
        }
    },

    stopCompression() {
        if (this.phase !== AUDIO_PHASE.COMPRESSION) return;
        App.dbg('AUDIO: stopCompression');
        this.phase = AUDIO_PHASE.PLAYING;
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
        if (this.phase === AUDIO_PHASE.UNINITIALIZED || this.muted) { App.dbg('AUDIO: playBurst blocked'); return; }
        App.dbg('AUDIO: playBurst — ctxState=' + this.audioCtx.state);
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
        if (this.phase === AUDIO_PHASE.UNINITIALIZED || this.muted) { App.dbg('AUDIO: playSingingBowl blocked'); return; }
        App.dbg('AUDIO: playSingingBowl — ctxState=' + this.audioCtx.state);
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
        if (this.phase === AUDIO_PHASE.UNINITIALIZED || this.muted) { App.dbg('AUDIO: startMelody blocked'); return; }
        App.dbg('AUDIO: startMelody — ctxState=' + this.audioCtx.state);
        this.melodyAudio.currentTime = 0;
        const t = this.audioCtx.currentTime;
        this.melodyGain.gain.setValueAtTime(0, t);
        this.melodyGain.gain.linearRampToValueAtTime(0.35, t + 2.0);
        this.phase = AUDIO_PHASE.MELODY;
    },

    update(progress) {
        if (this.phase === AUDIO_PHASE.UNINITIALIZED) return;
        const C = App.Config;
        const now = Date.now();
        if (now - this.lastUpdate < C.AUDIO_UPDATE_INTERVAL) return;
        this.lastUpdate = now;

        const t = this.audioCtx.currentTime;
        const melodyActive = this.phase === AUDIO_PHASE.MELODY;
        const revealDuck = melodyActive ? 0.08 : (progress > 0.85 ? 0.15 : 1.0);
        const droneVol = Math.min(0.7, progress * 3 + 0.1) * revealDuck;
        this.droneGain.gain.setTargetAtTime(droneVol, t, 0.3);
        const filterFreq = C.DRONE_FILTER_MIN + progress * (C.DRONE_FILTER_MAX - C.DRONE_FILTER_MIN);
        this.droneFilter.frequency.setTargetAtTime(filterFreq, t, 0.3);
        const melodyVol = melodyActive ? Math.max(0, Math.min(0.5, (progress - C.MELODY_FADE_START) / (C.MELODY_FADE_END - C.MELODY_FADE_START))) : 0;
        this.melodyGain.gain.setTargetAtTime(melodyVol, t, 0.5);
    },

    _lastChimeTime: 0,
    _collisionNoteIndex: 0,
    _collisionDirection: 1,

    playCollisionChime(proximity) {
        if (this.phase === AUDIO_PHASE.UNINITIALIZED || this.muted) return;
        const ctx = this.audioCtx;
        const now = ctx.currentTime;
        if (now - this._lastChimeTime < 0.4) return;
        this._lastChimeTime = now;

        const t = now;
        const idx = this._collisionNoteIndex;
        const freq = this.SWARA_BASE * this.SWARA_RATIOS[idx];
        const vol = 0.05 + proximity * 0.04;
        const decay = 2.5 + (1 - proximity) * 1.5;

        // Root + detuned pair (shimmer)
        const osc1 = ctx.createOscillator();
        osc1.type = 'sine';
        osc1.frequency.value = freq;

        const osc2 = ctx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.value = freq * 1.003;

        // Octave above (airy)
        const osc3 = ctx.createOscillator();
        osc3.type = 'sine';
        osc3.frequency.value = freq * 2.002;

        // Long wash envelope
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(vol, t + 0.04);
        gain.gain.setValueAtTime(vol, t + 0.2);
        gain.gain.exponentialRampToValueAtTime(vol * 0.3, t + decay * 0.5);
        gain.gain.exponentialRampToValueAtTime(0.001, t + decay);

        const g2 = ctx.createGain(); g2.gain.value = 0.6;
        const g3 = ctx.createGain(); g3.gain.value = 0.25;

        osc1.connect(gain);
        osc2.connect(g2); g2.connect(gain);
        osc3.connect(g3); g3.connect(gain);
        gain.connect(this.masterGain);

        osc1.start(t); osc2.start(t); osc3.start(t);
        osc1.stop(t + decay + 0.1);
        osc2.stop(t + decay + 0.1);
        osc3.stop(t + decay + 0.1);

        // Advance through ascending/descending scale cycle
        this._collisionNoteIndex += this._collisionDirection;
        if (this._collisionNoteIndex >= 7) {
            this._collisionNoteIndex = 7;
            this._collisionDirection = -1;
        } else if (this._collisionNoteIndex <= 0) {
            this._collisionNoteIndex = 0;
            this._collisionDirection = 1;
        }
    },

    toggleMute() {
        this.muted = !this.muted;
        if (this.masterGain) {
            this.masterGain.gain.setTargetAtTime(this.muted ? 0 : 1, this.audioCtx.currentTime, 0.1);
        }
        return this.muted;
    }
};
