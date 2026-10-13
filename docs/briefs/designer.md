# Brief: the designer (plan Task 13)

One continuous scene, not pages: a fixed full-viewport WebGL yard
(`src/render` → `createYard`) with a step sheet over it — a bottom sheet on
phones (≤ 1023 px, drag handle, max 62vh, the yard stays visible above) and
a 400 px side panel on the left at ≥ 1024 px. Between steps the CAMERA moves
(`cameraTo(step, 1200)`), the sheet content cross-slides (0.5 s
`--ease-ui`), the yard never reloads. Mounted into `#designer` by
`openDesigner(root, { mode: 'capture' | 'demo' })` (replace the stub from
Task 11; keep its export). Everything is lazy: this module, three
(via `src/render`), onnxruntime (via `src/depth/depth.js`) and the sim
worker load only when the designer opens. A progress line in the sheet
while they load.

Design: match `art-src/gen/comp-designer-capture.png` and
`comp-designer-compare.png`. Tokens/type from `src/styles/tokens.css`
(Task 11). Sheet surface: `--slate-900` at 92% with a 1 px paper-at-12%
border, 20 px radius top corners (phone) / 16 px (panel). One marigold
primary button per step (sentence case, verb: "Use this photo", "Next",
"Run the storm", "Design my garden", "Plant it", "Get my plan"), a quiet
text "Back". Step indicator: a thin 10-segment progress line (the steps
ARE a sequence, so numbering is legitimate) — no "Step 3 of 10" eyebrow.

## Modules (all exist on main by the time you start; read their JSDoc)
- `src/render/index.js` `createYard(canvas, { terrain, photo, toImage, reducedMotion })` → api (setWater, setGarden, setContours, setMarks, cameraTo, setSplit, pick, fps, resize, destroy, canvas). **Contract:** pass the UNCARVED terrain; `setGarden(g)` digs; sim depth from the carved terrain is passed as-is. Attach pointer listeners to `api.canvas`. setSplit: left = before.
- `src/depth/depth.js` `loadDepth({ onProgress })` → `{ estimate(bitmap), backend }` (runs in its own worker; errors carry `code: 'model-missing' | 'backend'`); `src/depth/heightfield.js` `toHeightfield(...)` → `{ terrain (with mask), confidence {slopePct, lowPct, highPct, source}, toGround, toImage, manualSuggested, notes }`; `src/depth/contours.js` `contours(terrain, intervalM)`; `src/depth/manual.js`/`manualTerrain(...)` (read the actual file names).
- `src/sim/worker.js` messages `run` (frames + done) and `optimize` (try + done); `src/sim/storm.js` `hyetograph`; `src/sim/infiltration.js` `SOILS`.
- `src/garden/{sizing,constraints,cost,layout}.js`, `src/garden/optimizer.js` (run it in the worker).
- `src/weather/openmeteo.js` `getStorms({ lat, lon, region, shapeFn: hyetograph })`.
- `src/plan/pdf.js` `makePdf(...)`.
- `src/data/plants.js` (`PLANTS`, `REGIONS`, `SOURCES`), `src/data/demo-yard.json` (demo marks), `public/art/demo-yard.webp`.

## Steps (camera pose in brackets)
1. **Capture** [capture]. Three ways in: "Use my camera" (getUserMedia
   rear camera, live preview in the sheet, shutter; on phones also read
   `DeviceOrientationEvent` to get gravity in camera space — ask for
   permission on iOS via `DeviceOrientationEvent.requestPermission()` on the
   same tap), "Upload a photo or short video" (a video → grab its middle
   frame), "Try a demo yard". Copy, always visible: "Your photo and its
   depth stay on this device. Nothing is uploaded." Demo mode skips
   straight to step 3 with the demo marks pre-filled (user can still edit).
   Camera denied → say so and offer upload/demo.
2. **Mark** [mark]. On the photo (shown flat in the sheet area / full
   screen overlay on phone): tap-to-place, drag-to-adjust markers, in order:
   "Draw a line along something 1 m long" (two handles + a metres input,
   default 1.0), "Tap the downspout", "Tap the house wall three times",
   "Tap where water leaves the yard", "Outline the yard" (polygon,
   double-tap/Done to close), optional "Mark a septic field" (Skip). Each
   sub-step one sentence. Undo per mark. Keyboard: markers are focusable,
   arrow keys nudge 1%.
