/**
 * Priority-flood depression filling, flow directions toward outlets, and
 * the lakes (filled hollows) the storm sim stores water in.
 *
 * Why: a real yard has hollows. D8 leaves them as dead-end sinks, which
 * would either lose water or loop. Priority-flood (Barnes, Lehman & Mulla
 * 2014, Computers & Geosciences 62:117-127) visits cells from the outlets
 * upward, so every cell gets a downstream pointer, and the visit order is a
 * valid downstream-first schedule (reverse it for upstream-first). Two
 * surfaces come out: `fill`, the true level a hollow fills to (used to find
 * lakes), and `zf`, fill plus 1e-6 m per step across flats so a strictly
 * draining DEM exists for whatever needs one. Lakes are taken from `fill`,
 * not `zf`, so a flat lawn is not mistaken for a pond.
 */
import { DX, DY, dirOffsets, opposite } from './grid.js';

const EPS = 1e-6;

/**
 * @param {{nx:number, ny:number, cell:number, z:Float64Array}} terrain
 * @param {Uint8Array} outlet 1 where water may leave the grid
 * @returns {{zf:Float64Array, fill:Float64Array, dir:Int8Array, order:Int32Array}}
 *   dir is -2 at outlets and points every other cell downstream. If there
 *   are no outlets at all, the single lowest cell becomes a terminal sink
 *   (-1) and everything drains to it.
 */
export function priorityFlood(terrain, outlet) {
  const { nx, ny, z } = terrain;
  const n = nx * ny;
  const off = dirOffsets(nx);
  const zf = new Float64Array(n);
  const fill = new Float64Array(n);
  const dir = new Int8Array(n).fill(-1);
  const order = new Int32Array(n);
  const seq = new Int32Array(n);
  const seen = new Uint8Array(n);
  const heap = new Int32Array(n);
  let hs = 0;
  let nOrder = 0;

  // Binary heap on (zf, insertion sequence): ties resolve first-in first-out,
  // which spreads across flats breadth-first.
  const less = (a, b) => zf[a] < zf[b] || (zf[a] === zf[b] && seq[a] < seq[b]);
  const push = (i) => {
    let k = hs++;
    heap[k] = i;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (!less(heap[k], heap[p])) break;
      const t = heap[k]; heap[k] = heap[p]; heap[p] = t;
      k = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    heap[0] = heap[--hs];
    let k = 0;
    for (;;) {
      const l = 2 * k + 1;
      const r = l + 1;
      let m = k;
      if (l < hs && less(heap[l], heap[m])) m = l;
      if (r < hs && less(heap[r], heap[m])) m = r;
      if (m === k) break;
      const t = heap[k]; heap[k] = heap[m]; heap[m] = t;
      k = m;
    }
    return top;
  };
  const visit = (i, d) => {
    seen[i] = 1;
    dir[i] = d;
    seq[i] = nOrder;
    order[nOrder++] = i;
    push(i);
  };

  for (let i = 0; i < n; i++) {
    if (outlet && outlet[i]) { zf[i] = z[i]; fill[i] = z[i]; visit(i, -2); }
  }
  if (nOrder === 0) {
    let lo = 0;
    for (let i = 1; i < n; i++) if (z[i] < z[lo]) lo = i;
    zf[lo] = z[lo]; fill[lo] = z[lo];
    visit(lo, -1);
  }

  while (hs > 0) {
    const c = pop();
    const x = c % nx;
    const y = (c - x) / nx;
    for (let d = 0; d < 8; d++) {
      const xx = x + DX[d];
      const yy = y + DY[d];
      if (xx < 0 || yy < 0 || xx >= nx || yy >= ny) continue;
      const j = c + off[d];
      if (seen[j]) continue;
      fill[j] = z[j] > fill[c] ? z[j] : fill[c];
      zf[j] = z[j] > zf[c] ? z[j] : zf[c] + EPS;
      visit(j, opposite(d));
    }
  }
  return { zf, fill, dir, order };
}

/**
 * Connected (8-neighbour) groups of cells where fill - z > 1e-6. Every cell
 * of one group shares the same fill level (the spill elevation).
 * @param {{nx:number, ny:number, z:Float64Array}} terrain
 * @param {Float64Array} fill the `fill` surface from priorityFlood
 * @param {{dir:Int8Array, order:Int32Array}} flood the priorityFlood result
 * @returns {{id:Int32Array, list:Array<{cells:Int32Array, spill:number, pour:number, outCell:number}>}}
 *   `cells` sorted by z ascending; `pour` is the lake cell the flood reached
 *   first (the lip it empties over); `outCell` is the first cell downstream
 *   of the pour, outside the lake (-2 if off-grid).
 */
export function lakes(terrain, fill, flood) {
  const { nx, ny, z } = terrain;
  const n = nx * ny;
  const off = dirOffsets(nx);
  const id = new Int32Array(n).fill(-1);
  const wet = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (fill[i] - z[i] > EPS) wet[i] = 1;
  const rank = new Int32Array(n);
  for (let k = 0; k < n; k++) rank[flood.order[k]] = k;
  const list = [];
  const stack = new Int32Array(n);
  for (let s = 0; s < n; s++) {
    if (!wet[s] || id[s] !== -1) continue;
    const lid = list.length;
    const level = fill[s];
    const members = [];
    let sp = 0;
    stack[sp++] = s;
    id[s] = lid;
    while (sp > 0) {
      const c = stack[--sp];
      members.push(c);
      const x = c % nx;
      const y = (c - x) / nx;
      for (let d = 0; d < 8; d++) {
        const xx = x + DX[d];
        const yy = y + DY[d];
        if (xx < 0 || yy < 0 || xx >= nx || yy >= ny) continue;
        const j = c + off[d];
        if (wet[j] && id[j] === -1 && Math.abs(fill[j] - level) < 1e-9) {
          id[j] = lid;
          stack[sp++] = j;
        }
      }
    }
    members.sort((a, b) => z[a] - z[b]);
    let pour = members[0];
    for (const c of members) if (rank[c] < rank[pour]) pour = c;
    const d = flood.dir[pour];
    const outCell = d >= 0 ? pour + off[d] : -2;
    list.push({ cells: Int32Array.from(members), spill: level, pour, outCell });
  }
  return { id, list };
}

/**
 * Stored volume (m^3) with the lake surface at `level`; exact for flat cell
 * bottoms (hypsometric sum over cells below the surface).
 */
export function lakeVolume(lake, z, cellArea, level) {
  let v = 0;
  const cells = lake.cells;
  for (let k = 0; k < cells.length; k++) {
    const h = level - z[cells[k]];
    if (h <= 0) break;
    v += h;
  }
  return v * cellArea;
}

/**
 * Inverse of lakeVolume: the surface level holding `volumeM3`. Above the
 * highest cell the surface keeps rising over all cells (the caller spills).
 */
export function lakeLevel(lake, z, cellArea, volumeM3) {
  const cells = lake.cells;
  const m = cells.length;
  const v = volumeM3 / cellArea;
  if (!(v > 0)) return z[cells[0]];
  let sum = 0;
  for (let k = 1; k < m; k++) {
    sum += z[cells[k - 1]];
    if (v <= k * z[cells[k]] - sum) return (v + sum) / k;
  }
  sum += z[cells[m - 1]];
  return (v + sum) / m;
}
