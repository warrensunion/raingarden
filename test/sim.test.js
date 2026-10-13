import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim, runStorm } from '../src/sim/sim.js';
import { SOILS } from '../src/sim/infiltration.js';
import { hyetograph } from '../src/sim/storm.js';
import { edgeMask } from '../src/sim/grid.js';

function make(nx, ny, cell, f) {
  const z = new Float64Array(nx * ny);
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) z[y * nx + x] = f(x, y);
  return { nx, ny, cell, z };
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A smooth random yard: tilt + a few sine bumps + a bowl, 64x64 at 0.25 m. */
function randomYard(seed) {
  const r = rng(seed);
  const waves = Array.from({ length: 5 }, () => ({
    a: 0.02 + 0.06 * r(), kx: 0.05 + 0.2 * r(), ky: 0.05 + 0.2 * r(), p: 6.28 * r(),
  }));
  const tilt = 0.002 + 0.01 * r();
  return make(64, 64, 0.25, (x, y) => {
    let z = -tilt * x;
    for (const w of waves) z += w.a * Math.sin(w.kx * x + w.p) * Math.cos(w.ky * y);
    z -= 0.25 * Math.exp(-((x - 30) ** 2 + (y - 34) ** 2) / 40);
    return z;
  });
}

const allZero = (n) => new Uint8Array(n);

test('conservation within 0.5%', () => {
  for (const seed of [1, 2, 3]) {
    const terrain = randomYard(seed);
    const n = terrain.nx * terrain.ny;
    const mask = new Uint8Array(n);
    for (let y = 31; y < 37; y++) for (let x = 27; x < 33; x++) mask[y * 64 + x] = 1;
    const imperv = new Uint8Array(n);
    for (let y = 0; y < 12; y++) for (let x = 0; x < 16; x++) imperv[y * 64 + x] = 1;
    const sim = createSim({
      terrain, soil: SOILS.loam, imperv, outlet: edgeMask(64, 64),
      roof: { areaM2: 120, cell: 12 * 64 + 16, mask: imperv },
      garden: { mask, storageM: 0.08 },
    });
    const res = runStorm(sim, hyetograph(40, 'IA', 24, 300), 300, { tailH: 48 });
    const L = res.ledger;
    assert.ok(sim.closure() < 0.005, `closure ${sim.closure()}`);
    assert.ok(sim.closure() < 1e-9, `target closure ${sim.closure()}`);
    assert.ok(L.rainL > 0 && L.roofL > 0 && L.infiltratedL > 0);
    for (const v of Object.values(L)) assert.ok(Number.isFinite(v) && v >= 0);
    const d = new Float32Array(n);
    sim.depth(d);
    for (const v of d) assert.ok(Number.isFinite(v) && v >= 0);
  }
});

test('impervious plane sends everything out', () => {
  const terrain = make(20, 10, 0.5, (x) => -0.02 * x);
  const n = 200;
  const sim = createSim({
    terrain, soil: SOILS.loam, imperv: new Uint8Array(n).fill(1), outlet: edgeMask(20, 10),
    roof: { areaM2: 0, cell: 0 }, garden: null,
  });
  const res = runStorm(sim, hyetograph(10, 'uniform', 1, 300), 300, { tailH: 1 });
  assert.ok(Math.abs(res.ledger.outL - res.ledger.rainL) / res.ledger.rainL < 1e-6);
  assert.ok(Math.abs(res.ledger.rainL - 10 * 200 * 0.25) < 1e-9);
  assert.equal(res.ledger.infiltratedL, 0);
});

test('sand swallows a small storm', () => {
  const terrain = make(16, 16, 0.5, () => 0);
  const sim = createSim({
    terrain, soil: SOILS.sand, imperv: allZero(256), outlet: edgeMask(16, 16),
    roof: { areaM2: 0, cell: 0 }, garden: null,
  });
  const res = runStorm(sim, hyetograph(5, 'uniform', 1, 300), 300, { tailH: 1 });
  assert.equal(res.ledger.outL, 0);
  assert.ok(Math.abs(res.ledger.infiltratedL - res.ledger.rainL) < 1e-9);
});

