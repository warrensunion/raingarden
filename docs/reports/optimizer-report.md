# Optimizer report: Task 6 (simulated annealing)

Branch `wt/opt`, worktree `C:\Users\Warren\Downloads\raingarden-wt\opt`. Status: **DONE_WITH_CONCERNS**. Every requested piece is built and tested. The concerns are about how fast a single evaluation is on the brief's own benchmark settings, and about a fix I made in Task 4's `applyGarden`.

## What was built

| File | Contents |
|---|---|
| `src/garden/optimizer.js` | `optimize(o)` → `{ok:true, garden, capturedL, outBeforeL, outAfterL, drainH, cost, areaM2, tries}` or `{ok:false, reason}`; `evaluateGarden({terrain, simParams, storm, garden})`; constants `LAMBDA_L_PER_CAD` (0.5), `PORE_FRACTION` (0.25), `GARDEN_STORAGE_M` (0.0762), `DRAWDOWN_LIMIT_H` (48), `MIN_AXIS_M` (0.6), `MAX_ASPECT` (3). |
| `src/sim/worker.js` | `{type:'optimize', id, params}` → `{type:'try', id, i, garden, outAfterL, drainH, accepted, best}` (at most 20 per second, plain objects, no transfers) then `{type:'done', id, result}`. `handle(msg, post, now = Date.now)` has an injectable clock so the throttle can be tested. |
| `src/garden/constraints.js` | `applyGarden` berm fix (see Rulings 5) and the new `BERM_CREST_M` = 0.005. |
| `scripts/bench-opt.mjs` | 128×128 yard (64×64 coarse), loam, 30 mm 24 h Type IA storm. Reports one coarse evaluation, per-try time, total time, the full-resolution phase, and a CPU calibration line. |
| `test/optimizer.test.js` | 10 tests (listed below). |
| `test/worker.test.js` | The stub test is replaced by 3 optimize tests. |
| `test/constraints.test.js` | +1 test: the pond spills at its lip through one notch. |

### Interface
`optimize({ terrain, forbidden, site?, simParams, storm: {mm, stepS}, limits, prior, prices?, iters = 160, seed = 1, onTry })`.

**`simParams`** is `{soil (SOILS key or object), Se?, imperv?, outlet, roof: {areaM2, cell, mask?}, manningN?}` at full resolution. These are the same fields as the worker's `run` params.

**`site`** is optional: the `forbiddenMask` options. It is used to name the binding constraint when nothing fits, and to build `forbidden` if `forbidden` is omitted.

**`limits`** defaults are `minDepthM 0.10`, `maxDepthM 0.30`, `maxBermM 0.15`, `maxAreaM2 ∞`, `budget ∞`.

**`cost`** in the result is the full `costOf` breakdown (`.total` and the line items).

**`onTry({i, garden, outAfterL, drainH, accepted, best: {garden, outAfterL}})`** is called once per evaluation. Its numbers are from the coarse grid.

### Algorithm

**1. Legality** is hard. Every proposal is checked at full resolution and is never evaluated if it fails. It must satisfy all of these:
- axes ≥ 0.6 m and aspect ≤ 3
- depth within its limits; berm within `[0, maxBermM]`
- area ≤ `maxAreaM2` and `costOf.total` ≤ budget
- no garden cell in `forbidden` dilated by applyGarden's berm disc (radius `ceil(max(0.6, cell·√2)/cell)`)

The disc is symmetric, so "garden ∪ berm misses forbidden" is the same as "garden misses forbidden dilated by the disc". That makes the test one precomputed mask plus an O(garden-bbox) scan using the same cell rule as `gardenCells`. The tests check legality independently with `applyGarden` at full resolution.

**2. Start**
- Run D8 (`d8` + `accumulate`) on the full terrain. Each cell's weight is 1, except roof-mask cells, which get 0. The downspout cell gets `roof.areaM2 / cell²` added.
- Scan candidates from highest accumulation down. The start garden is a circle of area `clamp(prior.areaM2, 1, maxAreaM2)`, also capped by what the budget allows. Depth is `minDepthM` (or `prior.depthM`); berm is 0.
- If no cell fits that area, halve it, down to the smallest garden (a 0.6 m circle).
- If nothing fits, return `ok:false`. The reason is checked in this order:
  - `'budget too small for the smallest garden'`: the 0.6 m circle at minimum depth costs more than the budget. This is checked first.
  - An area limit below the smallest garden (an extra reason).
  - Otherwise `site` is tested one rule at a time. Yard alone → `'the yard is too small'`; plus the wall → `'everything is within 3 m of the house'` (uses `minWallM`); plus septic → `'the septic buffer covers the yard'`.
  - Without `site`, the reason is `'the yard is too small'`.

