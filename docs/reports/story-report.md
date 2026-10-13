# Story report (plan Task 11): shell, preloader, scroll story, How it works

Branch `wt/story`. Brief: `docs/briefs/story.md`.

## What was built

| File | Role |
|---|---|
| `index.html` | Inline first-paint preloader (CSS + markup, paints before any module), header, skip link, `#story`, `#designer` mount, full static `#how`. |
| `src/main.js` | Boot: styles, scroll engine, `startStory`, preloader; designer hand-off via `lazy(() => import('./designer/designer.js'))`. |
| `src/core/env.js` | `env` (`reducedMotion` live via media query, `webgl2` lazy probe, `finePointer`, `phone`), `onEnvChange`, `logFallback(where, reason)`. |
| `src/core/scroll.js` | Native scroll; smoothed `scroll.y` with τ = 0.30 s, frame-rate independent; `velocity`. |
| `src/core/raf.js` | One rAF loop; paused when the tab is hidden; dt clamped to 0.1 s. |
| `src/core/ease.js` | CSS-exact cubic-bezier in JS + the token curves. |
| `src/core/lazy.js` | Memoised dynamic import, `warmImages` (data-src → src + decode), `whenIdle`. |
| `src/story/scenes.js` | The data: 6 scenes, layers with depth z, drop paths, splash points, copy, rain intensity. Litres computed from `storms-richmond.json` (150 m² × 23.3 mm = 3,495 → "3,500"). |
| `src/story/story.js` | Engine: `startStory(root, { onDesign }) → { enter(), destroy() }`. |
| `src/story/parallax.js` | The virtual camera (mouse + scroll crane + dolly). |
| `src/story/drop.js` | The raindrop and its splash. |
| `src/story/rain-overlay.js` | Raw WebGL2 instanced streaks (lazy chunk, 3.8 kB). |
| `src/story/preloader.js` | Real-bytes preloader and the drop → ripple → flood reveal. |
| `src/styles/{tokens,base,story}.css` | Tokens (the only colours), shell/How, story. |
| `src/designer/designer.js` | Stub `openDesigner(root, { mode })` → "Designer loading…" (Task 13 replaces it). |
| `vite.config.js` | es2022, `three` / `onnxruntime-web` forced into their own chunks. |
| `scripts/split-plates.mjs` | Splits each plate into a far layer and a near cut-out (see "Layering"). Output in `public/art/story/` (12 files, 1.7 MB). |
| `scripts/verify-story.mjs` | The brief's Verify list, rerunnable. |
| `scripts/check-story-contrast.mjs` | Renders each scene with the copy hidden and measures WCAG contrast behind every text box. |

## Layering (how the scenes get real depth)

The plates are single paintings, and a plate that only slides as one card reads as a photo. `scripts/split-plates.mjs` cuts each plate along a hand-traced skyline polygon (traced on a 5 % grid; polygons are in the script) into:

- **far** (z = 3.0): the plate, with the cut region filled by multi-scale normalised convolution (`blur(img·m)/blur(m)` at σ = 4…1200 px), so the few pixels the near layer uncovers as it moves are smeared sky and trees, not a ghost of the subject;
- **near** (z = 1.0, the pivot): the subject (house, driveway bank, curb, creek bank, garden bed, stream bank), grown 9 px with a 3 px soft edge so it covers the fill seam.

Both keep the plate's exact size, so they share `object-fit: cover` geometry and line up by construction. On top: a CSS mist bank (z 2.5), mid cut-outs (z 0.6–0.8: wet leaves, puddle, creek fish, reeds, stream fish, ferns, the garden soil cut-away), the scene's foreground band (z 0.2), then rain and the drop (particles). Each scene has 5–7 layers.

## How each NOTES technique was applied (with the numbers)

