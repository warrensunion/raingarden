# Garden report: Tasks 4 and 5 (sizing, constraints, cost, layout)

Branch `wt/garden`. Commits:
- `e103df1` feat(garden): published sizing, constraints, cost
- `a53c14f` feat(garden): native-plant layout by zone
- this report (docs commit)

Tests: `npm test` runs 31 tests, 31 pass, 0 fail (sizing 11, constraints 9, layout 11).

## Files

| File | Purpose |
|---|---|
| `src/garden/sizing.js` | `sizeGarden`, `SIZING_CITE`, `CITES`, `FT_M`, `IN_M`, `FT2_M2` |
| `src/garden/constraints.js` | `forbiddenMask`, `gardenCells`, `applyGarden`, `ellipseRho`, `inPolygon`, and constants `FENCE_BUFFER_M`, `SEPTIC_DOWNHILL_M`, `SEPTIC_UPHILL_M`, `BERM_WIDTH_M` |
| `src/garden/cost.js` | `costOf`, `gardenArea`, `COST_DEFAULTS`, `AMENDED_DEPTH_M` |
| `src/garden/layout.js` | `zonesOf`, `zoneOfPoint`, `layoutPlants`, `plantList` |
| `src/garden/rng.js` | `mulberry32(seed)`. It is shared so that the Task 6 optimizer can use the same generator. |
| `test/sizing.test.js`, `test/constraints.test.js`, `test/layout.test.js` | node:test |

## Interfaces (for Task 6)

### `sizeGarden(o)`

Input:

```
sizeGarden({ region: 'pnw'|'on', drainageAreaM2, soil: 'sand'|'loam'|'clay', depthM,
             downspoutDistM = 0,            // 'on' only
             drainRateMmH, rainRegion = 4, performance = 'best' })   // 'pnw' only
```

Returns `{ areaM2, factor, method, cite, inputs, warnings[] }`.

- `inputs` records the resolved bands in each method's own units:
  - WSU: `rateBand`, `pondingIn`, `rainRegion`, `rateSource`, and others.
  - Wisconsin: `soilClass`, `depthBand`, `distance`.
- It throws `RangeError` for an unknown region or soil, or for depth ≤ 0.

### `forbiddenMask(terrain, opts)`

```
forbiddenMask(terrain, { yard, wall, septic = null, minWallM = 3,
              septicBufferM = 3.048, septicUphillM = 15.24, fenceM = 0.5 })
```

Returns a `Uint8Array` where 1 means forbidden.

### `gardenCells(terrain, g)`

Returns a `Uint8Array` marking the cells whose centre is inside the ellipse.

- `lenM` and `widM` are the **full** axes.
- `rot` is measured in radians from +x, with y pointing down.

### `applyGarden(terrain, g)`

Returns `{ terrain /* new */, mask, bermMask, floorZ }`.

- The input terrain is never modified.
- `mask` and `bermMask` do not overlap.
- If the garden covers no cells, it returns an unchanged copy, empty masks and `floorZ = NaN`.

### `costOf(g, prices?)`

Returns `{ total, excavation, soil, mulch, plants }` in CAD.

### Layout functions

- **`layoutPlants(g, PLANTS, { seed, region, sun? })`**
  - Returns `[{ id, x, y, r, zone, drift }]`, with `x` and `y` in world metres.
  - `r` is half of the upper mature spread.
  - `drift` is the index of the drift (cluster) the plant belongs to.
  - It throws if `region` is missing.
- **`plantList(placed)`** returns `[{ id, common, latin, qty, zone }]`. Rows are sorted by zone (wet, middle, edge), then by qty descending, then by id.

## Sizing: methods, mapping and choices

### Choosing the method

- **WSU 2013 chart (`region: 'pnw'`)**
  - All three performance tables are transcribed from sizing.md as printed, including the Best 6 in and 12 in rows and the N/A cells.
  - If a 12 in pond is N/A at a given drainage band, we fall back to the 6 in row and add a warning, as the chart's footnote says.
  - Ponding depth: 12 in when `depthM` ≥ 9 in, otherwise 6 in. The chart only has 6 and 12 in.