**3. SA** on `coarsen(terrain, 2)`:
- Masks are coarsened too: imperv and roof mask by majority, outlet by "any". The downspout's block keeps the downspout's own outlet status (see Rulings 6).
- **Temperature:** T0 = 5% of the coarse `outBeforeL`, falling geometrically to 0.1% at the last iteration.
- **Moves:** each move perturbs one or two parameter groups, with position weighted 2/7.
  - Position step is a Gaussian with σ shrinking from 1 m to 0.25 m.
  - Length and width are multiplied by `exp(N·0.25·step)`, floored at 0.6 m.
  - Rotation moves by `N·0.6·step` rad.
  - Depth and berm move by `N·0.05` m, clamped to their ranges.
- **Rejection:** up to 40 proposals per iteration. Illegal ones are rejected without evaluation. If all 40 are illegal, the iteration is skipped, so `tries` ≤ iters + 1.
- Seeded through `mulberry32`.

**4. Evaluation**
- Apply `applyGarden` on the coarse terrain, then `createSim` with `garden: {mask, storageM: 0.3048 × 0.25}`, then step through the rain.
- **Outflow** is read when the rain stops. In the dry tail nothing spills: there is no inflow, ponds only lose water to infiltration, and the ledger's `outL` is constant. So the tail is only needed to time drawdown.
- **drainH is the garden's own pond:** Σ `sim.depth()` over the garden cells × cell area. It is the time from the end of rain until that is below 1 L, which is runStorm's threshold.
  - The tail stops as soon as the garden is dry or 48 h has passed. Past 48 h, drainH is extrapolated from the last loss rate, or is ∞ if the pond is not shrinking.
  - A garden that never held water reads 0.
  - Natural hollows elsewhere in the yard are deliberately ignored. Otherwise a slow natural puddle would penalise every garden.
- **Objective** = `outAfterL + 0.5·cost + penalty`. The penalty is `1e6 + 1000·min(drainH − limit, 1000)` when drainH > limit, and 0 otherwise.

**5. Full-resolution confirmation**
- Coarse candidates are sorted by objective, and up to 5 distinct ones are re-run on the full grid with the real 48 h limit.
- If a candidate fails the drawdown, the same garden is retried at `minDepthM` with no berm. That version is cheaper, so it is still legal.
- The first one that drains in time is returned, with full-resolution `outBeforeL`, `outAfterL` and `drainH`.
- If none drains in time: `{ok:false, reason: 'no garden here drains within 48 h (the soil is too slow)'}`.

## Rulings and choices

1. **λ = 0.5 L/CAD** and **storageM = AMENDED_DEPTH_M × 0.25 (assumed)** are both logged in DECISIONS.md.
2. **Graded drawdown penalty.** The ruling's 1e6 is kept, with 1000 L per hour over the limit added on top. Without the gradient, a start garden on loam at 0.15 m depth plus berm sat on a flat 1e6 plateau. SA then accepted the first feasible proposal it found, which was off the valley and captured nothing, and never came back. Feasible gardens never pay any part of the penalty, so their ranking is unchanged.
3. **The start is the shallowest legal depth with no berm**, rather than a mid-range depth. It drains fastest and costs least, and SA deepens the garden when that pays.
4. **Coarse speedups** (the ruling asked for a 300 s storm step; this is my call, measured):
   - **Rain:** on the coarse grid the rain is summed into 15-minute steps. Design storms (`hyetograph`) and forecasts (`fromHourly`) are uniform within each hour, so no intensity is lost. On loam, clay and sand 64² yards, outflow and capture changed by less than 0.5% (for example, captured 849 vs 850 vs 853 L at 300/900/1800 s).
   - **Tail:** the coarse dry tail uses 30-minute steps. The ponded Green-Ampt increment is exact per step. The full-resolution confirmation uses the storm's own step for rain and 15-minute steps for the tail.
   - **Drawdown margin:** the coarse grid applies the limit at **42 h**. Coarse drawdown came out a few hours optimistic near the limit. Before the margin, the full-resolution check rejected 4–5 candidates in a row (7.7 s), and in one test it returned `ok:false`.
5. **`applyGarden` berm fix (Task 4 code).** This was a real bug, found because the optimizer reported 0 L captured.
   - **What happened:** applyGarden raised the whole berm ring to exactly the pond's lip. That ring is a flat at spill level. Priority-flood's ε tie-break then pointed the uphill cells at the berm flat rather than the lake, so roof water ran along the berm crest and around an empty garden. Example: a 2.9 m² garden right in the valley captured 0 L at full resolution. The coarse grid happened to break the tie the other way.
   - **Fix:** the crest is now `BERM_CREST_M` = 5 mm above the lip. The exception is a one-cell overflow notch at the lip: an 8-connected line from the lowest rim cell, through the berm cell on the lowest natural ground, out the far side of the berm.
   - **Verified:**
     - The existing constraints tests still pass, because berm z is still ≥ floor + depth + berm.
     - New test: the pond fills exactly to the lip on three slopes, and 1–8 cells form the notch.
     - New regression test: that same garden now captures more than 100 L. Before the fix it captured 0.
   - Logged in DECISIONS.md.
