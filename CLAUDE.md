# Raingarden

A phone-first site (2026-10-13): you point your phone at a yard, a depth
model running ON the phone reads its slope, a real local storm (Open-Meteo)
runs across it, and an optimizer designs a rain garden of native plants to
soak the water up — shown as an animated before / after storm, then a
one-page plan (PNG + PDF). **One look**, "Wet light" (`docs/spec.md` §3):
hand-painted gouache-and-watercolour storybook art with a risograph grain,
overcast Pacific light, on a deep storm-slate page (`--slate-900 #26313C`)
with paper type (`--paper #ECE6DA`), one marigold action colour
(`--marigold #E8B04A`) and rain teal for water data (`--teal #49A3A0`).
Young Serif for display only, Atkinson Hyperlegible Next for everything
else. Every colour in `src/` is a token from `src/styles/tokens.css`
(index.html inlines the same values for first paint, and says so). The one
bold device is **a single raindrop you follow** from the roof to the
garden. The visual bar is 2019.makemepulse.com — its LEVEL of craft and its
measured timings (`design-reference/makemepulse/NOTES.md`), never its art,
copy or branding.

The page is one document: the scroll story (`#story`, six scenes: roof →
driveway → storm drain → creek → rain garden → "Design yours"), the
designer (`#designer`, one continuous WebGL scene with a step sheet), and
How it works (`#how`). Every decision is one line in `DECISIONS.md`; every
fact we rely on (plants, sizing, Green-Ampt, storms, design criteria) is
cited in `SOURCES.md` and `docs/research/`. The spec is `docs/spec.md`, the
plan `docs/superpowers/plans/2026-10-13-raingarden.md`, the per-part briefs
`docs/briefs/`, and what each part's builder found `docs/reports/`.

**Everything stays on the device.** The photo, the marks and the depth
never leave the browser; the capture step says so. The only network calls
are the site's own files and Open-Meteo (coordinates rounded to 2 dp).
No accounts, no server, no analytics.

## Run

```bash
npm install
npm run fetch-models   # once: Depth Anything V2 Small (int8 + fp16) and the ORT runtime into public/models/ + public/ort/ (gitignored, SHA-256 pinned)
npm run dev            # http://localhost:5173
npm test               # node --test "test/**/*.test.js" — the maths (sim, infiltration, sizing, optimizer, depth, layout, weather, pdf, designer model)
npm run build          # vite build; the entry chunk must not contain THREE or onnxruntime
node scripts/shoot.mjs # the whole-site gate in a real GPU Chromium (see below); exits 1 on any failure
```

Without `public/models/` the slope step says "The depth model isn't
installed on this site — use the slope buttons instead." and goes manual
(the model fetch is checked by size and content type, `src/depth/models.js`);
nothing pretends. `?preloader=0` skips the intro, `?static=1` forces the
Canvas2D yard (the no-WebGL fallback). `node scripts/fetch-models.mjs --check`
verifies what is on disk; `--print-hashes` re-pins.

`scripts/shoot.mjs [--dev] [--only story|demo|camera] [--sizes 1440,390]`
builds (if needed), serves `vite preview`, and in headed GPU Chromium shoots
every story scene (preloader, six scenes, a mid-wipe, How it works) and every
designer step at 1440×900, 1920×1080 and 390×844, runs the demo yard end to
end, runs "Use my camera" end to end with Chromium's fake camera fed the demo
photo as a .y4m, checks the garden reduces runoff, downloads the plan (PNG
2480×3508, PDF header/EOF), measures fps (story scroll, storm playback, and
playback at 390 with the CPU throttled 4× as a mid-range-phone stand-in),
and fails on any console/page/network error or horizontal scroll. Output:
`design-reference/shots/<stamp>/` + `results.json`. The per-part quick loops
are `scripts/verify-{story,yard,designer}.mjs` and
`scripts/check-story-contrast.mjs` (renders each scene with and without the
copy and measures the real glyph contrast).

## Stack

Vite 7 + vanilla ES modules. No framework, no TypeScript, no CSS-in-JS.
**Two runtime dependencies**: `three` (the yard renderer, `src/render/`,
dynamic import only) and `onnxruntime-web` (the depth model, inside
`src/depth/depth-worker.js`, a module Worker; the `/webgpu` build serves both
backends). Adding another is a DECISIONS.md line. Dev-only: `vite`,
`playwright`, `sharp`. The PDF writer is ours (`src/plan/pdf.js`, one page,
JPEG + Helvetica text). Art tools: the gpt-image-bridge (codex CLI on the
ChatGPT Plus subscription) through `art-src/tools/gen.mjs`; `cutout.mjs`,
`sheet-boxes.mjs` and `optimize-images.mjs` are copies from BTTRURSLF-v2.

## Structure

