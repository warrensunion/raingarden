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

test('optimize is a stub until Task 6', () => {
  const msgs = [];
  handle({ type: 'optimize', id: 3, params: {} }, (m) => msgs.push(m));
  assert.equal(msgs[0].type, 'error');
  assert.match(msgs[0].error, /not implemented/);
});
