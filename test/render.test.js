// Pure helpers of the yard renderer (no DOM, no WebGL).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { displayDepth, levelPond } from '../src/render/depth-display.js';
import { gardenUniforms, gardenOffset, gardenRim } from '../src/render/garden-shape.js';
import { easeExpoInOut } from '../src/render/camera-rig.js';

test('displayDepth widens a one-cell stream but keeps wet cells exact', () => {
  const nx = 16, ny = 16, n = nx * ny;
  const z = new Float32Array(n);
  const src = new Float32Array(n);
  for (let y = 0; y < ny; y++) src[y * nx + 8] = 0.02;
  const out = displayDepth(src, z, new Float32Array(n), new Float32Array(n), nx, ny);
  assert.equal(out[5 * nx + 8], src[5 * nx + 8]);
  assert.ok(out[5 * nx + 7] > 0.0005 && out[5 * nx + 7] < 0.02);
  assert.equal(out[5 * nx + 2], 0);
});

test('displayDepth never lifts a bank above the nearby water surface', () => {
  const nx = 10, ny = 10, n = nx * ny;
  const z = new Float32Array(n);
  const src = new Float32Array(n);
  for (let i = 0; i < n; i++) z[i] = (i % nx) < 5 ? 0 : 0.5;     // pond floor | high bank
  for (let i = 0; i < n; i++) if ((i % nx) < 5) src[i] = 0.2;
  const out = displayDepth(src, z, new Float32Array(n), new Float32Array(n), nx, ny);
  for (let i = 0; i < n; i++) if ((i % nx) >= 5) assert.equal(out[i], 0);
});

test('levelPond conserves volume and makes a flat surface', () => {
  const ground = new Float32Array([0, -0.1, -0.2, -0.1, 0]);
  const depth = new Float32Array([0.05, 0.05, 0.05, 0.05, 0.05]);
  const idx = Int32Array.from([0, 1, 2, 3, 4]);
  const L = levelPond(depth, idx, ground);
  const vol = depth.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(vol - 0.25) < 1e-4);
  for (let i = 0; i < 5; i++) if (depth[i] > 0) assert.ok(Math.abs(ground[i] + depth[i] - L) < 1e-5);
});

test('garden bowl: full depth at centre, zero far away, berm just outside', () => {
  const u = gardenUniforms({ cx: 5, cy: 5, lenM: 4, widM: 2, rot: 0.3, depthM: 0.2, bermM: 0.1 });
  assert.ok(Math.abs(gardenOffset(u, 5, 5) + 0.2) < 1e-9);
  assert.ok(Math.abs(gardenOffset(u, 20, 20)) < 1e-6);
  assert.ok(gardenRim(u, 5, 5) < 0);
  assert.equal(gardenOffset(gardenUniforms(null), 5, 5), 0);
});

test('easeExpoInOut runs 0 -> 1 monotonically', () => {
  assert.equal(easeExpoInOut(0), 0);
  assert.equal(easeExpoInOut(1), 1);
  assert.ok(Math.abs(easeExpoInOut(0.5) - 0.5) < 1e-9);
  let prev = 0;
  for (let t = 0; t <= 1; t += 0.01) { const e = easeExpoInOut(t); assert.ok(e >= prev); prev = e; }
});

import { gridFrame, marchPick } from '../src/render/grid-coords.js';
import { groundHeight } from '../src/render/garden-shape.js';
import { formOf, seasonScale } from '../src/render/plants.js';

function bumpyTerrain(nx, ny, cell) {
  const z = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) z[j * nx + i] = 0.03 * j * cell + 0.1 * Math.sin(i * 0.3) * Math.cos(j * 0.2);
  return { nx, ny, cell, z };
}

test('cell centres: (i+0.5)·cell, yard spans nx·cell, cellAt inverts center', () => {
  const f = gridFrame({ nx: 32, ny: 20, cell: 0.25 });
  assert.equal(f.W, 8);
  assert.equal(f.D, 5);
  assert.deepEqual(f.center(0, 0), [0.125, 0.125]);
  for (const [i, j] of [[0, 0], [10, 7], [31, 19]]) {
    const [x, y] = f.center(i, j);
    assert.equal(f.cellAt(x, y), j * 32 + i);
  }
});

test('a garden centred on a known cell centre carves that cell deepest', () => {
  const t = bumpyTerrain(40, 40, 0.2);
  t.z.fill(0);
  const f = gridFrame(t);
  const [cx, cy] = f.center(13, 22);
  const u = gardenUniforms({ cx, cy, lenM: 2, widM: 1.4, rot: 0.4, depthM: 0.25, bermM: 0.05 });
  assert.equal(f.cellAt(cx, cy), 22 * 40 + 13);
  assert.ok(Math.abs(groundHeight(t, 0, u, cx, cy) + 0.25) < 1e-9);
  let best = -1;
  let low = Infinity;
  for (let j = 0; j < 40; j++) {
    for (let i = 0; i < 40; i++) {
      const [x, y] = f.center(i, j);
      const hgt = groundHeight(t, 0, u, x, y);
      if (hgt < low - 1e-12) { low = hgt; best = j * 40 + i; }
    }
  }
  assert.equal(best, 22 * 40 + 13);
});

test('marchPick round-trips ground points through a camera ray (bowl-aware)', () => {
  const t = bumpyTerrain(64, 48, 0.15);
  const f = gridFrame(t);
  const u = gardenUniforms({ cx: 4, cy: 3, lenM: 2.5, widM: 1.5, rot: 0.2, depthM: 0.3, bermM: 0.1 });
  const h = (x, y) => groundHeight(t, 0, u, x, y);
  let hMin = Infinity;
  let hMax = -Infinity;
  for (const v of t.z) { hMin = Math.min(hMin, v); hMax = Math.max(hMax, v); }
  const cam = [1, 6, 9];
  for (const [x, y] of [[4, 3], [4.6, 3.2], [1.2, 0.8], [8.9, 6.9], [6, 5]]) {
    const p = f.toWorld(x, y, h(x, y));
    const got = marchPick(f, h, cam, [p[0] - cam[0], p[1] - cam[1], p[2] - cam[2]], hMin - 0.3, hMax + 0.1);
    assert.ok(got, 'hit ' + x + ',' + y);
    assert.ok(Math.hypot(got[0] - x, got[1] - y) < 0.01, `pick ${got} vs ${x},${y}`);
  }
  assert.equal(marchPick(f, h, cam, [0, 1, 0], hMin, hMax), null);
});

test('plant form falls back to the catalogue by id; season scales 0.3..1', () => {
  assert.equal(formOf({ id: 'slough-sedge' }), 'sedge');
  assert.equal(formOf({ id: 'slough-sedge', form: 'shrub' }), 'shrub');
  assert.equal(formOf({ id: 'nope' }), 'perennial');
  assert.equal(seasonScale(0), 0.3);
  assert.equal(seasonScale(1), 1);
});
