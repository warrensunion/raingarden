/**
 * The designer's pure helpers: turning what the user marked on the photo into
 * the inputs the sim and the optimizer need, and turning their answers back
 * into words and numbers.
 *
 * WHY a separate module: designer.js and the step files are DOM glue; every
 * decision that could be wrong (which side of the wall is the house, where
 * water may leave the yard, how a slope is put into words) lives here, where
 * Node tests can pin it. Pure: no window/document, plain arrays in and out.
 *
 * Frames (the same as src/depth/heightfield.js): image (u, v) in 0..1, u right,
 * v down; ground metres x right, y away from the camera, cell (i, j) centred at
 * ((i + 0.5)·cell, (j + 0.5)·cell), index j·nx + i.
 */

import { inPolygon } from '../garden/constraints.js';

const DEG = Math.PI / 180;

/** Region from longitude: west of 100° W is the Pacific Northwest, east of it Southern Ontario (spec). */
export function regionFromLon(lon) {
  if (!Number.isFinite(lon)) return 'pnw';
  return lon < -100 ? 'pnw' : 'on';
}

/** Coordinates are rounded to 2 dp (about 1 km) before they leave the device. */
export function round2(x) {
  return Math.round(x * 100) / 100;
}

/**
 * Camera-space gravity (down vector; x right, y down, z out of the REAR lens)
 * from DeviceOrientationEvent beta/gamma (degrees) and the screen orientation
 * angle (0 portrait, 90 landscape turned counter-clockwise, ...).
 * Device frame (W3C): x right, y up the screen, z out of the screen; with
 * R = Rz(α)Rx(β)Ry(γ) the earth's down in the device frame is
 * [cosβ sinγ, −sinβ, −cosβ cosγ]. The rear camera looks along −z_device.
 * @returns {number[]|null}
 */
export function gravityFromOrientation(beta, gamma, screenAngle = 0) {
  if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return null;
  const b = beta * DEG;
  const g = gamma * DEG;
  const d = [Math.cos(b) * Math.sin(g), -Math.sin(b), -Math.cos(b) * Math.cos(g)];
  // portrait camera image: x = device x, y = -device y
  const p0 = d[0];
  const p1 = -d[1];
  const a = (Number.isFinite(screenAngle) ? screenAngle : 0) * DEG;
  const x = p0 * Math.cos(a) + p1 * Math.sin(a);
  const y = -p0 * Math.sin(a) + p1 * Math.cos(a);
  const clean = (v) => (Math.abs(v) < 1e-12 ? 0 : v);
  return [clean(x), clean(y), clean(-d[2])];
}

/**
 * Relative inverse depth of perfectly level ground seen by a pinhole camera
 * with the given gravity: 1/z = (g · ray) / h. Used when the depth model is
 * missing, so the photo still gets a ground frame (metres from the scale line)
 * and the manual slope buttons supply the heights. Above the horizon the value
 * is clamped to a small positive number (far away).
 * The camera height is chosen so the marked scale line measures its metres on
 * that level ground; pass the returned cameraHeightM to toHeightfield so its
 * height prior picks exactly this plane (otherwise the prior and the line
 * disagree and the solve tilts the ground).
 * @returns {{w:number, h:number, data:Float32Array, aspect:number, cameraHeightM:number}}
 */
