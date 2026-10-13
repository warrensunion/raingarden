/**
 * Where a rain garden may go, and what it does to the ground.
 *
 * Why these rules (docs/research/sizing.md):
 *  - House wall: >= 10 ft (WSU 2013 p. 12; Wisconsin 2003 p. 4) and >= 3 m (ERCA,
 *    CRD, Metro Vancouver). Default minWallM = 3; this band also covers "never
 *    against the house".
 *  - Septic: WSU 2013 (pp. 12-14) keeps >= 10 ft (3.048 m) when the garden is
 *    downhill of the septic system and >= 50 ft (15.24 m) when it is uphill
 *    (Wisconsin just says "not over a septic system"). "Uphill" here means the
 *    cell's ground is more than 0.05 m above the LOWEST ground over the septic
 *    polygon (conservative: a cell beside any part of a sloped field above its
 *    low end gets 50 ft); within 0.05 m counts as level and gets 10 ft.
 *  - Yard: cells whose centre is outside the yard polygon are forbidden, and so are
 *    cells within 0.5 m of its boundary (fence or property line; our call, so the
 *    berm and digging stay on the owner's side).
 *
 * Geometry: terrain {nx, ny, cell, z}, index y*nx+x, cell centres at
 * ((x+0.5)cell, (y+0.5)cell) m. A garden g = {cx, cy, lenM, widM, rot, depthM,
 * bermM} is an ellipse with full axes lenM (along rot, radians from +x) and widM.
 * Pure module: no window/document.
 */

export const FENCE_BUFFER_M = 0.5;
export const SEPTIC_DOWNHILL_M = 10 * 0.3048;
export const SEPTIC_UPHILL_M = 50 * 0.3048;
export const BERM_WIDTH_M = 0.6;
/**
 * Berm crest above the overflow notch (m). 5 mm is invisible on a yard but
 * far above priority-flood's 1e-6 m per-cell flat increments, so ties never
 * send uphill water along the crest past the pond.
 */
export const BERM_CREST_M = 0.005;
/** Within this height of the septic system's lowest point counts as level (downhill buffer). */
export const SEPTIC_LEVEL_TOL_M = 0.05;

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Even-odd point-in-polygon test. */
export function inPolygon(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Distance from a point to a polygon's boundary. */
function edgeDist(px, py, poly) {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    d = Math.min(d, segDist(px, py, poly[j][0], poly[j][1], poly[i][0], poly[i][1]));
  }
  return d;
}

function nearestCell(t, px, py) {
  const x = Math.max(0, Math.min(t.nx - 1, Math.floor(px / t.cell)));
  const y = Math.max(0, Math.min(t.ny - 1, Math.floor(py / t.cell)));
  return y * t.nx + x;
}

/** Lowest ground height over a polygon (cells whose centre is inside; else the centroid's cell). */
function minZ(t, poly) {
  let m = Infinity;
  for (let y = 0; y < t.ny; y++) {
    for (let x = 0; x < t.nx; x++) {
      if (inPolygon((x + 0.5) * t.cell, (y + 0.5) * t.cell, poly)) m = Math.min(m, t.z[y * t.nx + x]);
    }
  }
  if (m < Infinity) return m;
  const cx = poly.reduce((a, p) => a + p[0], 0) / poly.length;
  const cy = poly.reduce((a, p) => a + p[1], 0) / poly.length;
  return t.z[nearestCell(t, cx, cy)];
}

/**
 * Cells a garden (or its berm) may not cover. 1 = forbidden.
 * @param {{nx:number, ny:number, cell:number, z:Float64Array}} terrain
 * @param {{yard:number[][], wall:number[][]|null, septic:number[][]|null,
 *   minWallM?:number, septicBufferM?:number, septicUphillM?:number, fenceM?:number}} o
 * @returns {Uint8Array}
 */
export function forbiddenMask(terrain, {
  yard, wall, septic = null, minWallM = 3,
  septicBufferM = SEPTIC_DOWNHILL_M, septicUphillM = SEPTIC_UPHILL_M, fenceM = FENCE_BUFFER_M,
}) {
  const { nx, ny, cell, z } = terrain;
  const m = new Uint8Array(nx * ny);
  const septicZ = septic && septic.length >= 3 ? minZ(terrain, septic) + SEPTIC_LEVEL_TOL_M : null;
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      const i = y * nx + x;
      const px = (x + 0.5) * cell;
      const py = (y + 0.5) * cell;
      if (yard && (!inPolygon(px, py, yard) || edgeDist(px, py, yard) < fenceM)) { m[i] = 1; continue; }
      if (wall && segDist(px, py, wall[0][0], wall[0][1], wall[1][0], wall[1][1]) < minWallM) { m[i] = 1; continue; }
      if (septicZ !== null) {
        const d = inPolygon(px, py, septic) ? 0 : edgeDist(px, py, septic);
        const buf = z[i] > septicZ ? septicUphillM : septicBufferM;
        if (d < buf) m[i] = 1;
      }
    }
  }
  return m;
}

