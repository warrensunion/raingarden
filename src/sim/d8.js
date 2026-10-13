/**
 * D8 steepest-descent flow directions and flow accumulation.
 *
 * Why: D8 is the cheapest routing that still reads true on a phone screen
 * (arrows and "where does the water go" overlays). It leaves pits as sinks
 * (-1); the storm sim uses priority-flood instead, which never does. Edge
 * outlets treat the outside world as a hair (1e-9 m) lower than the cell
 * so a perfectly flat yard still sheds water at its outlets instead of
 * stalling. Pure and O(n).
 */
import { DIST, DX, DY, dirOffsets, edgeMask } from './grid.js';

/**
 * @param {{nx:number, ny:number, cell:number, z:Float64Array}} terrain
 * @param {{outlet?: Uint8Array}} [opts] default outlets: every edge cell
 * @returns {Int8Array} 0..7 = DIRS index, -1 = sink, -2 = drains off-grid
 */
export function d8(terrain, opts = {}) {
  const { nx, ny, z } = terrain;
  const outlet = opts.outlet || edgeMask(nx, ny);
  const off = dirOffsets(nx);
  const dir = new Int8Array(nx * ny);
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      const i = y * nx + x;
      const zi = z[i];
      let best = -1;
      let bestDrop = 0;
      let lowestZ = Infinity;
      for (let d = 0; d < 8; d++) {
        const xx = x + DX[d];
        const yy = y + DY[d];
        if (xx < 0 || yy < 0 || xx >= nx || yy >= ny) continue;
        const zj = z[i + off[d]];
        if (zj < lowestZ) lowestZ = zj;
        const drop = (zi - zj) / DIST[d];
        if (drop > bestDrop) { bestDrop = drop; best = d; }
      }
      // An outlet drains off-grid unless some neighbour is lower than the
      // outside (taken as z - 1e-9).
      dir[i] = outlet[i] && !(lowestZ < zi - 1e-9) ? -2 : best;
    }
  }
  return dir;
}

/**
 * Cells (or summed weights) flowing through each cell, itself included.
 * Kahn topological order: O(n), no recursion, safe at 128x128 and beyond.
 * @param {Int8Array} dir
 * @param {number} nx
 * @param {number} ny
 * @param {Float64Array} [weight]
 * @returns {Float64Array}
 */
export function accumulate(dir, nx, ny, weight) {
  const n = nx * ny;
  const off = dirOffsets(nx);
  const acc = new Float64Array(n);
  const indeg = new Int32Array(n);
  const down = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    acc[i] = weight ? weight[i] : 1;
    const d = dir[i];
    down[i] = d >= 0 ? i + off[d] : -1;
    if (down[i] >= 0) indeg[down[i]]++;
  }
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < n; i++) if (indeg[i] === 0) queue[tail++] = i;
  while (head < tail) {
    const i = queue[head++];
    const j = down[i];
    if (j < 0) continue;
    acc[j] += acc[i];
    if (--indeg[j] === 0) queue[tail++] = j;
  }
  return acc;
}
