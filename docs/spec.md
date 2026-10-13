# Raingarden — design spec

2026-10-13. Written from the brief (no clarifying round: the brief asked for
self-answered questions; each answer below is my recommendation and is also
logged one line each in `DECISIONS.md`).

## 1. Intent

**What:** a phone-first website. You point your phone at your yard, the app
reads the yard's slope from a single photo with an on-device depth model,
runs a real local storm across it, and an optimizer designs a rain garden of
native plants that soaks the water up — shown as an animated before/after
storm, then a printable one-page plan.

**Who:** homeowners in the Pacific Northwest / Metro Vancouver and Southern
Ontario with a downspout, a lawn and a weekend. Not engineers.

**Success looks like:**
- Someone with no yard handy can run the demo yard end to end on a phone in
  under two minutes and leave with a plan PDF.
- Someone with a yard can do the same from a photo, with honest confidence
  about what a single photo can and cannot tell.
- The scroll story makes the "why" land before the tool asks for anything,
  at the craft level of 2019.makemepulse.com (layering, easing, timing).
- The maths is right: tests pin flow routing, water conservation, Green-Ampt
  and the sizing method to published worked examples.

**Assumptions I made (the brief did not say):**
- Units are metric throughout (both regions are Canadian), with litres for
  water. Imperial is not offered (YAGNI).
- English only.
- No accounts, no server, no analytics. Static site. Nothing about the yard
  leaves the device; the only network calls are the Open-Meteo weather
  requests (coordinates rounded to 2 decimals, ~1 km) and the app's own files.
- "Real local storm" = Open-Meteo historical data for the user's location.

## 2. Questions and my answers

| Question | Answer (recommendation) |
|---|---|
| Single page or multi-page? | One page. Story (scroll) → designer (one continuous WebGL scene) → How it works. Hash anchors `#design`, `#how`. |
| Scroll engine? | Own virtual smooth scroll (lerp on a native scroll position, not hijacked wheel events), so keyboard, touch and screen readers keep native scrolling. Timings from makemepulse NOTES.md. |
| Scene rendering? | Story scenes are layered DOM cut-outs (WebP) moved with `transform: translate3d` per depth layer, plus one shared WebGL rain overlay canvas. Cheap, crisp on phones, and a static fallback is the same DOM without motion. |
| Designer rendering? | three.js: the yard as a displaced plane textured with the photo; water as a second mesh driven by the sim's depth texture with a refraction/ripple shader. |
| Sim on CPU or GPU? | CPU core in plain JS (pure, Node-testable), a 128×128 grid by default (96×96 on low-end), in a Web Worker; GPU only renders. A 128² virtual-pipe step is ~0.3 ms in JS, well inside a 16 ms frame. The tests and the app run the same code. |
| Flow model? | Two, both tested: **D8** flow accumulation (for the contour/flow-arrow overlay and the optimizer's quick candidate search) and a **virtual-pipes shallow-water** model (Mei, Decaudin & Hu 2007 / O'Brien & Hodgins 1995) for the animated storm, which conserves volume exactly by construction. |
| Infiltration? | Green-Ampt per cell (explicit, ponded/unponded per step, Rawls 1983 parameters for sand / loam / clay), and Horton offered as the comparison in How it works only. Garden cells use the amended-soil parameters. |
| Depth model? | Depth Anything V2 Small, ONNX (onnx-community export), fp16 if WebGPU, int8-quantised on WASM; via onnxruntime-web directly (smaller than transformers.js). Self-hosted under `public/models/` by `scripts/fetch-models.mjs` with SHA-256 pins. |
| Scale and heights? | User marks a known length (default 1 m, editable). Relative inverse depth → metric heights via a ground-plane fit: we assume a pinhole camera with ~65° vertical FOV, back-project the yard polygon, fit a plane plus a smooth residual (low-order surface), then scale by the marked length. The fitted slope gets a ±confidence band from the fit residual and a fixed monocular uncertainty (±50% of relief). |
| Manual fallback? | "Flat / gentle (2%) / steep (8%)" presets in the direction downspout → outlet, plus draggable height pins (radial-basis interpolation). Always available. |
| Storms? | Three, each with its source line: (a) last 30 days' heaviest real day (Open-Meteo archive, hourly profile as recorded); (b) a typical storm = median wet-day total over 10 years, Type IA/II shaped; (c) a design storm = 90th-percentile wet-day total over 10 years (the LID capture criterion — see SOURCES.md), NRCS Type IA (PNW) / Type II (Ontario) 24 h shape. Location denied/offline → Richmond, BC, and a bundled offline copy of Richmond's numbers so the demo always works. |
| Sizing method? | The published method found by research (`docs/research/sizing.md`), implemented exactly, tested against its own worked example. Its result is the optimizer's area prior and is printed on the plan. |
| Optimizer? | Simulated annealing over (cx, cy, area, depth, berm height, aspect, rotation), objective = litres captured in the sim minus penalties; constraints are hard (rejected moves): ≥3 m from the house wall, never on the septic polygon, never against the house, inside the yard, ≤ user's area and budget (cost model: excavation + soil mix + plants per m², editable). 120–200 coarse-sim evaluations in a worker, ~2–5 s, with a live "trying…" visual. |
| Plants? | Curated lists for PNW and Southern Ontario (`src/data/plants.js`), zone by water tolerance (wet / middle / edge), placed by Poisson-disc in each zone ring at real on-centre spacing, drawn at mature spread. Region chosen from location (lon < -100 → PNW, else Ontario), switchable. |
| Before/after? | Same storm, same yard, two sim instances. Swipe divider on desktop and phone (draggable), plus a counter row: litres captured, litres leaving the yard, hours water stands. |
| Grow-in timelapse? | 3 seasons (planting → year 1 → year 3): plant cut-outs scale from 30% → 70% → 100% of mature spread, with mulch showing less each season; 4 s per season, reduced-motion = three cross-faded stills. |
| Export? | PNG from a 2480×3508 (A4 @300dpi) canvas; PDF hand-written (single page, the plan as an embedded JPEG + a text layer) — no PDF library. |
| Art? | ChatGPT Plus image generation in the user's browser, one fixed art direction (below), transparent PNG cut-outs, cleaned with `cutout.mjs`. Placeholders if blocked. |
| Fonts? | Self-hosted variable fonts (see art direction). No Google Fonts at runtime. |
| Hosting? | Static `dist/`. No server. |

