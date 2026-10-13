# Sim report: Tasks 1–3 (hydrology core)

Branch `wt/sim`, worktree `C:\Users\Warren\Downloads\raingarden-wt\sim`. Status: **DONE_WITH_CONCERNS**. The concerns are about how the benchmark was measured and a few interface deviations, not about correctness.

## What was built

| File | Contents |
|---|---|
| `src/sim/grid.js` | `DIRS`, `DIST`, `DX`/`DY`, `opposite`, `dirOffsets`, `edgeMask`, and **`coarsen(terrain, f)`** (block average; partial edge blocks average only the cells they hold). |
| `src/sim/d8.js` | `d8(terrain, {outlet})` → Int8Array. Codes: 0..7, -1 sink, -2 off-grid. An outlet drains off-grid unless a neighbour is lower than `z - 1e-9`. `accumulate(dir, nx, ny, weight?)` uses Kahn topological order, O(n). |
| `src/sim/flood.js` | `priorityFlood(terrain, outlet)` → `{zf, fill, dir, order}`. Barnes 2014 with a binary heap on (zf, seq) and ε = 1e-6. `lakes(terrain, fill, flood)` → `{id, list:[{cells sorted by z, spill, pour, outCell}]}`. Also `lakeVolume` and `lakeLevel` (exact hypsometric). |
| `src/sim/infiltration.js` | `SOILS` (Rawls 1983, from `docs/research/hydrology.md`), `HORTON`, `greenAmptF`, `greenAmptRate`, `greenAmptStep` (exact ponded increment by monotone Newton, capped at available water), the hot-path `gaStepRaw` (SI), `hortonRate`. |
| `src/sim/storm.js` | `TYPE_IA`, `TYPE_II` (25 hourly points), `hyetograph(total, 'IA'/'II'/'uniform', durationH, stepS)`, `fromHourly(hourly, stepS)`. Both integrate the cumulative curve, so the steps telescope and sum exactly. |
| `src/sim/sim.js` | `createSim(...)` → `{step, ledger, closure, depth, pondedM3, time, infiltrationM, lakeCount}`. `runStorm(sim, mmSteps, stepS, {tailH, frameEveryS, onFrame, frames, earlyExit})` → `{ledger, drainH, drained, peakStoredL, frames?}`. |
| `src/sim/worker.js` | `handle(msg, post)` implements the protocol (run → frames + done; error replies; `optimize` stub). `self.onmessage` is hooked up only inside a worker global. |
| `scripts/bench-sim.mjs` | 128×128 grid, 864 five-minute steps (24 h Type IA + 48 h tail, `earlyExit: false`). Prints ms per run and a CPU calibration line. |
| `package.json` | `test` script changed to `node --test "test/**/*.test.js"` (see Concerns). |

### Sim algorithm (one step)
1. Rain lands on every cell outside `roof.mask`. The roof volume (`rain × roof.areaM2`) goes to `roof.cell`.
2. The sweep walks `priorityFlood.order` in reverse, so each cell is visited before the cell it drains into.
   - **Non-lake cell:** water infiltrates up to Green-Ampt capacity. Garden cells first fill their amended-soil storage, which itself drains into the native soil. The remainder goes to `dir`, or to `outL` at an outlet.
   - **Lake cell:** if the cell sits above the current pond surface, it soaks up its own water first. The rest joins the lake pool.
   - **Lake pour cell** (the lake cell the flood reached first): the sweep is guaranteed to reach it after every cell that feeds the lake. The lake is settled there: compute the level, infiltrate over the wetted cells (each cell at most once per step), and spill anything above the lip to `outCell` in the same sweep.
   - So no separate per-lake pass is needed, and cascades of lakes spilling into lakes resolve in one O(n) sweep.
3. The ledger is kept in float64 m³: rain + roof = infiltrated + out + stored. Stored water is lake volume only, because routing within a step is instantaneous.
4. Display depth = pond depth + Manning sheet-flow depth h = (n·q/(cell·√S))^0.6, with S = max(slope, 0.005).

`drainH` is the number of hours after rain ends until ponds hold less than 1 L. If the tail ends first, it is extrapolated from the last loss rate and `drained: false` is returned. A dry run returns 0.

## TDD evidence

| Step | RED (before implementation) | GREEN |
|---|---|---|
| Task 1: `d8.test.js`, `flood.test.js` | `ERR_MODULE_NOT_FOUND ... src\sim\grid.js`, pass 0 / fail 2 | 11/11 pass |
| Task 2: `infiltration.test.js`, `storm.test.js` | `ERR_MODULE_NOT_FOUND ... infiltration.js / storm.js`, pass 0 / fail 2 | 14/14 pass |
| Task 3: `sim.test.js` | `ERR_MODULE_NOT_FOUND ... sim.js` | 9/9 pass |
| Worker: `worker.test.js` | `ERR_MODULE_NOT_FOUND ... worker.js` | 4/4 pass |

Every RED was "module missing", which is expected because the tests were written first. Every module passed on its first implementation.

**Final run:** `npm test` gives **38 tests, 38 pass, 0 fail**.

