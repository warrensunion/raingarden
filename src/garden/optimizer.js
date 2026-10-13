/**
 * Simulated-annealing garden optimizer: where to put a rain garden and how big,
 * deep and bermed to make it, so the real storm sim says the least water
 * leaves the yard for the money, within the user's limits.
 *
 * Why simulated annealing over the storm sim (not a formula): the published
 * sizing methods give an area but not a place, and whether a spot catches the
 * downspout's water depends on the actual slopes, hollows and the berm. SA
 * handles the mixed hard constraints (forbidden ground, budget, area, depth,
 * aspect) as simply rejected moves, and ~160 coarse sims fit in a few seconds.
 *
 * How:
 *  - Legality is hard and geometric, checked at FULL resolution for every
 *    proposal and never evaluated if violated: (garden cells ∪ berm) ∩
 *    forbidden = ∅, cost ≤ budget, area ≤ maxAreaM2, depth and berm in range,
 *    axes ≥ 0.6 m, aspect ≤ 3:1. The berm is the disc dilation applyGarden
 *    uses, so "garden ∪ berm misses forbidden" is "garden misses forbidden
 *    dilated by that disc", one precomputed mask and an O(garden) test.
 *  - Evaluation runs on the 2x coarsened yard (4x fewer cells) with the rain
 *    summed into 15-minute steps. Outflow is final when the rain stops (in
 *    the dry tail nothing spills; ponds only soak in), so the tail runs only
 *    until the garden's own pond is empty, or 48 h, the published drawdown
 *    limit (Metro Vancouver, TRCA, ERCA).
 *  - Objective (minimise) = outAfterL + λ·cost + 1e6 if the garden still
 *    holds water 48 h after the rain (plus 1000 per extra hour, so SA can
 *    climb out of an all-penalised start). λ = 0.5 L/CAD: a dollar must buy
 *    half a litre more capture (DECISIONS.md). The coarse grid applies the
 *    limit at 42 h, a margin for its slightly optimistic drawdown.
 *  - The best few coarse candidates are re-run at full resolution; the first
 *    that drains within 48 h (as is, or at the shallowest depth with no berm)
 *    is returned with full-resolution numbers.
 * Pure module (no window/document); runs in the sim Web Worker.
 */
import { coarsen } from '../sim/grid.js';
import { d8, accumulate } from '../sim/d8.js';
import { createSim } from '../sim/sim.js';
import { SOILS } from '../sim/infiltration.js';
import { forbiddenMask, ellipseRho, applyGarden, BERM_WIDTH_M } from './constraints.js';
import { costOf, gardenArea, AMENDED_DEPTH_M } from './cost.js';
import { mulberry32 } from './rng.js';

/** Litres of extra capture a dollar must buy (objective weight on cost). */
export const LAMBDA_L_PER_CAD = 0.5;
/** Pore space of the amended mix (assumed): water the amended layer holds. */
export const PORE_FRACTION = 0.25;
export const GARDEN_STORAGE_M = AMENDED_DEPTH_M * PORE_FRACTION;
/** Published drawdown limit (Metro Vancouver, TRCA, ERCA). */
export const DRAWDOWN_LIMIT_H = 48;
export const MIN_AXIS_M = 0.6;
export const MAX_ASPECT = 3;
const PENALTY = 1e6;
const DRY_M3 = 0.001; // same "drained" threshold as runStorm (1 L)
const FULL_RES_CANDIDATES = 5;
const PROPOSALS_PER_ITER = 40;
/**
 * Dry-tail step on the coarse grid (s). Ponded Green-Ampt increments are
 * exact per step, so 30-minute steps judge drawdown well at 1/6 the cost of
 * 5-minute ones; the full-resolution confirmation uses the storm's own step.
 */
const COARSE_TAIL_S = 1800;
/**
 * Rain step on the coarse grid (s). Design and forecast storms are uniform
 * within each hour, so summing 5-minute steps into 15-minute ones keeps every
 * intensity; measured on loam, clay and sand yards the outflow and capture
 * change < 0.5% and the run is 3x faster.
 */
const COARSE_RAIN_S = 900;
/**
 * Drawdown limit applied on the coarse grid (h). The coarse yard tends to
 * read a pond near the limit as draining a few hours sooner than the full
 * grid does, so SA keeps a margin and the full-resolution check applies the
 * real 48 h.
 */
