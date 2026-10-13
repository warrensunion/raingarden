/**
 * The manual fallback terrain: a preset slope plus draggable height pins.
 *
 * Why: the photo route can fail (no WebGPU/WASM, model missing, a noisy or
 * tiny yard, a band too wide to trust). The designer must still work, so the
 * user can say "flat / gentle / steep, falling this way" and nudge spots up or
 * down. The spec fixes the presets: flat 0%, gentle 2%, steep 8%.
 *
 * Frame (same as heightfield.js): x right, y away from the camera / down the
 * page, metres; grid row 0 = the y = 0 edge; heights at cell centres
 * ((x + 0.5) * cell, (y + 0.5) * cell). `dir` is the DOWNHILL direction
 * (downspout -> outlet); its length does not matter.
 *
 * Datum: the preset plane is shifted so its lowest cell is 0. Pin heights `h`
 * are in that datum (read a cell, add 0.3 to raise it 30 cm). Pins are blended
 * with a thin-plate spline (phi = r^2 ln r, plus an affine term) on the
 * residual h - plane(x, y). The four yard corners are added as zero-residual
 * anchors so a single pin makes a local bump instead of tilting the whole yard,
 * and so the affine term is always determined (TPS needs 3 non-collinear
 * points). Anchors within two cells of a pin are dropped (a pin on a corner
 * wins).
 *
 * Pure module: no DOM.
 */

const PRESETS = { flat: 0, gentle: 0.02, steep: 0.08 };

/**
 * @param {{ widthM:number, depthM:number, preset?:'flat'|'gentle'|'steep', dir?:[number,number],
 *           pins?:{x:number,y:number,h:number}[], n?:number }} opts
 * @returns {{ nx:number, ny:number, cell:number, z:Float64Array }}
 */
export function manualTerrain({ widthM, depthM, preset = 'gentle', dir = [0, 1], pins = [], n = 128 } = {}) {
  const W = widthM > 0 && Number.isFinite(widthM) ? widthM : 10;
  const D = depthM > 0 && Number.isFinite(depthM) ? depthM : 10;
  const N = n >= 2 && Number.isFinite(n) ? Math.round(n) : 128;
  const cell = Math.max(W, D) / N;
  const nx = Math.max(2, Math.round(W / cell));
  const ny = Math.max(2, Math.round(D / cell));
  const slope = PRESETS[preset] ?? 0;
  let dx = Number(dir?.[0]);
  let dy = Number(dir?.[1]);
  const len = Math.hypot(dx, dy);
  if (!(len > 0) || !Number.isFinite(len)) {
    dx = 0;
    dy = 1;
  } else {
    dx /= len;
    dy /= len;
  }
  const plane = (x, y) => -slope * (x * dx + y * dy);

  const z = new Float64Array(nx * ny);
  let min = Infinity;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const v = plane((i + 0.5) * cell, (j + 0.5) * cell);
      z[j * nx + i] = v;
      if (v < min) min = v;
    }
  }
  for (let k = 0; k < z.length; k++) z[k] -= min;

  const good = (pins || []).filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.h));
  if (good.length) {
    const pts = good.map((p) => ({ x: p.x, y: p.y, r: p.h - (plane(p.x, p.y) - min) }));
    const corners = [[0, 0], [nx * cell, 0], [0, ny * cell], [nx * cell, ny * cell]];
    for (const [x, y] of corners) {
      if (pts.every((p) => Math.hypot(p.x - x, p.y - y) > 2 * cell)) pts.push({ x, y, r: 0 });
    }
    const spline = thinPlate(pts);
    if (spline) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) z[j * nx + i] += spline((i + 0.5) * cell, (j + 0.5) * cell);
      }
    }
  }
  return { nx, ny, cell, z };
}

/**
 * Mean slope magnitude (rise/run, not %) over the grid, by central differences
 * (one-sided at the border). Used by tests and by the UI's "about 2%" label.
 */
export function meanSlope({ nx, ny, cell, z }) {
  let sum = 0;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const i0 = Math.max(0, i - 1);
      const i1 = Math.min(nx - 1, i + 1);
      const j0 = Math.max(0, j - 1);
      const j1 = Math.min(ny - 1, j + 1);
      const gx = (z[j * nx + i1] - z[j * nx + i0]) / ((i1 - i0) * cell);
      const gy = (z[j1 * nx + i] - z[j0 * nx + i]) / ((j1 - j0) * cell);
      sum += Math.hypot(gx, gy);
    }
  }
  return sum / (nx * ny);
}

const phi = (r) => (r > 0 ? r * r * Math.log(r) : 0);

/** Thin-plate spline through pts ({x,y,r}); null if the system is singular. */
function thinPlate(pts) {
  const m = pts.length;
  const size = m + 3;
  const A = Array.from({ length: size }, () => new Float64Array(size + 1));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < m; j++) A[i][j] = phi(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y));
    A[i][m] = 1;
    A[i][m + 1] = pts[i].x;
    A[i][m + 2] = pts[i].y;
    A[m][i] = 1;
    A[m + 1][i] = pts[i].x;
    A[m + 2][i] = pts[i].y;
    A[i][size] = pts[i].r;
  }
  const sol = solve(A, size);
  if (!sol) return null;
  return (x, y) => {
    let v = sol[m] + sol[m + 1] * x + sol[m + 2] * y;
    for (let i = 0; i < m; i++) v += sol[i] * phi(Math.hypot(x - pts[i].x, y - pts[i].y));
    return Number.isFinite(v) ? v : 0;
  };
}

/**
 * Gauss-Jordan elimination with partial pivoting on an augmented matrix
 * (rows of length size + 1). Returns the solution or null if singular.
 */
function solve(A, size) {
  for (let c = 0; c < size; c++) {
    let p = c;
    for (let r = c + 1; r < size; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (!(Math.abs(A[p][c]) > 1e-12)) return null;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < size; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      if (f === 0) continue;
      for (let k = c; k <= size; k++) A[r][k] -= f * A[c][k];
    }
  }
  const x = new Float64Array(size);
  for (let i = 0; i < size; i++) x[i] = A[i][size] / A[i][i];
  return x;
}
