/**
 * The storm sim: rain + downspout -> overland cascade -> Green-Ampt
 * infiltration -> ponds (lakes) -> outflow, with an exact water ledger.
 *
 * Why a cascade and not shallow-water equations: the question a homeowner
 * asks is "where does my roof water go and how much soaks in", over a whole
 * storm, on a phone, inside a simulated-annealing loop that runs hundreds of
 * sims. A one-sweep cascade along priority-flood directions is O(n) per
 * step, unconditionally stable at 5-minute steps, and every cubic metre is
 * accounted for: rain + roof = infiltrated + out + stored, summed in float64.
 * Flow is routed instantaneously within a step (yard-scale travel times are
 * minutes); water is only ever held in lakes (filled hollows), which
 * infiltrate over their wetted cells and spill at their lip.
 *
 * Order: priority-flood visits cells from the outlets upward, so walking its
 * order backwards visits every cell before its downstream cell. Each lake's
 * pour cell (the first lake cell the flood reached) comes after every cell
 * that can feed the lake, so the lake is settled exactly when the sweep
 * reaches its pour cell and its spill continues down the same sweep.
 *
 * Performance note: the hot functions live at module scope and take one
 * state object of fixed shape. Per-sim closures called from `step` made V8
 * deoptimise ("wrong call target") every time a second sim was created,
 * which the optimizer does hundreds of times. Pure: no window/document;
 * typed arrays, no per-step allocation.
 */
import { DIST, dirOffsets } from './grid.js';
import { priorityFlood, lakes as findLakes, lakeVolume } from './flood.js';
import { gaStepRaw } from './infiltration.js';

/** Infiltrate at most availM (m) into cell i during dt; returns m taken from the surface. */
function infiltrate(S, i, availM, dt) {
  S.stamp[i] = S.stepId;
  if (S.imperv[i]) return 0;
  const cap = S.gCap[i];
  if (cap > 0) {
    // Native soil drains the amended layer first, then the surface; the
    // surface then refills the layer. Only surface->soil counts as
    // infiltrated (the layer is already underground).
    const store = S.gStore[i];
    const native = gaStepRaw(S.F[i], store + availM, dt, S.gaA, S.gaK);
    S.F[i] += native;
    const fromStore = native < store ? native : store;
    const fromSurf = native - fromStore;
    const left = availM - fromSurf;
    const room = cap - (store - fromStore);
    let refill = left < room ? left : room;
    if (!(refill > 0)) refill = 0;
    S.gStore[i] = store - fromStore + refill;
    return fromSurf + refill;
  }
  if (!(availM > 0)) return 0;
  const dF = gaStepRaw(S.F[i], availM, dt, S.gaA, S.gaK);
  S.F[i] += dF;
  return dF;
}

/** Surface level of lake l holding volume V (hypsometric; cells sorted by z). */
function levelOf(S, l, V) {
  const { lakeStart, lakeCells, z } = S;
  const s = lakeStart[l];
  const e = lakeStart[l + 1];
  const v = V / S.area;
  if (!(v > 0)) return z[lakeCells[s]];
  let sum = 0;
  for (let k = s + 1; k < e; k++) {
    sum += z[lakeCells[k - 1]];
    const cnt = k - s;
    if (v <= cnt * z[lakeCells[k]] - sum) return (v + sum) / cnt;
  }
  sum += z[lakeCells[e - 1]];
  return (v + sum) / (e - s);
}

/** Settle lake l: take inflow, infiltrate over wetted cells, spill above the lip. Returns spill m3. */
function settleLake(S, l, dt) {
  const { lakeStart, lakeCells, z, stamp, area } = S;
  let V = S.lakeV[l] + S.lakeIn[l];
  S.lakeIn[l] = 0;
  if (V > 0) {
    const lvl = levelOf(S, l, V);
    let took = 0;
    for (let k = lakeStart[l], e = lakeStart[l + 1]; k < e; k++) {
      const c = lakeCells[k];
      const h = lvl - z[c];
      if (h <= 0) break;
      if (stamp[c] === S.stepId) continue; // already soaked this step
      took += infiltrate(S, c, h, dt) * area;
    }
    S.infV += took;
    V -= took;
    if (V < 0) V = 0;
  }
  // Garden cells in a hollow that got no surface water this step still
  // drain their amended layer into the native soil (O(lake cells)).
  const { gCap } = S;
  for (let k = lakeStart[l], e = lakeStart[l + 1]; k < e; k++) {
    const c = lakeCells[k];
    if (gCap[c] > 0 && stamp[c] !== S.stepId) S.infV += infiltrate(S, c, 0, dt) * area;
  }
  let spill = 0;
  const cap = S.lakeVspill[l];
  if (V > cap) { spill = V - cap; V = cap; }
  S.lakeV[l] = V;
  S.lakeLvl[l] = levelOf(S, l, V);
  return spill;
}

