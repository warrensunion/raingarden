import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../src/sim/worker.js';
import { edgeMask } from '../src/sim/grid.js';

function plane() {
  const nx = 10, ny = 8, z = new Float64Array(nx * ny);
  for (let i = 0; i < z.length; i++) z[i] = -0.02 * (i % nx);
  return { nx, ny, cell: 0.5, z };
}

test('run posts frames (transferable) then done', () => {
  const msgs = [];
  handle({
    type: 'run', id: 7,
    params: {
      terrain: plane(), soil: 'clay', outlet: edgeMask(10, 8),
      roof: { areaM2: 20, cell: 12 }, garden: null,
      storm: { totalMm: 20, shape: 'uniform', durationH: 1 }, stepS: 300, tailH: 1, frameEveryS: 900,
    },
  }, (m, transfer) => msgs.push({ m, transfer }));
  const frames = msgs.filter((x) => x.m.type === 'frame');
  const done = msgs.filter((x) => x.m.type === 'done');
  assert.ok(frames.length >= 4);
  assert.equal(frames[0].m.id, 7);
  assert.ok(frames[0].m.depth instanceof Float32Array);
  assert.deepEqual(frames[0].transfer, [frames[0].m.depth.buffer]);
  assert.equal(done.length, 1);
  assert.equal(msgs[msgs.length - 1].m.type, 'done');
  const r = done[0].m.result;
  assert.ok(Math.abs(r.ledger.rainL - 20 * 80 * 0.25) < 1e-6);
  assert.ok(r.closure < 1e-9);
});

test('run accepts explicit mmSteps and a soil object', () => {
  const msgs = [];
  handle({
    type: 'run', id: 1,
    params: {
      terrain: plane(), soil: { psiMm: 88.9, kMmH: 3.4, thetaE: 0.434 }, outlet: edgeMask(10, 8),
      mmSteps: [1, 2, 3], stepS: 300, tailH: 0,
    },
  }, (m) => msgs.push(m));
  const done = msgs.find((m) => m.type === 'done');
  assert.ok(Math.abs(done.result.ledger.rainL - 6 * 80 * 0.25) < 1e-9);
});

test('bad params post an error instead of throwing', () => {
  const msgs = [];
  handle({ type: 'run', id: 2, params: { soil: 'mud' } }, (m) => msgs.push(m));
  assert.equal(msgs[0].type, 'error');
  assert.equal(msgs[0].id, 2);
});

function valley() {
  const nx = 24, ny = 24, cell = 0.5, z = new Float64Array(nx * ny);
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) z[y * nx + x] = -0.04 * y * cell + 0.02 * Math.abs(x - 12) * cell;
  const imperv = new Uint8Array(nx * ny);
  for (let x = 0; x < nx; x++) imperv[x] = 1;
  const forbidden = new Uint8Array(nx * ny);
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) if (y < 7 || x < 1 || y > 22 || x > 22) forbidden[y * nx + x] = 1;
  return {
    terrain: { nx, ny, cell, z }, forbidden, soil: 'loam', imperv, outlet: edgeMask(nx, ny),
    roof: { areaM2: 60, cell: nx + 12, mask: imperv },
    storm: { totalMm: 30, shape: 'IA', durationH: 24 }, stepS: 300,
    limits: { maxAreaM2: 6, budget: 1500 }, prior: { areaM2: 3 }, iters: 8, seed: 1,
  };
}

test('optimize posts throttled tries (nothing transferred) then done', () => {
  // frozen clock: only the first try gets through the 20/s throttle
  const msgs = [];
  handle({ type: 'optimize', id: 9, params: valley() }, (m, transfer) => msgs.push({ m, transfer }), () => 1000);
  const tries = msgs.filter((x) => x.m.type === 'try');
  assert.equal(tries.length, 1);
  assert.equal(tries[0].m.id, 9);
  assert.ok(!tries[0].transfer || tries[0].transfer.length === 0);
  assert.ok(tries[0].m.garden && Number.isFinite(tries[0].m.outAfterL));
  const last = msgs[msgs.length - 1].m;
  assert.equal(last.type, 'done');
  assert.equal(last.id, 9);
  assert.equal(last.result.ok, true);
  assert.ok(last.result.capturedL > 0);
  assert.equal(last.result.tries, 9);
});

test('optimize posts every try when the clock moves >= 50 ms between them', () => {
  let t = 0;
  const msgs = [];
  handle({ type: 'optimize', id: 4, params: valley() }, (m) => msgs.push(m), () => (t += 60));
  const done = msgs.find((m) => m.type === 'done');
  assert.equal(msgs.filter((m) => m.type === 'try').length, done.result.tries);
});

test('optimize with bad params posts an error', () => {
  const msgs = [];
  handle({ type: 'optimize', id: 3, params: {} }, (m) => msgs.push(m));
  assert.equal(msgs[0].type, 'error');
  assert.equal(msgs[0].id, 3);
});
