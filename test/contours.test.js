import test from 'node:test';
import assert from 'node:assert/strict';
import { contours } from '../src/depth/contours.js';

function plane(nx, ny, cell, f) {
  const z = new Float64Array(nx * ny);
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) z[y * nx + x] = f((x + 0.5) * cell, (y + 0.5) * cell);
  }
  return { nx, ny, cell, z };
}

test('z = x on 10x10 at 1 m gives 9 levels, each a vertical line', () => {
  const t = plane(10, 10, 1, (x) => x);
  const out = contours(t, 1);
  assert.equal(out.length, 9);
  out.forEach((c, k) => {
    assert.equal(c.level, k + 1);
    assert.ok(c.segs instanceof Float32Array);
    assert.equal(c.segs.length % 4, 0);
    assert.ok(c.segs.length > 0);
    let yMin = Infinity;
    let yMax = -Infinity;
    for (let i = 0; i < c.segs.length; i += 4) {
      // every endpoint sits on x = level (cell centres are at (i + 0.5) m, so z = x exactly)
      assert.ok(Math.abs(c.segs[i] - c.level) < 1e-6, `x0 ${c.segs[i]} at level ${c.level}`);
      assert.ok(Math.abs(c.segs[i + 2] - c.level) < 1e-6);
      yMin = Math.min(yMin, c.segs[i + 1], c.segs[i + 3]);
      yMax = Math.max(yMax, c.segs[i + 1], c.segs[i + 3]);
    }
    // the line spans the sampled extent (first to last cell centre)
    assert.ok(Math.abs(yMin - 0.5) < 1e-6);
    assert.ok(Math.abs(yMax - 9.5) < 1e-6);
  });
});

test('a cone gives closed rings at the expected radius', () => {
  const t = plane(41, 41, 0.25, (x, y) => Math.hypot(x - 5.125, y - 5.125));
  const out = contours(t, 1);
  const ring = out.find((c) => c.level === 3);
  assert.ok(ring);
  for (let i = 0; i < ring.segs.length; i += 2) {
    const r = Math.hypot(ring.segs[i] - 5.125, ring.segs[i + 1] - 5.125);
    assert.ok(Math.abs(r - 3) < 0.05, `radius ${r}`);
  }
});

test('saddle: 2x2 [1,0;0,1] at 0.5 gives two segments', () => {
  const t = { nx: 2, ny: 2, cell: 1, z: Float64Array.from([1, 0, 0, 1]) };
  const out = contours(t, 0.5);
  assert.equal(out.length, 1);
  assert.equal(out[0].level, 0.5);
  assert.equal(out[0].segs.length, 8);
  // every endpoint is an edge midpoint (z goes 1 -> 0 along each edge)
  for (let i = 0; i < 8; i += 2) {
    const x = out[0].segs[i];
    const y = out[0].segs[i + 1];
    const near = (p, q) => Math.abs(p - q) < 1e-6;
    const onEdge = (near(x, 1) && (near(y, 0.5) || near(y, 1.5))) || (near(y, 1) && (near(x, 0.5) || near(x, 1.5)));
    assert.ok(onEdge, `${x},${y}`);
  }
});

test('flat terrain and bad intervals give no contours, never throw', () => {
  const flat = plane(8, 8, 1, () => 0);
  assert.deepEqual(contours(flat, 0.5), []);
  const t = plane(8, 8, 1, (x) => x);
  assert.deepEqual(contours(t, 0), []);
  assert.deepEqual(contours(t, -1), []);
  assert.deepEqual(contours(t, NaN), []);
});

test('non-finite heights are skipped, not propagated', () => {
  const t = plane(10, 10, 1, (x) => x);
  t.z[55] = NaN;
  const out = contours(t, 1);
  for (const c of out) for (const v of c.segs) assert.ok(Number.isFinite(v));
});
