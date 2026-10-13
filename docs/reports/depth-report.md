# Task 7 report: depth -> heightfield, contours, manual terrain, model fetch

Branch `wt/depth`. All work is in `src/depth/`, `scripts/`, `test/`.

## What was built

| File | What it does |
|---|---|
| `src/depth/heightfield.js` | `toHeightfield({ depth, fovYDeg=65, gravity, wallPts, yard, scale, n=128, cameraHeightM=1.4 })` -> `{ terrain, confidence, toGround, toImage, meta }` |
| `src/depth/contours.js` | `contours(terrain, intervalM)`: marching squares, `[{ level, segs: Float32Array }]` in metres |
| `src/depth/manualTerrain.js` | `manualTerrain({ widthM, depthM, preset, dir, pins, n })` (flat 0 / gentle 2 / steep 8 %, thin-plate pins), plus `meanSlope(terrain)` |
| `src/depth/preprocess.js` | pure `preprocess(rgba, w, h, size=518)` -> `{ tensor (NCHW Float32, ImageNet mean/std), dims, mapping }` |
| `src/depth/depth.js` | browser only: `loadDepth({ onProgress })` -> `{ estimate(source), backend, dispose }` |
| `scripts/fetch-models.mjs` | downloads the model, copies the ORT runtime, SHA-256 pins, `--check`, `--print-hashes` |
| `scripts/smoke-depth.mjs` | Node smoke run of the real model through `preprocess()` (manual, ~1 min) |

Conventions are in each file header. The main ones:

- Image coords (u, v) in 0..1, u right, v down. Camera space is OpenCV (x right, y down, z forward). `gravity` is a vector pointing down, in camera space. A phone held level and looking at the horizon gives `[0, 1, 0]`.
- Ground frame: x = right, y = away from the camera (the horizontal projection of the view direction), in metres. The origin is the near-left corner of the yard's bounding box. Cell (i, j) covers `[i*cell, (i+1)*cell)`, heights are sampled at cell centres, row 0 is the nearest edge, and `index = y*nx + x`. Heights are relative, with the lowest cell at 0. `toGround` and `toImage` use this same frame.
- `confidence = { slopePct, lowPct, highPct, source, manualSuggested, notes[] }`. `manualSuggested` and `notes` are additions to the planned interface. `meta = { cameraHeightM, usedHeightPrior, downhill: [dx, dy], yardAreaM2 }`.
- `estimate()` returns `{ w: 518, h: 518, data, aspect, mapping }`. `aspect` is the photo's width/height, and `heightfield.js` reads `depth.aspect`, so the depth object can be passed straight through.

## The maths, and the main finding

Depth Anything V2 returns relative inverse depth: `1/z = s*d + t`, with s and t unknown for each photo. The marked line fixes s. **The shift t cannot be fitted by "make the yard as planar as possible".** Changing t moves every reconstructed point by the projective map `P -> P / (1 + tau*z)`, which fixes the camera centre. A projective map sends planes to planes, so every t gives an equally planar yard, only tilted differently. This holds for any surface, not just a flat yard. Only a metric cue can fix t. The implementation uses two:

1. **Gravity + 3 or more wall taps (closed form).** The house wall's plane, built from the same affine depth, must be vertical: `(b + tau*e_z) . g = 0`, which gives `tau = -(b.g)/g_z`. No prior is needed. In the synthetic test it recovers 4.12 % within 0.5 pp at a camera height of 0.9 m, which is not the default, and the camera height comes out as 0.9 m.
2. **Otherwise, a camera-height prior** (1.4 m). For each tau, the marked line sets the metres, and we pick the tau that puts the camera 1.4 m above the fitted plane. h(tau) is not monotonic: there are three roots in the tests, and the wrong ones read the yard as 100-200 % slopes. So roots steeper than 60 % are dropped and the gentlest remaining root is kept. The band then includes how much the slope moves between 1.2 m and 1.6 m.

