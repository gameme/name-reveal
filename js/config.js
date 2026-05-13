window.App = window.App || {};

App.Config = {
    STRING_APPEAR:    [0.04, 0.12],
    VIBRATION:        [0.05, 0.45],
    ORB_FORM:         [0.2, 0.45],
    ORB_GROW:         [0.4, 0.65],
    STRINGS_FADE:     [0.7, 0.85],
    RAY_INTENSITY:    [0.6, 0.8],
    REVEAL:           [0.85, 0.95],

    MAX_PARTICLES:       800,
    PARTICLE_DECAY_MIN:  0.002,
    PARTICLE_DECAY_MAX:  0.005,
    PARTICLE_SIZE_MIN:   1,
    PARTICLE_SIZE_MAX:   3.5,
    NOTE_DRAW_SCALE:     5,
    MAX_SPEED:           8,
    DAMPING:             0.97,

    LETTER_PULL_BASE:    0.003,
    LETTER_PULL_SWARM:   0.005,
    ORB_PULL_BASE:       0.0005,
    ORB_PULL_GROW:       0.0015,

    POINTER_TRAIL_SIZE_MIN: 2.0,
    POINTER_TRAIL_SIZE_MAX: 4.0,

    AMBIENT_SPAWN_CHANCE: 0.3,
    AMBIENT_SPAWN_GROW:   0.2,
    AMBIENT_SPAWN_DIST_MIN: 2.5,
    AMBIENT_SPAWN_DIST_MAX: 6.5,

    NUM_STRINGS:          4,
    STRING_AMPLITUDE_BASE: 30,
    STRING_AMPLITUDE_STEP: 10,
    STRING_SPAWN_CHANCE:   0.25,
    STRING_STEP_PX:        4,
    STRING_BOW_FACTOR:     0.2,
    STRING_HIT_RADIUS:     30,
    STRING_PLUCK_DECAY:    0.92,
    STRING_PLUCK_THRESHOLD: 0.5,
    STRING_PLUCK_MIN_SPEED: 5,
    STRING_PLUCK_MAX_FORCE: 40,
    STRING_PLUCK_CLAMP:    60,
    STRING_BURST_COUNT_MIN: 2,
    STRING_BURST_COUNT_RANGE: 3,
    STRING_BURST_SPEED:    1.5,
    STRING_BURST_ANGLE:    0.8,
    STRING_GLOW_DECAY:     0.95,
    STRING_GLOW_SPEED:     20,

    ORB_MIN_RADIUS_PX:  8,
    ORB_MAX_RADIUS_PCT: 0.14,
    ORB_VERTICAL_SHIFT: 0.05,
    ORB_PULSE_SPEED_1:  1.5,
    ORB_PULSE_AMP_1:    0.04,
    ORB_PULSE_SPEED_2:  3.7,
    ORB_PULSE_AMP_2:    0.015,

    NUM_RAYS:         12,
    RAY_OPACITY:      0.12,
    RAY_LENGTH_PCT:   0.7,

    LETTER_DURATION:    1.5,
    HOLD_AFTER_FORMATION: 3,
    LETTER_SWARM_SPAWN_CHANCE: 0.4,
    LETTER_SWARM_ALIVE_CAP: 200,
    LETTER_SPAWN_DIST_MIN: 0.8,
    LETTER_SPAWN_DIST_MAX: 3.3,

    PHOTO_DELAY_AFTER_FORMATION: 6,
    PHOTO_FADE_DURATION: 2,

    FONT_HOLD_DURATION:      6,
    FONT_TRANSITION_DURATION: 0.8,
    FONT_SCALE_OUT_MAX:       1.4,

    CYCLE_FONTS: [
        { weight: '', family: 'Nistha, Georgia, serif', text: 'Raaga', scale: 1.0, y: 0 },
        { weight: '300 ', family: '-apple-system, "SF Pro Display", "Helvetica Neue", sans-serif', text: 'Raaga', scale: 0.9, y: -15 },
        { weight: '', family: 'AnekKannada, serif', text: 'ರಾಗಾ', scale: 0.85, y: 10 },
        { weight: '', family: 'Akasha, serif', text: 'रागा', scale: 1.25, y: 0 },
    ],

    TEXT_GLOW_RADIUS: 12,
    TEXT_GLOW_COLOR:  '255, 200, 80',
    MEET_OPACITY:     0.7,
    SPARKLE_DECAY:    0.025,

    BIRTH_DATE:       'May 16, 2026',

    AUDIO_UPDATE_INTERVAL: 200,
    DRONE_FILTER_MIN: 400,
    DRONE_FILTER_MAX: 4000,
    MELODY_FADE_START: 0.2,
    MELODY_FADE_END:   0.5,

    SHOW_PERF_HUD: false,
};
