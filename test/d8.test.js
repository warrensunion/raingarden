import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIRS, coarsen } from '../src/sim/grid.js';
import { d8, accumulate } from '../src/sim/d8.js';

function make(nx, ny, cell, f) {
  const z = new Float64Array(nx * ny);
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) z[y * nx + x] = f(x, y);
  return { nx, ny, cell, z };
}

test('DIRS order is E,SE,S,SW,W,NW,N,NE', () => {
  assert.deepEqual(DIRS[0], [1, 0]);
  assert.deepEqual(DIRS[2], [0, 1]);
  assert.equal(DIRS.length, 8);
});

test('tilted plane drains east', () => {
  const t = make(20, 10, 0.5, (x) => -0.02 * x);
  const dir = d8(t);
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 19; x++) assert.equal(dir[y * 20 + x], 0, `(${x},${y})`);
    assert.equal(dir[y * 20 + 19], -2);
  }
  const acc = accumulate(dir, 20, 10);
  let off = 0;
  for (let y = 0; y < 10; y++) {
    assert.equal(acc[y * 20 + 19], 20);
    off += acc[y * 20 + 19];
  }
  assert.equal(off, 200);
});

test('bowl drains to centre', () => {
  const t = make(21, 21, 1, (x, y) => (x - 10) ** 2 + (y - 10) ** 2);
  const dir = d8(t, { outlet: new Uint8Array(441) });
  const sinks = [];
  dir.forEach((d, i) => { if (d === -1) sinks.push(i); });
  assert.deepEqual(sinks, [10 * 21 + 10]);
  const acc = accumulate(dir, 21, 21);
  assert.equal(acc[10 * 21 + 10], 441);
});

test('valley', () => {
  const t = make(30, 21, 1, (x, y) => Math.abs(y - 10) * 0.1 - x * 0.01);
  const outlet = new Uint8Array(630);
  for (let y = 0; y < 21; y++) outlet[y * 30 + 29] = 1;
  const dir = d8(t, { outlet });
  const acc = accumulate(dir, 30, 21);
  assert.equal(acc[10 * 30 + 29], 630);
});

test('accumulate with weights sums weights', () => {
  const t = make(5, 1, 1, (x) => -x);
  const dir = d8(t);
  const w = new Float64Array([1, 2, 3, 4, 5]);
  const acc = accumulate(dir, 5, 1, w);
  assert.equal(acc[4], 15);
  assert.equal(acc[0], 1);
});

test('coarsen block-averages z and scales cell', () => {
  const t = { nx: 4, ny: 2, cell: 0.5, z: new Float64Array([1, 3, 5, 7, 3, 5, 7, 9]) };
  const c = coarsen(t, 2);
  assert.equal(c.nx, 2);
  assert.equal(c.ny, 1);
  assert.equal(c.cell, 1);
  assert.deepEqual([...c.z], [3, 7]);
});

test('coarsen with partial blocks averages what exists', () => {
  const t = { nx: 3, ny: 3, cell: 1, z: new Float64Array([0, 0, 9, 0, 0, 9, 6, 6, 3]) };
  const c = coarsen(t, 2);
  assert.equal(c.nx, 2);
  assert.equal(c.ny, 2);
  assert.deepEqual([...c.z], [0, 9, 6, 3]);
});