How gravity is chosen: the sensor vector (`source: 'gravity'`). Otherwise, with 3 or more wall taps, the wall normal is horizontal and we assume no camera roll, so `g ∝ w × e_x` (`'wall'`, +1 pp to the band). Otherwise `'level-assumed'`: the fitted plane is level, only relief is real, and the band is ±(|slope| + 3 + 2·SE) pp.

The plane fit is Huber IRLS of the normalised inverse depth against the ray, `dn ≈ a·r`, over a 64×64 lattice inside the yard polygon. Relief: each cell centre goes onto the plane, then into the photo. The model's point on that ray contributes `(P_raw − P_plane)·up`, but only inside the yard polygon (the bounding box can include the house). Relief is clamped to ±1 m and gets two masked 3×3 smoothing passes. Outside the yard, heights come from the plane.

Band half-width = 0.5·|slope| (the fixed ±50 % monocular relief term) + 2·SE (plane-fit standard error over the yard cells, with N capped at 64 because the residuals are spatially correlated) + the camera-height spread (only when the prior was used). `lowPct` is clamped at 0. `manualSuggested` is set when the band is over 8 pp, the yard is under 4 m², the scale line or polygon is degenerate, the depth samples are too few, or the source is level-assumed.

### Sensitivity of the camera-height prior (important for the UI)

Synthetic scene with a true slope of 5.38 %, gravity known, no wall taps, and the prior fixed at 1.4 m:

| true camera height | read slope | band |
|---|---|---|
| 1.2 m | 2.5 % | 0-9.8 |
| 1.4 m | 5.38 % | 0-14.5 |
| 1.6 m | 11.8 % | 0-24.4 |

This barely changes with pitch (25-70°). An error of ±0.2 m in the assumed phone height moves the slope by -3 / +6.5 pp, because "camera higher" and "ground falling away" look the same after the affine ambiguity. The band is honest (it contains the truth in tests at H = 1.25 m and 1.55 m), but it is wide, so **gravity-only captures will usually have `manualSuggested: true`**. Gravity plus wall taps gives a tight band (about ±2 pp at 4 %) with no prior. Suggestions for the capture UI, which is not built here:

- (a) always ask for 3 taps on the house wall when it is visible;
- (b) optionally ask "phone height: waist / chest / eye";
- (c) a second known length at a different distance would also fix the shift. This is not implemented.

## Model and runtime (fetched, verified)

HF tree checked on 2026-10-13. `onnx/` contains model, model_bnb4, model_fp16, model_int8, model_q4, model_q4f16, model_quantized and model_uint8. The planned files both exist, so no substitution was needed. The HF LFS oids are the SHA-256 values, and the downloaded bytes matched them.

| file | bytes | sha256 |
|---|---|---|
| `public/models/depth-anything-v2-small/model_quantized.onnx` (int8, WASM) | 27,258,801 | `fcf51f1b230362b28690bb9d1809bf0431f29cad20534e3f589bd7285547f20d` |
| `public/models/depth-anything-v2-small/model_fp16.onnx` (WebGPU) | 49,642,442 | `2df6223f206b5164e21f664ace61dabeb9bb6a49b8b5a3e00510b4807d0f5b04` |
| `public/ort/ort-wasm-simd-threaded.wasm` | 11,210,254 | `71aef049…33fe4` |
| `public/ort/ort-wasm-simd-threaded.mjs` | 20,856 | `30dd851d…385a8` |
| `public/ort/ort-wasm-simd-threaded.jsep.wasm` (WebGPU build) | 21,872,216 | `b45970d0…39368` |
| `public/ort/ort-wasm-simd-threaded.jsep.mjs` | 44,677 | `1cbcba8f…6dcd8` |

The full hashes are pinned in `scripts/fetch-models.mjs`. Both `node scripts/fetch-models.mjs` and `--check` print `ok: 2 model files and 4 ORT 1.22.0 runtime files verified`. Both directories are gitignored.