- **Wisconsin 2003 Tables 1 and 2 (`region: 'on'`)**
  - The manual's depth bands have gaps, so we split them at the midpoints: < 5.5 in uses "3-5", < 7.5 in uses "6-7", and anything deeper uses "8".
  - We warn when depth is < 3 in or > 8.5 in, and when the area is > 300 ft² (the manual says to split the garden).
  - `downspoutDistM` ≥ 30 ft (9.144 m) uses Table 2. The default is 0, which gives Table 1, the larger and more conservative factors.

### Units

Unit conversion happens only at the method boundary: 1 ft = 0.3048 m and 1 in = 0.0254 m. An epsilon of 1e-9 on drainage-rate band edges keeps exact edges in the upper band. For example, 12.7 mm/h is exactly 0.50 in/h and falls in the 0.50–0.99 band.

### Mapping our soil classes to each method

This mapping is ours; neither guide publishes it.

| Our class | Wisconsin class | WSU default drainage rate (Rawls 1983 Ks) | WSU band |
|---|---|---|---|
| sand | sandy | 117.8 mm/h | 2.50+ |
| loam | silty | 3.4 mm/h | 0.10–0.24 |
| clay | clayey | 0.3 mm/h, below the chart | clamped to 0.10–0.24, with a warning |

- The Wisconsin mapping follows the texture mapping in sizing.md, which puts loam, silt loam and silt under "silty".
- For WSU, a measured `drainRateMmH`, from the WSU infiltration test, overrides the soil-class default.

### WSU rainfall region

The default is **Region 4**. sizing.md says Metro Vancouver spans Regions 3–5 by annual precipitation (an extrapolation), and Region 4 is also the region of the handbook's worked example. The caller can pass `rainRegion`. If needed, Task 6 or the UI could derive it from annual precipitation using the cut-offs in sizing.md: 30, 40, 50, 70 and 90 in.

### Non-monotonic table cell

WSU Best / Region 5 / 6 in / 0.10–0.24 is kept as printed, at **75%**, which is larger than Region 6's 72%. A test pins both values. The code assumes nothing about monotonicity.

### Published worked examples (tests)

- **WSU:** 1,150 ft², 0.50 in/h, 6 in, Best, Region 4 gives a factor of 0.34 and an area of 391 ft². The test rounds to whole ft², the same rounding the guide uses.
- **Wisconsin:** 600 ft², silty (our loam), 6 in, < 30 ft gives a factor of 0.25 and an area of 150 ft².

## Constraints

- **House wall:** cells whose centre is less than `minWallM = 3` m from the wall segment are forbidden. This band also covers "never against the house".
- **Septic:** there is no 3 m guess here. sizing.md cites WSU 2013 pp. 12–14, which requires **≥ 10 ft (3.048 m) downhill** and **≥ 50 ft (15.24 m) uphill**, and both are implemented.
  - A cell counts as uphill when its z is greater than the mean z over the septic polygon.
  - On level ground, the 10 ft buffer applies.
  - Wisconsin says only "not over a septic system", so the stricter WSU numbers apply in both regions.
- **Yard:** cells whose centre is outside the yard polygon are forbidden. So are cells within 0.5 m of the polygon's boundary (the fence or property line). The 0.5 m figure is our call, not from a guide.
- **Applying the garden:**
  - **Rim:** the garden cells that have a 4-neighbour outside the garden, or that lie on the grid edge.
  - **Floor:** set level at min(rim z) − depthM. Every garden cell is set to this floor, including any that were lower, which levels the floor.
  - **Berm:** we inflate both semi-axes by 0.6 m. This is exact at the ends of the axes and an approximation of the true offset curve elsewhere. Berm cells are raised to floor + depthM + bermM wherever they are lower.

## Cost

