/**
 * Ground coordinates for the yard renderer — the one place that knows where a
 * grid cell sits in metres and in the three.js world.
 *
 * WHY: the project convention (garden/constraints.js, depth/contours.js,
 * depth/heightfield.js) puts cell (i, j) at its CENTRE ((i+0.5)·cell,
 * (j+0.5)·cell) and the yard spans [0, nx·cell] × [0, ny·cell]. Every piece of
 * the renderer (mesh, UVs, garden carve, plants, marks, contours, pick, the
 * Canvas2D fallback) goes through these helpers so none of them can drift
 * half a cell. Pure: no DOM, no three.
 *
 * World axes: X = x − W/2 (right), Y = height, Z = D/2 − y (y runs away from
 * the default camera, which looks down −Z).
 */

/** Frame of a terrain { nx, ny, cell }. */
export function gridFrame({ nx, ny, cell }) {
  const W = nx * cell;
  const D = ny * cell;
  return {
    nx, ny, cell, W, D,
    /** metres of the centre of cell (ix, iy) */
    center: (ix, iy) => [(ix + 0.5) * cell, (iy + 0.5) * cell],
    /** index of the cell containing ground point (x, y), clamped into the grid */
    cellAt: (x, y) => {
      const ix = Math.min(nx - 1, Math.max(0, Math.floor(x / cell)));
      const iy = Math.min(ny - 1, Math.max(0, Math.floor(y / cell)));
      return iy * nx + ix;
    },
    toWorld: (x, y, h) => [x - W / 2, h, D / 2 - y],
    fromWorld: (X, Z) => [X + W / 2, D / 2 - Z],
    /** default photo UV when no toImage is given: planar, image top = far edge */
    planarUV: (x, y) => [x / W, 1 - y / D],
  };
}

/**
 * Bilinear height of a node-per-cell-centre grid at (x, y) metres.
 * z: heights per cell, z0 subtracted.
 */
export function bilinear({ nx, ny, cell }, z, z0, x, y) {
  const fx = Math.min(nx - 1, Math.max(0, x / cell - 0.5));
  const fy = Math.min(ny - 1, Math.max(0, y / cell - 0.5));
  const x0 = Math.min(nx - 2, Math.floor(fx));
  const y0 = Math.min(ny - 2, Math.floor(fy));
  const tx = fx - x0;
  const ty = fy - y0;
  const i = y0 * nx + x0;
  return (z[i] * (1 - tx) + z[i + 1] * tx) * (1 - ty) + (z[i + nx] * (1 - tx) + z[i + nx + 1] * tx) * ty - z0;
}

/**
 * Ground point under a world-space ray, or null.
 * Marches the ray in steps of ~one cell through the yard's box, then refines
 * the crossing by bisection against height(x, y) (bowl-aware). Cheap enough
 * for pointermove: ~2·max(nx, ny) height samples, no triangle tests.
 * o, d: [X, Y, Z] origin and (any-length) direction; hMin/hMax bound the heights.
 */
export function marchPick(frame, height, o, d, hMin, hMax) {
  const { W, D, cell } = frame;
  const len = Math.hypot(d[0], d[1], d[2]) || 1;
  const dir = [d[0] / len, d[1] / len, d[2] / len];
  // clip the ray to the box [−W/2, W/2] × [hMin−0.5, hMax+0.5] × [−D/2, D/2]
  let t0 = 0;
  let t1 = Infinity;
  const lo = [-W / 2, hMin - 0.5, -D / 2];
  const hi = [W / 2, hMax + 0.5, D / 2];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(dir[a]) < 1e-12) {
      if (o[a] < lo[a] || o[a] > hi[a]) return null;
      continue;
    }
    let ta = (lo[a] - o[a]) / dir[a];
    let tb = (hi[a] - o[a]) / dir[a];
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
  }
  if (!(t1 > t0)) return null;
  const above = (t) => {
    const X = o[0] + dir[0] * t;
    const Z = o[2] + dir[2] * t;
    const [x, y] = frame.fromWorld(X, Z);
    return o[1] + dir[1] * t - height(x, y);
  };
  const step = cell * 0.75;
  let ta = t0;
  let fa = above(ta);
  if (fa < 0) return null; // starts under the ground
  for (let t = t0 + step; t <= t1 + step; t += step) {
    const tb = Math.min(t, t1);
    const fb = above(tb);
    if (fb <= 0) {
      let a = ta;
      let b = tb;
      for (let k = 0; k < 12; k++) {
        const m = (a + b) / 2;
        if (above(m) > 0) a = m; else b = m;
      }
      const tm = (a + b) / 2;
      const [x, y] = frame.fromWorld(o[0] + dir[0] * tm, o[2] + dir[2] * tm);
      return [Math.min(W, Math.max(0, x)), Math.min(D, Math.max(0, y))];
    }
    ta = tb;
    fa = fb;
    if (tb >= t1) break;
  }
  return null;
}