export function flatDepth({ w, h, gravity, aspect, scale = null, fovYDeg = 65 }) {
  const g = gravity && gravity.length === 3 ? gravity : [0, 0.94, 0.342];
  const n = Math.hypot(...g) || 1;
  const tanH = Math.tan((fovYDeg * DEG) / 2);
  const asp = aspect > 0 ? aspect : w / h;
  const ray = (uv) => [(uv[0] - 0.5) * 2 * tanH * asp, (uv[1] - 0.5) * 2 * tanH, 1];
  let cameraHeightM = 1.4;
  if (scale && scale.a && scale.b && scale.meters > 0) {
    const onGround = (r) => {
      const q = (g[0] * r[0] + g[1] * r[1] + g[2] * r[2]) / n;
      return q > 1e-6 ? r.map((v) => v / q) : null;
    };
    const pa = onGround(ray(scale.a));
    const pb = onGround(ray(scale.b));
    const L = pa && pb ? Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]) : 0;
    if (L > 1e-9 && Number.isFinite(L)) cameraHeightM = scale.meters / L;
  }
  const data = new Float32Array(w * h);
  for (let j = 0; j < h; j++) {
    const ry = ((j + 0.5) / h - 0.5) * 2 * tanH;
    for (let i = 0; i < w; i++) {
      const rx = ((i + 0.5) / w - 0.5) * 2 * tanH * asp;
      const q = (g[0] * rx + g[1] * ry + g[2]) / n;
      data[j * w + i] = Math.max(q, 0.002) / cameraHeightM;
    }
  }
  return { w, h, data, aspect: asp, cameraHeightM };
}

/** Every image mark through toGround([u, v]) -> [x, y] metres. */
export function groundMarks(m, toGround) {
  const g = (p) => (p ? toGround(p) : null);
  return {
    downspout: g(m.downspout),
    outlet: g(m.outlet),
    wallPts: (m.wall || []).map(g),
    yard: (m.yard || []).map(g),
    septic: m.septic && m.septic.length >= 3 ? m.septic.map(g) : null,
    scale: m.scale ? { a: g(m.scale.a), b: g(m.scale.b), meters: m.scale.meters } : null,
  };
}

function segDist(px, py, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.min(1, Math.max(0, ((px - a[0]) * dx + (py - a[1]) * dy) / l2)) : 0;
  return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy);
}

/**
 * The house wall on the ground, as a segment through the downspout (a
 * downspout stands at the foot of the wall) parallel to the yard edge nearest
 * it (people outline the yard along the house). Wall taps are not used for
 * this: a tap high on the wall projects through the ground plane to a point
 * inside the house, not to the wall's foot.
 * @returns {number[][]} [[x0, y0], [x1, y1]]
 */
export function wallLine(yard, spout, halfLenM = 6) {
  let best = null;
  let bestD = Infinity;
  for (let k = 0; k < yard.length; k++) {
    const a = yard[k];
    const b = yard[(k + 1) % yard.length];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-9) continue;
    const d = segDist(spout[0], spout[1], a, b);
    if (d < bestD) { bestD = d; best = [a, b]; }
  }
  let ux = 0;
  let uy = 1;
  if (best) {
    const L = Math.hypot(best[1][0] - best[0][0], best[1][1] - best[0][1]);
    ux = (best[1][0] - best[0][0]) / L;
    uy = (best[1][1] - best[0][1]) / L;
  }
  return [[spout[0] - ux * halfLenM, spout[1] - uy * halfLenM], [spout[0] + ux * halfLenM, spout[1] + uy * halfLenM]];
}

function centroid(poly) {
  let x = 0;
  let y = 0;
  for (const p of poly) { x += p[0]; y += p[1]; }
  return [x / poly.length, y / poly.length];
}

/** House footprint: cells on the far side of the wall line from the yard, and outside the yard. */
export function houseMask(terrain, seg, yard, mask) {
  const { nx, ny, cell } = terrain;
  const out = new Uint8Array(nx * ny);
  const [a, b] = seg;
  const side = (x, y) => (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
  const c = centroid(yard);
  const yardSide = Math.sign(side(c[0], c[1])) || 1;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (mask && mask[k]) continue;
      if (Math.sign(side((i + 0.5) * cell, (j + 0.5) * cell)) === -yardSide) out[k] = 1;
    }
  }
  return out;
}

/**
 * Where water may leave: over the edge of the ground grid, except where the
 * house stands, never at the downspout. Not at the yard's outline: a downspout
 * sits on that outline (the house side), so making the outline an outlet
 * would send all the roof water out of the yard in its first metre. The
 * outlet tap sets the manual slope's direction instead (manualDir).
 */
