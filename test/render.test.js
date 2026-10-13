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
