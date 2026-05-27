# Cosmic Resonance (name-reveal)

> **Maintenance contract for Claude:** as the codebase changes, keep THIS file (`CLAUDE.md`) up to date *without* explicit prompting. After any change that affects module ownership, the phase timeline, state machines, critical invariants, the test harness, or coding conventions, audit the relevant section and edit it in the same turn as the code change. Same for `README.md` for content humans care about (the experience itself, run/share instructions, day-by-day origin story, top-level test commands). When in doubt about scope, prefer over-updating to under-updating — stale documentation is the most common bug source future-you will hit.

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
| `js/constellations.js` | Five swara constellations (Sa, Re, Ga, Ma, Pa) form sequentially during the 0→7.5s window in place of the older letter-formation visual. **IIFE module** — exposes `App.Constellations.draw/init/triggerBurst/reset`. Owns its own state machine (HIDDEN → APPEARING → SETTLED → GLOWING → BURST_* → DONE), per-slot zoom-pop with overshoot, label cross-fade and compression-phase staff lift. Slot positions come from `App.getCachedLetterSlots()`. |
| `js/supernova.js` | Compression curve, vortex spawn, burst trigger (flash/ring/shake/rays), space-time ripples, smoothed orb scale. |
| `js/dualcore.js` | Two binary cores (gold + blue); orbit inside orb pre-burst, fly to footer 'i' dots post-burst, settle as candle flames. Re-launch flight (after scroll-up → ORBITING_OUTSIDE → scroll-down → FLYING) is capped at 2.5s; descent gate handles the milestone wait. **IIFE module** — exposes `App.DualCore.draw/reset/getFlightProgress/getCorePositions/areBothOrbiting/isShrutiCoreSettled/isVinodCoreSettled`. |
| `js/footer.js` | "Made with ❣️ in California by Shruti & Vinod" reveal. **IIFE module**, stateless state machine (pure `deriveProgress(elapsed)`). Each glowable name (Shruti, Vinod) renders into its own offscreen canvas — main ctx never sees `shadowBlur`/`shadowColor`/`clip()`, eliminating halo bleed and phantom glow at the source. Glow ramps drive per-core via `isShrutiCoreSettled`/`isVinodCoreSettled` (linear 0→1 over 5s). |
| `js/audio.js` | Tanpura drone, melody (HTMLAudio + WebAudio gain/filter), synthesized swara chimes, compression sound (noise+sub+harmonic stacking), burst (boom+crack+shimmer), singing bowl, post-reveal shimmer pentatonic. |
| `js/main.js` | Reveal `State` machine (incl. sticky `burstTime` footer anchor and `lastSwaraIndex/lastSparkleIndex/lastBurstIndex` monotonic counters), `sparkles`, `orbEnergy`, `_scaledTime`, `_experienceStartTime`, `fontCycleOffset`, glow text, god rays, font cycling. The orchestrator. Module-load constants `POP_PEAK_OFFSET_SEC` and `CHIME_SCHEDULE` precompute the peak-shifted Sa-Pa chime times. |

### Test harness
`tests.html` runs ~100 in-browser assertions using **duplicated helper math** (not the production functions). Tests verify pool semantics, swara mapping, smoothstep boundaries, swept collision, wave bounce/prune, pluck decay/cap, font wrap, audio dispatch, harmonic count, and chime-schedule shift. Treat them as regression tests for the algorithms, not the integrated system.

`.auto/run.py` + `js/auto.js` is the single-scenario integration harness; `.auto/run-all.py` is the parallel orchestrator that runs all five scroll scenarios concurrently in **headless Chrome** windows.

#### How parallelism stays clean
- Each scenario gets a unique `session_id` (e.g. `default-<unix-ts>`, `early-<unix-ts>`).
- `js/auto.js` reads `?session=<id>` from the URL and monkey-patches `window.fetch` so every `/log` POST appends `?session=<id>`. Production never sees this — the patch is gated by `?auto=1` and a session value.
- `dev-server.py` (now `ThreadingHTTPServer`) parses the query, routes the POST to `.auto/sessions/<id>.log`. Missing session falls back to the default `mobile-debug.log`, so manual Safari/Chrome tests at `localhost:8080` keep their own log untouched.
- Each Chrome instance uses `--user-data-dir=/tmp/raaga-harness-profile-<session_id>` (process-tree isolation) plus `--headless=new` (no focus steal, no window pollution) plus `--disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-renderer-backgrounding` (otherwise Chrome throttles unfocused tabs to 1Hz and beacons stall).
- `run-all.py` cleanup: `pkill -f raaga-harness-profile-` after every run — matches only harness profiles, never the user's regular Chrome.