The Node smoke run (`scripts/smoke-depth.mjs`, ORT 1.22.0 WASM, 1 thread) found:

- Both exports take `pixel_values` float32 `[B,3,H,W]` and return `predicted_depth` float32 `[B,H,W]`. The output is 518×518 for a 518 input, and **the fp16 export keeps float32 I/O**.
- On a synthetic image, the output is larger at the bottom (nearer), which confirms it is inverse depth.
- An int8 inference took **~61 s single-threaded** in Node on this heavily loaded machine. Browser WASM without cross-origin isolation is also single-threaded, so phones on the WASM path may take tens of seconds. WebGPU should be much faster, but that is not measured.

## TDD evidence

RED: all 21 tests in the four new files failed first against stubs that threw `not implemented` (the log shows 20 "not implemented" errors plus the MODEL_SIZE assertion).

GREEN:

- After contours, manualTerrain and preprocess: 13/13 passed (commit 04b9889).
- After heightfield: `node --test "test/*.test.js"` passed 22/22.
- Two heightfield tests failed on the way, and both were fixed:
  - **A test bug:** one wall tap projected outside the image.
  - **A code bug:** the 3×3 wall-tap median was centred on the nearest pixel rather than on the exact tap. A half-pixel offset tilted the wall plane, giving 3.95 % read for 5 % true.

  Also during the heightfield work: the "gentlest root" rule was added after the scan showed three height roots. The test asserting that the clean gravity-only case is *not* manual-suggested was dropped, because the camera-height sensitivity above makes that false for honest bands. It was replaced with "band contains the truth at H = 1.25 / 1.55 m", and with "gravity + wall gives a band under 8 pp and no manual suggestion".

Tests:

- `test/heightfield.test.js` (9): known gravity, 5.39 % within 0.5 pp, the scale line within 1 %, and an independent 2 m along the view within 2 %; grid orientation; toImage∘toGround round trip; gravity + wall; gravity-only band covers the truth; wall-only; level-assumed band; pure and added noise (finite, wider band, manual suggested); tiny and degenerate yard.
- `test/contours.test.js` (4): z = x on 10×10 at 1 m gives 9 vertical lines; cone rings; flat or bad interval gives `[]`; NaN is skipped.
- `test/manualTerrain.test.js` (5): gentle 2 % ± 0.1; steep 8 % / flat 0 % with direction; shape and cell size; a pin is honoured and the corners are kept; degenerate input stays finite.
- `test/preprocess.test.js` (4): the 518 constant; NCHW plus ImageNet values; stretch mapping; bilinear downscale.

## Concerns and notes for the leader

1. **`npm test` is broken on Node 24.** `node --test test/` fails with "Cannot find module …\test". `node --test "test/*.test.js"` works. I left package.json alone to avoid merge conflicts; it is a one-line fix.
2. Gravity-only slope depends on the camera-height prior (see the table). Wall taps are the real fix, and the capture UI should ask for them.
3. **The DeviceOrientation/DeviceMotion → camera-space gravity conversion is not implemented.** It is the capture step's job. Expected convention: down vector, camera x right / y down / z forward. Beware the iOS vs Android sign conventions for `accelerationIncludingGravity`.
4. Not run on a real photo or in a browser. `depth.js` passes `node --check` only; an esbuild bundle check hung for more than 25 min on the loaded machine and was killed, so the `onnxruntime-web/webgpu` and `/wasm` import specifiers are not yet verified by a bundler.
   - Real Depth Anything errors are not exactly affine (especially wall vs ground), so the wall closed form may be less exact on real photos than in the synthetic tests.
   - `depth.js` imports `onnxruntime-web/webgpu` or `onnxruntime-web/wasm` (the smaller WASM-only build) and sets `wasmPaths = '/ort/'`. Under a non-root Vite `base`, those absolute `/models/` and `/ort/` paths would need `import.meta.env.BASE_URL`.