test('garden captures roof runoff', () => {
  const run = (withGarden) => {
    const terrain = make(24, 16, 0.5, (x) => -0.03 * x);
    const n = 24 * 16;
    const roofCell = 8 * 24 + 4;
    let garden = null;
    if (withGarden) {
      const mask = new Uint8Array(n);
      for (let y = 7; y < 9; y++) for (let x = 4; x < 8; x++) mask[y * 24 + x] = 1; // 8 cells = 2 m2
      for (let i = 0; i < n; i++) if (mask[i]) terrain.z[i] -= 0.2;
      garden = { mask, storageM: 0.1 };
    }
    const sim = createSim({
      terrain, soil: SOILS.loam, imperv: allZero(n), outlet: edgeMask(24, 16),
      roof: { areaM2: 60, cell: roofCell }, garden,
    });
    const res = runStorm(sim, hyetograph(25, 'IA', 24, 300), 300, { tailH: 24 });
    assert.ok(sim.closure() < 1e-9);
    return res.ledger.outL;
  };
  const before = run(false);
  const after = run(true);
  assert.ok(after < before, `after ${after} before ${before}`);
});

test('zero rain', () => {
  const sim = createSim({
    terrain: randomYard(7), soil: SOILS.clay, imperv: allZero(4096), outlet: edgeMask(64, 64),
    roof: { areaM2: 100, cell: 100 }, garden: null,
  });
  const res = runStorm(sim, new Float64Array(288), 300, { tailH: 2 });
  for (const v of Object.values(res.ledger)) assert.equal(v, 0);
  assert.equal(sim.closure(), 0);
  assert.equal(res.drainH, 0);
  assert.equal(res.peakStoredL, 0);
});

test('drainH', () => {
  const terrain = make(21, 21, 0.5, (x, y) => 0.01 * ((x - 10) ** 2 + (y - 10) ** 2));
  const sim = createSim({
    terrain, soil: SOILS.clay, imperv: allZero(441), outlet: edgeMask(21, 21),
    roof: { areaM2: 0, cell: 0 }, garden: null,
  });
  // Clay (K 0.3 mm/h) cannot empty this bowl in 48 h: drainH is then
  // extrapolated from the last loss rate and flagged drained: false.
  const res = runStorm(sim, hyetograph(40, 'II', 24, 300), 300, { tailH: 48 });
  assert.ok(res.peakStoredL > 0);
  assert.equal(res.drained, false);
  assert.ok(res.drainH > 48 && Number.isFinite(res.drainH), `drainH ${res.drainH}`);
  assert.ok(sim.closure() < 1e-9);
});

test('drainH: a loam bowl really drains inside the tail', () => {
  const terrain = make(21, 21, 0.5, (x, y) => 0.01 * ((x - 10) ** 2 + (y - 10) ** 2));
  const sim = createSim({
    terrain, soil: SOILS.loam, imperv: allZero(441), outlet: edgeMask(21, 21),
    roof: { areaM2: 50, cell: 220 }, garden: null,
  });
  const res = runStorm(sim, hyetograph(40, 'IA', 24, 300), 300, { tailH: 72 });
  assert.equal(res.drained, true);
  assert.ok(res.drainH > 0 && res.drainH <= 72, `drainH ${res.drainH}`);
});

test('drainH is Infinity when a pond can never drain (impervious, no outlet)', () => {
  const terrain = make(8, 8, 1, (x, y) => 0.01 * (x + y));
  const sim = createSim({
    terrain, soil: SOILS.loam, imperv: new Uint8Array(64).fill(1), outlet: allZero(64),
    roof: { areaM2: 0, cell: 0 }, garden: null,
  });
  const res = runStorm(sim, hyetograph(10, 'uniform', 1, 300), 300, { tailH: 1 });
  assert.equal(res.drained, false);
  assert.equal(res.drainH, Infinity);
  assert.ok(sim.closure() < 1e-12);
});

