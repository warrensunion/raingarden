# Decisions

One line each: the decision, and why. Newest at the bottom.

- Project path is architectural (new project), so it gets the full spec -> plan -> subagents path; I answer the brainstorming questions myself, as the brief asks.
- Skills `design-taste-frontend`, `image-to-code` and `web-design-guidelines` are not installed in this session, so I use `frontend-design` for art direction, generate one design image per section through ChatGPT myself (image-to-code's method), and do the final audit by hand against the Vercel Web Interface Guidelines checklist.
- Tools copied from BTTRURSLF-v2 (read-only): cutout.mjs, sheet-boxes.mjs, optimize-images.mjs, under art-src/tools/.
- Metric units and litres only, English only: both target regions are Canadian; imperial would double the copy for little gain.
- No server, accounts or analytics; the only network calls are the app's own files and Open-Meteo (coordinates rounded to 2 dp).
- One page: scroll story -> one continuous designer scene -> How it works; hash anchors, no router.
- Virtual smooth scroll is a lerp on the native scroll position (not wheel hijacking), so keyboard, touch and screen readers still scroll natively.
- Story scenes are layered DOM WebP cut-outs moved by translate3d plus one shared WebGL rain canvas: crisp and cheap on phones, and the static fallback is the same DOM without motion.
- Hydrology core is pure JS on the CPU (128x128, 96x96 on low-end) in a Web Worker; WebGL only renders. One codebase for tests and app; 128^2 pipe steps cost well under a frame.
- Two flow models: D8 accumulation (overlay arrows + optimizer candidates) and virtual-pipes shallow water (the animated storm, exactly volume-conserving).
- Infiltration is Green-Ampt per cell with Rawls 1983 parameters; Horton appears only as the comparison in How it works.
- Depth via onnxruntime-web directly (not transformers.js): smaller bundle, and we only need one model. fp16 on WebGPU, int8 on WASM.
- Metric heights from relative depth by pinhole back-projection (65 deg vFOV assumed) + plane-plus-smooth-residual fit, scaled by the user's marked length; confidence band from fit residual plus a fixed +/-50% relief uncertainty.
- Storms: heaviest day in the last 30 days, median wet day (typical), 90th-percentile wet day (design, the LID capture criterion) over 10 years from Open-Meteo, shaped by NRCS Type IA (PNW) / Type II (Ontario); bundled Richmond BC numbers as offline fallback.
- Optimizer is simulated annealing (not CMA-ES): mixed constraints are easy as rejected moves, and ~150 coarse sims fit in a few seconds.
- PDF export is a hand-written single-page PDF writer (JPEG + text): no dependency for one page.
- Region auto-picked from longitude (west of -100 -> PNW, else Southern Ontario), switchable.
- Fonts: Young Serif (display) + Atkinson Hyperlegible Next (UI), self-hosted woff2, both SIL OFL (first pick Fraunces + Inter Tight was revised, see below).
- Art direction revised after frontend-design's review: cream page + Fraunces is a generated-page default, so the base is deep storm slate #26313C with paper type, one marigold action accent; the one bold device is a single raindrop you follow from roof to garden.
- Design images (image-to-code's method) come before building: one large ChatGPT comp per section, then layer art to match.
- Art is generated with the same ChatGPT Plus subscription through the codex CLI (gpt-image-bridge), not the chatgpt.com tab: in the user's Chrome every CDP call to chatgpt.com timed out (screenshots, typing and page JS hung for 45 s at a time while the window wasn't painting), so the browser route couldn't finish ~80 images. Same model family, same account; prompts logged in art-src/PROMPTS.md.
- Image prompts run 4 at a time from art-src/manifest.mjs through art-src/tools/gen.mjs, which skips images that already exist, so a rate limit or a crash resumes cleanly.
- Sizing: WSU Rain Garden Handbook for Western Washington (2013) chart for the Pacific NW and the Wisconsin DNR/UWEX (2003) size-factor method for Southern Ontario (no Ontario homeowner guide has a usable worked example; ERCA's is arithmetically broken), each tested against its own published example. Metro Vancouver's 2023 engineered method is cited but not used (it is for engineered systems with a rock layer).
- Design storm stays the 90th-percentile wet day from 10 years of Open-Meteo data for both regions: it is Ontario MECP's LID criterion, and for Richmond (23.3 mm) it is close to Metro Vancouver's 6-month 24 h capture target (72% of the 2-year 24 h, ~26 mm at YVR). Both are cited.
- Drawdown limit 48 h (Metro Vancouver, TRCA, ERCA all name it): the optimizer rejects gardens whose ponded water takes longer.
- ChatGPT's usage limit was hit at 12:30 with 31 plant cut-outs left; a background retry runs after the 15:39 reset. Until then the build uses labelled placeholders (art-src/MISSING.md).
- Garden sizing soil mapping (ours, not published): Wisconsin sand/loam/clay -> sandy/silty/clayey; WSU drainage rate defaults to Rawls 1983 Ks for the class (sand 117.8, loam 3.4, clay 0.3 mm/h, clay clamped to the 0.10-0.24 in/h band with a warning) unless a measured rate is given; WSU rainfall region defaults to 4 (Metro Vancouver spans 3-5 by annual precipitation; 4 matches the handbook's worked example).
- Garden siting: house wall >= 3 m; septic >= 10 ft downhill/level and >= 50 ft uphill (WSU 2013), "uphill" = cell more than 0.05 m above the septic area's LOWEST ground (conservative on sloped fields); nothing outside the yard polygon or within 0.5 m of its boundary (fence/property line, our call).
- Cost defaults (CAD, rough 2026 Metro Vancouver retail guesses, editable): excavation $60/m3 over ponding depth + the amended layer, amended soil $90/m3 over a 12 in (0.3048 m, WSU lower bound) layer, mulch $12/m2, plants $45/m2.
- Garden berm = disc dilation of the garden mask by ceil(max(0.6 m, cell*sqrt2)/cell) cells, so every 8-neighbour is berm and D8 routing cannot leak the pond out diagonally.
