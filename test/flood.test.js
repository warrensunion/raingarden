import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIRS } from '../src/sim/grid.js';
import { priorityFlood, lakes, lakeLevel, lakeVolume } from '../src/sim/flood.js';

function make(nx, ny, cell, f) {
  const z = new Float64Array(nx * ny);
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) z[y * nx + x] = f(x, y);
  return { nx, ny, cell, z };
}

function reachesOutlet(dir, nx, n, start) {
  let i = start;
  for (let k = 0; k <= n; k++) {
    if (dir[i] === -2) return true;
    if (dir[i] < 0) return false;
    const [dx, dy] = DIRS[dir[i]];
    i = i + dy * nx + dx;
  }
  return false;
}

test('priorityFlood bowl', () => {
  const t = make(21, 21, 1, (x, y) => (x - 10) ** 2 + (y - 10) ** 2);
  const outlet = new Uint8Array(441);
  outlet[10 * 21 + 0] = 1;
  const pf = priorityFlood(t, outlet);
  for (let i = 0; i < 441; i++) {
    assert.ok(pf.zf[i] >= t.z[i]);
    assert.ok(pf.fill[i] >= t.z[i]);
    assert.notEqual(pf.dir[i], -1);
    assert.ok(reachesOutlet(pf.dir, 21, 441, i), `cell ${i}`);
  }
  assert.equal(pf.order[0], 10 * 21);
  assert.equal(pf.order.length, 441);
  const L = lakes(t, pf.fill, pf);
  assert.equal(L.list.length, 1);
  assert.ok(Math.abs(L.list[0].spill - t.z[10 * 21]) <= 1e-5);
  const lk = L.list[0];
  for (let k = 1; k < lk.cells.length; k++) assert.ok(t.z[lk.cells[k]] >= t.z[lk.cells[k - 1]]);
  assert.ok(lk.outCell >= 0 && L.id[lk.outCell] === -1);
  assert.equal(L.id[10 * 21 + 10], 0);
});

test('lakeLevel/Volume round-trip', () => {
  const z = new Float64Array([0.2, 0, 0.1]);
  const lake = { cells: Int32Array.from([1, 2, 0]), spill: 1, outCell: -2 };
  assert.ok(Math.abs(lakeVolume(lake, z, 1, 0.15) - 0.2) < 1e-12);
  assert.ok(Math.abs(lakeLevel(lake, z, 1, 0.2) - 0.15) < 1e-12);
  assert.equal(lakeVolume(lake, z, 1, -1), 0);
  assert.equal(lakeLevel(lake, z, 1, 0), 0);
  // above the highest cell: all three wet
  assert.ok(Math.abs(lakeLevel(lake, z, 2, lakeVolume(lake, z, 2, 0.5)) - 0.5) < 1e-12);
});

test('flat yard', () => {
  const t = make(16, 16, 1, () => 0);
  const outlet = new Uint8Array(256);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (x === 0 || y === 0 || x === 15 || y === 15) outlet[y * 16 + x] = 1;
  }
  const pf = priorityFlood(t, outlet);
  for (let i = 0; i < 256; i++) {
    assert.notEqual(pf.dir[i], -1);
    assert.ok(Number.isFinite(pf.zf[i]));
    assert.ok(reachesOutlet(pf.dir, 16, 256, i));
  }
  // epsilon makes zf strictly drain on the flat
  assert.ok(pf.zf[8 * 16 + 8] > 0);
  assert.equal(lakes(t, pf.fill, pf).list.length, 0);
});

/** Two pits in series: upper (x=4, lip 0.5) spills into lower (x=2, lip 0.3), which drains to the outlet at (0,1). */
const SERIES = [0, 0.3, 0.1, 0.5, 0.4, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4];

test('two pits in series: two lakes, upper spills into lower', () => {
  const t = make(13, 3, 1, (x) => SERIES[x]);
  const outlet = new Uint8Array(39);
  outlet[1 * 13 + 0] = 1;
  const pf = priorityFlood(t, outlet);
  const L = lakes(t, pf.fill, pf);
  assert.equal(L.list.length, 2);
  for (const lk of L.list) assert.ok(Number.isFinite(lk.spill));
  const lower = L.id[1 * 13 + 2];
  const upper = L.id[1 * 13 + 4];
  assert.ok(lower >= 0 && upper >= 0 && lower !== upper);
  assert.ok(Math.abs(L.list[lower].spill - 0.3) < 1e-12);
  assert.ok(Math.abs(L.list[upper].spill - 0.5) < 1e-12);
  // Follow dir from the upper lake's outCell: it must enter the lower lake.
  let i = L.list[upper].outCell;
  let hit = false;
  for (let k = 0; k < 39 && i >= 0; k++) {
    if (L.id[i] === lower) { hit = true; break; }
    const d = pf.dir[i];
    if (d < 0) break;
    i += DIRS[d][1] * 13 + DIRS[d][0];
  }
  assert.ok(hit, 'upper lake spill reaches the lower lake');
  assert.ok(L.list[lower].outCell >= 0 && L.id[L.list[lower].outCell] === -1);
});