const COARSE_DRAWDOWN_H = 42;
/** Dry-tail step for the full-resolution confirmation (s). */
const FULL_TAIL_S = 900;

/** Sum rain steps into steps of targetS when it is a whole multiple of stepS. */
function rebin(mm, stepS, targetS) {
  const k = Math.round(targetS / stepS);
  if (k <= 1 || Math.abs(k * stepS - targetS) > 1e-9) return { mm, stepS };
  const out = new Float64Array(Math.ceil(mm.length / k));
  for (let i = 0; i < mm.length; i++) out[Math.floor(i / k)] += mm[i];
  return { mm: out, stepS: targetS };
}

function resolveSoil(soil) {
  if (typeof soil === 'string') {
    if (!SOILS[soil]) throw new Error(`unknown soil ${soil}`);
    return SOILS[soil];
  }
  return soil;
}

/** Block-reduce a 0/1 mask by f: 'any' (outlets) or 'half' (majority, roofs/paving). */
function coarsenMask(m, nx, ny, f, mode) {
  const cx = Math.ceil(nx / f);
  const cy = Math.ceil(ny / f);
  const sum = new Float64Array(cx * cy);
  const cnt = new Float64Array(cx * cy);
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      const j = Math.floor(y / f) * cx + Math.floor(x / f);
      sum[j] += m[y * nx + x] ? 1 : 0;
      cnt[j] += 1;
    }
  }
  const out = new Uint8Array(cx * cy);
  for (let j = 0; j < out.length; j++) out[j] = mode === 'any' ? (sum[j] > 0 ? 1 : 0) : (sum[j] * 2 >= cnt[j] ? 1 : 0);
  return out;
}

/** Sim inputs for a terrain + simParams (soil resolved, defaults filled). */
function simInputs(terrain, sp) {
  const n = terrain.nx * terrain.ny;
  return {
    terrain,
    soil: resolveSoil(sp.soil),
    Se: sp.Se,
    imperv: sp.imperv || new Uint8Array(n),
    outlet: sp.outlet,
    roof: sp.roof || { areaM2: 0, cell: 0 },
    manningN: sp.manningN,
  };
}

/** The same yard at 1/f resolution; the downspout lands in its block. */
function coarseInputs(full, f) {
  const { terrain, imperv, outlet, roof } = full;
  const { nx, ny } = terrain;
  const t = coarsen(terrain, f);
  const rx = Math.floor((roof.cell % nx) / f);
  const ry = Math.floor(Math.floor(roof.cell / nx) / f);
  const cOutlet = coarsenMask(outlet, nx, ny, f, 'any');
  // A downspout one cell in from an edge outlet shares its coarse block with
  // the outlet; without this the roof water would leave the coarse yard at
  // once and every garden would look useless. The block keeps the
  // downspout's own outlet status.
  cOutlet[ry * t.nx + rx] = outlet[roof.cell] ? 1 : 0;
  return {
    ...full,
    terrain: t,
    imperv: coarsenMask(imperv, nx, ny, f, 'half'),
    outlet: cOutlet,
    roof: { ...roof, cell: ry * t.nx + rx, mask: roof.mask ? coarsenMask(roof.mask, nx, ny, f, 'half') : undefined },
  };
}

/**
 * Run the storm and report outflow (fixed once the rain stops) and how long
 * the garden's own pond stands afterwards (searched up to 48 h, then
 * extrapolated from the last loss rate; Infinity if it is not draining).
 */