5. A `fetch-models` npm script and DECISIONS.md lines were not added (to avoid conflicts). Suggested DECISIONS line: "Depth shift (affine t) is unobservable from planarity; fixed by gravity + wall taps, else a 1.4 m camera-height prior with a 1.2-1.6 m band."

---

# Fix round 1

Commits: f3d0f97 (band, notes, mask, saddle, solve, package.json), then the worker and browser-check commit (see `git log`). Points 1 and 5 of the concerns above are superseded by what follows.

## Changes

1. **Level-assumed band** is now `[0, max(|slope| + 3, 12)]` pp, per the ruling.
   - TDD: the old level-assumed test was updated to assert the ruling. A new test covers a 5 % yard with collinear wall taps, which gives `source: 'level-assumed'`, a band containing 5, and a "wall unusable" note. RED (3 failing: high 3.0, band 0..3.0, no mask) → GREEN.
2. **Missing-model errors are now clear.** `src/depth/models.js` is the single source of the model files, pinned sizes and SHA-256 values, plus `SIZE`. `scripts/fetch-models.mjs` imports the pins from it, and only runs `main()` when invoked as a script.
   - `checkModelResponse()` rejects `!ok`, `content-type: text/html` (an SPA fallback page), and any byte count other than the pinned one, with `err.code = 'model-missing'`.
   - Session and inference failures get `err.code = 'backend'`. When WebGPU fails and WASM is tried next, the message lists each backend's error.
   - Tests: `test/models.test.js` (5), including "fetch-models pins equal the browser pins". These were written together with `models.js`, not strictly test-first.
3. **Inference runs in a worker, with a per-backend input size.**
   - `SIZE = { webgpu: 518, wasm: 308 }`.
   - `src/depth/depth-worker.js` is a module Worker (`new Worker(new URL('./depth-worker.js', import.meta.url), { type: 'module' })`). Its protocol is `load` / `progress` / `ready` / `estimate` / `result` / `error`. The ImageBitmap is transferred in and the depth buffer is transferred out.
   - `depth.js` keeps `loadDepth({ onProgress }) → { estimate, backend }` and adds `size`, `dispose` and an optional `backend` force (for testing).
   - Multiple `onProgress` listeners are supported, one shared load. Concurrent `estimate()` calls are serialised through a promise queue. A failed load can be retried.
4. **Minor fixes:**
   - `terrain.mask` (a Uint8Array of the in-yard cells) is returned, with a test.
   - Wall taps are dropped with a "wall unusable: …" note when they are collinear (minor/major spread < 2 %), when the plane is singular, when there is no depth gradient, or when |g| ≈ 0.
   - Contour saddle test: 2×2 `[1,0;0,1]` at 0.5 gives two segments at the edge midpoints. It passed immediately, because the code was already right.
   - `fetch-models` hashes each ORT file in `node_modules` before copying it, so a mismatched file is never copied.
   - `manualTerrain`'s `solve` is no longer exported.
5. **package.json:** `"test": "node --test \"test/**/*.test.js\""` and `"fetch-models": "node scripts/fetch-models.mjs"`. `npm test` now runs 31 tests and all pass. `npm run fetch-models` prints "ok: 2 model files and 4 ORT 1.22.0 runtime files verified".

## Real browser check (Playwright Chromium, headed, `--enable-unsafe-webgpu --use-angle=d3d11`)

Commands: `npx vite --port 5199 --strictPort`, then `node dev/run-depth-check.mjs` and `node dev/run-depth-check.mjs "http://localhost:5199/dev/depth.html?backend=wasm" docs/reports/depth-shots/demo-yard-wasm`. The photo is `dev/demo-yard.png` (1536×1024, the same blob as `art-src/gen/demo-yard.png` on main).

The check found two real bugs, both now fixed:

