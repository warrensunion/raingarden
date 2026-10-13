import test from 'node:test';
import assert from 'node:assert/strict';
import { manualTerrain, meanSlope } from '../src/depth/manualTerrain.js';

const at = (t, x, y) => t.z[Math.floor(y / t.cell) * t.nx + Math.floor(x / t.cell)];

test('gentle preset has a mean slope of 2% +/- 0.1', () => {
  const t = manualTerrain({ widthM: 12, depthM: 9, preset: 'gentle', dir: [1, 1], pins: [], n: 96 });
  assert.equal(t.z.length, t.nx * t.ny);
  assert.ok(Math.abs(meanSlope(t) * 100 - 2) <= 0.1, `mean slope ${meanSlope(t) * 100}%`);
});

test('steep is 8%, flat is 0%, and the terrain falls along dir', () => {
  const steep = manualTerrain({ widthM: 10, depthM: 10, preset: 'steep', dir: [0, 1], n: 64 });
  assert.ok(Math.abs(meanSlope(steep) * 100 - 8) <= 0.1);
  // dir = downhill direction (downspout -> outlet): +y is lower
  assert.ok(at(steep, 5, 1) > at(steep, 5, 9));
  assert.ok(Math.abs(at(steep, 5, 1) - at(steep, 5, 9) - 0.08 * 8) < 0.02);
  const flat = manualTerrain({ widthM: 10, depthM: 6, preset: 'flat', dir: [1, 0], n: 64 });
  assert.equal(meanSlope(flat), 0);
});

test('grid shape follows the yard size, cell in metres, heights >= 0', () => {
  const t = manualTerrain({ widthM: 20, depthM: 10, preset: 'gentle', dir: [1, 0], n: 128 });
  assert.equal(t.nx, 128);
  assert.equal(t.ny, 64);
  assert.ok(Math.abs(t.cell - 20 / 128) < 1e-12);
  let min = Infinity;
  for (const v of t.z) min = Math.min(min, v);
  assert.ok(Math.abs(min) < 1e-9);
});

test('pins pull the surface to their height (thin-plate RBF), corners keep the preset', () => {
  const base = manualTerrain({ widthM: 10, depthM: 10, preset: 'gentle', dir: [1, 0], n: 50 });
  const zPin = at(base, 5.1, 5.1) + 0.3;
  const t = manualTerrain({ widthM: 10, depthM: 10, preset: 'gentle', dir: [1, 0], n: 50, pins: [{ x: 5.1, y: 5.1, h: zPin }] });
  assert.ok(Math.abs(at(t, 5.1, 5.1) - zPin) < 0.02, `pin ${at(t, 5.1, 5.1)} vs ${zPin}`);
  // far corners stay near the preset plane (relative to the plane, offset-free)
  const d0 = at(t, 0.1, 0.1) - at(base, 0.1, 0.1);
  const d1 = at(t, 9.9, 9.9) - at(base, 9.9, 9.9);
  assert.ok(Math.abs(d0 - d1) < 0.02);
  for (const v of t.z) assert.ok(Number.isFinite(v));
});

test('degenerate input stays finite', () => {
  const t = manualTerrain({ widthM: 0, depthM: NaN, preset: 'nope', dir: [0, 0], n: 0, pins: [{ x: 1, y: 1, h: NaN }] });
  assert.ok(t.nx >= 2 && t.ny >= 2 && t.cell > 0);
  for (const v of t.z) assert.ok(Number.isFinite(v));
});