1. **Scroll smoothing**: `s += (target − s)·(1 − exp(−dt/0.30))`, τ = 300 ms (`core/scroll.js`). Native scroll untouched; the ±120 wheel clamp was not applied because the brief keeps native scrolling (we never intercept wheel events).
2. **Mouse parallax camera** (`story/parallax.js`): a layer at depth z moves `(1 − 1/z)` × the camera offset. K_X = 0.039 px/px, from "back plate +2.6 px per 100 px of mouse at 1440" (0.026 / (1 − 1/3)); vertical uses the camera ratio 0.45/0.8 × aspect. Resulting px per 100 px of mouse at 1440: far +2.6, mist +2.3, subject 0, mid (0.7) −1.7, band (0.2) −15.6. Eased with τ = 0.30 s. Fine pointers only (`(hover: hover) and (pointer: fine)`), never on phones or with reduced motion.
3. **Layer depths**: back 3.0, far 2.5, pivot 1.0, mid 0.6–0.8, band 0.2, particles 0.1 (scenes.js). Scroll moves the same camera: a crane of 1.9 × vh across the scene (far plate drifts down ~5 % of the screen, band rises ~30 %) and a dolly of 0.03 pivot units (scale z/(z − 0.03p): far 1.01, pivot 1.03, band 1.18), scaled about the viewport centre. No per-layer hand-tuned speeds.
4. **Foreground wipe**: across the last 30 % of each scene's 160vh, the next scene's band at 1.6× plus a rain curtain (streaks at 12°, fading into the band's straight lower edge) sweeps up through `--ease-wipe` (cubic-bezier(.65,0,.35,1)); the scenes swap at wipe progress 0.5 (the frame is fully covered for w ∈ [≈0.39, ≈0.61]); the band carries on up and out. Rest is guaranteed by `scroll-snap-type: y proximity` with snap points at each wipe's start and end, plus a settle on scroll-idle (180 ms) with hysteresis (finish forwards once a third in when scrolling down, two thirds when scrolling up).
5. **Passe-partout**: 1 px paper-at-20 % frame inset 24 px (12 px phone), 1.04 → 1 over 1.5 s Power4.easeInOut (cubic-bezier(.83,0,.17,1)) when the story is uncovered.
6. **Reveal ease**: headline lines are split at runtime (re-split on resize), rise 40 px + fade with `--ease-reveal` (.05,.75,.1,1) 1.0 s, 0.15 s stagger from the centre line outwards. UI transitions use `--ease-ui` at 0.25 / 0.5 / 0.8 s.
7. **Text cards**: body and CTAs fade in 0.8 s after a 0.7 s delay and leave instantly (no transition out). Copy is hidden while the wipe covers more than 20 % either side of the swap, so it never reveals under the curtain.
8. **Cursor**: browser default (house rule). The drop is the follower: it leans toward the cursor by up to 40 px, τ 0.30 s.
9. **Preloader**: the reference's pill, 6 × min(283 px, 32vh), fills bottom → top with 0.5 s steps from real bytes (fetch streams of scene 1's layers, the drop and both fonts; 90 %), then decode + font readiness (last 10 %). Then hold 0.4 s, drop falls 0.6 s ease-in, a ripple ring and a circular `clip-path` flood from the pool reveal scene 1 over 1.2 s `--ease-wipe`. Cached (bytes back in < 0.3 s): no hold, the drop falls while scene 1 decodes, half-length motion. Reduced motion: 0.4 s cross-fade. `?preloader=0` skips it (decided by a one-line inline script before first paint).
10. **Grade**: one fixed `tex-paper` layer, 512 px tile, multiply, opacity 0.06. No vignette, no bloom.
11. **Type**: Young Serif display only (`clamp(2.5rem, 7.2vw, 8rem)`, line-height 1, −0.01em, max 12ch and ≤ 44vw so it stays on the quiet third); Atkinson Hyperlegible Next 16/1.5 body, 13 px labels, 15 px bold sentence-case buttons, tabular figures.
12. **Hitch hygiene**: the visible scene's neighbour is decoded (`img.decode()`) as soon as a scene becomes visible, the one after at idle; neighbours wait until the preloader is done so they don't race scene 1. `will-change` only on the visible scene's layers.