| Quantity | Formula | Default price |
|---|---|---|
| Garden area | π/4 · len · wid | |
| Excavation | area × depthM | $60/m³ |
| Amended soil | area × 0.3048 m | $90/m³ |
| Mulch | per m² of area | $12/m² |
| Plants | per m² of area | $45/m² |

- The soil depth of 0.3048 m is the lower bound of WSU's recommended 12–24 in soil-mix layer, as sizing.md quotes it.
- Every price can be overridden.
- The defaults are logged in DECISIONS.md.

## Layout

### Zones

Zones are radius fractions of the ellipse:

| Zone | Radius fraction |
|---|---|
| wet | 0–0.45 |
| middle | 0.45–0.8 |
| edge | 0.8–1.0, plus the 0.6 m berm ring |

### Species choice

- Candidates come from the region, the zone and, if given, the light (sun) filter.
- A species is too big for a zone if its spacing exceeds that zone's limit:

  | Zone | Spacing limit |
  |---|---|
  | wet | 0.45·b |
  | middle | 0.35·b |
  | edge | 2 × rim width |

  Here b is the semi-minor axis and rim width = 0.2·b + 0.6 m. Too-big species are skipped.
- From the species that fit, 3–5 are picked at random (seeded).

### Placement

- **Drifts:** each placement round plants one drift of 3–7 of a single species. A drift starts from a dart-thrown seed point and grows by Poisson-disc steps of 1–1.5× the spacing.
- **Spacing:** two plants are never closer than the larger of their two spacings. The generator enforces this; the test checks it with a 0.9 tolerance.
- **Fill order:**
  - Pass 1 gives each species an equal share of the zone's area, counting a footprint of spacing² per plant.
  - Pass 2 fills the remaining gaps, smallest species first.
  - Big rim shrubs (spacing > rim width) do not take part in pass 2. They are limited to the outer half of the berm.
- **Zone order:** edge first, then wet, then middle.
- **Light filter:** if it leaves a zone with no species (for example, an Ontario wet zone in full shade has none), the zone is left as mulch rather than given a plant that would fail.

## RED/GREEN evidence

- **Task 4 RED:** `node --test "test/*.test.js"` failed with `ERR_MODULE_NOT_FOUND ... src\garden\constraints.js` and `... src\garden\sizing.js`. This is the expected failure, since the modules did not exist yet.
- **Task 4 GREEN:** 20 of 20 passed, including both published examples, on the first implementation.
- **Task 5 RED:** `ERR_MODULE_NOT_FOUND ... src\garden\layout.js`.
- **Task 5 first GREEN attempt:** 9 of 10 passed. `3-5 species per zone` failed with `pnw edge: 1 species`, because big PNW rim shrubs crowded each other out.
  - I iterated on the algorithm: per-species area shares, rim shrubs on the outer berm, zone order and size limits.
  - A sweep over 40 seeds × 2 regions × 2 garden sizes gave:

    | Garden size | Seeds failing "3–5 species per zone" |
    |---|---|
    | 36 m² (the WSU example size) | 0 of 80 |
    | 22 m² | 2 of 80 |
- **Final:** `npm test` gives 31 of 31 passing.

## Concerns / notes for the integrator

1. **`npm test` script changed.** `package.json` had `node --test test/`. On Node 24 that fails, because the directory is treated as a module path (`Cannot find module ...\test`). I changed it to `node --test "test/**/*.test.js"`. Other worktrees will hit the same problem, and the change may conflict trivially when merging.
2. **DECISIONS.md:** I appended three lines (soil mapping and region default; siting; cost defaults). Expect append conflicts with other worktrees.
3. **The "larger spacing" rule and PNW shrubs.** Every PNW rim plant except kinnikinnick is a shrub with 1.2–1.8 m spacing. Because two plants must keep the larger spacing apart, small gardens (< ~25 m²) can end up with fewer than 3 species in a zone, and with sparse side slopes near rim shrubs. The species-mix test therefore uses the WSU example size (36 m²). A separate test checks ≤ 5 species per zone at every size.
4. **Excavation volume understates the dig.** As ruled, excavation = area × depth. Physically, the amended 0.3 m layer is also dug out (WSU gives a 24–42 in total excavation). The cost therefore under-counts digging by about area × 0.3 × $60.
5. **Ponding ranges outside the charts.** Depths outside 6–12 in are mapped to the nearest WSU row. Wisconsin depths above 8 in use the 8 in factor and add a warning.
6. **Rawls clay rate is below the WSU chart.** At 0.3 mm/h, clay is under the chart's 0.1 in/h minimum. Clay in PNW is clamped to the lowest band and a warning is returned. The UI should surface that warning, because WSU's advice is to "consider a different location".