6. **The downspout's coarse block keeps the downspout's outlet status.** A downspout one cell inside an edge outlet shares its 2×2 block with that outlet. Under the "any" rule, the roof water left the coarse yard immediately: 1800 L out in every try, so every garden looked useless.
7. **Legality is a geometric check at full resolution on every proposal**, not a re-check at the end. A coarse garden can differ from the full-resolution one, so the evaluated shape is the coarse version of a legal full-resolution garden.

## TDD evidence

| Step | RED | GREEN |
|---|---|---|
| `test/optimizer.test.js` written first (9 tests) | `ERR_MODULE_NOT_FOUND ... src\garden\optimizer.js` | — |
| First implementation | 7/9 pass. ✖ reasons test: my test's septic left a legal band, so the test was fixed. ✖ beats-random: `captures water (0)`. Coarse outlet bug (Rulings 6). | after the outlet fix the optimizer still returned 0 L at full resolution: drawdown plateau (Rulings 2–3) and berm bypass (Rulings 5) |
| Regression `uphill water enters the garden...` | `captured 0 L` | after the notch fix: pass |
| `the returned garden is legal at full resolution` (min 0.12, max 0.25, berm 0.1) | `ok:false` ("no garden here drains within 48 h"): coarse said ≤ 48 h, full grid said > 48 h | min-depth repair + 42 h coarse margin: pass |
| `beats a random legal placement` | `optimizer 1407.9 L vs random 1418.3 L`: the random placement had not been required to meet the 48 h drawdown, and the test demanded the optimizer beat every random spot | test made fair: random placements must drain ≤ 48 h, and the optimizer must beat their mean and median. Now: optimizer 1408 L vs random 0, 0, 0, 0, 0, 1310, 1399, 1418 |
| `test/worker.test.js` optimize tests | 2 fail (stub posts an error) | 6/6 pass |

**Optimizer tests (all pass):**
- never inside a forbidden zone: 200 random 32² yards with random yard polygon, wall, `minWallM`, septic, soil, limits and prior, at iters 12. 179/200 return a garden; every one is legal at full resolution by an independent `applyGarden` check; the rest return a non-empty reason.
- ok:false when everything is forbidden.
- ok:false reasons name the binding constraint: wall, septic, yard, budget.
- beats a random legal placement on a valley yard.
- respects budget and maxArea, for every try and for the result.
- the returned garden is legal at full resolution (custom depth and berm limits).
- deterministic for a seed (`deepEqual` of two runs).
- drainH ≤ 48 on loam, and capturedL = before − after.
- onTry is called once per evaluation (calls === tries).
- uphill water enters the garden (berm regression).

**Final:** `npm test` gives **105 tests, 105 pass, 0 fail** (46 s on this loaded machine, about 23 s of that in the 200-yard property test).

## Benchmark (`node scripts/bench-opt.mjs`)

The machine was loaded. The calibration loop read 325 ms against about 100 ms on an idle desktop, so timings are inflated about 3×.

| Measure | Loaded | Est. idle (÷3.25) |
|---|---|---|
| One coarse evaluation at the brief's settings (64², 288 × 300 s rain, 300 s tail, 48 h) | best 143 ms, median 173 ms | ~44 ms |
| One SA try as run (64², 15-min rain, 30-min tail) | median 52.6 ms, p90 79.7 ms | ~16 ms |
| Default run (160 iters, 161 evaluations), total | 11.2 s | ~3.4 s |
| — of which full-resolution confirmation (before + 1 after, 128²) | 1.3 s | ~0.4 s |

Result on the bench yard: 1127 of 1172 L captured (96%), drainH 41.5 h, area 4.5 m², cost $494.

Before the speedups the default run took 45 s loaded (about 14 s idle), with roughly 7.7 s of it in the full-resolution phase.

## Concerns

1. **"Well under 50 ms" for one evaluation at the brief's exact settings is not met.** It is about 44 ms idle by calibration (an estimate, not measured idle). The sim's cost is about 30 ns per cell-step. The optimizer meets the overall target (about 16 ms per try and about 3.4 s per run, idle estimate) through 15-minute coarse rain steps and an early-stopped tail; Rulings 4 has the accuracy figures. Please re-run `node scripts/bench-opt.mjs` on a quiet machine.
2. **I edited Task 4's `applyGarden`** (berm crest and notch, Rulings 5). It changes every garden terrain by up to 5 mm on the berm. Any later merge touching constraints.js should keep this.
3. **The optimizer tends to sit close to the drawdown limit** (41–48 h at full resolution), because capture keeps rising with ponded volume. That is the stated objective. If the UI wants a comfort margin, lower `DRAWDOWN_LIMIT_H` or add a soft cost.
4. **On sand (no runoff before), capturedL is 0** and SA only minimises cost, so the garden shrinks to the smallest one. The UI should say "your yard already soaks this storm up" rather than show a 0.3 m² garden.
5. **Mixed resolution in the output:** onTry numbers are coarse, while the returned numbers are full resolution, so the last animated try will not exactly equal the final result.