export function outletMask(terrain, house, roofCell = -1) {
  const { nx, ny } = terrain;
  const out = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if ((i === 0 || j === 0 || i === nx - 1 || j === ny - 1) && !house[k]) out[k] = 1;
    }
  }
  if (roofCell >= 0) out[roofCell] = 0;
  return out;
}

/** Index of the in-yard cell nearest to a ground point (any cell if the mask is empty). */
export function snapCell(terrain, mask, pt) {
  const { nx, ny, cell } = terrain;
  let best = -1;
  let bestD = Infinity;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (mask && !mask[k]) continue;
      const d = (i + 0.5) * cell - pt[0];
      const e = (j + 0.5) * cell - pt[1];
      const dd = d * d + e * e;
      if (dd < bestD) { bestD = dd; best = k; }
    }
  }
  if (best < 0) {
    const i = Math.min(nx - 1, Math.max(0, Math.floor(pt[0] / cell)));
    const j = Math.min(ny - 1, Math.max(0, Math.floor(pt[1] / cell)));
    best = j * nx + i;
  }
  return best;
}

/** Unit normal of the wall segment pointing into the yard (toward the yard's centroid). */
export function wallNormal(wall, yard) {
  const dx = wall[1][0] - wall[0][0];
  const dy = wall[1][1] - wall[0][1];
  const L = Math.hypot(dx, dy) || 1;
  let n = [-dy / L, dx / L];
  const c = centroid(yard);
  if ((c[0] - wall[0][0]) * n[0] + (c[1] - wall[0][1]) * n[1] < 0) n = [-n[0], -n[1]];
  return n;
}

/** Downspout extension (m): roof water is let out this far from the wall, not at its foot. */
export const SPOUT_EXTENSION_M = 2;

/**
 * Sim + optimizer inputs from a terrain (with .mask) and the ground marks.
 * roof.mask = the house footprint (rain on it is the roof's, routed to the
 * downspout; without it the roof's rain would be counted twice). The roof
 * water enters the yard SPOUT_EXTENSION_M out from the wall (an extension
 * pipe or splash block, which the plan's build steps call for), snapped to
 * the nearest yard cell: let out at the wall's foot it would hug the yard's
 * edge, where no garden fits 3 m from the house.
 */
export function siteInputs(terrain, gm, roofAreaM2, extensionM = SPOUT_EXTENSION_M) {
  const { nx, ny, cell } = terrain;
  const mask = terrain.mask || new Uint8Array(nx * ny).fill(1);
  const reach = Math.hypot(nx * cell, ny * cell);
  const wall = wallLine(gm.yard, gm.downspout, reach);
  const house = houseMask(terrain, wall, gm.yard, mask);
  const nrm = wallNormal(wall, gm.yard);
  const inlet = [gm.downspout[0] + nrm[0] * extensionM, gm.downspout[1] + nrm[1] * extensionM];
  const roofCell = snapCell(terrain, mask, inlet);
  const outlet = outletMask(terrain, house, roofCell);
  return {
    outlet,
    imperv: house,
    house,
    roof: { areaM2: roofAreaM2 > 0 ? roofAreaM2 : 0, cell: roofCell, mask: house },
    site: { yard: gm.yard, wall, septic: gm.septic || null },
    inlet: [((roofCell % nx) + 0.5) * cell, (Math.floor(roofCell / nx) + 0.5) * cell],
  };
}

const ZONE_ORDER = { wet: 0, middle: 1, edge: 2 };