## 3. Art direction (fixed; the top of every image prompt)

"Wet light." Hand-painted gouache-and-watercolour storybook illustration with
a fine risograph grain, flat-ish shapes with soft painted edges, no black
outlines, seen in a gentle three-quarter elevated view. Overcast Pacific
light from the upper left, cool shadows, warm small highlights. Palette:
storm slate `#3E4A59`, rain blue-grey `#7D8FA3`, wet asphalt `#2B2F36`,
moss `#5F7A4A`, fern `#8FAE6B`, clay ochre `#B9824F`, rain teal `#3F8C8A`,
paper cream `#EFE7D6`, a single warm accent marigold `#E2A33B`. Matte, no
gloss, no text, no logos.

UI (revised after the frontend-design review, which flagged cream-page +
Fraunces as a generated-page default): the page base is deep storm slate
`#26313C` with paper `#ECE6DA` type; paper is a surface only for the
plan and cards. One action accent, marigold `#E8B04A`; water data in
rain teal `#49A3A0`. Type: **Young Serif** (one weight, old-style,
warm) for display only, **Atkinson Hyperlegible Next** (variable) for UI,
body and numbers — legibility first for a public tool. Grain overlay at
4–6% opacity and a soft vignette per scene — the colour-grading layer.
The one bold device: **a single raindrop you follow** from the roof to the
garden; it is also the cursor follower (lagged), and it becomes the
designer's water.

## 4. Architecture