function stored(S) {
  let s = 0;
  const v = S.lakeV;
  for (let l = 0; l < v.length; l++) s += v[l];
  return s;
}

/** One cascade sweep (see header). */
function stepSim(S, rainMm, dtS) {
  S.stepId++;
  S.lastDt = dtS;
  const { n, area, order, inflow, rainFrac, lakeOf, z, lakeLvl, lakeIn, lakePour, lakeOut, qPass, gStore, dir, off } = S;
  const rainM = rainMm > 0 ? rainMm / 1000 : 0;
  const rainCellV = rainM * area;
  const roofStepV = rainM * S.roofArea;
  S.rainV += rainCellV * S.rainCells;
  S.roofV += roofStepV;
  inflow[S.roofCell] += roofStepV;
  let infV = 0;
  let outV = 0;
  for (let k = n - 1; k >= 0; k--) {
    const i = order[k];
    let w = inflow[i] + rainCellV * rainFrac[i];
    inflow[i] = 0;
    const l = lakeOf[i];
    if (l >= 0) {
      // A lake cell above the current surface soaks up its own water first;
      // the rest (and everything on wet cells) joins the pool.
      if (w > 0 && z[i] >= lakeLvl[l]) {
        const t = infiltrate(S, i, w / area, dtS) * area;
        infV += t;
        w -= t;
      }
      lakeIn[l] += w;
      qPass[i] = 0;
      if (i === lakePour[l]) {
        const s = settleLake(S, l, dtS);
        qPass[i] = s;
        if (s > 0) {
          const o = lakeOut[l];
          if (o >= 0) inflow[o] += s; else outV += s;
        }
      }
      continue;
    }
    if (w > 0 || gStore[i] > 0) {
      const t = infiltrate(S, i, w / area, dtS) * area;
      infV += t;
      w -= t;
    }
    qPass[i] = w;
    if (w > 0) {
      const d = dir[i];
      if (d >= 0) inflow[i + off[d]] += w; else outV += w;
    }
  }
  S.infV += infV;
  S.outV += outV;
}

/**
 * @param {object} p
 * @param {{nx:number, ny:number, cell:number, z:Float64Array}} p.terrain
 * @param {{psiMm:number, kMmH:number, thetaE:number}} p.soil native soil (SOILS entry)
 * @param {number} [p.Se=0.3] initial effective saturation
 * @param {Uint8Array} [p.imperv] 1 = no infiltration (house footprint, patio)
 * @param {Uint8Array} p.outlet 1 where water may leave the grid
 * @param {{areaM2:number, cell:number, mask?:Uint8Array}} [p.roof] roof catchment
 *   routed to the downspout cell; cells under `mask` get no direct rain (the
 *   roof already caught it)
 * @param {null|{mask:Uint8Array, storageM:number}} [p.garden] garden cells and
 *   amended-soil pore storage (m of water) filled before native infiltration
 * @param {number} [p.manningN=0.24] Manning n for the display flow depth (lawn)
 */