/** Plant table rows: one per species, wet → middle → edge, most planted first. */
export function plantRows(placed, plants) {
  const byId = new Map(plants.map((p) => [p.id, p]));
  const rows = new Map();
  for (const p of placed) {
    const info = byId.get(p.id);
    if (!info) continue;
    if (!rows.has(p.id)) {
      rows.set(p.id, {
        id: p.id, common: info.common, latin: info.latin, zone: p.zone || info.zone, qty: 0,
        spacingM: info.spacing_m, spreadM: info.spread_m, heightM: info.height_m, form: info.form, sources: info.sources || [],
      });
    }
    rows.get(p.id).qty++;
  }
  return [...rows.values()].sort((a, b) => ZONE_ORDER[a.zone] - ZONE_ORDER[b.zone] || b.qty - a.qty || (a.id < b.id ? -1 : 1));
}

/** 12345.6 -> "12,346" (en-CA grouping, no locale lookup so Node and browsers agree). */
export function fmtNum(n, dp = 0) {
  const v = Number.isFinite(n) ? n : 0;
  const s = Math.abs(v).toFixed(dp);
  const [int, frac] = s.split('.');
  const g = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (v < 0 && Number(s) !== 0 ? '-' : '') + g + (frac ? '.' + frac : '');
}

/** Litres, never negative. */
export function fmtL(n) {
  return `${fmtNum(Math.max(0, Number.isFinite(n) ? n : 0))} L`;
}

/** Standing-water hours in words. */
export function fmtHours(h) {
  if (h === Infinity || !Number.isFinite(h)) return 'more than 48 h';
  if (h <= 0) return 'no standing water';
  if (h < 1) return 'under 1 h';
  return `${Math.round(h)} h`;
}

const DIRS8 = ['the right', 'the back right', 'the back', 'the back left', 'the left', 'the front left', 'the front', 'the front right'];

/** A ground direction (x right, y away from the camera) in words. */
export function directionWords(v) {
  const a = Math.atan2(v[1], v[0]);
  const k = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
  return DIRS8[k];
}

/** "Falls about 3% toward the back right (likely 1–6%)". downhill: ground vector. */
export function slopeSentence(conf, downhill) {
  const lo = Math.round(Math.max(0, conf.lowPct));
  const hi = Math.round(conf.highPct);
  const band = `(likely ${lo}–${hi}%)`;
  if (!(conf.slopePct >= 1) || !downhill || !(Math.hypot(downhill[0], downhill[1]) > 0)) return `Nearly flat ${band}`;
  return `Falls about ${Math.round(conf.slopePct)}% toward ${directionWords(downhill)} ${band}`;
}

/** Storm clock from midnight: "2:00 pm", "next day 3:00 am", "day 3, 3:00 am" (5-minute steps). */
export function clockLabel(tS) {
  const mins = Math.round(Math.max(0, tS) / 300) * 5;
  const day = Math.floor(mins / 1440);
  const m = mins % 1440;
  const h24 = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, '0');
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const t = `${h12}:${mm} ${h24 < 12 ? 'am' : 'pm'}`;
  if (day === 0) return t;
  if (day === 1) return `next day ${t}`;
  return `day ${day + 1}, ${t}`;
}

/** Rain intensity (mm/h) at time tS from per-step depths. */
export function rainRateAt(mm, stepS, tS) {
  const k = Math.floor(tS / stepS);
  if (!(k >= 0) || k >= mm.length) return 0;
  return (mm[k] * 3600) / stepS;
}

/** Frame pair and blend for time t (frames sorted by t); holds the first and last. */
export function frameIndexAt(frames, t) {
  const n = frames.length;
  if (n === 0) return { i: -1, k: 0 };
  if (t <= frames[0].t) return { i: 0, k: 0 };
  if (t >= frames[n - 1].t) return { i: n - 1, k: 0 };
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].t <= t) lo = mid; else hi = mid;
  }
  return { i: lo, k: (t - frames[lo].t) / (frames[hi].t - frames[lo].t) };
}

/**
 * Write the depth at time t into out (linear between frames). fadeS > 0: past
 * the last frame the water fades to nothing over fadeS seconds (the sim stops
 * sending frames once every pond is empty, so the last sheet flow must drain).
 */