3. **Slope** [mark→storm]. Run depth (progress: "Reading depth… 4 s"),
   `toHeightfield` → terrain; draw contours on the photo AND on the 3D
   yard; show "Falls about 3% toward the back right (likely 1–6%)" from
   `confidence` with a small band bar; if `manualSuggested` or the user
   taps "That doesn't look right": manual fallback — Flat / Gentle (2%) /
   Steep (8%) segmented control with a direction drag on the yard, plus
   "Add a height point" pins (drag up/down). Depth failure → explain
   (`model-missing` → "The depth model isn't installed on this site — use
   the slope buttons instead.") and go manual.
4. **Soil** [storm]. Sand / Loam / Clay cards with one-line descriptions
   and a "Not sure? Do the jar test" expander (the jar test steps from
   `docs/research/sizing.md`, with its source link). Default loam.
5. **Storm** [storm]. Location: `navigator.geolocation` on tap ("Use my
   location"); denied/unavailable → Richmond, BC (say so). `getStorms` →
   three cards: heaviest day last month / typical / design (90th pct),
   each with mm total, a tiny hyetograph sparkline and its source line
   (link). Default: design storm. Region from longitude (spec) with a
   switch PNW / Southern Ontario.
6. **Before** [storm]. Run the storm on the base terrain in the worker
   (`run`), animate frames on the yard (24 s playback, rain intensity from
   the hyetograph → `rainMmH`, a time scrubber + play/pause, "2:00 pm, 12
   mm/h"), live counters: litres fallen, litres leaving the yard, soaked
   in. This is the "before".
7. **Design** [optimize]. Limits: budget (CAD, default 1,500), max area
   (m², default = 2× the sizing prior), "Keep 3 m from the house" (locked
   on, explained), septic (from marks). Show the published sizing result
   first ("WSU Rain Garden Handbook says about 9 m² for your roof and
   soil", with cite). "Design my garden" runs `optimize` in the worker;
   each `try` message draws a ghost ellipse on the yard (fade 0.6 s), best
   so far solid; counter "Tried 84 gardens". Failure → its reason in plain
   words + suggestions.
8. **Plant** [plants]. `layoutPlants` for the region; plants drawn on the
   yard at real spread; zone legend (Wet / Middle / Edge) with the species
   and counts, each with a cut-out thumbnail (`/art/plants/<id>.webp`),
   latin name, mature size, source link. Grow-in timelapse: a 3-season
   control (Planting day / Year 1 / Year 3) that animates `season`
   0.3 → 0.7 → 1.0 over 4 s each (`setGarden(..., { season })` fast path),
   reduced motion = cross-faded stills.
9. **Compare** [compare]. Run the same storm on the carved terrain
   (`applyGarden`) with the garden soil, then show before/after with the
   swipe divider (`setSplit`, draggable handle, keyboard ←/→), synced
   playback, and three big numbers: "1,840 L captured", "120 L leave the
   yard" (vs before), "Water stands 18 h" (drainH), tabular figures,
   counting up with `--ease-reveal`.
10. **Plan** [plan]. Build the one-page plan on a 2480×3508 canvas (A4 @
    300 dpi), paper colour: title "Your rain garden", date, location (no
    exact address — just the region/city); top-down drawing of the yard
    outline, house wall, downspout, the garden ellipse with dimensions
    (length × width, depth, berm height, distance to house) and a north-ish
    arrow ("photo up"), zone rings with plant symbols; the plant list
    table (common, latin, zone, qty, spacing); soil mix (from sizing.md:
    e.g. 60% sand / 40% compost, 30 cm deep, 5–8 cm mulch); 6 build steps;
    a boxed safety note: "Call before you dig: BC 1 Call (bc1c.ca) in BC,
    Ontario One Call (ontarioonecall.ca) in Ontario, or your local service.
    Keep it at least 3 m from foundations and away from septic fields.
    Check your local bylaws. This plan is guidance, not engineering.";
    sources line. Buttons: "Download PNG", "Download PDF" (`makePdf` with
    the canvas as JPEG q 0.9, plus the safety lines as text), "Start over".

## Rules
- Reduced motion: camera jumps, no count-up, timelapse = stills.
- No WebGL: `createYard` returns the static fallback automatically; the
  flow still works end to end (it's the same API).
- 390 px: sheet usable one-handed, no horizontal scroll, targets ≥ 44 px.
- Everything the user marks stays in memory only.
- `window.__raingarden` test hook (always on, harmless): `{ step, goTo(n),
  state, lastResult }` so `scripts/shoot.mjs` can drive and read the flow.
- Console: no errors; fallbacks log via `logFallback`.

## Verify (you)
`npx vite`, Playwright chromium headed GPU: run the demo end to end at
1440×900 and 390×844, screenshot every step into
`docs/reports/designer-shots/`, download the PNG and PDF (check the PDF
starts with %PDF and the PNG is 2480×3508), zero console errors, fps of
the storm playback ≥ 55 desktop. Also run once with a fake camera:
`--use-fake-ui-for-media-stream --use-fake-device-for-media-stream
--use-file-for-fake-video-capture=<y4m of demo-yard>` (make the y4m with
ffmpeg from `art-src/gen/demo-yard.png`, 1280×720 or similar) through the
"Use my camera" path. Read your screenshots and compare with the comps.