Key measured values:
- **Chow Example 4.3.1** (inputs ψ = 167 mm, K = 6.5 mm/h, θe = 0.486, Se = 0.3): F = **31.672 mm** (target 31.7 ± 0.1), f = **18.160 mm/h** (target 18.1 ± 0.1).
- **Step vs closed form:** summing 3600 one-second `greenAmptStep` calls stays within 0.5% for silt loam, sand and clay. One 3600 s step also matches.
- **Conservation test:** 64×64 random yards, seeds 1–3, with a bowl, house, roof and garden, 40 mm IA + 48 h tail. `closure() < 1e-9` holds, as well as the required < 0.005.
- **Clay bowl (21×21):** closure ≈ 5e-14. drainH = 213.8 h (extrapolated, `drained: false`).
- **Loam bowl:** drainH = 42.75 h. **Sand bowl:** 0 h, because the pond is gone before the rain ends.

The other tests also pass:
- impervious plane: out = rain to 1e-6
- flat sand with 5 mm: out = 0, infiltrated = rain
- garden reduces outflow
- zero rain: ledger all 0, closure 0, drainH 0
- flat clay yard: no NaN
- no-outlet yard: ponds, closure holds
- frame cadence
- coarsen: 2×2 average, partial blocks
- lake level/volume round-trip

## Benchmark (`node scripts/bench-sim.mjs 3`)

The machine was heavily loaded (image generation running), and timings swung by about 4× between runs.

**Final code** (128×128 grid, 864 steps, closure 6.8e-14):

| Measurement | Value |
|---|---|
| Per-run times | 1669 / 2584 / 1818 ms |
| Best total including setup | **1874 ms** |
| Calibration loop (1e8 float adds) | 557 ms, vs ~100 ms on an idle desktop |

- **Estimated idle-desktop time: about 0.35–0.5 s.** This is my scaling by the calibration factor, not a measurement.
- With the default `earlyExit` (stops once ponds are empty), the dry tail is mostly skipped.

**Before the performance fix**, `--trace-deopt` showed about 1,700 "wrong call target" deopts in `step`. The cause was per-sim closures called from the hot loop, which were re-deoptimised every time a new sim was created. That is exactly what the optimizer will do hundreds of times. After moving the hot functions to module scope over one fixed-shape state object, 3 deopts remain, all at warm-up. Newton runs on only about 1.6% of infiltration calls, because the cheap "capacity not binding" exit handles the rest.

## Rulings and deviations from the plan

1. **`lakes(terrain, fill, flood)` instead of `lakes(terrain, zf)`.**
   - The ε-raised `zf` lifts every flat cell by k·1e-6. With the plan's `zf − z > 1e-6` rule, a flat lawn would become a "lake".
   - So `priorityFlood` also returns `fill` (no ε), and lakes are found from it.
   - The third argument (`{dir, order}`) is needed to find the pour cell and `outCell`.
   - Each lake also carries a `pour` field.
2. **`priorityFlood` with no outlets at all:** the lowest cell becomes a terminal sink (-1). The sim treats it as a pond that never spills. The plan's "never -1" holds whenever at least one outlet exists.
3. **`roof.mask` (optional) was added.** The impervious-plane test requires rain to fall on impervious cells, so without it rain on the house footprint would be counted twice (once directly, once through `roof.areaM2`). Cells under `roof.mask` get no direct rain.
4. **Garden storage:** surface water fills the amended layer, and the layer drains into the native soil at the native Green-Ampt rate. Water entering the layer counts as `infiltratedL`, so the ledger stays a surface ledger.
5. **Lakes are settled at their pour cell during the sweep**, instead of in a separate pass ordered by spill height. This gives the same result in one sweep and is cheaper.
6. **`runStorm` additions:**
   - an `earlyExit` option (default true; stops the tail once ponds are below 1e-9 m³)
   - a `frames: true` option to collect frames
   - a `drained` flag
7. **Green-Ampt test** uses the Chow example's own inputs and published answers: F 31.7 mm, f 18.1 mm/h, as the ruling said. The plan's 16.6 mm/h was not used.

## Constants: sources and verification

All of these come from `C:\Users\Warren\Downloads\raingarden\docs\research\hydrology.md`. I read it; I did not edit it.

- **SOILS:** Rawls, Brakensiek & Miller (1983), Table 2, marked VERIFIED there. Porosity values: sand .437, loam .463, silt loam .501, clay .475. Silt loam uses ψ 166.8 mm, as listed.
- **TYPE_IA / TYPE_II:** hourly points from the HydroCAD TR-20 1982 tabular mass curves. I also fetched the HydroCAD `.hcr` files myself, and the numbers are identical. The research file cross-checks them against WSDOT HRM App. 4C.
- **HORTON — partly my choice, flagged:**
  - f0 = 127 / 76 / 25 mm/h and k = 4 /h are VERIFIED from SWMM Ref. Manual Vol. I, Tables 4-4 and 4-6.
  - Where each soil sits inside its fc range is my own choice: sand fc 11.4 (top of HSG A), loam and silt loam 5.7 (middle of HSG B), clay 0.6 (middle of HSG D).
  - Silt loam reuses the loam row.
  - Horton is not used by the sim; it exists only for display.