function simulate(inp, terrain, gardenMask, mm, stepS, scratch, tailS = stepS) {
  const sim = createSim({
    terrain, soil: inp.soil, Se: inp.Se, imperv: inp.imperv, outlet: inp.outlet, roof: inp.roof,
    manningN: inp.manningN, garden: gardenMask ? { mask: gardenMask, storageM: GARDEN_STORAGE_M } : null,
  });
  for (let k = 0; k < mm.length; k++) sim.step(mm[k], stepS);
  const outL = sim.ledger.outL;
  if (!gardenMask) return { outL, drainH: 0 };
  const idx = [];
  for (let i = 0; i < gardenMask.length; i++) if (gardenMask[i]) idx.push(i);
  const area = terrain.cell * terrain.cell;
  const depth = scratch && scratch.length === gardenMask.length ? scratch : new Float64Array(gardenMask.length);
  const vol = () => {
    sim.depth(depth);
    let v = 0;
    for (let k = 0; k < idx.length; k++) v += depth[idx[k]];
    return v * area;
  };
  let v = vol();
  if (v < DRY_M3) return { outL, drainH: 0 };
  const tailSteps = Math.ceil((DRAWDOWN_LIMIT_H * 3600) / tailS - 1e-9);
  let prev = v;
  let rate = 0;
  for (let k = 0; k < tailSteps; k++) {
    sim.step(0, tailS);
    v = vol();
    if (v < DRY_M3) return { outL, drainH: ((k + 1) * tailS) / 3600 };
    rate = (prev - v) / tailS;
    prev = v;
  }
  const drainH = rate > 0 ? (tailSteps * tailS + (v - DRY_M3) / rate) / 3600 : Infinity;
  return { outL, drainH };
}

/** Disc radius (cells) of the berm applyGarden builds on this grid. */
function bermRadius(cell) {
  return Math.ceil(Math.max(BERM_WIDTH_M, cell * Math.SQRT2) / cell - 1e-9);
}

/** Forbidden dilated by the berm disc: a garden cell here would put garden or berm on forbidden ground. */
function dilate(mask, nx, ny, R) {
  const out = new Uint8Array(nx * ny);
  const R2 = R * R;
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      if (!mask[y * nx + x]) continue;
      for (let dy = -R; dy <= R; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= ny) continue;
        for (let dx = -R; dx <= R; dx++) {
          const xx = x + dx;
          if (xx >= 0 && xx < nx && dx * dx + dy * dy <= R2) out[yy * nx + xx] = 1;
        }
      }
    }
  }
  return out;
}

/** True when the garden has ≥ 1 cell and none in the dilated forbidden mask (same cells as gardenCells). */
function footprintFits(terrain, g, fd) {
  const { nx, ny, cell } = terrain;
  const r = Math.max(g.lenM, g.widM) / 2 + cell;
  const x0 = Math.max(0, Math.floor((g.cx - r) / cell));
  const x1 = Math.min(nx - 1, Math.ceil((g.cx + r) / cell));
  const y0 = Math.max(0, Math.floor((g.cy - r) / cell));
  const y1 = Math.min(ny - 1, Math.ceil((g.cy + r) / cell));
  let cells = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (ellipseRho(g, (x + 0.5) * cell, (y + 0.5) * cell) <= 1) {
        if (fd[y * nx + x]) return false;
        cells++;
      }
    }
  }
  return cells > 0;
}

function withDefaults(limits = {}) {
  return {
    maxAreaM2: limits.maxAreaM2 ?? Infinity,
    budget: limits.budget ?? Infinity,
    minDepthM: limits.minDepthM ?? 0.10,
    maxDepthM: limits.maxDepthM ?? 0.30,
    maxBermM: limits.maxBermM ?? 0.15,
  };
}

/** Everything but the footprint: sizes, ranges, area, budget. */
function paramsLegal(g, L, prices) {
  if (!(g.lenM >= MIN_AXIS_M && g.widM >= MIN_AXIS_M)) return false;
  if (Math.max(g.lenM, g.widM) / Math.min(g.lenM, g.widM) > MAX_ASPECT) return false;
  if (!(g.depthM >= L.minDepthM && g.depthM <= L.maxDepthM)) return false;
  if (!(g.bermM >= 0 && g.bermM <= L.maxBermM)) return false;
  if (!(gardenArea(g) <= L.maxAreaM2)) return false;
  return costOf(g, prices).total <= L.budget;
}

/** Circle of area A centred on cell i. */
function circleAt(terrain, i, A, depthM, bermM) {
  const d = 2 * Math.sqrt(A / Math.PI);
  return {
    cx: ((i % terrain.nx) + 0.5) * terrain.cell,
    cy: (Math.floor(i / terrain.nx) + 0.5) * terrain.cell,
    lenM: d, widM: d, rot: 0, depthM, bermM,
  };
}

