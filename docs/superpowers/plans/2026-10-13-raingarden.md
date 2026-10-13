# Raingarden Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A phone-first static site: a scroll story about stormwater, then a designer that reads a yard's slope from a photo, runs a real local storm over it, optimizes a native-plant rain garden and exports a one-page plan.

**Architecture:** Vite + vanilla ES modules. The hydrology, garden and depth maths are pure modules under `src/sim/`, `src/garden/`, `src/depth/` (Node-tested with `node --test`); the browser runs them in a Web Worker. three.js renders the yard and water (lazy-loaded); the story is layered DOM cut-outs with a virtual smooth scroll.

**Tech Stack:** Vite 7, three 0.180, onnxruntime-web 1.22, Playwright 1.63 (dev), sharp (dev, art tools only). Node 24.

**Spec:** `docs/spec.md` (decisions one line each in `DECISIONS.md`).

## Global Constraints

- No framework, no TypeScript, no CSS-in-JS. Runtime deps only `three`, `onnxruntime-web`; any other is logged in DECISIONS.md.
- Everything on the device: photo and depth never leave the browser; only Open-Meteo is called (coords rounded to 2 dp).
- three.js and the depth model are lazy-loaded (dynamic `import()`); the intro must paint without them.
- Model files and ORT wasm are self-hosted under `public/models/` and `public/ort/` (fetched by `scripts/fetch-models.mjs`, SHA-256 pinned); never fetched from a CDN at runtime.
- Units: metres, millimetres of rain, litres of water. Internal sim units SI (m, s, m³) with litres only at the edges.
- Every WebGL surface has a static fallback and logs `[raingarden] static fallback: <reason>` via `src/core/env.js` `logFallback(where, reason)`.
- `prefers-reduced-motion`: cross-fades instead of motion (`env.reducedMotion`).
- Works from 390 px wide; no horizontal scroll at any width.
- Colours only from `src/styles/tokens.css`: `--slate-900 #26313C`, `--slate-700 #3E4A59`, `--rain #7D8FA3`, `--asphalt #2B2F36`, `--moss #5F7A4A`, `--fern #9DB873`, `--clay #B9824F`, `--teal #49A3A0`, `--paper #ECE6DA`, `--marigold #E8B04A`.
- Fonts: Young Serif (display), Atkinson Hyperlegible Next (UI), self-hosted woff2 in `public/fonts/`.
- Safety copy on the plan: call before you dig (BC 1 Call in BC, Ontario One Call in Ontario, or the local service), ≥3 m from foundations, check local bylaws, "guidance, not engineering".
- Pure modules never touch `window`/`document`; they take typed arrays and plain objects.

## Review Focus

1. A yard photo where depth is noisy or the yard polygon is tiny → heightfield still finite, slope confidence widens, manual fallback offered (heightfield test with random noise depth).
2. A flat yard (no slope at all) → D8 has ties: water still leaves via outlets or ponds; no infinite loops / NaN (sim test on z=0 everywhere).
3. Zero-rain or missing weather → storm list falls back to bundled Richmond numbers; sim with 0 mm returns all-zero ledger, closure defined (no divide by 0).
4. Constraints leave no legal garden spot (septic covers yard, yard < 3 m deep) → optimizer returns `{ok:false, reason}` instead of placing illegally.
5. Optimizer randomness → garden never overlaps forbidden zones across 200 random yards (property test).

---

## Shared interfaces (all tasks)

```js
// src/sim/grid.js
export const DIRS = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]]; // E,SE,S,SW,W,NW,N,NE (y down)
// A "terrain": { nx, ny, cell /* m */, z: Float64Array(nx*ny) /* m */ }
// index i = y*nx + x
```

---

### Task 1: Flow routing — D8, priority-flood, lakes

**Files:** Create `src/sim/grid.js`, `src/sim/d8.js`, `src/sim/flood.js`; Test `test/d8.test.js`, `test/flood.test.js`