#### Self-testing strategy (when iterating)

When making any change that could affect the formation timeline, footer state, dualcore flight, or audio dispatch:

1. **Capture baseline first.** Set `Config.DEBUG = true` in `js/config.js:249`. Confirm `dev-server.py` is running on `:8080`. `uv run .auto/run-all.py` runs all five scenarios in parallel (~45s total) and prints a tabulated count summary. Save the table.
2. **Apply the fix.**
3. **Re-run `.auto/run-all.py`.** Diff the new table against baseline. Any deviation outside `.auto/baseline-expectations.md` is a regression. Per-scenario logs are at `.auto/sessions/<scenario>-<ts>.log` for inspection.
4. **Restore `Config.DEBUG = false`** before committing. Production beacons would 404 on GitHub Pages because `/log` only exists on `dev-server.py`. The default for distribution is always `false`.

For debugging a single scenario, `uv run .auto/run.py [--scrollup|--early-scrollup|--mid-scrollup|--pre-burst-scrollup] [--visible]`. `--visible` shows the Chrome window so you can watch it run.

If `dev-server.py` crashes mid-sweep (the user usually runs it in a separate terminal), the harness will report `dev-server not reachable on :8080` — pause, ask the user to restart it, then resume.

**Manual browser testing isolation:** the user routinely tests the live build manually in Safari (or non-incognito Chrome) while the harness runs. Because each harness Chrome carries `?session=<id>` and a dedicated profile dir, manual testing without those query params writes to `mobile-debug.log` and uses the user's normal Chrome/Safari profile — there is zero crosstalk. Don't kill processes by name pattern wider than `raaga-harness-profile-`.


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
| `0 → 7.5s` (`5 × 1.5s`) | Five swara constellations form sequentially in the slots that letters used to occupy. Each constellation appears at `slot_i × 1.5s`, zooms in via asymmetric pop (0.7 → ~1.16× peak around 0.7 of the appear window → 1.0×, settle stretched 2.3× longer than rise so it doesn't snap), and emits a 30-particle sparkle ring at the pop peak. The constellation's swara label cross-fades in over `LABEL_FADE_IN`, anchored to the same peak with its own pop-and-settle. |
| `0 → 7.5s` (Sa-Pa peak-aligned) | Chimes 0-4 (Sa, Re, Ga, Ma, Pa) fire at each constellation's pop peak (`slot_i × 1.5 + popPeakOffset`, where `popPeakOffset ≈ 0.28s = 0.7 × max(ANCHOR_FADE_IN, FILLER_FADE_IN)`). Chimes 5-7 (Dha, Ni, Sa') fire on the unshifted compression-phase schedule (`7.5, 9.0, 10.5s`). Each chime morphs heartbeat → tone, panned left → right, with a sustained drone tail. Schedule is precomputed once at module load (`CHIME_SCHEDULE` const in `main.js`). |
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
REVEALING — startTime set; lastBurstIndex/lastSwaraIndex/lastSparkleIndex/photoBurst tracked
  ↓ State.markComplete()  — when photoP > 0 first time
COMPLETE — terminal. State.enter() while COMPLETE rewinds startTime to skip pre-photo build.
  ↓ State.reset()  — only effective if NOT complete; clears sparkles, DualCore, audio reveal sounds, and the three monotonic indices
```
Critical: once you've seen the photo, scrolling up past `Config.REVEAL[0]` does NOT undo letters or replay the build. `State.reset()` no-ops the sparkle/photoBurst fields if `isComplete`.

The Statemachines refactor (commit `f348ae0`) replaced per-letter boolean arrays (`letterBursts`, `swaraTones`, `extraTones`) with monotonic indices (`lastBurstIndex`, `lastSwaraIndex`, `lastSparkleIndex`). Cleaner re-entry semantics: `swaraIdx > lastSwaraIndex` works regardless of skipped frames; reset paths clear all three to `-1` (or to a terminal value on COMPLETE re-entry).

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

**Stateless, derived from a single elapsed-time anchor.** The state machine is a pure function of `footerElapsed = max(0, _scaledTime − State.burstTime − PHOTO_FADE_DURATION)`. `State.burstTime` is captured once at burst and never moves; `footerElapsed` therefore advances monotonically in scaled real time, regardless of scroll position or whether a draw frame ran.

```
elapsed < 0                                   → (pre-burst, not rendered)
0 ≤ elapsed < primaryDelay (3.0s)              HIDDEN
elapsed < primaryDelay + primaryFade (1.5s)    REVEALING_PRIMARY  (Shruti emanates from 'i')
elapsed < primaryDelay + primaryFade
        + shiftDelay (4.5s)                    PRIMARY_VISIBLE
