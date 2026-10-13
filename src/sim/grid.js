/**
 * Grid conventions shared by every hydrology module.
 *
 * Why this file exists: D8, priority-flood, the storm sim and the optimizer
 * all walk the same 8-neighbourhood, and a single disagreement about the
 * neighbour order or the index layout silently routes water the wrong way.
 * Keeping the convention (row-major, y down, E-first clockwise) in one place
 * makes that class of bug impossible. Pure: no window/document.
 */

/** E,SE,S,SW,W,NW,N,NE as [dx, dy] with y pointing down. */
export const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

/** Distance factor per direction (multiply by cell size). */
export const DIST = DIRS.map(([dx, dy]) => (dx !== 0 && dy !== 0 ? Math.SQRT2 : 1));

/** dx and dy per direction as plain arrays (hot loops avoid destructuring). */
export const DX = DIRS.map((d) => d[0]);
export const DY = DIRS.map((d) => d[1]);

/** Index of the direction opposite to d. */
export const opposite = (d) => (d + 4) & 7;

/**
 * Neighbour offsets in flat-index space for a grid of width nx.
 * @param {number} nx
 * @returns {Int32Array}
 */
export function dirOffsets(nx) {
  const off = new Int32Array(8);
  for (let d = 0; d < 8; d++) off[d] = DIRS[d][1] * nx + DIRS[d][0];
  return off;
}

/**
 * Mask of edge cells (1 on the border), the default set of outlets.
 * @param {number} nx
 * @param {number} ny
 * @returns {Uint8Array}
 */
export function edgeMask(nx, ny) {
  const m = new Uint8Array(nx * ny);
  for (let x = 0; x < nx; x++) { m[x] = 1; m[(ny - 1) * nx + x] = 1; }
  for (let y = 0; y < ny; y++) { m[y * nx] = 1; m[y * nx + nx - 1] = 1; }
  return m;
}

/**
 * Block-average a terrain by an integer factor f (cell size grows by f).
 * Partial blocks at the right/bottom edge average only the cells they hold,
 * so no strip of the yard is dropped. The optimizer runs many cheap sims on
 * the coarse grid and one full-resolution sim at the end.
 * @param {{nx:number, ny:number, cell:number, z:Float64Array}} terrain
 * @param {number} f
 * @returns {{nx:number, ny:number, cell:number, z:Float64Array}}
 */
export function coarsen(terrain, f) {
  const { nx, ny, cell, z } = terrain;
  f = Math.max(1, Math.floor(f));
  const cx = Math.ceil(nx / f);
  const cy = Math.ceil(ny / f);
  const sum = new Float64Array(cx * cy);
  const cnt = new Float64Array(cx * cy);
  for (let y = 0; y < ny; y++) {
    const by = Math.floor(y / f) * cx;
    for (let x = 0; x < nx; x++) {
      const j = by + Math.floor(x / f);
      sum[j] += z[y * nx + x];
      cnt[j] += 1;
    }
  }
  for (let j = 0; j < sum.length; j++) sum[j] /= cnt[j];
  return { nx: cx, ny: cy, cell: cell * f, z: sum };
}