- **A `/ort/` directory as `wasmPaths`.** With a directory, ORT does `import('/ort/ort-wasm-simd-threaded.mjs')`, and the Vite dev server refuses to import files from `public/` ("Failed to fetch dynamically imported module …/ort/ort-wasm-simd-threaded.mjs?import"). The fix is `wasmPaths = { wasm: '/ort/ort-wasm-simd-threaded.jsep.wasm' }`, so the .mjs glue comes from the bundle.
- **`onnxruntime-web/wasm` does not inline its glue.** Its bundle imports `ort-wasm-simd-threaded.mjs` next to itself, which broke under Vite's dep pre-bundling (`/node_modules/.vite/deps/ort-wasm-simd-threaded.mjs`). The worker now uses the `onnxruntime-web/webgpu` build, which inlines its glue, for both execution providers.
  - **Cost:** non-WebGPU devices download the 22 MB JSEP .wasm instead of the 11 MB plain one.
  - **Side effect:** `public/ort/ort-wasm-simd-threaded.{wasm,mjs}` and the `.jsep.mjs` are no longer used at runtime. They are still fetched and pinned, and can be dropped later.

Final run (heavily loaded laptop; the load time includes compiling the WebGPU shaders):

| backend | input | load | estimate (worker) | rAF frames during estimate | output | inverse depth (bottom row mean / top row mean) |
|---|---|---|---|---|---|---|
| webgpu | 518 | 17.1 s | 3.88 s (3.87 s) | 532 | 518×518 float32, 0..7.98 | 5.98 / 0.82 (near > far, as expected) |
| wasm (forced) | 308 | 6.9 s | 6.48 s (6.48 s) | 923 | 308×308 float32, 0..5.90 | 4.84 / 0.66 |

The main thread kept painting the whole time; the frame counts above are the evidence. The first-ever WebGPU run took 41.9 s to load and 8.8 s to estimate, with a cold cache and shader compile.

Shots:

- `docs/reports/depth-shots/demo-yard-depth.png` (WebGPU depth map)
- `demo-yard-wasm-depth.png`
- `demo-yard-page.jpg` and `demo-yard-wasm-page.jpg` (page with the log)

The depth maps look right: the house wall and downspout are nearest, the lawn grades smoothly into the distance, and the trees and sky are farthest.

**Heightfield on the real depth** (no gravity in a desktop page; lawn polygon; a 1 m line guessed on the lawn): level-assumed reads 1.2 %, band 0–12. With three wall taps (source `wall`) it reads 13.9 %, band 5.6–22.1 (WebGPU), or 20.3 % (WASM). The note "no shift puts the camera at the assumed height" shows the guessed 1 m line is too long for this photo. Offline, with 0.5 m, the camera comes out at 1.40 m and the yard at 27.6 m². This confirms the earlier concern: the wall-only route, with derived gravity and a height prior, is poorly conditioned on real photos, and gravity from the sensors is needed.

That run also found a third bug:

- **Bug:** a scale line the depth disagrees with made the height solve push the shift to the horizon limit. The yard became about 2.4e10 m² and was clipped.
- **Fix:** shifts now start at 0.1 × the inverse-depth range above the horizon limit, so the yard's far edge is at most ~11× as far as its near edge. The polygon vertices are also included in the limit. A "no shift" result now sets `manualSuggested`.
- **Regression test:** it uses the real depth, `test/fixtures/demo-yard-depth-128.f32` (64 KB, 128×128 nearest-sampled from the WebGPU output). RED: "yard wider/deeper than 80 m, clipped". GREEN: area 340 m², not clipped.

## Remaining concerns

- **Production build (not checked):** it was not run. `vite build` with a worker that does dynamic `import()` needs `worker: { format: 'es' }` in `vite.config.js`, and there is no Vite config on main yet.
- **Inline glue may not survive a build:** whether ORT's inlined glue holds up under the production bundler is also unverified.
- **Pins still name unused runtime files:** `fetch-models` still pins the plain WASM runtime files that the app no longer loads.
- **Unrelated 404:** one 404 appears in the page console. It is most likely `/favicon.ico`.
