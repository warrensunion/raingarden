# Designer report (plan Task 13)

Branch `wt/designer`, worktree `C:\Users\Warren\Downloads\raingarden-wt\designer`. Status: **DONE_WITH_CONCERNS**. Concerns are listed at the end.

## What was built

| File | Contents |
|---|---|
| `src/designer/designer.js` | `openDesigner(root, { mode })` (same export as the stub). Sets up the fixed full-viewport stage and holds the state. `resetFrom(kind)` drops whatever a change invalidates. Builds the yard once per terrain: the new canvas fades in over the old one. Also handles camera poses per step, navigation, demo start, close, and the `window.__raingarden` hook (`step`, `goTo(n)` for steps already reached, `state`, `lastResult`, plus `fps()`). |
| `src/designer/sheet.js` | The step sheet. On phones (≤ 1023 px) it is a bottom sheet: drag handle that collapses and expands it, max 62vh, publishes `--dz-sheet-h`. At ≥ 1024 px it is a 400 px left panel. 10-segment progress line, 0.5 s `--ease-ui` cross-slide (a fade with reduced motion), one marigold primary button and a quiet "Back". |
| `src/designer/marker-editor.js` | Marks on the photo in an SVG overlay sized exactly to the letterboxed image. Tap to place, drag to adjust, focusable markers that arrow keys nudge by 1%, undo history. A polygon closes on tapping the first point, a double-tap, or "Done outlining". |
| `src/designer/steps/*.js` | One file per step, each `(sheet, ctx) => { destroy }`: capture, mark, slope, soil, storm, before, design, plant, compare, plan. |
| `src/designer/playback.js` | 24 s storm playback with play/pause, scrubber and a clock line ("2:00 pm, 12 mm/h"). Depth is blended between the 15-minute sim frames on every animation frame. |
| `src/designer/sim-client.js` | Promise wrapper around `src/sim/worker.js`. Its `optimize` returns `{ promise, cancel }`; cancel terminates the worker. |
| `src/designer/plan-canvas.js` | The A4 plan at 300 dpi (2480×3508). It contains the title, date, region, top-down drawing, plant table, soil mix, 6 build steps, the boxed safety note and a sources line. |
| `src/designer/model.js` | Pure helpers, with 25 tests in `test/designer-model.test.js` (written test-first): image marks → ground marks; wall line, house mask, outlet mask and snapped downspout → `siteInputs`; DeviceOrientation → camera gravity; a synthetic level-ground depth; slope sentence and direction words; litres, hours and clock formatting; frame and ledger interpolation; optimizer failure in plain words; plant table rows; segment clipping; contour interval. |
| `src/styles/designer.css` | Every selector starts with `.dz-`. Colours come from tokens only. |
| `scripts/verify-designer.mjs` | Headed GPU Chromium. Runs the demo end to end at 1440 and 390, then a fake-camera run, plus an optional `static` run (forced Canvas2D fallback with reduced motion). |

### Small changes to engine modules (additive)

- `src/render/yard-scene.js` and `static-yard.js`: new `project(x, y)` that maps ground metres to client px. The optimizer's ghost gardens and the height pins are drawn on a 2D overlay, and they need this.
- `src/sim/worker.js`: `frame` messages now also carry `ledger` (the running totals), so the litre counters update live. Existing worker tests still pass.
- `src/depth/depth-worker.js`: `ort.env.logLevel = 'error'` and `logSeverityLevel: 3`. Without this, ORT prints node-placement warnings through `console.error`, which breaks the zero-console-errors check.
- `vite.config.js`: `chunkSizeWarningLimit: 800`. The ~700 kB `three` chunk is lazy and expected, so the build now runs without warnings.

## The demo run (1440×900 and 390×844 give the same numbers)