test('a garden in a hollow drains its store into native soil once the hollow is dry', () => {
  // One-cell pit (2 cm) on a gentle loam slope, with a deep amended layer.
  const terrain = make(9, 9, 0.5, (x) => -0.01 * x);
  const g = 4 * 9 + 4;
  terrain.z[g] -= 0.02;
  const mask = new Uint8Array(81);
  mask[g] = 1;
  const sim = createSim({
    terrain, soil: SOILS.clay, imperv: allZero(81), outlet: edgeMask(9, 9),
    roof: { areaM2: 4, cell: g }, garden: { mask, storageM: 0.3 },
  });
  assert.ok(sim.lakeCount >= 1);
  for (const mm of hyetograph(20, 'uniform', 2, 300)) sim.step(mm, 300);
  let k = 0;
  while (sim.pondedM3() > 0 && k++ < 2000) sim.step(0, 300);
  assert.equal(sim.pondedM3(), 0, 'pit dried');
  const F0 = sim.infiltrationM[g];
  for (let s = 0; s < 72; s++) sim.step(0, 300);
  assert.ok(sim.infiltrationM[g] > F0 + 1e-5, `F ${F0} -> ${sim.infiltrationM[g]}`);
  assert.ok(sim.closure() < 1e-9);
});

test('two lakes in series on impervious ground hold exactly both lip volumes', () => {
  const SERIES = [0, 0.3, 0.1, 0.5, 0.4, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4];
  const terrain = make(13, 3, 1, (x) => SERIES[x]);
  const outlet = allZero(39);
  outlet[1 * 13 + 0] = 1;
  const sim = createSim({
    terrain, soil: SOILS.loam, imperv: new Uint8Array(39).fill(1), outlet,
    roof: { areaM2: 0, cell: 0 }, garden: null,
  });
  assert.equal(sim.lakeCount, 2);
  const res = runStorm(sim, hyetograph(100, 'uniform', 1, 300), 300, { tailH: 0 });
  // lower: 3 cells x 0.2 m; upper: 3 cells x 0.1 m (cell area 1 m2)
  assert.ok(Math.abs(res.ledger.storedL - 900) < 1e-6, `stored ${res.ledger.storedL}`);
  assert.ok(Math.abs(res.ledger.outL - (res.ledger.rainL - 900)) < 1e-6);
  assert.equal(res.ledger.infiltratedL, 0);
  assert.ok(sim.closure() < 1e-12);
});

test('roof.cell out of range throws RangeError', () => {
  const terrain = make(4, 4, 1, () => 0);
  for (const cell of [-1, 16, 2.5]) {
    assert.throws(() => createSim({
      terrain, soil: SOILS.loam, outlet: edgeMask(4, 4), roof: { areaM2: 10, cell },
    }), RangeError);
  }
});

test('flat yard: no NaN, water leaves or ponds, closure holds', () => {
  const terrain = make(16, 16, 0.5, () => 0);
  const sim = createSim({
    terrain, soil: SOILS.clay, imperv: allZero(256), outlet: edgeMask(16, 16),
    roof: { areaM2: 30, cell: 8 * 16 + 8 }, garden: null,
  });
  const res = runStorm(sim, hyetograph(30, 'II', 24, 300), 300, { tailH: 6 });
  assert.ok(res.ledger.outL > 0);
  for (const v of Object.values(res.ledger)) assert.ok(Number.isFinite(v));
  assert.ok(sim.closure() < 1e-9);
});

test('no outlets at all: water ponds, closure holds', () => {
  const terrain = make(12, 12, 0.5, (x, y) => 0.01 * (x + y));
  const sim = createSim({
    terrain, soil: SOILS.clay, imperv: allZero(144), outlet: allZero(144),
    roof: { areaM2: 0, cell: 0 }, garden: null,
  });
  const res = runStorm(sim, hyetograph(30, 'uniform', 2, 300), 300, { tailH: 1 });
  assert.equal(res.ledger.outL, 0);
  assert.ok(res.ledger.storedL > 0);
  assert.ok(sim.closure() < 1e-9);
});

test('frames are emitted every frameEveryS', () => {
  const terrain = make(8, 8, 1, (x) => -0.01 * x);
  const sim = createSim({
    terrain, soil: SOILS.clay, imperv: allZero(64), outlet: edgeMask(8, 8),
    roof: { areaM2: 0, cell: 0 }, garden: null,
  });
  const seen = [];
  const res = runStorm(sim, hyetograph(10, 'uniform', 1, 300), 300, {
    tailH: 0, frameEveryS: 900, onFrame: (f) => seen.push(f.t), frames: true,
  });
  assert.deepEqual(seen, [900, 1800, 2700, 3600]);
  assert.equal(res.frames.length, 4);
  assert.ok(res.frames[0].depth instanceof Float32Array);
});