## Measurements (headed Chromium 1.63, `--use-angle=d3d11 --enable-gpu`, 144 Hz display, shared/loaded machine)

From `scripts/verify-story.mjs` (dev server) — `docs/reports/story-shots/results.json`:

| Viewport | fps auto-scrolling the whole story (9 s) | p95 frame | frames > 33 ms | console errors | scrollWidth − innerWidth |
|---|---|---|---|---|---|
| 1440×900 | 143.2 | 7.0 ms | 0 | 0 | −15 (scrollbar) |
| 1920×1080 | 139.9 | 7.1 ms | 0 | 0 | −15 (scrollbar) |
| 390×844 (mobile emulation) | 143.7 | 7.1 ms | 0 | 0 | 0 |

The 390 figure is desktop-GPU with mobile emulation, not a real mid-range phone; the frame loop writes transforms/opacity only and composites at most the visible scene + the wipe (+ the rain canvas).

Preloader on the production build (`vite preview`), cached reload: bytes at 0.18–0.24 s, ready at 0.49–0.65 s, preloader gone 1.35–1.6 s after navigation start (choreography after decode ≈ 0.9 s). Cold with a throttled 350 kB/s network: the pill fills in visible steps (`*-0-preloader.png`).

Reduced motion (emulated): wipe stays hidden, scenes cross-fade 0.5 s at the swap point (`*-reduced-crossfade.png`, `*-reduced-after.png`); no parallax, drop or rain.

Contrast (`scripts/check-story-contrast.mjs`, 95th-percentile background luminance in each text box, copy hidden): every headline line ≥ 3.67:1 (large text, needs 3), every body/link/label ≥ 5.16:1 at all three viewports (phones ≥ 7.1). Script exits 0.

Build: `npm run build` clean (no warnings). Entry `index-*.js` 20.7 kB (8.95 kB gzip); `rain-overlay` and `designer` are separate chunks; no chunk contains `THREE` or `onnxruntime`. `npm test`: 92 pass, 0 fail.

## Screenshots

`docs/reports/story-shots/{1440,1920,390}-{0-preloader,1-roof,2-drive,3-drain,4-creek,5-garden,6-stream,wipe,wipe-early,how,reduced-crossfade,reduced-after}.png`. Compared against `art-src/gen/comp-*.png`: roof, driveway, drain, creek and stream frames match their comps' composition, headline placement and scale closely; How it works follows comp-how (five illustrated steps on a teal stream line, moss number discs).

## Accessibility

Landmarks: `header`, `nav[aria-label=Main]`, `main`; `#story` section (aria-label), each scene's copy is a `section[aria-labelledby]`; scene 1's headline is the `h1`, scenes 2–6 `h2`, `#designer` has a visually hidden `h2`, `#how` `h2` with `h3` rows. Copy is never `display:none` (opacity only), so screen readers and find-in-page reach every scene; focusing a scene's button scrolls that scene to rest. Skip link to the designer. Focus ring: marigold 2 px. Every interactive element ≥ 44 px. Meaningful art has alt text (near plates, soil section, How images, the two How SVGs are `role=img` with labels); decorative layers `alt=""`.

## Deviations and calls

