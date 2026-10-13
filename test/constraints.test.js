import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forbiddenMask, gardenCells, applyGarden } from '../src/garden/constraints.js';

function flat(nx, ny, cell, f = () => 0) {
  const z = new Float64Array(nx * ny);
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) z[y * nx + x] = f((x + 0.5) * cell, (y + 0.5) * cell);
  return { nx, ny, cell, z };
}
// cell index whose centre is nearest (px, py) metres
const at = (t, px, py) => Math.floor(py / t.cell) * t.nx + Math.floor(px / t.cell);

const YARD = [[0, 0], [20, 0], [20, 20], [0, 20]];
const WALL = [[0, 0], [20, 0]];

test('forbidden mask covers 3 m band from the wall', () => {
  const t = flat(40, 40, 0.5);
  const m = forbiddenMask(t, { yard: YARD, wall: WALL, septic: null });
  assert.equal(m[at(t, 10, 2.75)], 1);
  assert.equal(m[at(t, 10, 0.25)], 1);
  assert.equal(m[at(t, 10, 3.25)], 0);
  const m5 = forbiddenMask(t, { yard: YARD, wall: WALL, septic: null, minWallM: 5 });
  assert.equal(m5[at(t, 10, 4.75)], 1);
  assert.equal(m5[at(t, 10, 5.25)], 0);
});

test('cells outside the yard polygon are forbidden', () => {
  const t = flat(40, 40, 0.5);
  const m = forbiddenMask(t, { yard: [[0, 0], [10, 0], [10, 20], [0, 20]], wall: WALL, septic: null });
  assert.equal(m[at(t, 15, 10)], 1);
  assert.equal(m[at(t, 5, 10)], 0);
});

test('cells within 0.5 m of the yard boundary (fence) are forbidden', () => {
  const t = flat(40, 40, 0.5);
  const m = forbiddenMask(t, { yard: YARD, wall: WALL, septic: null });
  assert.equal(m[at(t, 0.25, 10)], 1);
  assert.equal(m[at(t, 0.75, 10)], 0);
  assert.equal(m[at(t, 19.75, 10)], 1);
  assert.equal(m[at(t, 10, 19.75)], 1);
});

test('septic polygon + buffer is forbidden (WSU 10 ft downhill / level)', () => {
  const t = flat(40, 40, 0.5);
  const septic = [[10, 10], [12, 10], [12, 12], [10, 12]];
  const m = forbiddenMask(t, { yard: YARD, wall: WALL, septic });
  assert.equal(m[at(t, 11, 11)], 1); // over the tank/field
  assert.equal(m[at(t, 14.75, 11)], 1); // 2.75 m away
  assert.equal(m[at(t, 15.25, 11)], 0); // 3.25 m away > 3.048 m
});

test('septic uphill buffer is 50 ft (WSU) where the cell is above the septic system', () => {
  // z falls with y: smaller y is uphill.
  const t = flat(40, 40, 0.5, (x, y) => -0.1 * y);
  const septic = [[10, 14], [12, 14], [12, 16], [10, 16]];
  const m = forbiddenMask(t, { yard: YARD, wall: WALL, septic });
  assert.equal(m[at(t, 11, 9.25)], 1); // 4.75 m uphill -> forbidden
  const t2 = flat(40, 80, 0.5, (x, y) => -0.1 * y);
  const m2 = forbiddenMask(t2, { yard: [[0, 0], [20, 0], [20, 40], [0, 40]], wall: WALL, septic });
  assert.equal(m2[at(t2, 11, 20.75)], 0); // 4.75 m downhill -> allowed
  assert.equal(m2[at(t2, 11, 18.75)], 1); // 2.75 m downhill -> forbidden
});

test('septic covering the yard forbids every cell', () => {
  const t = flat(20, 20, 0.5);
  const m = forbiddenMask(t, { yard: [[0, 0], [10, 0], [10, 10], [0, 10]], wall: [[0, 0], [10, 0]], septic: [[1, 1], [9, 1], [9, 9], [1, 9]] });
  assert.ok(m.every((v) => v === 1));
});

test('gardenCells is an ellipse honouring rotation', () => {
  const t = flat(40, 40, 0.5);
  const g = { cx: 10, cy: 10, lenM: 6, widM: 2, rot: 0, depthM: 0.15, bermM: 0.15 };
  const m = gardenCells(t, g);
  assert.equal(m[at(t, 12.6, 10)], 1);
  assert.equal(m[at(t, 10, 11.6)], 0);
  const r = gardenCells(t, { ...g, rot: Math.PI / 2 });
  assert.equal(r[at(t, 12.6, 10)], 0);
  assert.equal(r[at(t, 10, 12.6)], 1);
  let n = 0;
  for (const v of m) n += v;
  assert.ok(Math.abs(n * 0.25 - Math.PI * 3 * 1) < 1.5);
});

test('applyGarden floor is level and below the rim; berm raised; input untouched', () => {
  const t = flat(40, 40, 0.5, (x, y) => 0.05 * x + 0.02 * y);
  const before = Float64Array.from(t.z);
  const g = { cx: 10, cy: 10, lenM: 6, widM: 3, rot: 0.3, depthM: 0.15, bermM: 0.15 };
  const { terrain, mask, bermMask, floorZ } = applyGarden(t, g);
  assert.deepEqual(t.z, before);
  assert.notEqual(terrain.z, t.z);
  const inner = gardenCells(t, g);
  assert.deepEqual(mask, inner);
  // rim = garden cells with a 4-neighbour outside the garden
  let rimMin = Infinity;
  for (let y = 0; y < t.ny; y++) for (let x = 0; x < t.nx; x++) {
    const i = y * t.nx + x;
    if (!mask[i]) continue;
    const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !mask[(y + dy) * t.nx + x + dx]);
    if (edge) rimMin = Math.min(rimMin, t.z[i]);
  }
  assert.ok(Math.abs(floorZ - (rimMin - 0.15)) < 1e-12);
  let nb = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) assert.equal(terrain.z[i], floorZ);
    else if (bermMask[i]) {
      nb++;
      assert.ok(terrain.z[i] >= floorZ + 0.15 + 0.15 - 1e-12);
      assert.ok(terrain.z[i] >= t.z[i]);
    } else assert.equal(terrain.z[i], t.z[i]);
    assert.ok(!(mask[i] && bermMask[i]));
  }
  assert.ok(nb > 0);
  // berm ring at most ~0.6 m (+ half a cell) outside the ellipse
  assert.equal(bermMask[at(t, 10 + 3 * Math.cos(0.3) + 1.2 * Math.cos(0.3), 10 + 3 * Math.sin(0.3) + 1.2 * Math.sin(0.3))], 0);
});

test('applyGarden with a garden off the grid returns an unchanged copy and empty mask', () => {
  const t = flat(10, 10, 0.5);
  const { terrain, mask } = applyGarden(t, { cx: 50, cy: 50, lenM: 2, widM: 1, rot: 0, depthM: 0.15, bermM: 0.1 });
  assert.deepEqual(terrain.z, t.z);
  assert.ok(mask.every((v) => v === 0));
});
