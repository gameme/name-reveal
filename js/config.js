window.App = window.App || {};

App.Config = {
    // --- Scroll progress phases [start, end] ---
    // Each pair maps scroll progress (0–1) to a phase intensity (0–1).
    // Wider range = slower transition; narrower = snappier.
    STRING_APPEAR:    [0.04, 0.12],  // strings fade in
    VIBRATION:        [0.05, 0.45],  // string wave amplitude ramps up
    ORB_FORM:         [0.2, 0.45],   // orb fades in
    ORB_GROW:         [0.4, 0.65],   // orb expands to full size
    STRINGS_FADE:     [0.6, 0.75],   // strings fade out as orb dominates
    REVEAL:           [0.75, 0.88],  // name reveal + supernova trigger zone

    // --- Particles ---
    MAX_PARTICLES:       800,   // pool cap; higher = denser but heavier on GPU
    PARTICLE_DECAY_MIN:  0.002, // slowest death rate; lower = longer lived
    PARTICLE_DECAY_MAX:  0.005, // fastest death rate; higher = shorter lived
    PARTICLE_SIZE_MIN:   1,     // smallest particle (px before DPR)
    PARTICLE_SIZE_MAX:   3.5,   // largest particle
    NOTE_DRAW_SCALE:     5,     // sprite render size multiplier
    MAX_SPEED:           8,     // velocity clamp; higher = faster streaks
    DAMPING:             0.97,  // per-frame velocity decay; lower = more drag

    // --- Particle attraction ---
    LETTER_PULL_BASE:    0.003,  // constant pull toward forming letter
    LETTER_PULL_SWARM:   0.005,  // additional pull during swarm phase
    ORB_PULL_BASE:       0.0005, // constant pull toward orb center
    ORB_PULL_GROW:       0.0015, // additional pull as orb grows

    // --- Pointer trail (post-reveal interactive) ---
    POINTER_TRAIL_SIZE_MIN: 2.0, // smallest trail particle
    POINTER_TRAIL_SIZE_MAX: 4.0, // largest trail particle

    // --- Ambient particles (orbit around orb) ---
    AMBIENT_SPAWN_CHANCE: 0.3,   // base probability per frame; higher = more particles
    AMBIENT_SPAWN_GROW:   0.2,   // extra spawn chance as orb grows
    AMBIENT_SPAWN_DIST_MIN: 2.5, // closest spawn distance (× orb radius)
    AMBIENT_SPAWN_DIST_MAX: 6.5, // farthest spawn distance

    // --- Strings ---
    NUM_STRINGS:          4,
    STRING_AMPLITUDE_BASE: 18,   // wave height (px); same for all strings
    STRING_AMPLITUDE_STEP: 0,    // no per-string increase (organic feel via phase offsets instead)
    STRING_SPAWN_CHANCE:   0.25, // chance per frame of spawning a particle from a string
    STRING_STEP_PX:        4,    // vertical resolution of wave; lower = smoother but heavier
    STRING_PAIR_GAP:       0.06, // gap between paired strings (fraction of W)
    STRING_PUSH_EDGE:      0.14, // how far toward edges pairs settle (fraction of W from edge)
    STRING_HIT_RADIUS:     30,   // touch/mouse interaction radius (px)
    STRING_PLUCK_DECAY:    0.92, // pluck energy decay per frame; lower = faster fade
    STRING_PLUCK_THRESHOLD: 0.5, // minimum pluck energy to trigger sound
    STRING_PLUCK_MIN_SPEED: 5,   // pointer speed needed to pluck
    STRING_PLUCK_MAX_FORCE: 40,  // max pluck force from pointer velocity
    STRING_PLUCK_CLAMP:    60,   // absolute pluck energy cap
    STRING_BURST_COUNT_MIN: 2,   // min particles per pluck burst
    STRING_BURST_COUNT_RANGE: 3, // random additional particles per burst
    STRING_BURST_SPEED:    1.5,  // burst particle ejection speed
    STRING_BURST_ANGLE:    0.8,  // spread angle of burst (radians)
    STRING_GLOW_DECAY:     0.95, // glow fade per frame; lower = faster fade
    STRING_GLOW_SPEED:     20,   // glow travel speed along string

    // --- String aurora evolution ---
    STRING_DISSOLVE_CHANCE: 0.25, // particle emission chance per frame during fade
    STRING_AURORA_GLOW_MAX: 28,   // max outer glow width (px before DPR) at full orbGrow
    STRING_AURORA_FREQ_MULT: 0.2, // wave freq multiplier at full aurora (lower = longer waves)

    // --- Orb ---
    ORB_MIN_RADIUS_PX:  8,     // starting radius before growth
    ORB_MAX_RADIUS_PCT: 0.28,  // max radius as fraction of screen; larger = bigger orb
    ORB_VERTICAL_SHIFT: 0.05,  // how far orb rises from center as it grows (fraction of H)
    ORB_PULSE_SPEED_1:  1.5,   // primary breathing speed (Hz)
    ORB_PULSE_AMP_1:    0.04,  // primary breathing depth; higher = more pulse
    ORB_PULSE_SPEED_2:  3.7,   // secondary breathing speed
    ORB_PULSE_AMP_2:    0.015, // secondary breathing depth

    // --- Orb energy ---
    ENERGY_DECAY:           0.985,  // per-frame decay (lower = faster drain)
    ENERGY_DECAY_REVEAL:    0.975,  // faster decay during name reveal
    ENERGY_GAIN_ABSORB:     0.02,   // energy per absorbed particle
    ENERGY_GAIN_STRUM:      0.5,   // energy per strum (weighted by velocity)
    ENERGY_FLOOR_POST_BURST: 3.0,   // minimum energy after photo reveal
    ENERGY_BRIGHTNESS_MIN:  0.3,    // orb alpha at zero energy
    ENERGY_BRIGHTNESS_RANGE: 0.7,   // additional alpha at max energy
    ENERGY_BRIGHTNESS_SCALE: 0.06,  // how fast energy converts to brightness
    ENERGY_INTENSITY_MAX:   2.5,    // max RGB multiplier (1.0 = normal, 2.5 = white-hot)
    ENERGY_INTENSITY_SCALE: 0.06,   // how fast energy converts to intensity
    ENERGY_BLOOM_SCALE:     0.25,   // outer bloom radius growth per energy unit
    ENERGY_BLOOM_ALPHA:     0.02,   // outer bloom opacity per energy unit

    // --- God rays ---
    NUM_RAYS:         12,   // ray count; more = denser halo
    RAY_OPACITY:      0.12, // base ray brightness; higher = more visible
    RAY_LENGTH_PCT:   0.7,  // ray length as fraction of screen; larger = longer rays

    // --- Name reveal timing ---
    LETTER_DURATION:    1.5,  // seconds per letter in formation sequence
    LETTER_SWARM_SPAWN_CHANCE: 0.4, // particle swarm density during letter formation
    LETTER_SWARM_ALIVE_CAP: 200,    // max swarm particles alive at once
    LETTER_SPAWN_DIST_MIN: 0.8,     // closest swarm spawn (× font size)
    LETTER_SPAWN_DIST_MAX: 3.3,     // farthest swarm spawn
    LETTER_POP_SCALE:     0.35,     // overshoot scale when letter appears (0.15 = 15%)

    // --- Supernova ---
    PHOTO_DELAY_AFTER_FORMATION: 6, // seconds of compression build before photo reveal
    PHOTO_FADE_DURATION: 2,         // seconds for photo to fade in after burst
    BURST_TEXT_SCALE:    0.75,       // how much the name scales up at burst (0.35 = 35%)
    BURST_TEXT_GLOW:     2.5,        // glow intensity boost at burst

    // --- Font cycling (post-reveal name display) ---
    FONT_HOLD_DURATION:      6,   // seconds each font is shown
    FONT_TRANSITION_DURATION: 1.0, // seconds for crossfade between fonts
    FONT_SCALE_OUT_MAX:       1.3, // outgoing font scales up to this before fading

    CYCLE_FONTS: [
        { weight: '', family: 'Nistha, Georgia, serif', text: 'Raaga', scale: 1.0, y: 0 },
        { weight: '300 ', family: '-apple-system, "SF Pro Display", "Helvetica Neue", sans-serif', text: 'Raaga', scale: 0.9, y: -15 },
        { weight: '', family: 'AnekKannada, serif', text: 'ರಾಗಾ', scale: 0.85, y: 10 },
        { weight: '', family: 'Akasha, serif', text: 'रागा', scale: 1.25, y: 0 },
    ],

    // --- Text rendering ---
    TEXT_GLOW_RADIUS: 12,          // glow blur radius (px); larger = softer halo
    TEXT_GLOW_COLOR:  '255, 200, 80', // RGB string for glow tint
    MEET_OPACITY:     0.5,         // "Meet" label opacity (dimmer than the name + date)
    SPARKLE_DECAY:    0.025,       // sparkle death rate; higher = shorter sparks

    // --- Typography ---
    // Base font = Math.min(W × FONT_BASE_W, H × FONT_BASE_H)
    FONT_BASE_W:    0.15,
    FONT_BASE_H:    0.09,
    FONT_HERO:      1.15,  // name reveal (Raaga)
    FONT_TITLE:     0.45,  // "Meet"
    FONT_BODY:      0.36,  // birth date
    FONT_CAPTION:   0.3,   // footer ("Made with love")

    // --- Layout (multipliers of base font) ---
    NAME_OFFSET_Y:  0.8,   // name position below orb center
    DATE_OFFSET_Y:  0.85,  // date position below name
    LETTER_SPREAD:  1.2,   // letter separation during formation

    BIRTH_DATE:       'Arrived · May 16, 2026',

    // --- Audio ---
    AUDIO_UPDATE_INTERVAL: 200,  // ms between audio parameter updates; lower = smoother but more CPU
    DRONE_FILTER_MIN: 400,       // lowpass cutoff at scroll=0 (Hz); lower = more muffled start
    DRONE_FILTER_MAX: 4000,      // lowpass cutoff at scroll=1 (Hz); higher = brighter peak
    MELODY_FADE_START: 0.2,      // scroll progress where melody begins fading in
    MELODY_FADE_END:   0.5,      // scroll progress where melody reaches full volume

    // --- Debug ---
    DEBUG: false,
    // Global time scale for the entire experience. 1.0 = normal, 0.1 = 10× slow-mo, 2.0 = double speed.
    TIME_SCALE: 1.0,

    // --- Blast ---
    // Lower = smoother/slower orb expansion; higher = snappier. Range: 0.1–0.5.
    BLAST_ORB_LERP: 0.22,
};
