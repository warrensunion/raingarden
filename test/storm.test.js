import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TYPE_IA, TYPE_II, hyetograph, fromHourly } from '../src/sim/storm.js';

const sum = (a) => a.reduce((s, v) => s + v, 0);

test('cumulative tables are 25 monotone fractions 0..1', () => {
  for (const t of [TYPE_IA, TYPE_II]) {
    assert.equal(t.length, 25);
    assert.equal(t[0], 0);
    assert.equal(t[24], 1);
    for (let k = 1; k < 25; k++) assert.ok(t[k] >= t[k - 1]);
  }
});

test('hyetograph sums', () => {
  for (const shape of ['IA', 'II', 'uniform']) {
    const h = hyetograph(40, shape, 24, 300);
    assert.equal(h.length, 288);
    assert.ok(Math.abs(sum(h) - 40) < 1e-9, `${shape}: ${sum(h)}`);
  }
});

test('IA peak step lies in hours 7-9; II peak near hour 12', () => {
  const ia = hyetograph(40, 'IA', 24, 300);
  let k = 0;
  for (let i = 1; i < ia.length; i++) if (ia[i] > ia[k]) k = i;
  const tH = (k * 300) / 3600;
  assert.ok(tH >= 7 && tH < 9, `IA peak at ${tH} h`);
  const ii = hyetograph(40, 'II', 24, 300);
  k = 0;
  for (let i = 1; i < ii.length; i++) if (ii[i] > ii[k]) k = i;
  assert.ok(Math.abs((k * 300) / 3600 - 11.5) <= 0.5);
});

test('hyetograph scales a 24 h shape onto another duration', () => {
  const h = hyetograph(10, 'II', 6, 600);
  assert.equal(h.length, 36);
  assert.ok(Math.abs(sum(h) - 10) < 1e-9);
});

test('hyetograph with steps not dividing the duration still sums', () => {
  const h = hyetograph(25, 'IA', 24, 7 * 60);
  assert.ok(Math.abs(sum(h) - 25) < 1e-9);
});

test('zero rain gives all zeros', () => {
  const h = hyetograph(0, 'IA', 24, 300);
  assert.equal(sum(h), 0);
});

test('fromHourly spreads each hour uniformly', () => {
  const h = fromHourly([6, 0, 3], 1200);
  assert.deepEqual([...h], [2, 2, 2, 0, 0, 0, 1, 1, 1]);
  const g = fromHourly([1, 2, null, 4], 300);
  assert.equal(g.length, 48);
  assert.ok(Math.abs(sum(g) - 7) < 1e-12);
});
