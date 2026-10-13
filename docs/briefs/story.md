# Brief: shell, preloader, scroll story (plan Task 11)

Read with: `docs/spec.md` §3 (art direction, palette, type) and §5 (story),
`design-reference/makemepulse/NOTES.md` ("Techniques to adopt" — the numbers
below come from it), and the design comps in `art-src/gen/comp-*.png`
(contact sheet: `design-reference/comps-sheet.png`). Build to match the comps.

## What exists
- `public/art/*.webp`: scene plates `plate-{roof,drive,drain,creek,garden,stream}`
  (opaque, full-bleed, ~1672×941, subject right, quiet left third),
  foreground bands `band-*` (transparent, full width, bottom quarter), mid
  objects (`roof-house`, `roof-gutter`, `drive-bike`, `drain-litter`,
  `creek-fish`, `stream-fish`, `soil-section`, `tex-raindrop`, `tex-splash`,
  `tex-puddle`, `pre-drop`, `pre-pool`, `tex-paper`, `tex-paper-light`,
  `roof-far`, `roof-sky`, …). `art-src/MISSING.md` lists placeholders.
- `public/fonts/young-serif-400.woff2`, `public/fonts/atkinson-next-var.woff2` (OFL).
- `src/data/storms-richmond.json` (real numbers; design storm 23.3 mm).
- Pure sim/garden/depth modules (do not touch).

## Build
`index.html`, `src/main.js`, `src/core/{env,scroll,ease,raf,lazy}.js`,
`src/story/{scenes.js,story.js,parallax.js,rain-overlay.js,preloader.js,drop.js}`,
`src/styles/{tokens.css,base.css,story.css}`, a `#designer` mount point (empty
section, Task 13 fills it via `import('./designer/designer.js')` on demand —
create a stub module exporting `openDesigner(root)` that renders "Designer
loading…" so the hand-off works) and a `#how` section (How it works — see
below; build it fully).

### Tokens (`tokens.css`) — the only colours in src/
`--slate-900 #26313C`, `--slate-700 #3E4A59`, `--rain #7D8FA3`,
`--asphalt #2B2F36`, `--moss #5F7A4A`, `--fern #9DB873`, `--clay #B9824F`,
`--teal #49A3A0`, `--paper #ECE6DA`, `--marigold #E8B04A`. Ink on marigold =
`--slate-900`. Body background `--slate-900`, text `--paper`.
Ease tokens: `--ease-ui: cubic-bezier(.215,.61,.355,1)` (all CSS UI, 0.25/0.5/0.8 s),
`--ease-reveal: cubic-bezier(.05,.75,.1,1)` (1.0 s, stagger 0.15 s from centre),
`--ease-wipe: cubic-bezier(.65,0,.35,1)` (Power3.easeInOut, 1.75 s).

### Type
Young Serif for display only: scene headlines `font-size: clamp(2.5rem, 7.2vw, 8rem)`,
line-height 1.0, letter-spacing −0.01em, max 12ch, left aligned on the quiet
left third (bottom-left on phones). UI/body Atkinson Hyperlegible Next: 16 px
body (line 1.5), 13 px small, buttons 15 px weight 700 sentence case (no all
caps — frontend-design rule), tabular figures for numbers. No eyebrow labels.

### Preloader (index.html inline CSS + `preloader.js`; must paint before any JS)
Storm-slate screen; centred `pre-pool` ellipse; `pre-drop` hangs above it; a
thin vertical pill (6×min(283px,32vh), rounded) right of it fills
bottom→top with REAL progress (bytes of scene-1 assets + fonts via fetch
streams or image decode count). At 100%: hold 0.4 s, the drop falls into the
pool (0.6 s ease-in), a ripple ring expands from the pool and floods the
screen as a circular clip-path reveal of scene 1 (1.2 s `--ease-wipe`).
Wordmark "Raingarden" under the pool in Young Serif 20 px. Reduced motion:
0.4 s cross-fade. `?preloader=0` skips it. Never longer than needed: if
assets are cached it completes in <1 s.

### Scroll engine (`core/scroll.js`)
Native document scroll (keyboard, touch, screen readers untouched). A
smoothed value follows `scrollY` with `s += (target − s)·(1 − exp(−dt/0.30))`
(τ = 300 ms, frame-rate independent). Everything visual reads the smoothed
value. One rAF loop (`core/raf.js`) shared by all, paused when the tab is
hidden.