/** Ellipse radius fraction of a point in garden g: < 1 inside. Optional inflation (m) on both semi-axes. */
export function ellipseRho(g, px, py, inflateM = 0) {
  if (!(g.lenM > 0) || !(g.widM > 0)) throw new RangeError(`garden axes must be > 0 (lenM ${g.lenM}, widM ${g.widM})`);
  const c = Math.cos(g.rot || 0);
  const s = Math.sin(g.rot || 0);
  const dx = px - g.cx;
  const dy = py - g.cy;
  const u = (dx * c + dy * s) / (g.lenM / 2 + inflateM);
  const v = (-dx * s + dy * c) / (g.widM / 2 + inflateM);
  return Math.sqrt(u * u + v * v);
}

/** Cells whose centre lies inside the garden ellipse. */
export function gardenCells(terrain, g) {
  const { nx, ny, cell } = terrain;
  const m = new Uint8Array(nx * ny);
  // only scan the ellipse's bounding box
  const r = Math.max(g.lenM, g.widM) / 2 + cell;
  const x0 = Math.max(0, Math.floor((g.cx - r) / cell));
  const x1 = Math.min(nx - 1, Math.ceil((g.cx + r) / cell));
  const y0 = Math.max(0, Math.floor((g.cy - r) / cell));
  const y1 = Math.min(ny - 1, Math.ceil((g.cy + r) / cell));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (ellipseRho(g, (x + 0.5) * cell, (y + 0.5) * cell) <= 1) m[y * nx + x] = 1;
    }
  }
  return m;
}

/**
 * Cut the garden into a NEW terrain (input untouched).
 * Floor: level at min(z over the rim) - depthM, where the rim is the garden cells
 * with a 4-neighbour outside the garden (or on the grid edge), so the pond fills
 * exactly depthM before it can spill at the lowest lip.
 * Berm: the cells within R = ceil(max(0.6 m, cell*sqrt2)/cell) cells of the garden
 * (disc dilation of the mask) are raised to floor + depthM + bermM where lower.
 * R >= sqrt2 cells guarantees every 8-neighbour is berm, so under D8 routing the
 * pond holds its full depthM before spilling.
 * @returns {{terrain:object, mask:Uint8Array, bermMask:Uint8Array, floorZ:number}}
 */
export function applyGarden(terrain, g) {
  const { nx, ny, cell } = terrain;
  const z = Float64Array.from(terrain.z);
  const out = { nx, ny, cell, z };
  const mask = gardenCells(terrain, g);
  const bermMask = new Uint8Array(nx * ny);
  let rimMin = Infinity;
  let rimCell = -1;
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      const i = y * nx + x;
      if (!mask[i]) continue;
      const rim = x === 0 || y === 0 || x === nx - 1 || y === ny - 1
        || !mask[i - 1] || !mask[i + 1] || !mask[i - nx] || !mask[i + nx];
      if (rim && terrain.z[i] < rimMin) { rimMin = terrain.z[i]; rimCell = i; }
    }
  }
  if (rimMin === Infinity) return { terrain: out, mask, bermMask, floorZ: NaN };
  const floorZ = rimMin - g.depthM;
  const bermTop = floorZ + g.depthM + g.bermM;
  // Berm = disc dilation of the mask, radius ceil(max(0.6 m, cell*sqrt2)/cell) cells,
  // so it always contains every 8-neighbour of the garden (D8 cannot slip past
  // diagonally) and is at least 0.6 m wide in every direction.
  const R = Math.ceil(Math.max(BERM_WIDTH_M, cell * Math.SQRT2) / cell - 1e-9);
  const R2 = R * R;
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      const i = y * nx + x;
      if (!mask[i]) continue;
      z[i] = floorZ;
      for (let dy = -R; dy <= R; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= ny) continue;
        for (let dx = -R; dx <= R; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= nx || dx * dx + dy * dy > R2) continue;
          const j = yy * nx + xx;
          if (!mask[j]) bermMask[j] = 1;
        }
      }
    }
  }
  // Overflow notch: a one-cell channel at bermTop from the lowest rim cell
  // through the berm cell on the lowest natural ground and out the far side
  // of the berm (where a real garden's overflow goes). The rest of the crest
  // sits BERM_CREST_M higher. A crest exactly at the lip would be a flat at
  // spill level, and priority-flood routes water arriving from uphill along
  // that flat and round the garden instead of into it.
  const notch = new Uint8Array(nx * ny);
  let low = -1;
  for (let i = 0; i < z.length; i++) if (bermMask[i] && (low < 0 || z[i] < z[low])) low = i;
  if (low >= 0) {
    const x0 = rimCell % nx;
    const y0 = (rimCell - x0) / nx;
    const ddx = (low % nx) - x0;
    const ddy = Math.floor(low / nx) - y0;
    const steps = Math.max(Math.abs(ddx), Math.abs(ddy), 1);
    // 8-connected walk (DDA) along the ray until it leaves the berm
    for (let k = 1; k <= steps + 2 * R + 2; k++) {
      const xx = Math.round(x0 + (ddx * k) / steps);
      const yy = Math.round(y0 + (ddy * k) / steps);
      if (xx < 0 || yy < 0 || xx >= nx || yy >= ny) break;
      const j = yy * nx + xx;
      if (mask[j]) continue;
      if (!bermMask[j]) { if (k > steps) break; continue; }
      notch[j] = 1;
    }
  }
  for (let i = 0; i < z.length; i++) {
    if (!bermMask[i]) continue;
    const top = notch[i] ? bermTop : bermTop + BERM_CREST_M;
    if (z[i] < top) z[i] = top;
  }
  return { terrain: out, mask, bermMask, floorZ };
}