**Interfaces — Produces:**
- `d8(terrain, {outlet?: Uint8Array}) -> Int8Array dir` (0..7 index into DIRS, `-1` = sink, `-2` = drains off-grid). Edge cell drains off-grid when `outlet[i]` (default: all edge cells are outlets) and no interior neighbour is lower than the outside, where outside is treated as `z[i]` minus 1e-9 (so a flat edge drains out).
- `accumulate(dir, nx, ny, weight?: Float64Array) -> Float64Array` (cells, or weighted sum, flowing through each cell incl. itself; topological order, O(n)).
- `priorityFlood(terrain, outlet: Uint8Array) -> { zf: Float64Array (filled, +1e-6 per step on flats), dir: Int8Array, order: Int32Array (visit order, outlets first) }` (Barnes et al. 2014 priority-flood + epsilon; `dir` points every cell downstream toward an outlet; never -1).
- `lakes(terrain, zf) -> { id: Int32Array (-1 none), list: [{ cells: Int32Array sorted by z, spill: number /* m */, outCell: number /* first cell downstream outside the lake, or -2 */ }] }` (connected components where `zf - z > 1e-6`).
- `lakeLevel(lake, z, cellArea, volumeM3) -> levelM` and `lakeVolume(lake, z, cellArea, level) -> m³` (hypsometric, exact piecewise-linear).

- [ ] Step 1: Write failing tests:
  - `tilted plane drains east`: z = −0.02·x on 20×10, cell 0.5 → every interior `d8` dir == 0; `accumulate` on the east column == 20 for each row; sum of off-grid flow == 200.
  - `bowl drains to centre`: z = (x−10)²+(y−10)² on 21×21 with `outlet` all 0 → centre is the only sink (`-1`), its accumulation == 441.
  - `valley`: z = |y−10|·0.1 − x·0.01 on 30×21, outlet only x==29 → accumulation at (29,10) == 630.
  - `priorityFlood bowl`: bowl with outlet at (0,10) only → `zf` everywhere ≥ z, `lakes` returns 1 lake with spill == z(0,10)±1e-5; every `dir` path reaches the outlet within n steps.
  - `lakeLevel/Volume round-trip`: for a 3-cell lake z=[0,0.1,0.2], area 1: volume(level=0.15) == 0.15+0.05 == 0.2 m³ and lakeLevel(0.2) == 0.15.
  - `flat yard`: z = 0 on 16×16, default outlets → no -1 in priorityFlood dir; no NaN.
- [ ] Step 2: `node --test test/d8.test.js test/flood.test.js` → FAIL (modules missing).
- [ ] Step 3: Implement. Priority queue = binary heap on (z, insertion seq).
- [ ] Step 4: Tests PASS. Step 5: commit `feat(sim): D8, priority-flood and lakes`.

### Task 2: Infiltration (Green-Ampt, Horton) and storms

**Files:** Create `src/sim/infiltration.js`, `src/sim/storm.js`; Test `test/infiltration.test.js`, `test/storm.test.js`

**Interfaces — Produces:**
- `SOILS`: `{ sand, loam, clay, siltLoam }`, each `{ name, porosity, thetaE, psiMm, kMmH }` from Rawls, Brakensiek & Miller 1983 (Chow et al. 1988 Table 4.3.1): sand θe .417 ψ 49.5 mm K 117.8 mm/h; loam θe .434 ψ 88.9 K 3.4; clay θe .385 ψ 316.3 K 0.3; silt loam θe .486 ψ 166.8 K 6.5 (verify against `docs/research/hydrology.md`; that file wins).
- `greenAmptF(tH, soil, Se) -> Fmm` cumulative under continuous ponding (Newton on F − ψΔθ ln(1+F/ψΔθ) = K t).
- `greenAmptRate(Fmm, soil, Se) -> mm/h`.
- `greenAmptStep(Fm, availM, dtS, soil, Se) -> dFm` infiltration during dt from state F with at most `availM` water: exact ponded increment (Newton on F2−F1−ψΔθ ln((F2+ψΔθ)/(F1+ψΔθ)) = KΔt), capped at `availM`. Handles F=0 (start F at 1e-7 m).
- `hortonRate(tH, {f0, fc, k}) -> mm/h`, `HORTON` typical params (cited in research).
- `TYPE_IA`, `TYPE_II`: NRCS 24 h cumulative fractions at hourly steps (25 numbers, 0..1).
- `hyetograph(totalMm, shape: 'IA'|'II'|'uniform', durationH, stepS) -> Float64Array mm per step` (linear interpolation of the cumulative curve; sum == totalMm to 1e-9).
- `fromHourly(hourlyMm: number[], stepS) -> Float64Array` (uniform within each hour).