/** Does the smallest garden fit anywhere outside this (dilated) mask? */
function anyFits(terrain, fd, depthM) {
  const minA = (Math.PI / 4) * MIN_AXIS_M * MIN_AXIS_M;
  for (let i = 0; i < fd.length; i++) {
    if (!fd[i] && footprintFits(terrain, circleAt(terrain, i, minA, depthM, 0), fd)) return true;
  }
  return false;
}

/** Why no garden fits: the first site rule that alone leaves no room. */
function noRoomReason(terrain, site, R, depthM) {
  const tooSmall = 'the yard is too small';
  if (!site || !site.yard) return tooSmall;
  const { nx, ny } = terrain;
  const fits = (s) => anyFits(terrain, dilate(forbiddenMask(terrain, s), nx, ny, R), depthM);
  if (!fits({ ...site, wall: null, septic: null })) return tooSmall;
  if (site.wall && !fits({ ...site, septic: null })) return `everything is within ${site.minWallM ?? 3} m of the house`;
  if (site.septic) return 'the septic buffer covers the yard';
  return tooSmall;
}

/**
 * 1e6 once the pond outlasts the 48 h limit, plus 1000 per extra hour (capped)
 * so that inside the infeasible region SA still feels which way drains
 * faster; feasible gardens never pay any of it.
 */
function drawdownPenalty(drainH, limitH) {
  if (!(drainH > limitH)) return 0;
  return PENALTY + 1000 * Math.min(drainH - limitH, 1000);
}

/**
 * Score one garden on given sim inputs. Returns outflow, drainage and the
 * objective; the caller supplies the "before" outflow.
 */
function scoreOn(inp, g, run, prices, scratch) {
  const { mm, stepS, tailS, limitH } = run;
  const { terrain: t2, mask } = applyGarden(inp.terrain, g);
  const r = simulate(inp, t2, mask, mm, stepS, scratch, tailS);
  const cost = costOf(g, prices).total;
  const obj = r.outL + LAMBDA_L_PER_CAD * cost + drawdownPenalty(r.drainH, limitH);
  return { outAfterL: r.outL, drainH: r.drainH, cost, obj };
}

/**
 * Capture of one given garden at full resolution (no legality check); used by
 * tests and the UI's "what if" comparisons.
 * @returns {{outBeforeL:number, outAfterL:number, capturedL:number, drainH:number}}
 */
export function evaluateGarden({ terrain, simParams, storm, garden }) {
  const inp = simInputs(terrain, simParams);
  const before = simulate(inp, terrain, null, storm.mm, storm.stepS);
  const { terrain: t2, mask } = applyGarden(terrain, garden);
  const after = simulate(inp, t2, mask, storm.mm, storm.stepS);
  return { outBeforeL: before.outL, outAfterL: after.outL, capturedL: before.outL - after.outL, drainH: after.drainH };
}