export function createSim(p) {
  const { terrain, soil } = p;
  const { nx, ny, cell, z } = terrain;
  const n = nx * ny;
  const area = cell * cell;
  const Se = p.Se ?? 0.3;
  const manningN = p.manningN ?? 0.24;
  const roof = p.roof || { areaM2: 0, cell: 0 };
  const garden = p.garden || null;

  // An out-of-range downspout index would drop roof water outside the
  // ledger and silently break closure, so refuse it up front.
  if (!(Number.isInteger(roof.cell) && roof.cell >= 0 && roof.cell < n)) {
    throw new RangeError(`roof.cell ${roof.cell} is outside the ${nx}x${ny} grid`);
  }

  const pf = priorityFlood(terrain, p.outlet);
  const { dir, order } = pf;
  const L = findLakes(terrain, pf.fill, pf);
  const off = dirOffsets(nx);

  // Flatten lakes into typed arrays; add a terminal "lake" for the -1 sink
  // (only when the caller gives no outlets) that never spills.
  const lakeList = L.list.slice();
  const lakeOf = L.id;
  for (let i = 0; i < n; i++) {
    if (dir[i] === -1) {
      lakeOf[i] = lakeList.length;
      lakeList.push({ cells: Int32Array.of(i), spill: Infinity, pour: i, outCell: -2 });
    }
  }
  const nl = lakeList.length;
  const lakeStart = new Int32Array(nl + 1);
  for (let l = 0; l < nl; l++) lakeStart[l + 1] = lakeStart[l] + lakeList[l].cells.length;
  const lakeCells = new Int32Array(lakeStart[nl]);
  const lakeVspill = new Float64Array(nl);
  const lakePour = new Int32Array(nl);
  const lakeOut = new Int32Array(nl);
  const lakeLvl = new Float64Array(nl);
  for (let l = 0; l < nl; l++) {
    const lk = lakeList[l];
    lakeCells.set(lk.cells, lakeStart[l]);
    lakeVspill[l] = Number.isFinite(lk.spill) ? lakeVolume(lk, z, area, lk.spill) : Infinity;
    lakePour[l] = lk.pour;
    lakeOut[l] = lk.outCell;
    lakeLvl[l] = z[lk.cells[0]];
  }

  const rainFrac = new Float64Array(n);
  const gCap = new Float64Array(n);
  const slope = new Float64Array(n);
  let rainCells = 0;
  for (let i = 0; i < n; i++) {
    if (!(roof.mask && roof.mask[i])) { rainFrac[i] = 1; rainCells++; }
    if (garden && garden.mask[i]) gCap[i] = garden.storageM;
    const d = dir[i];
    const s = d >= 0 ? (z[i] - z[i + off[d]]) / (DIST[d] * cell) : 0;
    slope[i] = s > 0.005 ? s : 0.005;
  }

  // One fixed-shape state object (see header note).
  const S = {
    n, area, z, dir, order, off,
    imperv: p.imperv || new Uint8Array(n),
    gaA: (soil.psiMm / 1000) * (1 - Se) * soil.thetaE, // m
    gaK: soil.kMmH / 1000 / 3600, // m/s
    roofArea: roof.areaM2 > 0 ? roof.areaM2 : 0,
    roofCell: roof.cell | 0,
    rainCells,
    rainFrac, gCap, slope,
    F: new Float64Array(n), // cumulative native infiltration, m
    gStore: new Float64Array(n), // garden storage held, m
    inflow: new Float64Array(n), // m3 arriving from upstream this step
    qPass: new Float64Array(n), // m3 leaving the cell downstream last step
    stamp: new Int32Array(n), // step id when the cell last infiltrated
    lakeOf, lakeStart, lakeCells, lakeVspill, lakePour, lakeOut, lakeLvl,
    lakeV: new Float64Array(nl),
    lakeIn: new Float64Array(nl),
    rainV: 0, roofV: 0, infV: 0, outV: 0, // ledger, m3
    stepId: 0,
    lastDt: 1,
  };
  const ledger = { rainL: 0, roofL: 0, infiltratedL: 0, outL: 0, storedL: 0 };

  const sim = {
    ledger,
    time: 0,
    nx, ny, cell,
    lakeCount: L.list.length,
    /** Cumulative infiltration per cell (m), read-only view for overlays. */
    infiltrationM: S.F,

    /** Advance one step with rainMm of rain (depth over the step) lasting dtS. */
    step(rainMm, dtS) {
      stepSim(S, rainMm, dtS);
      sim.time += dtS;
      ledger.rainL = S.rainV * 1000;
      ledger.roofL = S.roofV * 1000;
      ledger.infiltratedL = S.infV * 1000;
      ledger.outL = S.outV * 1000;
      ledger.storedL = stored(S) * 1000;
    },

    /** |in - (infiltrated + out + stored)| / max(in, 1e-9). */
    closure() {
      const inV = S.rainV + S.roofV;
      return Math.abs(inV - (S.infV + S.outV + stored(S))) / Math.max(inV, 1e-9);
    },

    /** Display depth (m): ponded depth on lakes + Manning sheet-flow depth elsewhere. */
    depth(out) {
      const { qPass } = S;
      for (let i = 0; i < n; i++) {
        const l = lakeOf[i];
        let h = 0;
        if (l >= 0) {
          const d = lakeLvl[l] - z[i];
          if (d > 0) h = d;
        }
        const q = qPass[i];
        if (q > 0) {
          const qw = q / S.lastDt / cell; // m2/s per unit width
          h += Math.pow((manningN * qw) / Math.sqrt(slope[i]), 0.6);
        }
        out[i] = h;
      }
      return out;
    },

    /** Surface water held in ponds (m3). */
    pondedM3() {
      return stored(S);
    },
  };
  return sim;
}