- [ ] Step 1: Failing tests:
  - `Green-Ampt matches Chow Example 4.3.1`: siltLoam, Se 0.3, t = 1 h → F within 0.1 mm of 31.7, f within 0.1 mm/h of 16.6 (exact published values from `docs/research/hydrology.md`).
  - `step agrees with closed form`: summing `greenAmptStep` over 3600 1-s steps with unlimited water equals `greenAmptF(1)` within 0.5%.
  - `step never exceeds available water`.
  - `hyetograph sums`: IA and II for 40 mm at 300 s → sum 40 ± 1e-9; IA peak step lies in hours 7–9.
- [ ] Steps 2–5 as Task 1; commit `feat(sim): Green-Ampt, Horton and design-storm hyetographs`.

### Task 3: The storm sim with a water ledger

**Files:** Create `src/sim/sim.js`, `src/sim/worker.js`; Test `test/sim.test.js`

**Interfaces — Consumes:** Tasks 1–2. **Produces:**
```js
createSim({
  terrain,                      // {nx, ny, cell, z}
  soil,                         // SOILS entry for the native soil
  Se = 0.3,                     // initial effective saturation
  imperv: Uint8Array,           // 1 = no infiltration (house footprint, patio)
  outlet: Uint8Array,           // where water may leave the grid (edges minus the house wall)
  roof: { areaM2, cell },       // roof catchment and the downspout's cell index
  garden: null | { mask: Uint8Array, storageM },  // garden cells + amended-soil pore storage (m) filled before native infiltration
  manningN = 0.24,              // lawn, for display flow depth
}) -> {
  step(rainMm, dtS),            // advance one step
  ledger: { rainL, roofL, infiltratedL, outL, storedL },  // cumulative litres
  closure(): number,            // |in − (inf+out+stored)| / max(in, 1e-9)
  depth(out: Float32Array),     // display depth m per cell = ponded + Manning flow depth
  pondedM3(): number,
  time: number                  // s
}
runStorm(sim, mmSteps, stepS, {tailH = 48, frameEveryS = 900, onFrame}) -> { ledger, drainH, peakStoredL, frames? }
```
Algorithm (one step): add rain to every non-imperv cell and the roof volume to `roof.cell`; then visit cells in `priorityFlood.order` reversed (upstream first): a non-lake cell infiltrates `min(available, capacity)` (garden cells first fill `storageM`), passes the rest to `dir`; water reaching a lake cell is added to that lake's volume; then each lake infiltrates over its wetted cells (depth = level − z > 0) and spills any volume above `spill` to `outCell` (process lakes in order of spill elevation, highest first; spill into another lake joins it). Water with dir −2 / reaching an outlet edge adds to `outL`. Flow passing a cell is recorded for display depth h = (n·q/(cell·√S))^0.6, S = max(slope, 0.005).

- [ ] Step 1: Failing tests:
  - `conservation within 0.5%` on a random smooth yard 64×64 with a bowl and a garden, design storm 40 mm IA + 48 h tail: `closure() < 0.005` (target < 1e-9).
  - `impervious plane sends everything out`: imperv all 1, tilted plane, 10 mm → outL == rainL within 1e-6 relative.
  - `sand swallows a small storm`: flat sand, 5 mm over 1 h → outL == 0, infiltrated == rain.
  - `garden captures roof runoff`: tilted loam plane with a 2 m² basin under the downspout → outL(after) < outL(before).
  - `zero rain`: ledger all 0, closure 0.
  - `drainH`: ponded clay bowl → drainH > 0 and finite.
- [ ] Steps 2–5; commit `feat(sim): cascade storm sim with water ledger`.
- [ ] Worker: `worker.js` handles `{type:'run', id, params}` → posts `{type:'frame', id, t, depth: Float32Array (transferable)}` and `{type:'done', id, result}`; `{type:'optimize', ...}` delegates to Task 6.