### Story (`scenes.js` is the data, `story.js` the engine)
`#story` is `scenes.length × 160vh` tall; a sticky 100vh stage holds all
scenes stacked; only the active one and its neighbour are visible.
Six scenes, copy fixed:
1. roof — "A storm lands on your roof." / "Scroll to follow one raindrop."
2. drive — "It doesn't soak in." / "{L} litres run off one roof in a single design storm." (L = 150 m² × 23.3 mm = 3,495 → "3,500")
3. drain — "It all goes somewhere." / "Storm drains carry it, oil and all, straight to the nearest creek."
4. creek — "Somewhere is a creek." / "Fast, dirty water scours the banks salmon need."
5. garden — "Or your yard drinks it." / "A shallow bowl of native plants and loose soil soaks a roof's worth of rain into the ground." + the `soil-section` cut-out with three labels (Mulch 5–8 cm, Amended soil 30 cm, Gravel / native subsoil) drawn as leader lines.
6. stream — "Design yours." + marigold button "Point your phone at your yard" (opens the designer in capture mode) + text link "Try a demo yard" (opens designer in demo mode). Both scroll to `#designer` and call `openDesigner`.
Each scene = layers with a depth `z` (back plate z=3.0, far z=2.5, subject/pivot z=1.0,
mid objects z=0.6–0.8, foreground band z=0.2, particles z=0.1). Layer offset
from scroll inside the scene: `y = (1 − 1/z)·k·progress` style true-perspective
parallax (derive from a virtual camera; do not hand-tune per layer); mouse
parallax on fine pointers: camera offset ±0.8 / ±0.45 units at pivot
distance 50, giving ≈ fore −5 px, pivot 0, back +2.6 px per 100 px of mouse
travel at 1440 — eased with τ = 0.30 s. Layers are `<img>` with
`transform: translate3d()` only (no layout thrash), `will-change` only on
the active scene, plates `object-fit: cover`.
Scene change = **foreground wipe**: across the last 30% of a scene's
scroll range the NEXT scene's foreground band (scaled 1.6×) plus a rain
curtain sweeps up from the bottom over the whole frame (progress mapped
through `--ease-wipe`), the scenes swap at wipe progress 0.5, the band
continues up and out. CSS `scroll-snap-type: y proximity` on scene
boundaries so it never rests half-covered. Headline reveal per scene:
lines rise 40 px + fade in with `--ease-reveal` 1.0 s, 0.15 s stagger; leave
instantly (NOTES #7).
Frame/passe-partout: a 1px paper-at-20% inset frame (24 px desktop, 12 px
phone) that scales 1.04→1 over 1.5 s on the first scene (NOTES #5).
Grade: one fixed full-screen grain overlay (`tex-paper` tiled 512 px,
`mix-blend-mode: multiply`, opacity 0.06), no vignette, no bloom.
The raindrop (`drop.js`): `tex-raindrop` (~28 px wide desktop, 20 px phone)
travels a per-scene path (roof edge → down the drive → into the grate →
into the creek → into the garden soil → the stream), interpolated by scroll;
on fine pointers it leans toward the cursor by up to 40 px with τ 0.30 s.
It is the thread through the story. Small splash (`tex-splash`) when it
lands at each scene's end.
Rain overlay (`rain-overlay.js`, lazy): raw WebGL2 (no three here) full-screen
canvas, instanced streaks angled 12°, intensity per scene (roof 1.0, drive
0.8, drain 0.6, creek 0.4, garden 0.3, stream 0.0), speed tied to scroll
velocity slightly. If WebGL2 is unavailable: `logFallback('rain overlay', reason)`
(`core/env.js` exports `env.reducedMotion`, `env.webgl2`, `logFallback(where, reason)`
which `console.info('[raingarden] static fallback: ' + where + ' — ' + reason)`)
and no rain (the plates already show rain).
Reduced motion: no parallax, no drop travel, no wipe — scenes cross-fade
(0.5 s) at boundaries; rain overlay off.
Phones (≤ 768 px): headline bottom-left over a slate gradient scrim for
contrast (AA), plates positioned `object-position: 70% 50%` so the subject
stays visible, no mouse parallax; must have no horizontal scroll at 390 px.

### Header
Fixed, minimal: wordmark "Raingarden" (Young Serif 20 px) left; right: "How it works" text link and a marigold pill "Design yours". Comps show this.

### How it works (`#how`, after `#designer`)
Heading "How it works". Five illustrated rows along a stream line (use
the comp `comp-how`): Depth — "Your phone's photo goes through a small depth model that runs on the phone. It guesses shape, not size, so you mark something 1 m long and we show how sure we are."; The storm — "We pull real rain for where you are from Open-Meteo: last month's wettest day, a typical day, and the 90th-percentile day planners design for."; Soaking in — "Each patch of ground soaks water at a rate set by its soil (the Green-Ampt model). Sand drinks fast, clay barely sips."; Trying gardens — "An optimizer tries hundreds of shapes and spots, at least 3 m from the house and never over a septic field, and keeps the one that catches the most water."; The limits — "It is guidance, not engineering. A photo can be wrong about slope; we say when. Call before you dig and check your local bylaws." Use small cut-outs where art exists (ui-phone, tex-raindrop, soil-section) and simple inline SVG diagrams otherwise (a contour grid, ellipse outlines).

### Perf + rules
Intro bundle must NOT include three or onnxruntime-web (designer/depth are
dynamic imports). Scene images: preload scene 1 with `fetchpriority=high`;
others `loading="lazy"` + decode ahead of the active scene. 60 fps on a
mid-range phone: transforms only, ≤ 3 scenes' layers composited.
No horizontal scroll at any width; visible focus rings (marigold 2 px);
`prefers-reduced-motion` honoured via `env.reducedMotion`; colours only from
tokens; every interactive element ≥ 44 px on touch.

### Verify (you, before reporting)
`npx vite` + Playwright chromium (headless false, args
['--use-angle=d3d11','--enable-gpu']): screenshot the preloader mid-fill,
each of the 6 scenes at rest, one mid-wipe frame, and `#how`, at 1440×900,
1920×1080 and 390×844 into `docs/reports/story-shots/`; confirm zero console
errors; measure fps while auto-scrolling (≥55 on desktop); emulate
reduced motion and check cross-fades; check `document.documentElement.scrollWidth
<= innerWidth` at 390. Read your screenshots and compare with the comps;
iterate until they look as polished as the comps.