/**
 * Run a storm (rain per step, mm) then a dry tail.
 * @param {ReturnType<typeof createSim>} sim
 * @param {ArrayLike<number>} mmSteps
 * @param {number} stepS
 * @param {{tailH?:number, frameEveryS?:number, onFrame?:Function, frames?:boolean, earlyExit?:boolean}} [opts]
 * @returns {{ledger:object, drainH:number, drained:boolean, peakStoredL:number, frames?:Array}}
 *   drainH: hours after the rain stops until ponds hold < 1 L. If the tail
 *   ends first it is extrapolated from the last loss rate (drained=false).
 *   drainH is Infinity (drained=false) when ponds are not losing water at the
 *   end of the run: water held on impervious ground, a no-outlet sink on
 *   impervious cells, or tailH 0 with a pond still standing. Callers must
 *   treat Infinity as a valid "never drains" answer, not an error.
 */
export function runStorm(sim, mmSteps, stepS, opts = {}) {
  const tailH = opts.tailH ?? 48;
  const frameEveryS = opts.frameEveryS ?? 900;
  const onFrame = opts.onFrame;
  const collect = opts.frames === true;
  const earlyExit = opts.earlyExit ?? true;
  const n = sim.nx * sim.ny;
  const frames = collect ? [] : undefined;
  const DRY_M3 = 0.001;

  let peak = 0;
  let nextFrame = sim.time + frameEveryS;
  const emit = () => {
    while (sim.time >= nextFrame - 1e-6) {
      if (onFrame || collect) {
        const depth = sim.depth(new Float32Array(n));
        const f = { t: sim.time, depth };
        if (onFrame) onFrame(f);
        if (collect) frames.push(f);
      }
      nextFrame += frameEveryS;
    }
  };

  for (let k = 0; k < mmSteps.length; k++) {
    sim.step(mmSteps[k], stepS);
    const s = sim.pondedM3();
    if (s > peak) peak = s;
    emit();
  }
  const rainEnd = sim.time;
  const tailSteps = Math.ceil((tailH * 3600) / stepS - 1e-9);
  let drainAt = sim.pondedM3() < DRY_M3 ? rainEnd : -1;
  let prev = sim.pondedM3();
  let lossRate = 0;
  for (let k = 0; k < tailSteps; k++) {
    sim.step(0, stepS);
    const s = sim.pondedM3();
    if (s > peak) peak = s;
    lossRate = (prev - s) / stepS;
    prev = s;
    if (drainAt < 0 && s < DRY_M3) drainAt = sim.time;
    emit();
    // Once ponds are empty to a microlitre nothing visible changes; the
    // ledger still closes because what remains is counted as stored.
    if (earlyExit && drainAt >= 0 && s < 1e-9) break;
  }
  let drainH;
  let drained = true;
  if (drainAt >= 0) drainH = (drainAt - rainEnd) / 3600;
  else {
    drained = false;
    const rem = sim.pondedM3();
    drainH = lossRate > 0 ? (sim.time - rainEnd + (rem - DRY_M3) / lossRate) / 3600 : Infinity;
  }
  const res = { ledger: { ...sim.ledger }, drainH, drained, peakStoredL: peak * 1000 };
  if (collect) res.frames = frames;
  return res;
}