| | |
|---|---|
| Depth | WebGPU, Depth Anything V2 Small. The reading is "Falls about 20% toward the front right (likely 9–31%)" with source `gravity` (the stored demo vector), and `manualSuggested` is true. So the step opens the manual control: Gentle (2%), falling downspout → outlet. |
| Storm | Design storm (90th percentile wet day), 23.3 mm, Richmond, BC. These were live Open-Meteo numbers, which match the bundled set. |
| Before | 1,507 L rain on the yard + 2,796 L from the 120 m² roof. 2,756 L leave the yard, 1,547 L soak in. 96 frames: the run exits early because nothing ponds. |
| Garden | 8.2 m² (3.6 × 2.9 m), 15 cm deep, 5 cm berm, 3.6 m from the house, about CAD 919. The optimizer tried 161 gardens. |
| After / compare | **Captured 2,756 L, 0 L leave the yard** (2,756 before), **drainH 41 h** (the optimizer's figure for the garden's pond; the sim's whole-yard figure is 41.1 h). |
| Plants | 26 plants, 10 species (PNW). There are layout warnings about the middle zone being small, and the step shows them. |
| Sizing prior shown | "The WSU Rain Garden Handbook says about 65 m² for 120 m² of roof on loam, more than this 47 m² yard has room for…", with the citation. |

Frame rate during storm playback (`api.fps()`, 90-frame average): **117 fps at 1440, 128 fps at 390** in the final run (best run). Compare playback with the split ran at 120 and 133 fps. These were measured on a shared, loaded machine; an earlier 1440 run under heavier load read 64 fps. All runs are above the 55 fps target.

Time to the slope reading (model download, WebGPU initialisation and inference): 28–33 s with a warm cache. The very first cold load on this machine took 93–385 s.

## PNG / PDF checks

- PNG download: 2480 × 3508 px, PNG format (checked with sharp), about 9.5 MB.
- PDF download: starts with `%PDF-` and ends with `%%EOF`, 1.39 MB. It holds the plan as a JPEG (q 0.9) plus text lines: the summary, the safety note wrapped to 92 characters, and the sources.
- Console errors: **0** in every run (1440, 390, camera, static). The only `[raingarden]` log was `static fallback: yard — forced by ?static=1` in the static run.
- Horizontal scroll: 0 at both widths, before and after the run.

## Fake camera

`docs/reports/demo-yard.y4m` was made with ffmpeg from `art-src/gen/demo-yard.png` at 1272×848 (3:2, so the demo marks line up). It is gitignored. I launched Chromium with `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream --use-file-for-fake-video-capture=…` and went through "Use my camera". The live preview showed, the shutter took a 1272×848 photo, and every mark was placed by tapping the photo. The slope then read on WebGPU: 34% (12–55%), manual suggested. Screenshots are `camera-*.jpg`.

## Static fallback + reduced motion

With `?static=1` and `reducedMotion: 'reduce'`, the same flow runs end to end. It ends with the same numbers (2,756 L captured), a valid PNG and a valid PDF, and zero errors. Under reduced motion the camera jumps between poses, playback starts at the end state and plays only on request, numbers appear without counting up, and the timelapse becomes a dip-faded still.

## Screenshots

These are in `docs/reports/designer-shots/` as JPEG: `{1440,390,static}-{02-mark-demo,03-slope,…,10-plan}.jpg`, `*-plan-1240.jpg` (the downloaded plan, scaled down) and `camera-*.jpg`. The raw numbers are in `results.json` and `results-static.json`.

Compared with the comps:
- **comp-designer-capture:** same structure (photo, pins for the downspout, house and outlet, a "1 m" line, one marigold "Next"). The sheet is slate at 92% as the brief asks, not the comp's light card.
- **comp-designer-compare:** the before | after divider has a round handle and three big numbers ("2,756 L captured", "0 L leave the yard", "41 h water stands") with a marigold "Get my plan".
- **comp-plan:** paper, serif title, top-down garden with dimensions and a "Photo up" arrow, the plant list, the soil-mix cross-section, numbered build steps and a marigold-boxed safety note.

## Deviations and calls

- **Before the terrain exists, the yard is not drawn.** Steps 1–2 show a blurred painted backdrop, and then the photo with its marks. The 3D yard first appears at step 3. It is rebuilt (with a 0.45 s cross-fade) only when the slope changes, because `createYard` takes the terrain only at creation. From step 3 to step 10 the scene never reloads; only the camera moves.
- **Site model** (in DECISIONS.md):
  - The wall line runs through the downspout, parallel to the nearest yard edge.
  - The house is the area on the far side of that line and outside the yard.
  - Water leaves over the edge of the ground grid. Making the yard outline the outlet would send all the roof water away immediately, because the downspout sits on that outline.
  - Roof water enters 2 m out from the wall (a downspout extension), and the plan's build steps tell the user to add one. Without this, the flow hugged the yard edge, where no garden fits 3 m from the house, and the optimizer captured 0 L.
- **Manual slope keeps the photo's ground frame.** When the depth model is missing, a synthetic level-ground depth provides the frame instead. Its camera height is solved so the scale line measures its stated length.
- **Height points** use ↑/↓ buttons (±5 cm) instead of dragging up and down on the yard. This is more accessible, and the points are still placed by tapping the yard. The downhill direction is set by dragging on the yard.
- **Roof area** is asked for in the downspout sub-step (default 60 m²; the demo uses 120 m²). The brief has no place for it, but the sim and the sizing need it.
- **"Plant it" vs "Next":** steps 3, 4, 6 and 8 use "Next". Step 5 uses "Run the storm". Step 7 uses "Design my garden", which turns into "Plant it" once the garden is designed. Step 9 uses "Get my plan". Step 10's primary is "Download PNG", with "Download PDF" and "Start over" next to it.
- **Location:** the plan shows the region only. If the Richmond fallback was used, it says "(storm data for Richmond, BC)". It never shows coordinates.

## Concerns

1. **The demo slope reading is not trustworthy.** It reads 20% with a 9–31% band, so the demo always lands on the manual 2% slope. The flow is honest about it ("We're not sure about that reading…"), but the "Falls about 3%" style of result is never shown on the demo.
2. **Placeholder plant art dominates the 3D plant and compare views.** The labelled placeholder cards are drawn at mature height; the serviceberry and red-flowering currant are huge (see `1440-08-plant.jpg`). This is expected until the art is regenerated (art-src/MISSING.md). The plan already detects placeholders and draws plain discs instead.
3. **The optimizer sits near the 48 h drawdown limit** (41 h here), as the optimizer report predicted.
4. **The first cold load of the depth model was very slow** on this loaded machine (minutes). The progress line keeps the user informed, but real-phone timing is untested.
5. **The 3D yard's ground frame stretches the photo** when the reading is wild (camera run, 34%). This is cosmetic and comes from the heightfield's frame.
6. **The last plan bottom-margin fix** (sources line clear of the border) landed after the final screenshot run. The PNG in the shots predates it; the code is covered by the build only.

---

# Fix round 1

Commands:

```
git merge main
npm test
npm run build
node scripts/verify-designer.mjs http://localhost:5191 docs/reports/designer-shots
node scripts/verify-designer.mjs http://localhost:5191 docs/reports/designer-shots static
```

- **Merge:** main merged cleanly except for `DECISIONS.md`. Both sides' lines were kept: main's first, then the designer's.
- **Tests:** `npm test` gives 174 pass, 0 fail. That includes 4 new tests in `test/designer-model.test.js` (`latestOnly`, `playSpan`, `stormPhrase`, `planPdfLines`) plus 1 for the `lerpFrames` fade.
- **Build:** `npm run build` is clean, with no warnings.

## Changes

1. **Camera stream can no longer stay on** (`steps/capture.js`).
   - Every "Use my camera" tap takes a ticket from a new pure guard, `latestOnly()` (`model.js`, tested).
   - The old stream is stopped before a new request.
   - When `getUserMedia` resolves, the new tracks are stopped at once if the step was closed (`gone`) or another tap superseded the request.
   - `stopCamera()` cancels the pending ticket and clears `video.srcObject`.
   - Leaving the step sets `gone`.
   - If `usePhoto` fails after the shutter, the user now sees "That photo could not be saved on this device…".
   - A bitmap decoded after the step closed is closed again.
2. **Depth model is disposed.**
   - The slope step hands the `loadDepth()` promise to the designer (`ctx.keepDepth`). `handle.destroy()` calls `model.dispose()`, which terminates the worker and releases the ORT session and GPU device.
   - The step's progress listener is now a named function. It is removed on destroy through a new `removeProgressListener(fn)` in `src/depth/depth.js`.
   - `dispose()` now rejects every in-flight estimate with `code: 'backend'`, "depth: disposed", so nothing hangs.
3. **"dry" now shows dry.**
   - **Cause:** the before run drains, so `runStorm` exits early and the last frame is at the rain end (24:00). The playback span was `max(storm, last.t)`, so playback ended exactly on that last frame. That frame still held the final step's Manning sheet flow (the teal ribbon), while the clock already read "dry". In compare, the before side held that same frame for the rest of the 72 h playback.
   - **Fix:** `playSpan()` runs playback one hour past the last frame of a drained run. `lerpFrames(..., fadeS = 900)` fades a drained run's last frame to nothing over 15 minutes. Before and compare both use them, and both renderers get the same arrays.
   - **Verified:** after scrubbing to the end, the clock reads "next day 1:00 am, dry" (before) and "day 3, 6:00 pm, dry" (compare), and the ribbon is gone in WebGL and static (`*-06-before-end.jpg`, `*-09-compare-end.jpg`).

## Minor fixes

- **Marker editor:**
  - A press on a marker that doesn't move it no longer adds an undo step or resets later steps. A tap (not a drag) on the first corner closes an outline.
  - Keyboard placement: the photo is focusable. Arrows move a crosshair (Shift for 5% steps) and Enter or Space places the current mark.
- **Slope:** Next first applies a pending debounced slope change.
- **Storm:** the source link now sits outside the `role="radio"` button.
- **Arrow keys:** the storm, region, slope preset and season radio groups respond to arrow keys (`src/designer/radio.js`). Soil already did.
- **Sheet handle:** works from the keyboard (Enter or Space toggles it).
- **Touch targets:** `.dz-seg` buttons are now at least 44 px tall.
- **Compare:**
  - The settled numbers are announced once through a `role="status"` summary. The animated numbers are `aria-hidden`.
  - The divider re-places itself through a ResizeObserver on the yard host.
- **Escape** closes the designer, and focus returns to whatever opened it. For a scripted open with no focused opener, focus goes to the header's "Design yours" link (the verify run confirms focus lands on `data-design="capture"`).
- **Timelapse:** picking a season yourself cancels the running timelapse.
- **Plan:**
  - Every species fits in the table: rows shrink, with proportional fonts, up to the 15-species maximum. The "+N more" line is gone, and the table no longer collides with "Build steps".
  - The sources line is wrapped in pixels, drops to 19 px if it needs 3 lines, and stays inside the border.
  - The PDF text now comes from `planPdfLines()` (tested). It drops spacer lines before any text and keeps every source line within the 17 lines that fit under the image. All of "King County", "Type IA 24 h shape", "Metro Vancouver 2023" and "guidance, not engineering" are present in the downloaded PDF.
  - The doubled parentheses are fixed by `stormPhrase()`: "the design storm (90th percentile, 23.3 mm)".
- **Labels and state:**
  - The counter now reads "Rain on roof and ground".
  - `restart()` resets `root.dataset.mode` to `capture`.

**Regression found and fixed during this round:** a scripted edit turned the plan's word-wrap regex into `/s+/`, which dropped every letter "s" (visible in the first rerun's plan). It is fixed to `/\s+/`, and the final plan shot reads correctly (`1440-plan-1240.jpg`).

