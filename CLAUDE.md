# Cosmic Resonance (name-reveal)

A scroll-driven HTML5 canvas experience that reveals a baby's name (Name, also rendered in Kannada and Devanagari) and photo. The technical shape: four vibrating strings birth an orb that compresses, supernova-bursts to reveal the name and photo, then two binary cores fly out to perch as candle flames over the dots of "Shruti" and "Vinod" in the credits.

## Architecture

- **Vanilla HTML/CSS/JS** — no build system, no bundler, no package manager. Open `index.html` to run; no preprocessing.
- **All modules attach to `window.App`** and are loaded as plain `<script>` tags in **fixed order** at the bottom of `index.html`. Dependencies are implicit: module N may use anything in modules 1..N-1. **Reordering breaks the experience.**
- A **single `requestAnimationFrame` loop** in `main.js` orchestrates every per-frame action. Subsystems do not own their own scheduling — `main.js` calls into them.
- A single **800vh scroll container** drives the experience via `window.scrollY`. Body scroll is disabled until the start overlay is tapped.
- `dev-server.py` serves the static site on `0.0.0.0:8080` and accepts log POSTs from mobile via `/log`. It also exposes `/ip` to surface the LAN IP in the HUD for cross-device testing.

### Module ownership

Loading order (top-to-bottom in `index.html` script block), with what each module owns (not what's *in* the file — what it produces or guards):

| Module | Owns |
|---|---|
| `js/browser.js` | iOS pinch-zoom, gesture-zoom, and multi-touch zoom suppression. Pure side-effect, no exports. |
| `js/errors.js` | `App.dbg/dbgw/dbge` (no-op until `Config.DEBUG`), `_errorLog` ring buffer (cap 100), 3s POST-beacon to `/log`, error overlay + `window.onerror` capture. |
| `js/config.js` | `App.Config` — every tunable knob. **Read this file for any numeric constant**, do not hardcode. |
| `js/shared.js` | Color palette, easing fns (`easeOutQuint`, `smoothstep`), `App.NAME_LETTERS` (`['G','r','a','h','i', 't']`), `App.DPR` (clamped to 2), LAN URL fetch from `/ip`. |
| `js/cache.js` | `Cache.circularPhoto` (resize-invalidated photo canvas) and `Cache.text` (heart-emoji bitmap). |
| `js/input.js` | Multi-touch `pointers` Map; mouse fallback suppressed once any touch fires (prevents ghost pointers); 35px iOS edge-swipe-back guard. |
| `js/strings.js` | Pluck/strum interaction, glow rendering, profile bar HUD. Produces strum energy + particle bursts. |
| `js/wave-models.js` | Bouncing strum waves with quadratic falloff (`±0.08` of pos contributes); pos reflects at [0,1] boundaries. |
| `js/particles.js` | Pooled particle system (pool size = `1.25 × MAX_PARTICLES`), pre-baked sprite sheet (4 colors × 4 sizes × 5 notes × 5 rotations). |
| `js/supernova.js` | Compression curve, vortex spawn, burst trigger (flash/ring/shake/rays), space-time ripples, smoothed orb scale. |
| `js/dualcore.js` | Two binary cores (gold + blue); orbit inside orb pre-burst, fly to footer 'i' dots post-burst, settle as candle flames. **IIFE module** — exposes `App.DualCore.draw/reset/getFlightProgress/getCorePositions`. |
| `js/footer.js` | "Made with ❣️ in California by Shruti & Vinod" reveal state machine. **IIFE module**; emanates names from each 'i' position. Persistent glow gradient builds after settled. |
| `js/audio.js` | Tanpura drone, melody (HTMLAudio + WebAudio gain/filter), synthesized swara chimes, compression sound (noise+sub+harmonic stacking), burst (boom+crack+shimmer), singing bowl, post-reveal shimmer pentatonic. |
| `js/main.js` | Reveal `State` machine, `sparkles`, `orbEnergy`, `_scaledTime`, `_experienceStartTime`, `fontCycleOffset`, glow text, god rays, font cycling. The orchestrator. |

### Test harness
`tests.html` runs ~100 in-browser assertions using **duplicated helper math** (not the production functions). Tests verify pool semantics, swara mapping, smoothstep boundaries, swept collision, wave bounce/prune, pluck decay/cap, font wrap, audio dispatch, harmonic count. Treat them as regression tests for the algorithms, not the integrated system.

## The Phase Timeline (the central thing the TODO in `main.js` calls out)

Timing constants are scattered across `Config`, `audio.js`, `footer.js`, and `dualcore.js`. This is the unified picture. **Anything that touches timing must be cross-checked here**, or formation/convergence/burst/cycling will drift out of sync.

### Pre-tap (real wall time)
- Body `overflow:hidden` → scroll disabled.
- Start overlay (`#startOverlay` in `index.html`): "Cosmic Resonance" title, breathing circle with **two CSS-orbiting cores** (`.orbit-core` — foreshadowing the in-orb dual cores), "awaken" text, "headphones recommended" label.
- AudioContext NOT yet created. iOS requires it inside a gesture.

### Tap (synchronous inside the overlay's `click` handler in `main.js`)
1. `Audio.init()` — AudioContext created, drone+melody connected, drone starts at gain 0.1.
2. **Melody pre-started silently** in `Audio.init()`. iOS won't allow `.play()` later otherwise.
3. `window.scrollTo(0,0)` and body scroll enabled.
4. `_experienceStartTime = Date.now()`.
5. 2s later overlay element removed from DOM.

### Scroll → Visual progress (`window.scrollY / maxScroll`, smoothstep-interpolated via Config ranges)

| `progress` | Phase | Driven by (in `Config`) |
|---|---|---|
| 0.04–0.12 | Strings fade in (overrides intro fade if higher) | `STRING_APPEAR` |
| 0.05–0.45 | Vibration ramps (string amplitude, particle spawn rate) | `VIBRATION` |
| 0.20–0.45 | Orb fades in | `ORB_FORM` |
| 0.40–0.65 | Orb grows; aurora evolution begins (waves slow, glow widens) | `ORB_GROW` |
| 0.60–0.75 | Strings dissolve into particles flowing toward orb | `STRINGS_FADE` |
| 0.75–0.88 | Reveal triggered | `REVEAL` |

`introFade` (computed in `main.js`) is a separate ramp from start-overlay dismissal: 1.2s delay then 1s linear ramp. Strings get `max(introFade × 0.6, scroll-driven smoothstep)` so they're at least 60% opacity 2.2s after tap, even if user hasn't scrolled.

### Reveal (driven by `_scaledTime - State.startTime`; `Config.TIME_SCALE` multiplier applied to `dt`)

| Window | Action |
|---|---|
| `0 → 7.5s` (`5 × 1.5s`) | Letters R, a, a, g, a materialize one-by-one. Particle swarm converges onto the active letter; sparkle burst (30 sparks) when it pops in. `LETTER_DURATION × NAME_LETTERS.length` defines this window. |
| `0 → 7.5s`, ÷8 | Swara chime sequence Sa Re Ga Ma Pa Dha Ni Sa' fires every `formationTime/8 ≈ 0.94s`. **Intentionally not per-letter** — 8 chimes spread across 5 letters. Each chime morphs heartbeat → tone, panned left → right, with a sustained drone tail. |
| `7.5 → 13.5s` | Compression build: orb shrinks (cubic ease-out reaches 0.87 at 50% of build, lingering in dramatic zone); vortex pulls particles inward (final 25% accelerates); space-time ripples emit; audio noise sweep + accelerating sub pulse + 10-harmonic stack with progressive detune + cubic pitch bend. |
| `13.5s` | **SUPERNOVA BURST** (the `photoP > 0` branch in `main.js`): flash, shockwave ring, screen shake (1.5), 450+ particle explosion, 60 sparkles. Audio: `stopCompression → playBurst (boom+crack+shimmer) → playSingingBowl → startMelody`. State → COMPLETE. DualCore launches both cores toward footer. |
| `13.5 → 15.5s` | Photo fades in over `PHOTO_FADE_DURATION` (2s). |
| `13.5s` onward | Font cycles through 4 variants from `Config.CYCLE_FONTS` (Nistha, SF Pro, AnekKannada `ರಾಗಾ`, Akasha `रागा`) every `FONT_HOLD_DURATION + FONT_TRANSITION_DURATION` (6+1=7s). Tap on the name advances the cycle (jumps to transition start). |
| Variable, real-time after photo | Footer state machine animates "Made with ❣️ in California by Shruti & Vinod". |

## State Machines

Four independent machines, all live simultaneously after reveal. Their interactions are the load-bearing complexity of this codebase.

### 1. Reveal phase (in `main.js`, the `State` object)
```
IDLE
  ↓ State.enter()  — when revealProgress > 0 and startTime < 0
REVEALING — startTime set; lastBurstIndex/lastSwaraIndex/photoBurst tracked
  ↓ State.markComplete()  — when photoP > 0 first time
COMPLETE — terminal. State.enter() while COMPLETE rewinds startTime to skip pre-photo build.
  ↓ State.reset()  — only effective if NOT complete; clears sparkles, DualCore, audio reveal sounds
```
Critical: once you've seen the photo, scrolling up past `Config.REVEAL[0]` does NOT undo letters or replay the build. `State.reset()` no-ops the sparkle/photoBurst fields if `isComplete`.

The Statemachines refactor (commit `f348ae0`) replaced per-letter boolean arrays (`letterBursts`, `swaraTones`, `extraTones`) with monotonic indices (`lastBurstIndex`, `lastSwaraIndex`). Cleaner re-entry semantics: `swaraIdx > lastSwaraIndex` works regardless of skipped frames.

### 2. Audio phase (`AUDIO_PHASE` enum in `audio.js`)
```
UNINITIALIZED
   ↓ Audio.init()  — synchronous inside tap gesture (iOS)
PLAYING — drone + lowpass filter; melody silent; filter rises 400→4000 Hz with progress
   ↓ Audio.startCompression()  — called whenever supernovaCompression > 0.01
COMPRESSION — noise + sub + harmonic stack; ramps with `compression` value
   ↓ Audio.stopCompression()                   ↓ Audio.startMelody()  — from photoBurst
PLAYING                                         MELODY — playNote dispatches shimmer
                                                         instead of base; ducks drone to 0.08
```
`MELODY` is **terminal**. There is no transition out — once melody starts, it stays. `Audio.playNote` dispatches per-phase: PLAYING → `_playBaseNote` (4 oscillators, swara just-intonation), MELODY → `_playShimmerNote` (pentatonic + 3s decay).

### 3. Footer (`STATE` enum in `footer.js`)
```
HIDDEN
  ↓ stateTimer > primaryDelay (3.0s)
REVEALING_PRIMARY  — "Made by ... Shruti" fades in (1.5s easeOutQuint)
  ↓ primaryFadeDuration elapsed
PRIMARY_VISIBLE  — Shruti emanates from 'i' (chars fan out, 0.4s descent + 1.0s emanation)
  ↓ stateTimer > shiftDelay (2.0s)
SHIFTING — text widens for "with ❣️" insertion; "& Vinod" reveals; Vinod emanates from 'i'
  ↓ shiftP=1 ∧ revealRaw=1
COMPLETE — heart pulses on heartbeat; persistent glow ramps in for both names

(STATE.REVEALING_SECONDARY is enum-defined but unreachable — SHIFTING jumps directly to COMPLETE)
```
**Re-entry behavior** (in `Footer.draw` / `Footer.markInactive`): `markInactive()` fires every frame from the main draw loop. If `Footer.draw()` is skipped a frame (revealProgress dropped to 0 mid-flight), `entryTimer` resets on next call to replay the envelope fade-in. `state` itself never regresses.

### 4. DualCore (`STATE` constant inside `dualcore.js` IIFE)
```
ORBITING_INSIDE  — pre-burst, two cores orbit at INNER_ORBIT × orbRadius
   ↓ photoBurst (post-burst setup, called once)
   ├─ Footer.isPrimaryDone()    → DONE     (skip flight; already arrived previously)
   └─ else                       → FLYING  (initCoreFlight along bezier with safe control point)
   ↓
FLYING — quadratic bezier; control point picks the side away from orb center, clamped to screen
   ├─ revealActive=false → ORBITING_OUTSIDE   (reveal lost mid-flight)
   ├─ Footer milestone   → DESCENDING
   ↓
ORBITING_OUTSIDE — at OUTER_ORBIT × orbRadius (idle while user scrolls away)
   ├─ revealActive=true  → FLYING (relaunch)
   ├─ Footer milestone   → DESCENDING
   ↓
DESCENDING (0.4s ease-out toward 'i' dot, scales down to SETTLED_DOT_SCALE=0.3)
   ↓
SETTLED — flame on the 'i' dot (independent flicker per core via seed offset; breathing alpha)
DONE — never rendered (early return in renderCore)
```
**Pre-burst collision** (in `main.js` post-orb-render block, gated by `!State.photoBurst`): when the two orbiting cores pass within `orbRadius × 0.3`, a flash blooms at the midpoint and 1-4 particles expel outward. `escapeBoost` scales with `orbPull` (cores fight to escape the orb's pull). The cores' positions are exposed via `DualCore.getCorePositions()` for this purpose.

**Pairing**: Core A (gold, `255, 220, 140`) → Shruti's 'i' dot. Core B (blue, `200, 220, 255`) → Vinod's 'i' dot.

## Critical Invariants

These are NOT enforced by structure — breaking them silently breaks the experience.

1. **Audio init must be inside the tap gesture** (in the start-overlay click handler). iOS WebKit will lock the AudioContext otherwise.
2. **Melody pre-started silently** (in `Audio.init()`). iOS won't allow a media element to start later from any non-gesture context. Melody plays at gain 0 until `startMelody()` ramps it in.
3. **DPR clamped to 2** (`App.DPR` in `shared.js`). On 3× retina the canvas would be 9× the pixel work — clamping keeps mobile performant.
4. **Particle pool oversized** (`POOL_SIZE` in `Particles.init`): pool size = `1.25 × MAX_PARTICLES`. Provides headroom for the weakest-particle eviction path on overflow.
5. **`_scaledTime` drives all visuals; `audioCtx.currentTime` drives all audio**. `Config.TIME_SCALE` only affects visual timing; audio is always at real time. Beware: with `TIME_SCALE != 1.0`, audio and visuals will desync. This is by design — used for animation tuning, not production.
6. **`Footer.markInactive()` must be called every frame** (currently invoked at the top of the main draw loop). Without it, the footer's re-entry detection cannot tell when `draw()` was skipped, and the envelope fade-in won't replay on re-reveal.
7. **Particle absorption uses squared-distance** (orb-absorb branch in `Particles.update`). The threshold `dist < orbRadius × 0.6` is implemented as `distSq < orbRadius² × 0.36` to avoid `sqrt` per particle. Tests verify this equivalence.
8. **Pointer locks must clear on cross-over OR pointer movement >2px** (in `Strings.checkInteraction`). Without this, a finger held at rest on a string accumulates a single hit and stops responding even while moving slowly.
9. **Audio reveal sounds must be stopped on scroll-up before reveal completes** (the main draw loop calls `State.reset()` when `revealProgress <= 0`, which calls `Audio.stopRevealSounds()`). Otherwise the harmonic stack and noise sweep persist with no visual context.
10. **Wave model bounce is reflective, not toroidal** (in `WaveModels.update`): `pos > 1.0 → pos = 2.0 - pos; dir *= -1` preserves total displacement at the boundary.

## Inter-module contracts

```
                        ┌──────────────────────────────────┐
                        │           main.js                │
                        │  (rAF loop; owns reveal State,   │
                        │   sparkles, orbEnergy, _scaledTime)
                        └──┬───────────┬───────────┬───────┘
                  Strings ─┘ Particles─┤  Audio    │
            WaveModels      Supernova  │  DualCore │
                            Footer     │  Cache    │
                                       │  Input    │
                                       └──────┬────┘
                                              │
                                       Footer ◄─ DualCore reads
                                                  Footer.TIMING + isPrimaryDone()
                                                                + isSecondaryStarted()
```

- **`main.js`** owns the canonical reveal `State`. Subsystems do not maintain their own copy.
- **DualCore reads from Footer**: `App.Footer.isPrimaryDone()`, `isSecondaryStarted()`, `TIMING`. The cores' descent timing is gated by where the footer state machine is, not by elapsed time. Intentional: avoids cores landing before the 'i' is visible.
- **Strings produces** strum energy via `Strings.consumeStrumEnergy()` and absorbed-particle counts via `Particles.consumeAbsorbed()`. Both are **consume-once accumulators** — calling twice in one frame yields zero on the second call.
- **Audio is fire-and-forget**: `Strings.checkInteraction → Audio.playNote`; swara timer in main → `Audio.playLetterChime`; photoBurst → `Audio.playBurst + playSingingBowl + startMelody`.
- **Cache is read-only invalidation** on resize. Photo + heart-emoji bitmaps regenerate on next access.

## Non-obvious decisions

- **Two-pass glow text** (`drawGlowText` helper in `main.js`): outer halo (2× blur, 0.3α) + inner glow (0.6× blur, 0.7α) gives a layered halo that survives across phases.
- **Pulse damping during reveal** (`pulseDampen` in main draw): orb breathing reduces to flat once `revealProgress > 0` and `!photoBurst`, keeping letter formation stable. After burst, breathing returns.
- **Energy decay faster + absorption suppressed during reveal** (the `orbEnergy` update step in main): `ENERGY_DECAY_REVEAL=0.975` vs base `ENERGY_DECAY=0.985`; `ENERGY_GAIN_ABSORB` zeroed during `inReveal`. Prevents energy spike during compression.
- **Compression curve is cubic ease-out** (`Supernova.computeCompression`): `1 - (1-raw)³` reaches 0.87 at 50% of build time, lingering in the dramatic zone.
- **Smoothed orb scale** (`Supernova.getOrbScale`): `BLAST_ORB_LERP=0.22` smooths jumps at burst over a few frames so the visual recoil doesn't snap.
- **Vortex particles cleared at burst** (in `Supernova.trigger`): they would be invisible behind the flash anyway; freeing the pool ensures the explosion has slots.
- **Mobile-aware string push** (`mobileBlend` in `Strings.draw`): on narrow aspect ratios, pushing pairs apart begins at `orbForm` (earlier) instead of `orbGrow` to prevent string overlap during orb formation.
- **Bezier control point picks furthest side from orb** (`computeSafeControlPoint` in `dualcore.js`): cores arc *around* the orb, not through it. Clamped to screen so curves don't fly off mobile edges.
- **Tap-on-name advances font cycle** (in the canvas `pointerdown` handler): jumps to the transition start of the current segment so the scale-out/scale-in animation plays.
- **Tap burst gated by `State.isComplete`** (early return in the canvas `pointerdown` handler): pre-reveal taps do nothing; post-reveal taps spawn 15-25 particles around the touch point.
- **Pointer trail unlocked post-reveal only** (the post-reveal trail block in main): trails come with a moving pointer; they would distract from the formation phases.
- **Particles drift outward post-reveal** (`effectivePull = State.isComplete ? -0.3 : orbGrow`): negative pull → outward drift via inverse-distance push.
- **Sprite rotation pre-baked** (`SPRITE_ROTATIONS` in `Particles`): 5 rotations baked at sprite-sheet build time avoids per-frame rotation cost.
- **Pre-burst dual-core collision** (the `!State.photoBurst` block in main, after orb render): the two orbiting cores collide visibly when separation < 30% of orb radius. Flash + particle expulsion. Reads core positions via `App.DualCore.getCorePositions()` — this method exists *for this purpose*.
- **Settled cores render as flames, not glows** (`drawFlame` function in `dualcore.js`, added in commit `d014406`): replaces simple radial glow once cores reach SETTLED. Per-core seed offset gives independent flicker. This is the symbolic resolution — cores become candle flames over the names of the parents.

## Performance budget

- Target 60fps. FPS HUD (when `Config.SHOW_PERF_HUD=true`) shows green ≥50, yellow ≥30, red <30.
- Frame profiled in 6 sections: `clear, rays+str, particles, orb, dualcore, reveal`. Section >1.5ms triggers a `PERF_SPIKE` warning (throttled to 1/sec).
- Pre-built once at init: sprite sheet (4 colors × 4 sizes × 5 notes × 5 rotations), noise buffer for compression, chime reverb impulse.
- Cached, invalidated on resize: photo bitmap, heart-emoji bitmap, letter metrics (`cachedLetterPositions`), footer character widths (`widths`).
- `Audio.update` throttle (`AUDIO_UPDATE_INTERVAL=200ms`): audio param updates run no faster than this. Prevents WebAudio param thrashing.
- Touch-vs-scroll correlation check in main: emits `SCROLL_STUCK` warning if user is touching but not scrolling — catches mobile gesture bugs.

## Dev workflow

- Run `python3 dev-server.py` from the repo root. Serves on `0.0.0.0:8080`.
- HUD shows the LAN URL — open on a phone for mobile testing. Mobile logs are POSTed to `/log` every 3s and appended to `mobile-debug.log` (reset on each session via `BEACON_INIT`).
- `Config.DEBUG=true` enables console capture + beacon. Set to `false` for "production" sharing — `App.dbg/dbgw/dbge` silently no-op.
- `Config.TIME_SCALE` slows the entire visual experience for animation tuning. **Audio remains at real time, so this also exposes any audio/visual desync paths.**
- `Config.SHOW_PERF_HUD=true` shows FPS bars top-left, LAN URL bottom-left, string profile bar top-right, reveal sub-timing top-left below FPS.
- Run unit tests by opening `tests.html` directly in a browser (no server needed for tests).

## Identity / strings

- Reveal letters: `App.NAME_LETTERS = ['G','r','a','h','i', 't']` in `shared.js`.
- Cycle scripts (in `Config.CYCLE_FONTS`): Latin (Nistha, SF Pro), Kannada `ರಾಗಾ` (AnekKannada), Devanagari `रागा` (Akasha).
- Birth date string: `Config.BIRTH_DATE` (free-form display string in config).
- Footer text (in `footer.js`'s `SEGMENTS` constant): "Made with ❣️ in California by Shruti & Vinod".
- Watermark: "Cosmic Resonance" — visible only post-reveal at `progress=0`, fades to 0 by `progress=0.03`.
- Hint: "A name awaits" with downward arrow — visible only pre-reveal.

## Coding conventions

- All globals on `App` (e.g., `App.Particles`, `App.Audio`).
- DPR-aware: pixel coords are multiplied by `DPR` everywhere; raw `clientX/Y` is multiplied at the input boundary in `Input.update`.
- `App.Config` is mutated only at file-load. Any runtime tunable lives in module-local `let`/`var`.
- Time units: **seconds** for `_scaledTime` and audio (via `audioCtx.currentTime`); **milliseconds** for `Date.now()` deltas and HUD intervals.
- Debug log shape: `'CATEGORY: message ...'` (e.g., `STRUM:`, `AUDIO:`, `MILESTONE:`, `SCROLL:`, `PERF_SPIKE:`, `SWARA:`, `LETTER:`, `BEACON_INIT:`). Useful for grepping `mobile-debug.log`.