- **Plates split into far + near layers** (new script and 12 generated WebPs). Not in the brief's file list, but it is what makes the parallax read as depth instead of a sliding photo. The original `plate-*.webp` are no longer loaded by the story.
- **Mid cut-outs chosen to avoid duplicating painted content**: drain uses `tex-puddle` (not `drain-litter`, whose cup duplicated the plate's), no `roof-house` / `roof-gutter` / `drive-bike` (each already painted in its plate).
- **Garden**: the soil cut-out sits on the quiet left under the copy (on a soft slate halo) with three leader-line labels; the garden headline is held to 9ch so it stays off the planting.
- **Header on phones**: the "How it works" text link is hidden ≤ 768 px (wordmark + link + pill don't fit 390 px with 44 px targets); the pill stays.
- **Copy**: unchanged wording; straight apostrophes became typographic (’).
- **Ease note**: the brief's `--ease-wipe` cubic-bezier(.65,0,.35,1) is easeInOutCubic (GSAP Power2); GSAP's Power3.easeInOut is quart (.76,0,.24,1), and NOTES' 10 %/90 % timing points sit closer to quart. Kept the brief's token; flagging for the coordinator.
- **Cached preloader** finishes ≈ 1.4 s after navigation rather than < 1 s: about 0.3–0.45 s of that is image decode + font readiness on this (loaded) machine, which the reveal must wait for to avoid uncovering a half-painted frame.
- **Test hook**: `data-snap="off"` on `<html>` disables the scroll-idle settle so the verify script can hold a mid-wipe frame.
- **Wheel clamp (±120)** not applied: we don't intercept wheel events (native scroll per the brief).

---

## Fix round 1 (review findings and rulings)

Where this section and the text above disagree, this section is current.

### Changes

1. **Garden labels above the scrim.** `.sl-section` (soil cut-away + labels) is no longer inside `.story-layers` (z 0, under the z 2 scrim). story.js appends it to the scene wrapper at z 3 and still drives it with the same camera transform (z 0.8). It is hidden with its scene, and cross-fades under reduced motion. The slate halo is gone. The cut-out is larger (`clamp(260px, 38vh, 440px)`, was 34vh) with a lighter drop shadow. Garden copy starts at 12vh so the two don't collide at 900 or 1080 px tall. The phone headline is back to 12ch (the desktop 9ch rule was leaking to phones). Labels: 13 px paper on slate-900 at 88 %.
2. **`check-story-contrast.mjs` now measures rendered glyphs.** Each scene is shot with its text and again with the text colour transparent; backgrounds and scrims stay, and rain is hidden. Pixels that differ are the glyphs. Their rendered luminance (90th percentile) is compared with the box's background without text (95th percentile), so text dimmed by anything painted over it fails. `INJECT_CSS` reproduces a regression on purpose: with `INJECT_CSS='.sl-section{z-index:0 !important}'` (the labels back under the scrim) the garden labels measure **2.04–2.61:1 FAIL** at 1440/1920, matching the review's 2.2–2.6. The old assumed-paper version had reported 9.8+.
3. **Painted wipe curtain.** `split-plates.mjs` also writes `plate-<scene>-veil.webp`: the far plate at 1100 px, 2.2 px blur, brightness 0.6, saturation 0.85, 9–20 kB each. The wipe is now:
   - the next band twice at the leading edge (the second mirrored, offset 7 %, brightness 0.82);
   - the next scene's veil as the body, so the curtain is a rain-soaked preview of where the drop is going, with the 12° streak overlay kept;
   - the band mirrored as the tail.
   The body's slate gradient is gone. While wiping, the stage gets `.is-wiping` and the rain canvas moves above the curtain (z 6, frame z 7), with intensity `max(lerp(a, b, w), sin(πw))`, so it is 1.0 at the swap. Flat rows measured (per-row luminance SD < 4 levels) in the wipe-early / wipe / wipe-mid frames: **0.0 % at 1440 and 1920; 0.8 % and 0.0 % at 390 for wipe and wipe-mid**. The 390 wipe-early frame's 8.1 % is the scene's own phone copy scrim behind the headline (rows 594–758); the curtain had only just entered at the bottom.
4. **Ruling: `--ease-wipe` = cubic-bezier(.76,0,.24,1)** (Power3/quart) in tokens.css and ease.js. DECISIONS.md is updated with an appended line.
5. **Ruling: foreground at the measured −5 px/100 px.** `parallax.js` derives `FORE_Z = 1 / (1 − FORE_SHIFT / K_X)` with FORE_SHIFT = −0.05 and K_X = 0.039, giving **z = 0.438**. Bands use it and so does the wipe's horizontal parallax; the back plate stays at +2.6. Per 100 px of mouse at 1440: back +2.6, mist +2.3, pivot 0, mid −1.7, band **−5.0**. Scroll crane on the band is now −0.095 × vh across a scene, from −0.30.
6. **Ruling: preloader motion is always full length.** The drop falls for 0.6 s and the flood runs 1.2 s on every path. When the bytes return in under 0.3 s, the hold is skipped and the fall starts immediately, overlapping decode and font readiness. The flood waits for both.
7. **Minors:**
   - The wipe's band and veil sources are set as soon as the scene before is current (`setWipeScene(min(i+1, n−1))` every frame, equality-guarded), so a wipe never starts band-less.
   - The skip link only jumps to `#designer` (no `data-design`, no camera prompt).
   - The frame loop skips all writes when settled, using a key of smoothed scroll, camera, pointer, viewport, reduced-motion and entered state. It skips everything and zeroes the rain once the story is fully scrolled past.
   - The rain clears once and then idles when its intensity is 0.
   - Rain context loss calls `logFallback('rain overlay', 'WebGL context lost')`.
   - The vite.config.js comment now says what manualChunks actually does: it names the chunks but can't stop a static import, so the check is the build output.
   - **Scene 1 downloads once.** Scene-1 `<img>`s (and the drop) start with `data-src` only. The preloader streams the bytes, keeps them as Blobs and hands them over through `story.adopt()` as object URLs. Fonts are no longer fetched by the preloader: each counts 5 % when `document.fonts.load()` resolves from its single @font-face download. Request count on a cold load: plate-roof-far 1, plate-roof-near 1, band-roof 1, both woff2 1 each. tex-raindrop shows 2 because the favicon is the same file.

### Commands and outputs (machine at 100 % CPU from other agents during this round; Win32 LoadPercentage = 100)

- `node scripts/split-plates.mjs` produced the six far, near and veil sets.
- `npx vite build`: `✓ built`, no warnings. Entry `index-*.js` 21.7 kB, `rain-overlay` 3.9 kB, `designer` 0.2 kB. `THREE:0 ort:0` in every chunk.
- `npm test`: 92 pass, 0 fail.
- `node scripts/verify-story.mjs http://localhost:5181 docs/reports/story-shots`: 0 console errors at all three viewports; overflowX 0 at 390; reduced motion leaves the wipe hidden and cross-fades.

| Viewport | fps (auto-scroll, loaded machine) | p95 | frames > 33 ms |
|---|---|---|---|
| 1440×900 | 128.4 | 7.1 ms | 10 |
| 1920×1080 | 119.0 | 14.0 ms | 8 |
| 390×844 | 130.7 | 7.1 ms | 7 |

(The previous round's 140+ fps were taken on a quieter machine. A mid-round run at peak load measured 94–103 fps.)

- `node scripts/check-story-contrast.mjs http://localhost:5181`: exit 0. Garden labels **6.67–7.60:1** at 1440/1920 and **4.87–5.36:1** at 390. Headline lines ≥ 3.39:1 (large text). Body and links ≥ 5.04:1.
- Preloader on the production build (`vite preview`), cached reload, marks in ms after navigation start:

| run | pl:bytes | pl:ready | pl:flood (fall done + ready) | pl:gone |
|---|---|---|---|---|
| 1 | 268 | 782 | 1456 | 2756 |
| 2 | 218 | 425 | 966 | 2266 |
| 3 | 238 | 467 | 1179 | 2490 |

**Cached load time (bytes + decode + fonts) is 0.43–0.78 s, under 1 s.** The total including the full 0.6 s fall and 1.2 s flood is 2.3–2.8 s on this loaded machine.

### Shots read this round

`1440-5-garden.png`: labels crisp above the scrim, larger cut-away. `1440-wipe.png` and `1440-wipe-mid.png`: double band leading edge, then the rain-soaked painted drain scene with rain in front. `390-5-garden.png`: headline "Or your yard / drinks it.", labels legible. `390-wipe.png` and `390-wipe-mid.png`: painted curtain, no slate panel.
