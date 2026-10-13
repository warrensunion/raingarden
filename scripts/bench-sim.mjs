/**
 * Benchmark: one 72 h storm (24 h NRCS Type IA + 48 h dry tail, 864
 * five-minute steps) over a 128x128 yard. Why: the optimizer runs many sims
 * and the designer must feel instant, so the sim step has to stay O(n) and
 * allocation-free; this keeps that promise measurable. Target < ~1.5 s in
 * Node on a desktop. Usage: node scripts/bench-sim.mjs [runs]
 */
import { createSim, runStorm } from '../src/sim/sim.js';
import { SOILS } from '../src/sim/infiltration.js';
import { hyetograph } from '../src/sim/storm.js';
import { edgeMask } from '../src/sim/grid.js';

const N = 128;
const runs = Number(process.argv[2]) || 3;

function yard() {
  const z = new Float64Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      z[y * N + x] = -0.004 * x
        + 0.05 * Math.sin(0.11 * x + 1.3) * Math.cos(0.07 * y)
        + 0.03 * Math.sin(0.23 * y + 0.4)
        - 0.3 * Math.exp(-((x - 70) ** 2 + (y - 60) ** 2) / 120);
    }
  }
  return { nx: N, ny: N, cell: 0.15, z };
}

const rain = hyetograph(40, 'IA', 24, 300);
const times = [];
let last;
for (let r = 0; r < runs; r++) {
  const t0 = performance.now();
  const terrain = yard();
  const mask = new Uint8Array(N * N);
  for (let y = 55; y < 66; y++) for (let x = 64; x < 76; x++) mask[y * N + x] = 1;
  const imperv = new Uint8Array(N * N);
  for (let y = 0; y < 30; y++) for (let x = 0; x < 40; x++) imperv[y * N + x] = 1;
  const sim = createSim({
    terrain, soil: SOILS.loam, imperv, outlet: edgeMask(N, N),
    roof: { areaM2: 150, cell: 30 * N + 40, mask: imperv },
    garden: { mask, storageM: 0.08 },
  });
  const t1 = performance.now();
  last = runStorm(sim, rain, 300, { tailH: 48, earlyExit: false });
  const t2 = performance.now();
  times.push({ setup: t1 - t0, run: t2 - t1, closure: sim.closure(), steps: sim.time / 300 });
}
for (const t of times) {
  console.log(`setup ${t.setup.toFixed(1)} ms  run ${t.run.toFixed(1)} ms  steps ${t.steps}  closure ${t.closure.toExponential(2)}`);
}
const best = Math.min(...times.map((t) => t.setup + t.run));
console.log(`best total ${best.toFixed(1)} ms for ${N}x${N} x 864 steps`);
console.log('ledger L', JSON.stringify(last.ledger), 'drainH', last.drainH.toFixed(2));

// Machine-load yardstick: a plain 1e8-iteration float loop is ~100 ms on an
// idle desktop. If it reads far higher, the machine is busy and the numbers
// above are inflated by the same factor.
const c0 = performance.now();
let acc = 0;
for (let i = 0; i < 1e8; i++) acc += i * 0.5;
console.log(`calibration 1e8 float adds ${(performance.now() - c0).toFixed(0)} ms (idle desktop ~100 ms)${acc < 0 ? '!' : ''}`);
