/**
 * Benchmark: the garden optimizer on a 128x128 yard (64x64 coarse), 24 h
 * NRCS Type IA design storm at 300 s steps, drawdown tail up to 48 h. Why:
 * the optimize step animates live tries on a phone, so one coarse evaluation
 * must stay well under 50 ms and a default 160-iteration run under ~8 s on a
 * desktop; this keeps both numbers measurable.
 * Usage: node scripts/bench-opt.mjs [iters]
 */
import { optimize, evaluateGarden } from '../src/garden/optimizer.js';
import { forbiddenMask } from '../src/garden/constraints.js';
import { edgeMask, coarsen } from '../src/sim/grid.js';
import { hyetograph } from '../src/sim/storm.js';

const N = 128;
const CELL = 0.15;
const W = N * CELL;
const iters = Number(process.argv[2]) || 160;

function yard() {
  const z = new Float64Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      z[y * N + x] = -0.004 * y
        + 0.05 * Math.sin(0.11 * x + 1.3) * Math.cos(0.07 * y)
        + 0.03 * Math.sin(0.23 * y + 0.4)
        - 0.3 * Math.exp(-((x - 70) ** 2 + (y - 80) ** 2) / 120);
    }
  }
  return { nx: N, ny: N, cell: CELL, z };
}

const terrain = yard();
const imperv = new Uint8Array(N * N);
for (let y = 0; y < 20; y++) for (let x = 20; x < 100; x++) imperv[y * N + x] = 1;
const simParams = {
  soil: 'loam', imperv, outlet: edgeMask(N, N),
  roof: { areaM2: 150, cell: 21 * N + 60, mask: imperv },
};
const site = { yard: [[0, 0], [W, 0], [W, W], [0, W]], wall: [[20 * CELL, 20 * CELL], [100 * CELL, 20 * CELL]], septic: null };
const forbidden = forbiddenMask(terrain, site);
const storm = { mm: hyetograph(30, 'IA', 24, 300), stepS: 300 };

// One coarse evaluation (same work as one SA try): coarse yard, garden, sim.
const c = coarsen(terrain, 2);
const cImperv = new Uint8Array(c.nx * c.ny);
for (let y = 0; y < 10; y++) for (let x = 10; x < 50; x++) cImperv[y * c.nx + x] = 1;
const cParams = { soil: 'loam', imperv: cImperv, outlet: edgeMask(c.nx, c.ny), roof: { areaM2: 150, cell: 10 * c.nx + 30, mask: cImperv } };
const g = { cx: 10.5, cy: 11.5, lenM: 2.4, widM: 1.6, rot: 0.3, depthM: 0.12, bermM: 0.05 };
const evals = [];
for (let k = 0; k < 6; k++) {
  const t0 = performance.now();
  const e = evaluateGarden({ terrain: c, simParams: cParams, storm, garden: g });
  // evaluateGarden runs before + after: two sims
  evals.push((performance.now() - t0) / 2);
  if (k === 0) console.log(`coarse eval: captured ${e.capturedL.toFixed(0)} L, drainH ${e.drainH.toFixed(1)} h`);
}
console.log(`one coarse evaluation (64x64, 288 rain steps + tail): best ${Math.min(...evals).toFixed(1)} ms, median ${evals.sort((a, b) => a - b)[3].toFixed(1)} ms`);

const t0 = performance.now();
let tries = 0;
let first = 0;
let last = t0;
const gaps = [];
const r = optimize({
  terrain, forbidden, site, simParams, storm,
  limits: { maxAreaM2: 10, budget: 1500 }, prior: { areaM2: 5 }, iters, seed: 1,
  onTry: () => {
    const now = performance.now();
    if (tries === 0) first = now - t0; else gaps.push(now - last);
    last = now;
    tries++;
  },
});
const end = performance.now();
gaps.sort((a, b) => a - b);
console.log(`optimize ${iters} iters: ${(end - t0).toFixed(0)} ms total, ${tries} evaluations`);
console.log(`  setup + start + first try: ${first.toFixed(0)} ms`);
console.log(`  per SA try as run (64x64, 15-min rain, 30-min tail): median ${gaps[gaps.length >> 1].toFixed(1)} ms, p90 ${gaps[Math.floor(gaps.length * 0.9)].toFixed(1)} ms`);
console.log(`  full-resolution confirmation: ${(end - last).toFixed(0)} ms`);
console.log(JSON.stringify({ ok: r.ok, capturedL: r.capturedL, outBeforeL: r.outBeforeL, drainH: r.drainH, area: r.areaM2, cost: r.cost && r.cost.total }));

// Machine-load yardstick (as in bench-sim): ~100 ms on an idle desktop.
const c0 = performance.now();
let acc = 0;
for (let i = 0; i < 1e8; i++) acc += i * 0.5;
console.log(`calibration 1e8 float adds ${(performance.now() - c0).toFixed(0)} ms (idle desktop ~100 ms)${acc < 0 ? '!' : ''}`);