- **Unverified constants:**
  - Manning n = 0.24 for lawn display depth (the plan's value; I did not check it against a source).
  - The 1 L "drained" threshold.
  - The 0.005 minimum slope.
  - These are all display or reporting knobs; none of them affects the ledger.

## Self-review

- Pure modules: none of them reference `window` or `document`. `worker.js` touches `self` only behind a `typeof` guard.
- No allocation per step inside `step`. `runStorm` allocates one Float32Array per emitted frame, because the worker transfers it.
- Ledger closure is about 1e-13 everywhere tested. Any water left in transit in `inflow[]` would show up as a closure failure, so the exact closure also confirms the sweep ordering is correct.
- Review Focus items 2 (flat yard) and 3 (zero rain gives a defined closure of 0) are covered by tests.

## Concerns

1. **Benchmark measured on a loaded machine.** Raw numbers were 1.1–2.6 s; my scaled estimate for an idle desktop is under 0.5 s. Re-run `node scripts/bench-sim.mjs` on a quiet machine to confirm the < 1.5 s target.
2. **`package.json` test script changed.** `node --test test/` fails on Node 24.20: it loads the directory as a CommonJS module and reports MODULE_NOT_FOUND. I changed it to `node --test "test/**/*.test.js"`. Other worktrees may need the same edit, or hit a merge conflict on this line.
3. **Interface deviations** consumers need to know about:
   - `lakes(terrain, fill, flood)` replaces `lakes(terrain, zf)`.
   - `roof.mask` is optional and new.
   - `priorityFlood` also returns `fill`.
4. **Hourly Type IA flattens the peak.** The real peak is between 7.5 and 8 h; hourly interpolation spreads it over 7–8 h, so peak intensity is understated by about 1.5×. The half-hour table is available in the research file if Task 6 wants sharper peaks.
5. **Physical simplification:** routing within a step is instantaneous, and there is no ponding on slopes. This is fine for yard scale at 5-minute steps. Display depth on slopes is a Manning estimate, not a simulated state.

## Fix round 1 (task review)

I wrote the new tests first and ran them. The two behaviour tests (1 and 3) failed for the expected reasons. The tests that only strengthen existing coverage (2 and 4) passed straight away against the existing code.

| # | What changed | RED → GREEN |
|---|---|---|
| 1 (Important) | **Bug:** a garden inside a hollow never drained its amended-soil store once the hollow was dry. Lake cells only called `infiltrate` when water arrived, and `settleLake` only touched submerged cells. **Fix:** at the end of `settleLake`, each lake cell with `gCap > 0` that has not been processed this step now gets an `infiltrate(S, c, 0, dt)` call. Cost is O(lake cells). This drains the store into the native soil and moves no surface water, so the ledger is unchanged. New test: `a garden in a hollow drains its store into native soil once the hollow is dry` (1-cell 2 cm pit, clay, 0.3 m store, 72 dry steps after the pit empties). | RED: `F 0.02060470204375311 -> 0.02060470204375311` (no drainage). GREEN: F rises; closure < 1e-9. |
| 2 | `runStorm` JSDoc now states that `drainH` is Infinity (with `drained: false`) when ponds are not losing water: impervious ground, a no-outlet sink, or `tailH` 0 with water still standing. The clay-bowl test now asserts `drained === false` and `drainH > 48` (finite, extrapolated). New tests: a loam bowl with `tailH` 72 really drains (`drained: true`, 0 < drainH ≤ 72), and an impervious no-outlet pond gives `drainH === Infinity`. | Passed on first run; these only strengthen coverage. |
| 3 | `createSim` throws `RangeError` when `roof.cell` is not an integer in [0, n). This check applies even when the roof area is 0. New test covers -1, n and 2.5. | RED: `Missing expected exception (RangeError)`. GREEN. |
| 4 | Replaced the vague "nested pits" test with `two pits in series` (13×3 profile, outlet at (0,1)). It asserts exactly 2 lakes with lips at 0.3 and 0.5, and that following `dir` from the upper lake's `outCell` enters the lower lake. New sim test `two lakes in series on impervious ground hold exactly both lip volumes`: stored = 900 L (lower 3 × 0.2 m³ plus upper 3 × 0.1 m³), out = rain − 900 L, infiltrated = 0, closure < 1e-12. | Passed on first run; the existing code already handled it. |
| 5 | Added a comment on the Chow test explaining that ψ = 167 mm is the book's own rounding (16.7 cm, ψΔθ = 5.68 cm), which its published answers follow. That is why the test does not use `SOILS.siltLoam`'s 166.8 mm. | n/a |

**Command:** `node --test test/sim.test.js test/flood.test.js test/infiltration.test.js`

**Output:** `ℹ tests 25 / ℹ pass 25 / ℹ fail 0`

**Full suite (`npm test`):** `ℹ tests 43 / ℹ pass 43 / ℹ fail 0`