export function lerpFrames(frames, t, out, fadeS = 0) {
  const { i, k } = frameIndexAt(frames, t);
  if (i < 0) { out.fill(0); return out; }
  const a = frames[i].depth;
  const last = frames[frames.length - 1];
  if (fadeS > 0 && t > last.t) {
    const f = Math.max(0, 1 - (t - last.t) / fadeS);
    for (let j = 0; j < out.length; j++) out[j] = last.depth[j] * f;
    return out;
  }
  if (k === 0 || i + 1 >= frames.length) { out.set(a.subarray(0, out.length)); return out; }
  const b = frames[i + 1].depth;
  for (let j = 0; j < out.length; j++) out[j] = a[j] + (b[j] - a[j]) * k;
  return out;
}

/** Greedy word wrap to at most `width` characters per line. */
export function wrapText(text, width) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (!cur) cur = w;
    else if (cur.length + 1 + w.length <= width) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

/** SVG path for a hyetograph sparkline in a w×h box (binned to at most 60 points by max). */
export function sparkPath(values, w, h) {
  const v = Array.from(values || []);
  if (!v.length) return '';
  let pts = v;
  if (v.length > 60) {
    const k = Math.ceil(v.length / 60);
    pts = [];
    for (let i = 0; i < v.length; i += k) pts.push(Math.max(...v.slice(i, i + k)));
  }
  const max = Math.max(...pts) || 1;
  const f = (x) => +x.toFixed(1);
  const n = pts.length;
  return pts.map((y, i) => `${i ? 'L' : 'M'}${f(n > 1 ? (i / (n - 1)) * w : 0)} ${f(h - (y / max) * h)}`).join(' ');
}

/** Garden numbers for the plan: full axes, depth, berm, clear gap from the wall to the garden edge (m). */
export function gardenDims(g, wall) {
  let houseM = null;
  if (wall) {
    houseM = Infinity;
    const c = Math.cos(g.rot || 0);
    const s = Math.sin(g.rot || 0);
    for (let k = 0; k < 144; k++) {
      const t = (k / 144) * Math.PI * 2;
      const lx = (Math.cos(t) * g.lenM) / 2;
      const ly = (Math.sin(t) * g.widM) / 2;
      houseM = Math.min(houseM, segDist(g.cx + lx * c - ly * s, g.cy + lx * s + ly * c, wall[0], wall[1]));
    }
  }
  return { lengthM: g.lenM, widthM: g.widM, depthM: g.depthM, bermM: g.bermM || 0, houseM };
}

/** Downhill direction for the manual slope: downspout -> outlet, else away from the camera. */
export function manualDir(spout, outlet) {
  if (!spout || !outlet) return [0, 1];
  const dx = outlet[0] - spout[0];
  const dy = outlet[1] - spout[1];
  const L = Math.hypot(dx, dy);
  return L > 1e-9 ? [dx / L, dy / L] : [0, 1];
}

/** Absolute polygon area (m²). */
export function polyAreaM2(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) / 2;
}

/** Yard mask for a terrain from a ground polygon (cell centres inside). */
export function polygonMask(terrain, poly) {
  const { nx, ny, cell } = terrain;
  const m = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) m[j * nx + i] = inPolygon((i + 0.5) * cell, (j + 0.5) * cell, poly) ? 1 : 0;
  return m;
}