## New run (main merged, real plant art)

Demo numbers are unchanged:
- before: 2,756 L leave the yard
- garden: 8.2 m² (3.6 × 2.9 m, 15 cm deep, berm 5 cm, 3.6 m from the house), about CAD 919
- captured: 2,756 L; out after: 0 L; drainH: 41 h
- plants: 26 plants, 10 species

| Run | Console errors | Storm fps | Compare fps | PNG | PDF | h-scroll | Escape |
|---|---|---|---|---|---|---|---|
| 1440 | 0 | 132 | 136 | 2480×3508 | `%PDF-` … `%%EOF`, 1.48 MB | 0 | closed, focus on opener |
| 390 | 0 | 117 | 45 * | 2480×3508 | same | 0 | same |
| static + reduced motion | 0 (one `static fallback: yard` info log) | 60 | 60 | 2480×3508 | same | 0 | same |
| camera (fake y4m) | 0 | — | — | photo 1272×848 from the camera | — | — | — |

\* **390 compare fps:** this is the 390 run's compare playback, taken on the shared, loaded machine. It applies `setSplit` with a fresh before-depth upload on every frame. In the run just before this one it measured 113 fps, and storm playback at 390 measured 117 fps in this run. It should be re-checked on a quiet machine or a real phone.

With the 42 real plant cut-outs, the plant and compare views look as designed (`1440-08-plant.jpg`, `1440-09-compare.jpg`). The serviceberry and red-flowering currant are large but read as shrubs at the rim. The plan draws the real cut-outs inside canopy discs.
