# Task 12 — Yard renderer: report

Branch `wt/render`. Verified in a real Chromium (Playwright 1.63; ANGLE D3D11 on an RTX 3060)
with `node scripts/verify-yard.mjs` against the dev page `/dev/yard.html`.

## What was built

| File | Role |
|---|---|
| `src/render/index.js` | `createYard(canvas, opts)`: probes WebGL2 on a **throwaway** canvas, dynamic-imports `yard-scene.js` (and so three), falls back on any failure with `console.info('[raingarden] static fallback: yard — <reason>')`. `?static=1` forces the fallback. |
| `src/render/yard-scene.js` | three.js scene: grid geometry (nx×ny vertices) shared by ground and water, float textures for terrain/depth, half-res ground render target, scissored before/after split, pick, fps, resize, destroy (disposes everything, `forceContextLoss` = WEBGL_lose_context). |
| `src/render/water-material.js` | Water shader (see below). |
| `src/render/ground-material.js` | Photo/lawn draped on terrain, overcast lighting (cool shadows, warm light), mulch + berm painted in, wet-ground darkening, plant contact shadows, grain, edges dissolving into slate. |
| `src/render/garden-shape.js` | The dug basin (bowl + soft berm) in GLSL **and** JS, so CPU-placed plants/marks/contours match the GPU displacement. |
| `src/render/depth-display.js` | Pure: `displayDepth` (softens 1-cell D8 streams into tapering 3-cell streams, never raising a bank above nearby water) and `levelPond` (pours the garden's water volume into the dug bowl so it is flat). |
| `src/render/camera-rig.js` | Named poses capture/mark/storm/optimize/plants/compare/plan; distance solved per viewport so the subject fits; expo-in-out arcs over pose parameters; portrait screens look more steeply down and cinematic poses may crop the flanks. |
| `src/render/overlays.js` | Contours (teal, edge-faded, draped +2 cm) and marks (downspout pin, outlet ring, wall fence, septic outline, scale bar). |
| `src/render/plants.js` | Camera-facing sprites sized 2r × (0.3 + 0.7·season); start as tinted soft blobs per growth form, swapped for `/art/plants/<id>.webp` when it loads. |
| `src/render/static-yard.js` | Canvas2D fallback, same API: top-down hillshade × photo, teal-by-depth water, garden ellipse + plant dots, contours, marks, split, pick; draws only on change; `fps()` = 60. |
| `src/render/palette.js` | Token mirror (tokens.css belongs to Task 11). |
| `dev/yard.html`, `dev/yard.js` | Synthetic 128² yard (slope, swales, bowl), painted stand-in photo, fake storm (bowl fills then overflows downhill, streams gather, garden ponds), pose buttons, split toggle/slider, rain toggle. `?t=17` freezes the storm clock, `?photo=0` uses the lawn material. |
| `scripts/verify-yard.mjs` | The verification below. |
| `test/render.test.js` | 5 unit tests for the pure helpers (all pass). |

### Water
- Vertex: lifts each grid node to ground + depth (texelFetch of an R32F texture, uploaded per `setWater`). A **dry node takes the neighbouring water level, clamped just under its own ground** — so a pond's edge is exactly where the flat surface meets the terrain (smooth contour shoreline, no stair-steps, no z-fighting); isolated dry nodes are tucked 3 cm under. Below 0.5 mm: discarded.
- Normal from the water-surface gradient (dry neighbours count as level, so pond edges stay flat); Manning-style speed h^⅔·√S drives bright downhill streaks on overflow streams.
- Rain ripples: jittered ring grid at two scales (0.9 m and 0.45 m cells), each cell reseeding per cycle, density from `rainMmH`; slope + crest highlight; antialiased by `fwidth` so they fade instead of sparkling at distance.
- Refraction of the half-res ground pass offset by the view-space normal; absorption clear → teal `#49A3A0` → slate `#26313C` with depth (thin sheets keep a teal veil); Fresnel to an overcast sky mixed from rain/paper/slate tokens; small warm highlight; broken paper foam in the shallowest band.
- The ground RT is re-rendered only when the camera, water, garden or split changed.

## Measurements

| | 1440×900 (DPR 1) | 390×844 (DSF 3 → capped 1.5, mobile emulation) |
|---|---|---|
| rAF fps over 3 s, live storm, storm pose | **60.2** | **60.3** |
| rolling `api.fps()` | 60 | 60 |
| uncapped (`--disable-gpu-vsync --disable-frame-rate-limit`) | 202 fps | 222 fps |
| `setWater` CPU cost (128², incl. smoothing + levelling) | 2.9 ms | 2.9 ms |

Console errors: **0** (54 expected 404s for `/art/plants/*.webp` and `/art/tex-lawn.webp`, which do not exist
in this worktree — Task 10 art; the renderer falls back to blobs / procedural lawn as specified).
Static fallback log seen both ways: `?static=1` → `forced by ?static=1`; launching with
`--disable-gpu --disable-webgl --disable-webgl2` → `no WebGL2`. `pick()` at screen centre in the plants pose
returned (4.6, 4.5) m = the garden centre; `destroy()` raised no errors.

## Screenshots (`docs/reports/render-shots/`)
`desktop-{capture,mark,storm,optimize,plants,compare,plan}.png`, `desktop-compare-split.png`,
`desktop-mark-contours.png`, `desktop-move-midflight.png`, the same set as `phone-*.png`,
`static-plan.png`, `static-compare-split.png`.

Iterations made after looking at them: one-cell streams first rendered as spiky white trenches (fixed by
`displayDepth` + less foam/streak); garden water followed the bowl's slope (fixed by `levelPond`); pond
shorelines were stair-stepped (fixed by extending the water level into dry nodes); ripples sparkled (fwidth
fade, larger rings, crest highlight); plant sprites were sliced at the waterline (water no longer writes
depth); contours ran past the faded yard edge (vertex-alpha fade); phone framing was a sliver (portrait
elevation + flank crop).

## Decisions / notes for integration
- Grid node (ix, iy) sits at (ix·cell, iy·cell) metres; contours/marks/pick use the same convention.
- The renderer digs the garden visually (bowl `depthM`, berm `bermM`) and levels the garden's water volume
  into it. If Task 3/13 already carve the garden into `terrain.z`, pass `depthM: 0` or the dig doubles.
- `api.kind` is `'webgl'|'static'` and `api.canvas` is the canvas actually drawn on (the fallback swaps in
  a twin canvas if the original already handed out a WebGL context).
- `src/core/env.js` `logFallback` (Task 11) is not in this worktree; `index.js` logs the identical line
  directly — swap to `logFallback('yard', reason)` at merge.
- Our shaders are not colour-managed (tokens/photo used as display colours); built-in materials keep three's
  default sRGB path and land on the same colours.
- `npm test` (`node --test test/`) errors on this Windows/Node setup before running any file (pre-existing
  script); `node --test test/render.test.js` passes 5/5.

## Concerns
- fps was measured on a desktop RTX 3060, not a mid-range phone. Uncapped headroom is ~3.4× at 60 fps;
  a mid-range phone GPU is far weaker, so real-device profiling is still needed. Levers if needed:
  disable MSAA (already off at DPR ≥ 2), drop the small ripple layer, cap DPR at 1.25.
- `setWater` costs ~3 ms CPU on desktop (could be ~10 ms on a phone); if the designer streams frames at
  60 Hz, move `displayDepth` into the sim worker.
- Placeholder plants are blobs until Task 10 art lands; the plant-shadow loop caps at 48 plants.