/** Clip segment [[x0, y0], [x1, y1]] to [0, W] x [0, D] (Liang-Barsky); null when it misses. */
export function clipSegment(seg, W, D) {
  const [[x0, y0], [x1, y1]] = seg;
  const dx = x1 - x0;
  const dy = y1 - y0;
  let t0 = 0;
  let t1 = 1;
  const edges = [[-dx, x0], [dx, W - x0], [-dy, y0], [dy, D - y0]];
  for (const [p, q] of edges) {
    if (p === 0) { if (q < 0) return null; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  const f = (v) => Math.round(v * 1e9) / 1e9;
  return [[f(x0 + t0 * dx), f(y0 + t0 * dy)], [f(x0 + t1 * dx), f(y0 + t1 * dy)]];
}

/** Ground marks for the yard view ({ kind, pts }, see src/render/overlays.js). */
export function rendererMarks(gm, site, W, D) {
  const out = [];
  if (site && site.wall) {
    const w = clipSegment(site.wall, W, D);
    if (w) out.push({ kind: 'wall', pts: w });
  }
  if (gm.septic && gm.septic.length >= 3) out.push({ kind: 'septic', pts: gm.septic });
  if (gm.scale && gm.scale.a && gm.scale.b) out.push({ kind: 'scale', pts: [gm.scale.a, gm.scale.b] });
  if (gm.outlet) out.push({ kind: 'outlet', pts: [gm.outlet] });
  if (gm.downspout) out.push({ kind: 'downspout', pts: [gm.downspout] });
  return out;
}

/** Contour interval (m) from a round set, aiming at about 8 lines over the height range. */
export function niceInterval(rangeM) {
  if (!(rangeM > 0)) return 0.05;
  const steps = [0.01, 0.02, 0.025, 0.05, 0.1, 0.2, 0.25, 0.5, 1];
  for (const s of steps) if (rangeM / s <= 10) return s;
  return 1;
}

const LEDGER_KEYS = ['rainL', 'roofL', 'infiltratedL', 'outL', 'storedL'];

/** Running water ledger at time t: zero at t = 0, linear up to the first frame, then between frames. */
export function ledgerAt(frames, t) {
  const out = {};
  for (const key of LEDGER_KEYS) out[key] = 0;
  if (!frames.length) return out;
  const f0 = frames[0];
  if (t < f0.t) {
    const k = Math.max(0, t) / f0.t;
    for (const key of LEDGER_KEYS) out[key] = (f0.ledger[key] || 0) * k;
    return out;
  }
  const { i, k } = frameIndexAt(frames, t);
  const a = frames[i].ledger;
  const b = frames[Math.min(frames.length - 1, i + 1)].ledger;
  for (const key of LEDGER_KEYS) out[key] = (a[key] || 0) + ((b[key] || 0) - (a[key] || 0)) * k;
  return out;
}

/** The optimizer's { ok: false, reason } in plain words, with what to try next. */
export function failureWords(reason) {
  const r = String(reason || '');
  if (/budget/.test(r)) return { say: 'Your budget won’t cover even the smallest garden.', tips: ['Raise the budget a little.', 'Plant plugs instead of pots to keep plant costs down.'] };
  if (/area limit/.test(r)) return { say: 'The area limit is smaller than the smallest garden we can draw.', tips: ['Raise the maximum area to at least 1 m².'] };
  if (/within .* of the house/.test(r)) {
    const m = r.match(/within ([\d.]+) m/);
    return { say: `Every open spot in the yard is within ${m ? m[1] : 3} m of the house.`, tips: ['Check the yard outline reaches the far side of the lawn.', 'Mark the downspout and wall again if they moved.', 'Ask about a planter box against the house instead.'] };
  }
  if (/septic/.test(r)) return { say: 'The septic field’s safety buffer covers the rest of the yard.', tips: ['Check the septic outline is drawn where the field really is.', 'Ask a septic installer before digging near it.'] };
  if (/drains within/.test(r)) return { say: 'Your soil drains too slowly for any garden here to empty within 48 hours.', tips: ['Try Loam if a jar test says it is not really clay.', 'Ask a landscaper about an underdrain or a lined planter.'] };
  if (/too small/.test(r)) return { say: 'The yard is too small for a garden with a berm and a 0.5 m gap from the fence.', tips: ['Outline the yard again, including all of the lawn.'] };
  return { say: 'We couldn’t find a garden that fits these limits.', tips: ['Raise the budget or the maximum area.', 'Check the yard outline.'] };
}