### Task 4: Garden sizing (published method), constraints, cost

**Files:** Create `src/garden/sizing.js`, `src/garden/constraints.js`, `src/garden/cost.js`; Test `test/sizing.test.js`, `test/constraints.test.js`

**Interfaces — Produces:**
- `sizeGarden({ drainageAreaM2, soil: 'sand'|'loam'|'clay', depthM, ...methodInputs }) -> { areaM2, factor, method, cite }` — exactly the method in `docs/research/sizing.md`.
- `SIZING_CITE` string.
- `forbiddenMask(terrain, { yard: [[x,y]...] metres polygon, wall: [[x,y],[x,y]] segment, septic: null|[[x,y]...], minWallM = 3, septicBufferM = 3 }) -> Uint8Array` (1 = garden may not cover).
- `gardenCells(terrain, g) -> Uint8Array` for `g = { cx, cy, lenM, widM, rot, depthM, bermM }` (ellipse).
- `applyGarden(terrain, g) -> { terrain: new terrain (level floor at min(rim z) − depthM; berm ring 0.6 m wide raised to floor + depthM + bermM on cells below that), mask }`.
- `costOf(g, { excavPerM3 = 60, soilPerM3 = 90, mulchPerM2 = 12, plantPerM2 = 45 }) -> CAD` (defaults logged in DECISIONS.md as rough 2026 Metro Vancouver retail guesses, editable in UI).

- [ ] Step 1: Failing tests: `sizing reproduces the published worked example` (inputs and answer copied from `docs/research/sizing.md`, within rounding the guide uses); `forbidden mask covers 3 m band from the wall`; `septic polygon + buffer is forbidden`; `cells outside the yard polygon are forbidden`; `applyGarden floor is level and below the rim`.
- [ ] Steps 2–5; commit `feat(garden): published sizing, constraints, cost`.

### Task 5: Plant layout

**Files:** Create `src/garden/layout.js`; Test `test/layout.test.js`. Consumes `src/data/plants.js` (`PLANTS`, fields `zone, spacing_m, spread_m, height_m, form`).

**Produces:** `zonesOf(g) -> { wet, middle, edge }` as ellipse radii fractions (wet: inner 0–0.45, middle 0.45–0.8, edge 0.8–1.0 + berm), `layoutPlants(g, plants, { seed, sun }) -> [{ id, x, y, r /* mature radius m */ }]` (Poisson-disc per zone, spacing = plant `spacing_m`, 3–5 species per zone, drifts of 3–7 same species), `plantList(placed) -> [{ id, common, latin, qty, zone }]`.

- [ ] Failing tests: `no two plants closer than the larger spacing × 0.9`; `every plant inside its zone ring`; `quantities sum to placed length`; deterministic for a seed. Steps 2–5; commit.

### Task 6: Optimizer (simulated annealing)

**Files:** Create `src/garden/optimizer.js`; Test `test/optimizer.test.js`

**Consumes:** Tasks 3–4. **Produces:**
`optimize({ terrain, forbidden, simParams, storm: {mm, stepS}, limits: { maxAreaM2, budget, minDepthM = 0.10, maxDepthM = 0.30, maxBermM = 0.15 }, prior: { areaM2 } /* sizing result */, iters = 160, seed, onTry }) -> { ok: true, garden, capturedL, outBeforeL, outAfterL, tries } | { ok: false, reason }`.
SA over (cx, cy, lenM, widM, rot, depthM, bermM); a move whose `gardenCells` touch `forbidden` or whose cost > budget or area > max is rejected (never evaluated); objective = outAfterL + 0.002·cost·L/CAD… (prefer cheaper among equals) + penalty 1e6 if drainH > 48. Start: D8 accumulation-weighted best legal cell for the prior area. Evaluation on a 2× coarsened terrain (`coarsen(terrain, 2)` exported from `src/sim/grid.js`).

