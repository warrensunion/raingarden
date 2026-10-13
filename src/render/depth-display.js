/**
 * Display depth: the sim's per-cell water depth, softened for drawing.
 *
 * WHY: the storm sim routes flow D8 cell-to-cell, so its overflow streams are
 * one cell wide. Drawn literally, a one-cell stream is a row of spikes (each
 * wet vertex surrounded by dry ones) with a jagged sawtooth shoreline. Dry
 * cells next to water get a shallow bank from a small blur of the depth, so a
 * thin stream reads ~3 cells wide with tapering edges; wet cells keep their
 * true depth, and a bank is never allowed to lift the surface above the
 * nearby water (no lips around ponds). The water ledger is untouched — this
 * is only what we paint. Pure: typed arrays in, typed arrays out.
 */

const WET = 0.0005;

/**
 * out[i] = src[i] where wet; else min(1.6·blur(src), nearby wet surface − z).
 * z: terrain heights (any float array); tmp: scratch Float32Array(nx*ny).
 */
export function displayDepth(src, z, out, tmp, nx, ny) {
  const n = nx * ny;
  out.set(src.length > n ? src.subarray(0, n) : src);
  // two passes of a separable [1 2 1]/4 blur ≈ a 5-tap Gaussian
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < ny; y++) {
      const r = y * nx;
      for (let x = 0; x < nx; x++) {
        tmp[r + x] = (out[r + Math.max(0, x - 1)] + 2 * out[r + x] + out[r + Math.min(nx - 1, x + 1)]) * 0.25;
      }
    }
    for (let y = 0; y < ny; y++) {
      const u = Math.max(0, y - 1) * nx;
      const r = y * nx;
      const d = Math.min(ny - 1, y + 1) * nx;
      for (let x = 0; x < nx; x++) out[r + x] = (tmp[u + x] + 2 * tmp[r + x] + tmp[d + x]) * 0.25;
    }
  }
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      const i = y * nx + x;
      const s = src[i] || 0;
      if (s >= WET) { out[i] = s; continue; }
      const b = out[i] * 1.6;
      if (b < WET) { out[i] = 0; continue; }
      let top = -Infinity;
      for (let dy = -2; dy <= 2; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= ny) continue;
        for (let dx = -2; dx <= 2; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= nx) continue;
          const j = yy * nx + xx;
          const sj = src[j] || 0;
          if (sj >= WET && z[j] + sj > top) top = z[j] + sj;
        }
      }
      const cap = top - z[i];
      out[i] = cap > 0 ? Math.min(b, cap) : 0;
    }
  }
  return out;
}

/**
 * Level the water inside the garden: ponded water is flat, but the sim may
 * hand us depth measured over an un-dug garden. Keep the garden's water
 * volume and pour it into the dug bowl: depth = max(0, L − ground) with L
 * found by bisection. idx = garden cell indices, ground = displaced heights
 * (indexed like depth). In place; returns the level (or NaN if dry).
 */
export function levelPond(depth, idx, ground) {
  let vol = 0;
  let lo = Infinity;
  let hi = -Infinity;
  for (let k = 0; k < idx.length; k++) {
    const i = idx[k];
    vol += depth[i] > 0 ? depth[i] : 0;
    if (ground[i] < lo) lo = ground[i];
    if (ground[i] > hi) hi = ground[i];
  }
  if (!(vol > WET) || !idx.length) return NaN;
  hi += vol / idx.length + 0.01;
  for (let it = 0; it < 40; it++) {
    const L = (lo + hi) / 2;
    let v = 0;
    for (let k = 0; k < idx.length; k++) {
      const d = L - ground[idx[k]];
      if (d > 0) v += d;
    }
    if (v > vol) hi = L; else lo = L;
  }
  const L = (lo + hi) / 2;
  for (let k = 0; k < idx.length; k++) {
    const i = idx[k];
    const d = L - ground[i];
    depth[i] = d > 0 ? d : 0;
  }
  return L;
}