elapsed < primaryDelay + primaryFade
        + shiftDelay + max(shiftDur, revealDur)  SHIFTING (with ❣️ inserts; & Vinod emanates)
otherwise                                      COMPLETE  (heart pulses; persistent glow ramps in)
```

`App.Footer.tick(elapsed, dt, shrutiSettled, vinodSettled)` runs every frame from the top of `main.js`'s draw loop. It refreshes `_lastElapsed` (consumed by `isPrimaryDone()` / `isSecondaryStarted()` queries from DualCore) and ticks the persistent `_shrutiGlowP` / `_vinodGlowP` accumulators when the corresponding core is SETTLED — gold halo for Shruti starts ramping the moment Core A lands, blue halo for Vinod the moment Core B lands. Glow accumulators are the **only** stateful pieces left; the state machine itself never holds time.

Each glowable name renders into its own offscreen canvas (`bakeGlowCanvas`) — main ctx never sees `shadowBlur`/`shadowColor`/`clip()`, so halo bleed onto neighbouring text is geometrically impossible and the Chrome-vs-Safari "phantom shadow" pattern is structurally unreachable.

`App.Footer.draw` is then called unconditionally inside `if (State.isComplete)` post-block — there is **one** render path, no envelope fade-in, no re-entry detection. Scroll-up is invisible to the footer's clock by construction.

### 4. DualCore (`STATE` constant inside `dualcore.js` IIFE)
```
ORBITING_INSIDE  — pre-burst, two cores orbit at INNER_ORBIT × orbRadius
   ↓ photoBurst (post-burst setup, called once)
   ├─ Footer.isPrimaryDone()    → DONE     (skip flight; already arrived previously)
   └─ else                       → FLYING  (initCoreFlight along bezier with safe control point)
   ↓
FLYING — quadratic bezier; control point picks the side away from orb center, clamped to screen
   ├─ revealActive=false → ORBITING_OUTSIDE   (reveal lost mid-flight; 1s dwell guard before transition)
   ├─ Footer milestone   → DESCENDING
   ↓
ORBITING_OUTSIDE — at OUTER_ORBIT × orbRadius (idle while user scrolls away)
   ├─ revealActive=true  → FLYING (re-launch always 2.5s, regardless of milestone state — descent gate `flightP > 0.9 && isDone` handles the milestone wait without making the user watch a 7-8s flight)
   ├─ Footer milestone   → DESCENDING
   ↓
DESCENDING (ease-out toward 'i' dot, duration scales with remaining distance: 0.6s minimum, 3.5s max via `dist / (orbRadius * 0.7)`; scales down to SETTLED_DOT_SCALE=0.3)
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
6. **`State.burstTime` is the footer's anchor** (set once in `markComplete(time)`, never moves; survives `State.reset()` because reset is suppressed when `isComplete`). The footer's elapsed-time clock is `time − State.burstTime − PHOTO_FADE_DURATION`. If `burstTime` ever drifts (e.g., re-set on re-entry), the footer animation will jump or restart.
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

- **`main.js`** owns the canonical reveal `State` (including the sticky `burstTime` anchor) and ticks the footer every frame via `App.Footer.tick(elapsed, dt)` at the top of the draw loop — must run before `DualCore.draw` so its `isPrimaryDone()`/`isSecondaryStarted()` queries see fresh state. Subsystems do not maintain their own state copy.
- **DualCore reads from Footer**: `App.Footer.isPrimaryDone()`, `isSecondaryStarted()`, `TIMING`. Footer queries answer from a cached elapsed time refreshed on each `tick()`. The cores' descent timing is gated by footer-state phase, not raw wall time. Intentional: avoids cores landing before the 'i' is visible.
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