- [ ] Failing tests: `never inside a forbidden zone` (200 random yards with random wall/septic, every returned garden's cells ∩ forbidden = ∅); `returns ok:false with a reason when everything is forbidden`; `beats a random legal placement` on a valley yard; `respects budget and maxArea`. Steps 2–5; commit.

### Task 7: Depth → heightfield, contours, model fetch

**Files:** Create `scripts/fetch-models.mjs`, `src/depth/depth.js`, `src/depth/heightfield.js`, `src/depth/contours.js`; Test `test/heightfield.test.js`, `test/contours.test.js`

**Produces:**
- `fetch-models.mjs`: downloads Depth Anything V2 Small ONNX (onnx-community/depth-anything-v2-small, `onnx/model_quantized.onnx` and `onnx/model_fp16.onnx`) to `public/models/`, copies `node_modules/onnxruntime-web/dist/*.{wasm,mjs}` needed to `public/ort/`, pins SHA-256, `--check`, `--print-hashes` (pattern of BTTRURSLF-v2 `scripts/fetch-mediapipe.mjs`).
- `loadDepth({ onProgress }) -> Promise<{ estimate(source: ImageBitmap|HTMLCanvasElement) -> { w, h, data: Float32Array /* relative inverse depth */ }, backend }>` (dynamic `import('onnxruntime-web')`, `ort.env.wasm.wasmPaths = '/ort/'`, WebGPU→wasm, input 518×518 ImageNet-normalised).
- `toHeightfield({ depth, fovYDeg = 65, gravity: null|[x,y,z] camera space, wallPts: [[u,v]...]|null, yard: [[u,v]...] (0..1 image coords), scale: { a:[u,v], b:[u,v], meters }, n = 128 }) -> { terrain, confidence: { slopePct, lowPct, highPct, source: 'gravity'|'wall'|'level-assumed' }, toGround([u,v]) -> [x,y] m, toImage([x,y]) -> [u,v] }`.
- `contours(terrain, intervalM) -> [{ level, segs: Float32Array /* x0,y0,x1,y1 m */ }]` (marching squares).
- `manualTerrain({ widthM, depthM, preset: 'flat'|'gentle'|'steep', dir: [dx,dy], pins: [{x,y,h}] , n }) -> terrain` (2% / 8%; pins by RBF thin-plate).

- [ ] Failing tests: synthetic depth of a known tilted ground plane seen by the pinhole camera with known gravity → recovered slope within 0.5 percentage points and the scale line measures its meters within 1%; noise depth → finite terrain and `highPct − lowPct` wider than for clean; contours of z = x on 10×10 at 1 m → 9 levels each a vertical line; `manualTerrain gentle` mean slope 2% ± 0.1. Steps 2–5; commit.

### Task 8: Weather and plan PDF

**Files:** Create `src/weather/openmeteo.js`, `src/data/storms-richmond.json`, `src/plan/pdf.js`; Test `test/weather.test.js`, `test/pdf.test.js`

**Produces:**
- `getStorms({ lat, lon, region, fetchFn = fetch, today = new Date() }) -> Promise<[{ id: 'recent'|'typical'|'design', label, totalMm, mm: Float64Array, stepS: 300, peakMmH, when?: string, source: { text, url } }]>`; on any failure returns the bundled Richmond set, each `source.text` saying "offline sample".
- pure helpers `heaviestDay(hourly: {time:[], precipitation:[]}) -> { date, hourlyMm: number[24] }`, `wetDayPercentile(dailyMm: number[], p, wetMm = 1) -> mm`.
- `scripts/make-richmond-storms.mjs` writes the JSON from the live API once (lat 49.17, lon −123.14).
- `makePdf({ jpeg: Uint8Array, imgW, imgH, pageW = 595.28, pageH = 841.89, title, lines: string[] }) -> Uint8Array` single page: image full-width, text layer with Helvetica.

- [ ] Failing tests: `heaviestDay picks the max-sum calendar day`; `wetDayPercentile(…, 90)` on 1..100 → 90 (nearest-rank, wet days only); `getStorms falls back offline` with a fetch that throws; `pdf starts with %PDF-1.4, has a valid xref (each offset points at 'n 0 obj') and ends with %%EOF`. Steps 2–5; commit.

### Task 9: Plant data and sources (research) — done by a research agent

`src/data/plants.js` (`REGIONS`, `PLANTS`, `SOURCES`), `docs/research/{sizing,hydrology}.md`, `SOURCES.md`. Test `test/plants.test.js`: every plant has latin, zone ∈ {wet,middle,edge}, numeric sizes, ≥1 source key present in SOURCES; each region ≥5 per zone.

### Task 10: Art

`art-src/manifest.mjs` → `art-src/tools/gen.mjs` (ChatGPT via codex) → `art-src/gen/*.png` → `art-src/tools/cutout.mjs` → `public/art/*.webp` (a `art-src/tools/build-art.mjs` runs every cut-out with the right flags and max sizes: scene layers 2400 px, plants 900 px, comps not shipped). Missing art → labelled placeholder WebP generated by `build-art.mjs` (`PLACEHOLDER: <name>` painted on it) and listed in `art-src/MISSING.md`.

### Task 11: Shell, scroll engine, preloader, story scenes

**Files:** `index.html`, `src/main.js`, `src/core/{env,scroll,ease,raf}.js`, `src/story/{scenes,story,rain-overlay}.js`, `src/styles/{tokens,base,story}.css`, `public/fonts/*`.
Consumes `design-reference/makemepulse/NOTES.md` numbers (lerp, easings, durations, parallax per layer, cursor lag) and the comps. Produces `startStory(root) -> { destroy }`, the `#design` hand-off button calling `openDesigner()` (dynamic import of Task 12). Static fallback: no-WebGL → no rain overlay, logged. Reduced motion → scenes cross-fade at section boundaries.

### Task 12: Yard renderer

**Files:** `src/render/yard-scene.js`, `src/render/water-material.js`, `src/render/static-yard.js`.
`createYardScene(canvas, { terrain, photo: ImageBitmap|null, mapUV }) -> { setWater(depth: Float32Array), setGarden(g|null, plants), setContours(levels), setMarks(marks), cameraTo(name: 'capture'|'mark'|'storm'|'optimize'|'plants'|'compare'|'plan', ms), setSplit(x01|null, otherDepth?), fps(), destroy() }`. Water: a second mesh, height = terrain + depth, refraction (screen-space offset of the ground render target by the water normal), ripples (procedural rings from rain intensity uniform), puddle edge foam, overflow streams brighter where flow depth is high. Static fallback: same API on Canvas2D (top-down hillshade + teal water alpha).

### Task 13: Designer flow

**Files:** `src/designer/designer.js`, `src/designer/steps/*.js`, `src/styles/designer.css`.
One fixed full-screen scene; a bottom sheet (phone) / side panel (≥1024 px) carries each step; camera moves between steps via `cameraTo`. Steps: capture (camera / upload / demo; "Your photo stays on this device"), mark (scale line, downspout, house wall, outlet, optional septic, yard outline), slope (contours + confidence band; manual fallback presets + pins), soil (sand/loam/clay + jar test explainer), storm (3 storms with sources), simulate (before), optimize (limits: budget, max area; live tries), plants (zones, grow-in timelapse 3 seasons), compare (swipe; litres captured, litres leaving, hours standing), plan (PNG + PDF export).

### Task 14: How it works, CLAUDE.md, scripts/shoot.mjs, compare, audit

`scripts/shoot.mjs` (every scene/step at 1440×900, 1920×1080, 390×844; demo yard end to end with `--use-fake-device-for-media-stream --use-file-for-fake-video-capture=<y4m>`; before/after; plan export saved; fps via rAF sampling; exit 1 on console error), `design-reference/compare/` sheets, `CLAUDE.md` in BTTRURSLF-v2's style, web-design-guidelines audit, `npm run build` clean.

## Execution order / parallelism

Wave 1 (parallel): Tasks 1+2+3 (one agent, sim), 7 (depth), 8 (weather+pdf), 9 (research, running), 10 (art, running), makemepulse NOTES (running).
Wave 2 (parallel): Tasks 4+5+6 (garden agent, after research lands), 11 (shell/story, after NOTES + art), 12 (renderer).
Wave 3: Task 13 (integration, me), Task 14 (verification, me).
