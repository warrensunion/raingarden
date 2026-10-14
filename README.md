# Raingarden

Point your phone at a yard and get a native-plant rain garden designed for it, tested against a real local storm.

**Live demo:** https://warrensunion.github.io/raingarden/

The site opens with a short scroll story that follows one raindrop from a roof to a creek, then hands you the designer. Use your camera, or press "Try a demo yard" to run the whole flow on a sample photo.

## What it does

1. **Reads the yard.** You take a photo and mark a 1 m scale line, the downspout, the house wall, where water leaves and the yard outline. Depth Anything V2 Small runs in the browser (WebGPU, or WASM on phones without it) and the depth map becomes a metric heightfield with a slope and a confidence band. When the reading is unsure, or the model is not installed, it says so and asks for flat, gentle or steep instead.
2. **Finds your storm.** Open-Meteo's historical archive gives three real local storms: the heaviest day of the last 30 days, a typical wet day and the 90th-percentile wet day over 10 years (the LID design criterion). Each is shaped into 15-minute rain with the NRCS Type IA (Pacific Northwest) or Type II (Southern Ontario) curve. Offline, it uses bundled Richmond, BC numbers and labels them as a sample.
3. **Runs the storm across the yard.** A water simulation on a 128 x 128 grid routes roof and yard water downhill and soaks it in with Green-Ampt infiltration. You watch it play back in 3D and see how many litres leave the yard.
4. **Designs the garden.** A simulated-annealing optimizer tries garden positions, sizes and depths on a coarse grid, keeps them 3 m from the house, clear of any septic field and inside the yard, rejects any garden still holding water after 48 hours, and confirms the best candidates at full resolution. It then lays out native plants by wetness zone from a list of 42 cited species (Pacific Northwest and Southern Ontario).
5. **Shows before and after.** The same storm runs on the yard with and without the garden, side by side with a slider, then a one-page plan (PNG at 2480 x 3508 and PDF) with the dimensions, plant list, soil mix, build steps and the safety note (call before you dig, keep it away from foundations, check local bylaws).

On the demo yard (Richmond, BC, 23.3 mm design storm, 120 m² roof) the optimizer tried 161 gardens and picked an 8.2 m², 15 cm deep garden that captures 2,756 L, all of the water that left the yard before (`docs/reports/designer-report.md`).

**Everything stays on the device.** The photo, the marks and the depth never leave the browser. The only network calls are the site's own files and Open-Meteo, with coordinates rounded to 2 decimal places. No accounts, no server, no analytics.

## How it works

- **Depth to terrain.** Relative depth is back-projected through a pinhole camera (65° vertical field of view assumed), fitted with a plane plus a smooth residual, and scaled by the marked metre. The confidence band combines the fit residual with a fixed ±50% relief uncertainty (`src/depth/heightfield.js`). The model and the onnxruntime-web binaries are served from the site itself and SHA-256 pinned (`scripts/fetch-models.mjs`).
- **Hydrology.** Pure JavaScript in a Web Worker: priority-flood depression filling, D8 flow accumulation for the optimizer's candidates, and a volume-conserving virtual-pipes model for the animated storm. The water ledger (`rain + roof = infiltrated + out + stored`) closes to under 1e-9 relative (`src/sim/`).
- **Sizing and constraints.** Published sizing from the WSU Rain Garden Handbook for Western Washington (2013) and the Wisconsin DNR homeowner manual (2003), each tested against its own worked example; WSU setbacks; a 48 h drawdown limit (`src/garden/`).
- **Optimizer.** Simulated annealing on the 2x coarsened yard with an objective of litres leaving plus 0.5 L per CAD of rough cost, about 150 coarse simulations in a few seconds (`src/garden/optimizer.js`, `DECISIONS.md`).
- **Rendering.** A three.js WebGL2 yard with animated water and plants, with a Canvas2D fallback (`?static=1` forces it). three and onnxruntime-web load only when the designer opens.
- **Plan export.** A hand-written single-page PDF writer (`src/plan/pdf.js`).

Every decision is one line in [`DECISIONS.md`](DECISIONS.md) and every fact the app relies on is cited in [`SOURCES.md`](SOURCES.md) and `docs/research/`.

## Stack

Vite 7, vanilla ES modules, three.js, onnxruntime-web (WebGPU and WASM), Depth Anything V2 Small, Web Workers, Open-Meteo, Node's built-in test runner, Playwright for the visual checks.

## Run it locally

```bash
npm install
npm run fetch-models   # once: Depth Anything V2 Small (int8 + fp16) and the ORT runtime into public/models/ and public/ort/ (~110 MB, gitignored, SHA-256 pinned)
npm run dev            # http://localhost:5173
npm test               # the maths: sim, infiltration, sizing, optimizer, depth, layout, weather, pdf, designer model
npm run build          # production build into dist/
```

Without `npm run fetch-models` the site still works: the slope step says the depth model isn't installed and uses the slope buttons instead. `?preloader=0` skips the intro. `node scripts/shoot.mjs` runs the whole-site visual check in a real GPU Chromium.

The GitHub Pages build (`.github/workflows/pages.yml`) fetches the models, builds with `GITHUB_PAGES=true` so assets resolve under `/raingarden/`, and deploys `dist/`.

## Credits, data and licences

- Depth model: [Depth Anything V2 Small](https://huggingface.co/depth-anything/Depth-Anything-V2-Small) (Yang et al., 2024), ONNX export by [onnx-community](https://huggingface.co/onnx-community/depth-anything-v2-small), Apache-2.0. Downloaded at build time, not stored in this repo.
- Runtime: [onnxruntime-web](https://github.com/microsoft/onnxruntime) 1.22.0, MIT.
- Weather: [Open-Meteo](https://open-meteo.com/) historical weather API (free non-commercial tier).
- Rain garden sizing, siting, hydrology and plant data: WSU Extension / Washington Dept. of Ecology, Wisconsin DNR / UW-Extension, Metro Vancouver, TRCA, Credit Valley Conservation, Essex Region Conservation Authority, Capital Regional District, King County, Rawls et al. (1983), US EPA SWMM, USDA TR-55 and others, all listed in [`SOURCES.md`](SOURCES.md).
- Fonts: Young Serif and Atkinson Hyperlegible Next, SIL Open Font License.
- Illustrations: generated for this project with OpenAI image models through ChatGPT; every prompt is logged in `art-src/PROMPTS.md`.

The plan is guidance, not engineering. Call before you dig.
