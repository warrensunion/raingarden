/**
 * Contour lines of a terrain by marching squares.
 *
 * Why: the designer draws contour lines over the yard photo so people can see
 * the slope the depth model found (and so a wrong read is obvious at a glance).
 * Segments are enough for drawing; we do not stitch them into polylines.
 *
 * Coordinates: heights are sampled at cell centres, so sample (x, y) sits at
 * ((x + 0.5) * cell, (y + 0.5) * cell) metres in the terrain frame (x right,
 * y away from the camera, row 0 = nearest edge; see heightfield.js). Segment
 * endpoints are in that same metric frame.
 *
 * Levels are the multiples of intervalM strictly between the lowest and the
 * highest finite height. A sample "is above" a level when z > level, so a
 * sample exactly on a level counts as below; that keeps every crossing on a
 * strict sign change and never emits zero-length segments. Saddles are
 * resolved by the mean of the four corners. Squares with a non-finite corner
 * are skipped.
 *
 * Pure module: no DOM, typed arrays in and out.
 */

/**
 * @param {{ nx:number, ny:number, cell:number, z:Float64Array }} terrain
 * @param {number} intervalM contour interval in metres (> 0)
 * @returns {{ level:number, segs:Float32Array }[]} segs = x0,y0,x1,y1 in metres
 */
export function contours(terrain, intervalM) {
  const { nx, ny, cell, z } = terrain;
  if (!(intervalM > 0) || !Number.isFinite(intervalM) || !(nx >= 2) || !(ny >= 2)) return [];
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < nx * ny; i++) {
    const v = z[i];
    if (Number.isFinite(v)) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  if (!(hi > lo)) return [];
  const kFirst = Math.floor(lo / intervalM) + 1;
  const kLast = Math.ceil(hi / intervalM) - 1;
  // A runaway level count (tiny interval) would freeze the UI; refuse it.
  if (kLast - kFirst > 2000) return [];

  const out = [];
  for (let k = kFirst; k <= kLast; k++) {
    const level = Math.round(k * intervalM * 1e9) / 1e9;
    if (!(level > lo && level < hi)) continue;
    const segs = march(nx, ny, cell, z, level);
    if (segs.length) out.push({ level, segs: new Float32Array(segs) });
  }
  return out;
}

// Corners: 0 = (x, y), 1 = (x+1, y), 2 = (x+1, y+1), 3 = (x, y+1).
// Edges: 0 = c0-c1, 1 = c1-c2, 2 = c2-c3, 3 = c3-c0.
// CASES[bits] (bit i set = corner i above the level) lists the edge pairs to
// join; null marks the two saddles, decided by the centre value.
const CASES = [
  [], [[3, 0]], [[0, 1]], [[3, 1]],
  [[1, 2]], null, [[0, 2]], [[3, 2]],
  [[2, 3]], [[0, 2]], null, [[1, 2]],
  [[1, 3]], [[0, 1]], [[3, 0]], [],
];
const CX = [0, 1, 1, 0];
const CY = [0, 0, 1, 1];

function march(nx, ny, cell, z, level) {
  const segs = [];
  const v = [0, 0, 0, 0];
  const px = [0, 0, 0, 0];
  const py = [0, 0, 0, 0];
  for (let y = 0; y < ny - 1; y++) {
    for (let x = 0; x < nx - 1; x++) {
      v[0] = z[y * nx + x];
      v[1] = z[y * nx + x + 1];
      v[2] = z[(y + 1) * nx + x + 1];
      v[3] = z[(y + 1) * nx + x];
      if (!(Number.isFinite(v[0]) && Number.isFinite(v[1]) && Number.isFinite(v[2]) && Number.isFinite(v[3]))) continue;
      let c = 0;
      for (let i = 0; i < 4; i++) if (v[i] > level) c |= 1 << i;
      if (c === 0 || c === 15) continue;
      for (let e = 0; e < 4; e++) {
        const a = e;
        const b = (e + 1) & 3;
        if ((v[a] > level) === (v[b] > level)) continue;
        const t = (level - v[a]) / (v[b] - v[a]);
        px[e] = (x + CX[a] + t * (CX[b] - CX[a]) + 0.5) * cell;
        py[e] = (y + CY[a] + t * (CY[b] - CY[a]) + 0.5) * cell;
      }
      let pairs = CASES[c];
      if (pairs === null) {
        const centreAbove = (v[0] + v[1] + v[2] + v[3]) / 4 > level;
        if (c === 5) pairs = centreAbove ? [[0, 1], [2, 3]] : [[3, 0], [1, 2]];
        else pairs = centreAbove ? [[3, 0], [1, 2]] : [[0, 1], [2, 3]];
      }
      for (const [e0, e1] of pairs) segs.push(px[e0], py[e0], px[e1], py[e1]);
    }
  }
  return segs;
}