```
index.html              preloader markup + first-paint CSS (inline on purpose), header, #story, #designer, #how
src/main.js             boot: styles, scroll engine, story, preloader; designer via lazy import
src/core/               env (reducedMotion, webgl2, finePointer, phone, logFallback), scroll (native + τ 0.30 s smoothing),
                        raf (one loop, paused when hidden), ease (CSS-exact beziers), lazy
src/story/              scenes.js (the data: layers with depth z, drop paths, copy), story.js (engine: wipes, snap, reveal),
                        parallax.js (the virtual camera), drop.js, rain-overlay.js (raw WebGL2, lazy), preloader.js
src/designer/           designer.js (state, steps, camera moves, window.__raingarden), sheet.js, marker-editor.js,
                        steps/*.js (capture, mark, slope, soil, storm, before, design, plant, compare, plan),
                        plan-canvas.js (the A4 plan), model.js (pure helpers, Node-tested), sim-client.js
src/render/             index.js createYard → WebGL2 three scene or static-yard.js (Canvas2D), same API;
                        yard-scene.js, water-material.js, ground-material.js, garden-shape.js, plants.js, grid-coords.js …
src/depth/              depth.js (loadDepth → worker), depth-worker.js, models.js (pins, sizes per backend),
                        preprocess.js, heightfield.js (depth → metric terrain + slope confidence), contours.js, manualTerrain.js
src/sim/                grid.js, d8.js, flood.js (priority-flood + lakes), infiltration.js (Green-Ampt, Horton),
                        storm.js (NRCS Type IA / II hyetographs), sim.js (the cascade sim + water ledger), worker.js
src/garden/             sizing.js (WSU 2013 / Wisconsin DNR 2003), constraints.js (forbidden zones, applyGarden),
                        cost.js, layout.js (plants by zone), optimizer.js (simulated annealing), rng.js
src/weather/openmeteo.js  the three storms + offline Richmond fallback
src/plan/pdf.js         the PDF writer
src/data/               plants.js (42 native plants, PNW + Southern Ontario, cited), demo-yard.json, storms-richmond.json
public/art/             every image (WebP); plants/<id>.webp; story/ (plates split into far + near layers)
public/fonts/           Young Serif, Atkinson Hyperlegible Next (OFL)
art-src/                gen/ (ChatGPT originals), manifest.mjs (every prompt), PROMPTS.md (log), tools/
design-reference/       makemepulse/ (NOTES.md + recordings), comps-sheet.png, compare/, shots/
docs/                   spec.md, research/, briefs/, reports/, superpowers/plans/
test/                   node --test suites
```

## Conventions

- **The maths is pure and tested.** `src/sim`, `src/garden`, most of
  `src/depth` and `src/designer/model.js` never touch `window`/`document`;
  they take typed arrays and plain objects and run in Node tests and in
  Workers alike. A change to them starts with a failing test.
- **Terrain** is `{ nx, ny, cell /* m */, z: Float64Array }`, index
  `y*nx + x`, x right, y away from the camera, row 0 nearest; cell (i, j)
  sits at its CENTRE ((i+0.5)·cell, (j+0.5)·cell) and the yard spans
  [0, nx·cell]. Every module uses this (render's `grid-coords.js` is the one
  helper there).
- **The water ledger closes.** `rain + roof = infiltrated + out + stored`
  to < 1e-9 relative (`sim.closure()`); the before / after numbers come
  from the same storm, soil, outlets and roof mask on base vs carved
  terrain. Pass `roof.mask` (the house footprint) or roof rain counts twice.
- **The renderer gets the UNCARVED terrain**; `setGarden(g)` is the only
  place it digs, and sim depth computed on the carved terrain is passed as
  is. `setSplit`: left = before. Attach listeners to `api.canvas` (the
  fallback may swap the canvas).
- **Garden legality**: (garden ∪ berm) ∩ forbidden = ∅ at full resolution —
  ≥ 3 m from the house wall, the septic field plus WSU's buffers (10 ft
  downhill / 50 ft uphill), inside the yard and 0.5 m off its edge.
  Drawdown ≤ 48 h. Never relax these to make a garden fit; say why it
  doesn't.
- **Every WebGL surface has a static fallback** and logs why through
  `logFallback(where, reason)` (`[raingarden] static fallback: …`): the
  yard (`?static=1` forces it), the rain overlay.
- **Reduced motion goes through `src/core/env.js`**: cross-fades instead of
  motion everywhere (story wipes, camera moves, count-ups, grow-in).
- **Lazy is a rule.** The intro bundle never contains three or
  onnxruntime; the designer, the renderer, the depth worker and the sim
  worker load when the designer opens.
- **Timings are the measured ones** (NOTES.md): scroll τ 0.30 s; wipe 1.75 s
  `cubic-bezier(.76,0,.24,1)` (true Power3), swap at 0.5; reveal
  `cubic-bezier(.05,.75,.1,1)` 1.0 s, 0.15 s stagger from the centre; UI
  `cubic-bezier(.215,.61,.355,1)` at 0.25 / 0.5 / 0.8 s; mouse parallax
  fore −5 / back +2.6 px per 100 px at 1440 from a virtual camera (never
  hand-tuned per layer).
- **Art is one direction**: the STYLE block in `art-src/manifest.mjs` goes
  on top of every prompt; new art is a manifest entry → `gen.mjs` →
  `build-art.mjs` (cut-outs through `cutout.mjs`) → `public/art/`. A
  missing image ships as a labelled placeholder and is listed in
  `art-src/MISSING.md`.
- **Copy is plain and sentence case**; buttons say what they do ("Design my
  garden", "Get my plan"); no all-caps labels, no eyebrows.
- **File headers explain why**, not what.
- **One line per decision in DECISIONS.md, one source per fact in
  SOURCES.md.**

## Locked rules

- The photo and depth never leave the device. No uploads, no analytics.
- The plan always carries the safety copy: call before you dig (BC 1 Call
  in BC, Ontario One Call in Ontario, or the local service), keep it away
  from foundations, check local bylaws, and "guidance, not engineering".
- Never present a slope, a storm or a number we didn't compute or cite;
  when unsure, say so (the slope band, "offline sample", the depth fallback).
- `C:\Users\Warren\Downloads\BTTRURSLF-v2` is read-only reference.
