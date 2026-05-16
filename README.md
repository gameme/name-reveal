# Cosmic Resonance

A scroll-driven web experience that reveals a baby's name and photo. Built as a private gift — open the link, scroll, listen.

## What it is

You land on a quiet starfield with a slow-breathing circle and the word "awaken". You tap. A tanpura drone begins, and the world begins to tune itself.

As you scroll, four strings fade in and start to vibrate. Touch them — they pluck. Each pluck plays a swara (Sa, Re, Ga, Ma...) tuned to where on the string you struck. Particles fly off, drift, glow.

Scroll further and an orb forms in the center. The strings bend toward it, dissolving into ribbons of light that pour into the orb. Inside the orb, two small cores — one warm, one cool — circle each other. Sometimes they pass close enough to flash and spit a few sparks.

Keep scrolling. Letters begin to materialize one by one — R · a · a · g · a — each accompanied by a single chime that walks the full octave (Sa to Sa'). The orb shrinks as something gathers in it, then bursts: a flash, a shockwave, the photo.

After the burst, a melody comes in. The name cycles through different fonts — Latin, Kannada (ರಾಗಾ), Devanagari (रागा). At the bottom of the screen, slowly, a credit line resolves: "Made with ❣️ in California by Shruti & Vinod". The two binary cores fly out of the orb, glide along curves, and land precisely on the dots of the two i's. There they sit and flicker — small candle flames over the names of the parents.

## Running it

```
python3 dev-server.py
```

Serves on `http://0.0.0.0:8080`. The HUD bottom-left will show the LAN URL — open that on a phone for mobile testing. The dev server tails console logs from any connected client into `mobile-debug.log`.

To run the in-browser unit tests, open `tests.html` directly.

For sharing, set `Config.DEBUG = false` in `js/config.js` to silence the debug beacon and HUD.

## How it came together

The project was built across four days of intense iteration. Each day had a clear shape:

**Day 1 — bones.**
Bootstrapped as a single HTML file, then split into modular JS within hours. The first reveal state machine appeared. By end of day: supernova trigger, dual-core + footer integration, three-act god rays, space-time ripples, photo pop, font cycling, and the multi-script font set (Akasha for Devanagari, AnekKannada for Kannada).

**Day 2 — voice.**
String strum sounds. Wave reactions on strings. Audio architecture. The baby photo was added. The dev server with remote logging arrived, and so did the first start overlay.

**Day 3 — fit.**
Mobile-first refinements: zoom prevention, height lerping, particle speed tuning. Better supernova. Better reveal audio (the compression sound — noise sweep, accelerating sub pulse, harmonic stack). Performance pass. The state machines were refactored from boolean arrays to monotonic indices, making re-entry cleaner. Symbolic onboarding — the start overlay got two CSS-orbiting cores foreshadowing the dual cores you'll meet inside the orb. Late on Day 3: the two cores started colliding visibly, flashing, expelling sparks.

**Day 4 — soul.**
Larger 'i' dots so the cores can land cleanly. String polish. Watermark fixes. Height lerps. And the final commit, in the small hours: candle flames replace the simple core glows in the SETTLED state, with independent flicker per flame. The cores become a literal symbol over the names — flames lit for the family.

## Authors

Shruti & Vinod — California.

For Daughter.