```
index.html            preloader markup + first-paint CSS inline
src/main.js           boot: preloader, scroll engine, lazy scenes
src/core/             env (reduced motion, webgl check + logged fallback),
                      scroll (virtual smooth scroll), ease, raf, lazy
src/story/            scenes.js (scene table: layers, depths, copy),
                      parallax.js, rain-overlay.js (WebGL rain, lazy)
src/designer/         designer.js (the one continuous scene + camera moves),
                      steps/capture.js, steps/scale.js, steps/storm.js,
                      steps/soil.js, steps/optimize.js, steps/plants.js,
                      steps/compare.js, steps/plan.js
src/depth/            depth.js (onnxruntime-web, lazy), heightfield.js
                      (depth → metric heights, confidence), contours.js
                      (marching squares), demo-yard.js
src/sim/              (pure, Node-tested) grid.js, d8.js, pipes.js,
                      infiltration.js (Green-Ampt, Horton), storm.js
                      (hyetographs), sim.js (one step: rain + downspout +
                      flow + infiltration + outflow, with a water ledger),
                      worker.js
src/garden/           (pure, Node-tested) sizing.js (published method),
                      constraints.js, optimizer.js (SA), layout.js
                      (plant placement), cost.js
src/render/           yard-scene.js (three.js), water-material.js,
                      static-yard.js (2D canvas fallback)
src/weather/          openmeteo.js (fetch + offline Richmond fallback)
src/plan/             plan.js (layout drawing), pdf.js (minimal PDF writer)
src/data/             plants.js, regions, storms-richmond.json
src/styles/           tokens.css (palette), base.css, story.css, designer.css
test/                 node --test suites
scripts/              fetch-models.mjs, shoot.mjs, make-demo-yard.mjs
art-src/              gen/ (ChatGPT originals), tools/, PROMPTS.md
public/art/           final WebP cut-outs; public/models/ (gitignored)
```

Data flow in the designer:
photo → depth (worker/WebGPU) → heightfield (metres, 128²) + confidence →
user marks (scale, downspout, wall, outlet, septic, yard polygon) → storm
(hyetograph, mm/h per minute) → sim(before) → sizing prior → optimizer (SA
over coarse sims) → garden (geometry modifies heightfield: excavation +
berm; soil cells → amended Green-Ampt) → layout (plants) → sim(after) ×
before side by side → plan export.

**Water ledger (conservation):** every step,
`rain_in + downspout_in = Δstored + infiltrated + runoff_out`, tracked in
litres in float64; tests require closure within 0.5% (target ≤1e-9
relative).

## 5. Story (scroll) — 6 scenes + preloader

0. Preloader: a single raindrop forms and falls into a pool; ripple wipes to
   scene 1. Progress = real asset bytes.
1. **Roof** — "A storm lands on your roof." Rain sheets, gutter, downspout.
2. **Driveway** — "It doesn't soak in." Water races down the asphalt.
3. **Storm drain** — "It all goes somewhere." Grate swallows it, with
   oil sheen and litter.
4. **Creek** — "Somewhere is a creek." Murky, eroded banks, a salmon/trout
   silhouette struggles (PNW) — region-neutral copy.
5. **Rain garden** — "Or your yard drinks it." Cross-section: mulch,
   amended soil, gravel; roots pull water down; healthy stream beyond.
6. **Design yours** — call to action into the designer.

Each scene: 4–6 depth layers (sky/back, far, mid, near, foreground,
particles), parallax per layer from NOTES.md, enter/leave with the measured
choreography. Then **How it works** after the designer.

## 6. Error handling

- No camera / denied → upload photo; no photo → demo yard.
- Depth model missing or fails → logged, falls to manual slope presets.
- No WebGL → static 2D canvas yard + "static fallback" logged with reason;
  the sim still runs (CPU) and draws water as a 2D heat map.
- Open-Meteo fails → bundled Richmond numbers, labelled "offline sample".
- Optimizer finds no legal spot → says why (which constraint), suggests a
  smaller area or removing the septic mark.

## 7. Testing

- `node --test`: d8 on tilted plane / bowl / valley; pipes conservation;
  full sim ledger ≤0.5%; Green-Ampt vs Chow et al. Example; sizing vs its
  published example; optimizer never in forbidden zones (randomised);
  layout spacing; storm hyetograph sums; PDF writer produces a valid file.
- `scripts/shoot.mjs`: every scene and step at 1440×900, 1920×1080, 390×844,
  demo yard end to end with a fake camera (Chromium
  `--use-file-for-fake-video-capture` with a generated yard video),
  before/after, plan export, fps measure, fails on console errors.
- Compare sheets vs makemepulse in `design-reference/compare/`.
- `npm run build` clean.

## 8. Out of scope (YAGNI)

Accounts, saving designs server-side, more regions, imperial units, AR
placement, cost quotes from contractors, languages other than English.
