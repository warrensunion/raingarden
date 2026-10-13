import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forbiddenMask, gardenCells, applyGarden, ellipseRho } from '../src/garden/constraints.js';

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
  // berm ring is a few cells wide, not unbounded
  assert.equal(bermMask[at(t, 10 + 3 * Math.cos(0.3) + 1.8 * Math.cos(0.3), 10 + 3 * Math.sin(0.3) + 1.8 * Math.sin(0.3))], 0);
});

test('applyGarden with a garden off the grid returns an unchanged copy and empty mask', () => {
  const t = flat(10, 10, 0.5);
  const { terrain, mask } = applyGarden(t, { cx: 50, cy: 50, lenM: 2, widM: 1, rot: 0, depthM: 0.15, bermM: 0.1 });
  assert.deepEqual(terrain.z, t.z);
  assert.ok(mask.every((v) => v === 0));
});

test('berm blocks every 8-neighbour of the garden (D8 cannot leak diagonally) on tilted planes', () => {
  let cases = 0;
  for (const cell of [0.25, 0.5, 1]) {
    for (const [sx, sy] of [[0, 0], [0.05, 0], [0.03, 0.04], [-0.06, 0.02], [0.1, -0.1]]) {
      for (const rot of [0, 0.3, 0.8, 1.3, 2.2]) {
        const n = Math.round(24 / cell);
        const t = flat(n, n, cell, (x, y) => sx * x + sy * y);
        const g = { cx: 12, cy: 12, lenM: 6, widM: 3, rot, depthM: 0.15, bermM: 0.1 };
        const { terrain, mask, floorZ } = applyGarden(t, g);
        for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) {
          const i = y * n + x;
          if (!mask[i]) continue;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const j = i + dy * n + dx;
            if (!mask[j]) assert.ok(terrain.z[j] >= floorZ + g.depthM - 1e-12, `leak at cell ${cell} slope ${sx},${sy} rot ${rot}`);
          }
        }
        cases++;
      }
    }
  }
  assert.equal(cases, 75);
});

test('septic: a cell beside the lower part of a sloped field counts as uphill (min septic z + 0.05 m)', () => {
  const t = flat(40, 40, 0.5, (x, y) => -0.2 * y);
  const septic = [[10, 14], [12, 14], [12, 16], [10, 16]];
  const m = forbiddenMask(t, { yard: YARD, wall: WALL, septic });
  // y = 15.25: z = -3.05, below the field's mean (-3.0) but > min (-3.15) + 0.05; 4.25 m to the side
  assert.equal(m[at(t, 16.25, 15.25)], 1);
  // y = 15.75: z = -3.15 = min septic z -> level, 10 ft buffer only
  assert.equal(m[at(t, 16.25, 15.75)], 0);
});

test('ellipse with a zero or negative axis is a RangeError', () => {
  const t = flat(10, 10, 0.5);
  assert.throws(() => gardenCells(t, { cx: 2, cy: 2, lenM: 0, widM: 1, rot: 0 }), RangeError);
  assert.throws(() => ellipseRho({ cx: 0, cy: 0, lenM: 2, widM: -1, rot: 0 }, 0, 0), RangeError);
});

test('the pond spills at its lip (floor + depth + berm) through one notch; the rest of the crest is higher', async () => {
  const { priorityFlood } = await import('../src/sim/flood.js');
  const { edgeMask } = await import('../src/sim/grid.js');
  const { BERM_CREST_M } = await import('../src/garden/constraints.js');
  for (const [sx, sy] of [[0.04, 0], [0, -0.03], [0.02, 0.03]]) {
    const t = flat(60, 60, 0.25, (x, y) => sx * x + sy * y + 0.02 * Math.cos(x));
    const g = { cx: 7.5, cy: 7.5, lenM: 2.5, widM: 1.6, rot: 0.4, depthM: 0.12, bermM: 0.06 };
    const { terrain, mask, bermMask, floorZ } = applyGarden(t, g);
    const lip = floorZ + g.depthM + g.bermM;
    const { fill } = priorityFlood(terrain, edgeMask(60, 60));
    for (let i = 0; i < mask.length; i++) if (mask[i]) assert.ok(Math.abs(fill[i] - lip) < 1e-9, `pond fills to the lip (slope ${sx},${sy})`);
    let notch = 0;
    for (let i = 0; i < mask.length; i++) {
      if (!bermMask[i]) continue;
      if (Math.abs(terrain.z[i] - lip) < 1e-12) notch++;
      else assert.ok(terrain.z[i] >= lip + BERM_CREST_M - 1e-12);
    }
    assert.ok(notch >= 1 && notch <= 8, `a narrow notch (${notch} cells)`);
  }
});