## Fix round 1

### Changes

1. **Berm no longer leaks diagonally (`constraints.js` `applyGarden`).**
   - **Old berm:** "inflate both semi-axes by 0.6 m". This left gaps between diagonal neighbours.
   - **New berm:** a disc dilation of the garden mask, with radius R = ceil(max(0.6 m, cell·√2)/cell) cells. That is R = 2 at 0.5 m and 1 m cells, and R = 3 at 0.25 m cells.
   - Every 8-neighbour of the garden is now berm, raised to at least floor + depthM + bermM. Under D8 the pond therefore holds the full depthM before it spills.
   - The berm is wider than before: about 1 m on 0.5 m cells.
   - The layout's "edge" zone still uses the 0.6 m plant ring.
2. **Septic uphill test is now conservative (`forbiddenMask`).**
   - A cell is uphill when its z is greater than the **minimum** ground z over the septic polygon + 0.05 m. Within 0.05 m counts as level and gets the 10 ft buffer.
   - This replaces the comparison with the mean z.
   - The constant is `SEPTIC_LEVEL_TOL_M`, and the change is logged in DECISIONS.md.
3. **Excavation now includes the amended layer (`cost.js`).**
   - Excavation = area × (depthM + 0.3048) × excavPerM3.
   - The test and the DECISIONS.md cost line are updated. This resolves concern 4 from the first round.
4. **Minor fixes:**
   - `sizeGarden` uses `Object.hasOwn` for the soil lookup. Before, `soil: 'toString'` caused a TypeError; it now throws a RangeError.
   - The 30 ft cut-off is compared in metres: `downspoutDistM >= 9.144 - 1e-9`.
   - `ellipseRho`, and so also `gardenCells`, `applyGarden` and layout, throws a RangeError when lenM ≤ 0 or widM ≤ 0.
   - `layoutPlants` now attaches `.warnings` to the returned array. Each warning is `{ code, zone, message }`, with one of these codes:

     | Code | Raised when |
     |---|---|
     | `small-garden-few-species` | fewer than min(3, available) species were placed in a zone |
     | `small-garden-small-drifts` | under half of a zone's plants are in drifts of 3 or more |
     | `no-species-for-light` | the light filter leaves a zone with no species |

     The array's elements and their order are unchanged.

### New tests

All six were RED first, each failing for the expected reason:

| Test | RED failure |
|---|---|
| Berm blocks every 8-neighbour, 75 cases: cells 0.25/0.5/1 m × 5 tilts × 5 rotations | `leak at cell 0.5 slope 0.05,0 rot 0.3` |
| A cell beside the lower part of a sloped field is uphill | expected 1, got 0 |
| Zero or negative axis throws RangeError | missing expected exception |
| Small garden returns warnings; a roomy one returns none | `.warnings` undefined |
| Soil lookup ignores inherited keys | `Received "TypeError"` |
| Cost includes the amended layer in excavation | old value |

The 30 ft cut-off test (9.144 m → '>=30 ft', 9.14 m → '<30 ft') passed before the change: 9.144/0.3048 happens to equal exactly 30 in floating point. The change makes this independent of float luck.

### Command and output

```
node --test test/sizing.test.js test/constraints.test.js test/layout.test.js
ℹ tests 37
ℹ pass 37
ℹ fail 0
```

`npm test` gives the same result: 37 pass, 0 fail.