function gauss(rng) {
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

const GROUPS = ['pos', 'pos', 'len', 'wid', 'rot', 'depth', 'berm'];

/** Perturb one or two parameter groups; position step stepM, sizes ±25%·(stepM/1 m). */
function propose(g, rng, stepM, L) {
  const n = rng() < 0.5 ? 1 : 2;
  const picks = new Set();
  while (picks.size < n) picks.add(GROUPS[Math.floor(rng() * GROUPS.length)]);
  const h = { ...g };
  for (const p of picks) {
    if (p === 'pos') { h.cx += gauss(rng) * stepM; h.cy += gauss(rng) * stepM; }
    else if (p === 'len') h.lenM = Math.max(MIN_AXIS_M, h.lenM * Math.exp(gauss(rng) * 0.25 * stepM));
    else if (p === 'wid') h.widM = Math.max(MIN_AXIS_M, h.widM * Math.exp(gauss(rng) * 0.25 * stepM));
    else if (p === 'rot') h.rot = h.rot + gauss(rng) * 0.6 * stepM;
    else if (p === 'depth') h.depthM = Math.min(L.maxDepthM, Math.max(L.minDepthM, h.depthM + gauss(rng) * 0.05));
    else h.bermM = Math.min(L.maxBermM, Math.max(0, h.bermM + gauss(rng) * 0.05));
  }
  return h;
}

/**
 * @param {object} o
 * @param {{nx:number, ny:number, cell:number, z:Float64Array}} o.terrain full resolution
 * @param {Uint8Array} [o.forbidden] 1 = garden and berm may not cover (forbiddenMask)
 * @param {object} [o.site] the forbiddenMask options; used to name the binding
 *   rule when nothing fits (and to build `forbidden` if it is missing)
 * @param {{soil:string|object, Se?:number, imperv?:Uint8Array, outlet:Uint8Array,
 *   roof?:{areaM2:number, cell:number, mask?:Uint8Array}, manningN?:number}} o.simParams
 * @param {{mm:ArrayLike<number>, stepS:number}} o.storm rain per step
 * @param {{maxAreaM2?:number, budget?:number, minDepthM?:number, maxDepthM?:number, maxBermM?:number}} o.limits
 * @param {{areaM2:number, depthM?:number}} [o.prior] sizing result (start area)
 * @param {object} [o.prices] costOf unit prices
 * @param {number} [o.iters=160]
 * @param {number} [o.seed=1]
 * @param {(t:{i:number, garden:object, outAfterL:number, drainH:number, accepted:boolean, best:{garden:object, outAfterL:number}}) => void} [o.onTry]
 *   called once per evaluation, coarse-grid numbers
 * @returns {{ok:true, garden:object, capturedL:number, outBeforeL:number, outAfterL:number,
 *   drainH:number, cost:object, areaM2:number, tries:number} | {ok:false, reason:string}}
 */
export function optimize(o) {
  const { terrain, site = null, storm, prices, onTry } = o;
  const iters = o.iters ?? 160;
  const rng = mulberry32(o.seed ?? 1);
  const L = withDefaults(o.limits);
  const { nx, ny, cell } = terrain;
  const n = nx * ny;
  const forbidden = o.forbidden || (site ? forbiddenMask(terrain, site) : new Uint8Array(n));
  const R = bermRadius(cell);
  const fd = dilate(forbidden, nx, ny, R);
  const mm = storm.mm;
  const stepS = storm.stepS;

  // --- smallest-garden checks: budget and area limit -----------------------
  const minA = (Math.PI / 4) * MIN_AXIS_M * MIN_AXIS_M;
  const minG = { lenM: MIN_AXIS_M, widM: MIN_AXIS_M, depthM: L.minDepthM };
  if (costOf(minG, prices).total > L.budget) return { ok: false, reason: 'budget too small for the smallest garden' };
  if (L.maxAreaM2 < minA) return { ok: false, reason: `the area limit is below the smallest garden (${minA.toFixed(2)} m²)` };

  // --- start: highest roof-weighted D8 accumulation that fits -------------
  const full = simInputs(terrain, o.simParams);
  const cellA = cell * cell;
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = full.roof.mask && full.roof.mask[i] ? 0 : 1;
  if (full.roof.areaM2 > 0) w[full.roof.cell] += full.roof.areaM2 / cellA;
  const acc = accumulate(d8(terrain, { outlet: full.outlet }), nx, ny, w);
  const cand = [];
  for (let i = 0; i < n; i++) if (!fd[i]) cand.push(i);
  cand.sort((a, b) => acc[b] - acc[a] || a - b);

  // Shallowest legal depth, no berm: drains fastest and costs least; SA deepens if it pays.
  let depth0 = Math.min(L.maxDepthM, Math.max(L.minDepthM, o.prior?.depthM ?? L.minDepthM));
  const unitCost = costOf({ lenM: 2 / Math.sqrt(Math.PI), widM: 2 / Math.sqrt(Math.PI), depthM: depth0 }, prices).total;
  let A = Math.min(Math.max(o.prior?.areaM2 ?? 1, 1), L.maxAreaM2, L.budget / unitCost);
  if (A < minA) { depth0 = L.minDepthM; A = minA; }
  const berm0 = 0;
  let start = null;
  for (let a = A; !start; a = a / 2) {
    a = Math.max(a, minA);
    for (const i of cand) {
      const g = circleAt(terrain, i, a, depth0, berm0);
      if (paramsLegal(g, L, prices) && footprintFits(terrain, g, fd)) { start = g; break; }
    }
    if (a <= minA) break;
  }
  if (!start) return { ok: false, reason: noRoomReason(terrain, site, R, L.minDepthM) };

  const legal = (g) => paramsLegal(g, L, prices) && footprintFits(terrain, g, fd);

  // --- SA on the coarse grid -----------------------------------------------
  const coarse = coarseInputs(full, 2);
  const scratch = new Float64Array(coarse.terrain.nx * coarse.terrain.ny);
  const cr = rebin(mm, stepS, COARSE_RAIN_S);
  const cRun = { mm: cr.mm, stepS: cr.stepS, tailS: Math.max(cr.stepS, COARSE_TAIL_S), limitH: COARSE_DRAWDOWN_H };
  const fRun = { mm, stepS, tailS: Math.max(stepS, FULL_TAIL_S), limitH: DRAWDOWN_LIMIT_H };
  const outBeforeC = simulate(coarse, coarse.terrain, null, cr.mm, cr.stepS).outL;
  const T0 = Math.max(0.05 * outBeforeC, 1e-6);
  const Tend = Math.max(0.001 * outBeforeC, 1e-8);

  const evaluated = [];
  let tries = 0;
  const evalC = (g) => {
    tries++;
    const s = scoreOn(coarse, g, cRun, prices, scratch);
    evaluated.push({ g, obj: s.obj, k: evaluated.length });
    return s;
  };
  let cur = start;
  let curS = evalC(start);
  let best = cur;
  let bestS = curS;
  if (onTry) onTry({ i: 0, garden: { ...cur }, outAfterL: curS.outAfterL, drainH: curS.drainH, accepted: true, best: { garden: { ...best }, outAfterL: bestS.outAfterL } });

  for (let i = 1; i <= iters; i++) {
    const frac = iters > 1 ? (i - 1) / (iters - 1) : 1;
    const T = T0 * Math.pow(Tend / T0, frac);
    const stepM = Math.pow(0.25, frac); // 1 m shrinking to 0.25 m
    let g = null;
    for (let a = 0; a < PROPOSALS_PER_ITER && !g; a++) {
      const h = propose(cur, rng, stepM, L);
      if (legal(h)) g = h;
    }
    if (!g) continue;
    const s = evalC(g);
    const dE = s.obj - curS.obj;
    const accepted = dE <= 0 || rng() < Math.exp(-dE / T);
    if (accepted) { cur = g; curS = s; }
    if (s.obj < bestS.obj) { best = g; bestS = s; }
    if (onTry) onTry({ i, garden: { ...g }, outAfterL: s.outAfterL, drainH: s.drainH, accepted, best: { garden: { ...best }, outAfterL: bestS.outAfterL } });
  }

  // --- full-resolution confirmation ----------------------------------------
  evaluated.sort((a, b) => a.obj - b.obj || a.k - b.k);
  const outBeforeL = simulate(full, terrain, null, mm, stepS).outL;
  const seen = new Set();
  let checked = 0;
  for (const e of evaluated) {
    if (checked >= FULL_RES_CANDIDATES) break;
    const key = JSON.stringify(e.g);
    if (seen.has(key)) continue;
    seen.add(key);
    checked++;
    // The coarse grid can read a pond near the 48 h limit as draining in
    // time; if the full grid disagrees, the same garden at the shallowest
    // depth and no berm (cheaper, so still legal) usually drains.
    let g = e.g;
    if (!legal(g)) continue; // belt and braces: every candidate was checked already
    let s = scoreOn(full, g, fRun, prices);
    if (s.drainH > DRAWDOWN_LIMIT_H) {
      g = { ...g, depthM: L.minDepthM, bermM: 0 };
      if (!legal(g)) continue;
      s = scoreOn(full, g, fRun, prices);
      if (s.drainH > DRAWDOWN_LIMIT_H) continue;
    }
    return {
      ok: true,
      garden: { ...g },
      capturedL: outBeforeL - s.outAfterL,
      outBeforeL,
      outAfterL: s.outAfterL,
      drainH: s.drainH,
      cost: costOf(g, prices),
      areaM2: gardenArea(g),
      tries,
    };
  }
  return { ok: false, reason: `no garden here drains within ${DRAWDOWN_LIMIT_H} h (the soil is too slow)` };
}
