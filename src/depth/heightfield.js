/**
 * Monocular relative depth -> metric heightfield of the yard, with an honest
 * slope confidence band.
 *
 * Why this is not just "scale the depth": Depth Anything V2 returns RELATIVE
 * INVERSE depth d (larger = nearer) that is only known up to an affine map:
 * true 1/z = s*d + t with s, t unknown per photo. The scale s is fixed by the
 * line the user marks (default 1 m). The shift t is the hard part, and it is
 * worth being precise about why: on any surface, changing t maps the
 * reconstruction through a projective transform that fixes the camera centre
 * (P -> P / (1 + tau * z)). Projective maps send planes to planes, so "make the
 * yard as planar as possible" CANNOT find t; every t gives an equally planar
 * yard, just tilted differently. Only metric cues can. We use, in order:
 *
 *   1. gravity + >= 3 wall taps: the house wall must be vertical, i.e. its
 *      plane normal perpendicular to gravity. That is linear in t: closed form.
 *   2. otherwise a camera-height prior (default 1.4 m: a phone held at chest
 *      height): the marked line gives metres for each candidate t, and we pick
 *      the t whose camera sits cameraHeightM above the ground plane. The band
 *      then includes how much the slope moves between 1.2 m and 1.6 m.
 *
 * Gravity, in priority: the `gravity` argument (phone sensors, camera space);
 * else derived from >= 3 wall taps (wall normal is horizontal, and we assume no
 * camera roll, so gravity is perpendicular to both the wall normal and the
 * camera's x axis) -> source 'wall'; else 'level-assumed': the fitted ground
 * plane is declared level, only the residual relief is real, and the band is
 * [0, max(|slope| + 3, 12)] pp. Wall taps that are collinear, singular or give
 * |g| ~ 0 are dropped with a "wall unusable" note.
 *
 * Conventions (all documented here, used everywhere in src/depth):
 *   - Image coords (u, v) in 0..1, u right, v down; depth.data is row-major
 *     w x h and covers the whole photo (stretch, see preprocess.js); the
 *     photo's aspect is depth.aspect (w / h of the PHOTO), else depth.w/depth.h.
 *   - Camera space (OpenCV): x right, y down, z out of the lens. Pinhole with
 *     vertical FOV fovYDeg (65 deg default, a typical phone main camera).
 *     Ray through (u, v): [(u - .5) * 2 tan(fov/2) * aspect, (v - .5) * 2 tan(fov/2), 1].
 *   - gravity: unit-ish vector pointing DOWN (toward the earth) in camera
 *     space. Phone level and looking at the horizon: [0, 1, 0].
 *   - Ground frame: x = right, y = away from the camera (horizontal projection
 *     of the view direction), metres. z = up. Origin = the near-left corner of
 *     the yard's bounding box, so terrain cell (i, j) covers
 *     x in [i*cell, (i+1)*cell), y in [j*cell, (j+1)*cell); heights are sampled
 *     at cell centres. Grid row 0 is the NEAREST edge. index = y * nx + x.
 *   - Heights are relative: the lowest cell is 0. terrain.mask (Uint8Array,
 *     same indexing) is 1 for cells whose centre falls inside the yard polygon.
 *
 * Relief: each grid cell is projected into the photo through the fitted plane,
 * and the height offset of the depth-model point on that same ray is added
 * (inside the yard polygon only; outside it the plane is used, because the
 * bounding box can contain the house or a fence). The horizontal shift of a
 * relief point along its ray is ignored; it is a few cm for relief that is
 * small next to the camera height. Relief is lightly smoothed and clamped to
 * +/-1 m so a bad depth pixel cannot make a cliff.
 *
 * Confidence band (percentage points of slope):
 *   half-width = 0.5 * |slope|            fixed +/-50% monocular relief uncertainty
 *              + 2 * SE                    plane-fit standard error over the yard,
 *                                          counting at most 64 independent samples
 *                                          (residuals are spatially correlated)
 *              + camera-height spread      only when the height prior was used
 *   level-assumed: the band is [0, max(|slope| + 3, 12)] pp; the fitted tilt is
 *   unknown without gravity, and 12% is the steepest slope rain-garden guides
 *   allow, so the band says "somewhere between level and too steep".
 *   lowPct is clamped at 0. manualSuggested is set when the band is wider than
 *   8 pp, the yard is under 4 m^2, the scale line or polygon is degenerate, or
 *   gravity had to be assumed: the UI then offers manualTerrain().
 *
 * Pure module: no DOM; typed arrays and plain objects in and out.
 */

const DEG = Math.PI / 180;
const HEIGHT_RANGE = [1.2, 1.6]; // m, phone held at waist..eye height
const RELIEF_CLAMP = 1; // m
const MAX_PLAUSIBLE_SLOPE = 60; // %, ~31 deg: steeper than any lawn you would dig a rain garden in
const MAX_EXTENT = 80; // m, a yard bigger than this is a misread horizon

/**
 * @param {object} o
 * @param {{ w:number, h:number, data:Float32Array, aspect?:number }} o.depth relative inverse depth
 * @param {number} [o.fovYDeg]
 * @param {null|number[]} [o.gravity] camera-space down vector
 * @param {null|number[][]} [o.wallPts] [[u, v], ...] taps on the house wall
 * @param {number[][]} o.yard [[u, v], ...] yard polygon in image coords
 * @param {{ a:number[], b:number[], meters:number }} o.scale the marked line
 * @param {number} [o.n] cells along the longer side
 * @param {number} [o.cameraHeightM] prior for the camera height above the ground
 */
export function toHeightfield({ depth, fovYDeg = 65, gravity = null, wallPts = null, yard, scale, n = 128, cameraHeightM = 1.4 }) {
  const flags = [];
  const W = depth.w;
  const Hh = depth.h;
  const aspect = depth.aspect > 0 ? depth.aspect : W / Hh;
  const tanH = Math.tan((fovYDeg * DEG) / 2);
  const ray = (uv) => [(uv[0] - 0.5) * 2 * tanH * aspect, (uv[1] - 0.5) * 2 * tanH, 1];
  const N = n >= 8 && Number.isFinite(n) ? Math.round(n) : 128;
  const h0 = cameraHeightM > 0 ? cameraHeightM : 1.4;

  let poly = Array.isArray(yard) ? yard.filter((p) => p && Number.isFinite(p[0]) && Number.isFinite(p[1])) : [];
  if (poly.length < 3 || Math.abs(polyArea(poly)) < 1e-9) {
    flags.push('yard polygon degenerate; using the lower half of the photo');
    poly = [[0.02, 0.5], [0.98, 0.5], [0.98, 0.98], [0.02, 0.98]];
  }

  // --- 1. depth samples inside the yard, normalised for conditioning -------
  const raw = (uv) => bilinear(depth.data, W, Hh, uv[0] * W - 0.5, uv[1] * Hh - 0.5);
  const samples = samplePolygon(poly, 64).map((uv) => ({ uv, r: ray(uv), d: raw(uv) })).filter((s) => Number.isFinite(s.d));
  if (samples.length < 12) flags.push('too few depth samples in the yard');
  const ds = samples.map((s) => s.d).sort((p, q) => p - q);
  const med = ds.length ? quantile(ds, 0.5) : 0;
  let spread = ds.length ? (quantile(ds, 0.75) - quantile(ds, 0.25)) / 1.349 : 1;
  if (!(spread > 1e-12)) spread = 1;
  const norm = (d) => (d - med) / spread;
  for (const s of samples) s.dn = norm(s.d);

  // --- 2. robust plane in inverse depth: dn ~ a . r -------------------------
  const a = samples.length >= 3 ? robustLinear(samples.map((s) => s.r), samples.map((s) => s.dn)) : [0, 0, 0];

  // wall plane (same affine), from a 3x3 median around each tap
  let b = null;
  if (Array.isArray(wallPts) && wallPts.length >= 3) {
    const wr = [];
    const wd = [];
    for (const p of wallPts) {
      if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
      const d = medianAround(depth.data, W, Hh, p[0], p[1]);
      if (Number.isFinite(d)) {
        wr.push(ray(p));
        wd.push(norm(d));
      }
    }
    if (wr.length < 3) flags.push('wall unusable: fewer than 3 taps with depth');
    else if (collinear(wallPts.filter((p) => p && Number.isFinite(p[0]) && Number.isFinite(p[1])))) {
      flags.push('wall unusable: taps are (nearly) on one line, so they do not define a plane');
    } else {
      b = leastSquares3(wr, wd);
      if (!b || !b.every(Number.isFinite)) {
        b = null;
        flags.push('wall unusable: singular wall plane');
      } else if (Math.hypot(b[0], b[1]) < 1e-6 * (Math.abs(b[2]) + 1)) {
        // a wall seen square-on with no depth gradient carries no direction
        b = null;
        flags.push('wall unusable: no depth gradient across the taps');
      }
    }
  }

  let g0 = null;
  if (Array.isArray(gravity) && gravity.length === 3 && gravity.every(Number.isFinite)) {
    const L = Math.hypot(...gravity);
    if (L > 1e-9) g0 = gravity.map((v) => v / L);
  }
  const source = g0 ? 'gravity' : b ? 'wall' : 'level-assumed';
  let wallGravityFailed = false;

  // scale line rays
  const sa = scale && Array.isArray(scale.a) ? ray(scale.a) : null;
  const sb = scale && Array.isArray(scale.b) ? ray(scale.b) : null;
  const meters = scale && scale.meters > 0 ? scale.meters : 1;
  let scaleOk = !!(sa && sb && sa.every(Number.isFinite) && sb.every(Number.isFinite));

  // valid shifts keep every yard ray (and the scale ends) in front of the camera
  let minAr = Infinity;
  let maxAr = -Infinity;
  for (const s of samples) {
    const v = dot(a, s.r);
    minAr = Math.min(minAr, v);
    maxAr = Math.max(maxAr, v);
  }
  if (scaleOk) for (const r of [sa, sb]) minAr = Math.min(minAr, dot(a, r));
  if (!Number.isFinite(minAr)) {
    minAr = 0;
    maxAr = 1;
  }
  const tauMin = -minAr;
  const range = Math.max(maxAr - minAr, 1e-6);

  // everything that depends on the shift tau
  const model = (tau) => {
    const m = [a[0], a[1], a[2] + tau];
    const mLen = Math.hypot(...m);
    let g;
    if (g0) g = g0;
    else if (b) {
      const w = [b[0], b[1], b[2] + tau];
      g = [0, w[2], -w[1]]; // perpendicular to the wall normal and to camera x (no roll)
      const gl = Math.hypot(...g);
      if (!(gl > 1e-9 * (Math.hypot(...w) + 1e-12))) {
        // wall normal along camera x: gravity undefined for this shift; read it as level
        wallGravityFailed = true;
        g = m.map((v) => v / (mLen || 1));
      } else {
        g = g.map((v) => v / gl);
        if (dot(g, m) < 0 || (dot(g, m) === 0 && g[1] < 0)) g = g.map((v) => -v);
      }
    } else g = m.map((v) => v / (mLen || 1));
    // metres per unscaled unit, from the marked line on the plane
    let k = NaN;
    if (scaleOk) {
      const pa = onPlane(m, sa);
      const pb = onPlane(m, sb);
      const L = Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]);
      if (L > 1e-12 && Number.isFinite(L)) k = meters / L;
    }
    const mg = dot(m, g);
    const height = mg > 1e-12 ? k / mg : NaN; // vertical distance camera -> plane
    const cos = mLen > 0 ? Math.min(1, Math.abs(mg) / mLen) : 1;
    const planeSlope = 100 * Math.tan(Math.acos(cos));
    return { tau, m, g, k, height, planeSlope };
  };

  // --- 3. choose tau ------------------------------------------------------
  const solveHeight = (target) => {
    const steps = 241;
    const taus = [];
    for (let i = 0; i < steps; i++) taus.push(tauMin + range * 10 ** (-4 + (8 * i) / (steps - 1)));
    const f = taus.map((t) => model(t).height - target);
    const roots = [];
    for (let i = 0; i + 1 < steps; i++) {
      if (Number.isFinite(f[i]) && Number.isFinite(f[i + 1]) && (f[i] === 0 || f[i] * f[i + 1] < 0)) {
        let lo = taus[i];
        let hi = taus[i + 1];
        let flo = f[i];
        for (let it = 0; it < 60; it++) {
          const mid = 0.5 * (lo + hi);
          const fm = model(mid).height - target;
          if (flo * fm <= 0) hi = mid;
          else {
            lo = mid;
            flo = fm;
          }
        }
        roots.push(0.5 * (lo + hi));
      }
    }
    // h(tau) is not monotonic, so several shifts can put the camera at the
    // target height. The wrong ones read the yard as a cliff (100-200% in the
    // tests), so: drop implausible slopes, then take the gentlest.
    const slopeOf = (t) => model(t).planeSlope;
    const plausible = roots.filter((t) => slopeOf(t) <= MAX_PLAUSIBLE_SLOPE);
    if (plausible.length) {
      let best = plausible[0];
      for (const t of plausible) if (slopeOf(t) < slopeOf(best)) best = t;
      return { tau: best, exact: true };
    }
    // no root: the closest plausible shift (or the closest of all)
    let best = taus[0];
    let bestErr = Infinity;
    for (const onlyPlausible of [true, false]) {
      taus.forEach((t, i) => {
        if (!Number.isFinite(f[i]) || Math.abs(f[i]) >= bestErr) return;
        if (onlyPlausible && !(slopeOf(t) <= MAX_PLAUSIBLE_SLOPE)) return;
        bestErr = Math.abs(f[i]);
        best = t;
      });
      if (bestErr < Infinity) break;
    }
    return { tau: best, exact: false };
  };

  let tau;
  let usedPrior = true;
  if (g0 && b && Math.abs(g0[2]) > 1e-3) {
    const tw = -dot(b, g0) / g0[2];
    if (Number.isFinite(tw) && tw > tauMin) {
      tau = tw;
      usedPrior = false;
    }
  }
  if (tau === undefined) {
    const sol = solveHeight(h0);
    tau = sol.tau;
    if (!sol.exact) flags.push('no shift puts the camera at the assumed height');
  }
  let M = model(tau);
  if (!(M.k > 0) || !Number.isFinite(M.k)) {
    // no usable scale line: let the camera-height prior set the metres
    scaleOk = false;
    flags.push('scale line unusable; metres from the camera-height prior');
    const mg = dot(M.m, M.g);
    M = { ...M, k: h0 * (mg > 1e-12 ? mg : Math.hypot(...M.m) || 1) };
    M.height = h0;
  }
  let heightSpread = 0;
  if (usedPrior && source !== 'level-assumed') {
    for (const hh of HEIGHT_RANGE) {
      const s = model(solveHeight(hh).tau).planeSlope;
      if (Number.isFinite(s)) heightSpread = Math.max(heightSpread, Math.abs(s - M.planeSlope));
    }
  }

  // --- 4. ground frame ------------------------------------------------------
  const { m, g, k } = M;
  const U = g.map((v) => -v);
  let F = sub([0, 0, 1], scl(U, U[2]));
  if (Math.hypot(...F) < 0.05) F = sub([0, -1, 0], scl(U, -U[1])); // looking straight down: image-up is away
  F = unit(F);
  const X = unit(cross(F, U));
  const planePoint = (r) => {
    const q = Math.max(dot(m, r), 1e-9 * Math.hypot(...m) + 1e-12);
    return scl(r, k / q);
  };
  const groundRaw = (uv) => {
    const P = planePoint(ray(uv));
    return [dot(P, X), dot(P, F)];
  };

  // bounding box of the yard on the ground (projective: polygon edges stay straight)
  const gp = poly.map(groundRaw);
  let x0 = Math.min(...gp.map((p) => p[0]));
  let x1 = Math.max(...gp.map((p) => p[0]));
  let y0 = Math.min(...gp.map((p) => p[1]));
  let y1 = Math.max(...gp.map((p) => p[1]));
  if (![x0, x1, y0, y1].every(Number.isFinite)) {
    flags.push('yard projects to infinity');
    [x0, x1, y0, y1] = [-5, 5, 0, 10];
  }
  if (x1 - x0 > MAX_EXTENT) {
    const c = (x0 + x1) / 2;
    x0 = c - MAX_EXTENT / 2;
    x1 = c + MAX_EXTENT / 2;
    flags.push('yard wider than 80 m, clipped');
  }
  if (y1 - y0 > MAX_EXTENT) {
    y1 = y0 + MAX_EXTENT;
    flags.push('yard deeper than 80 m, clipped');
  }
  const ext = Math.max(x1 - x0, y1 - y0, 0.5);
  const cell = ext / N;
  const nx = Math.max(2, Math.round((x1 - x0) / cell));
  const ny = Math.max(2, Math.round((y1 - y0) / cell));
  const yardArea = Math.abs(polyArea(gp));

  const toGround = (uv) => {
    const p = groundRaw(uv);
    return [p[0] - x0, p[1] - y0];
  };
  const mU = dot(m, U);
  const worldOnPlane = (x, y) => {
    const Hp = add(scl(X, x + x0), scl(F, y + y0));
    const zz = Math.abs(mU) > 1e-12 ? (k - dot(m, Hp)) / mU : 0;
    return add(Hp, scl(U, zz));
  };
  const toImage = ([x, y]) => {
    const P = worldOnPlane(x, y);
    const zc = Math.abs(P[2]) > 1e-12 ? P[2] : 1e-12;
    return [P[0] / zc / (2 * tanH * aspect) + 0.5, P[1] / zc / (2 * tanH) + 0.5];
  };

  // --- 5. heights ------------------------------------------------------------
  const z = new Float64Array(nx * ny);
  const relief = new Float64Array(nx * ny);
  const inYard = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const cx = (i + 0.5) * cell;
      const cy = (j + 0.5) * cell;
      const P = worldOnPlane(cx, cy);
      const id = j * nx + i;
      z[id] = dot(P, U);
      if (!(P[2] > 0)) continue;
      const uv = [P[0] / P[2] / (2 * tanH * aspect) + 0.5, P[1] / P[2] / (2 * tanH) + 0.5];
      if (!(uv[0] >= 0 && uv[0] <= 1 && uv[1] >= 0 && uv[1] <= 1) || !inPolygon(poly, uv)) continue;
      inYard[id] = 1;
      const q = norm(raw(uv)) + tau; // unscaled inverse depth of the model's point on this ray
      const qPlane = dot(m, ray(uv));
      if (!(q > 0.05 * qPlane) || !Number.isFinite(q)) continue; // behind/at infinity: no relief
      const Praw = scl(P, qPlane / q);
      relief[id] = clamp(dot(Praw, U) - z[id], -RELIEF_CLAMP, RELIEF_CLAMP);
    }
  }
  smoothMasked(relief, inYard, nx, ny, 2);
  let zmin = Infinity;
  for (let id = 0; id < z.length; id++) {
    let v = z[id] + relief[id];
    if (!Number.isFinite(v)) v = Number.isFinite(z[id]) ? z[id] : 0;
    z[id] = v;
    if (v < zmin) zmin = v;
  }
  for (let id = 0; id < z.length; id++) z[id] -= zmin;

  // --- 6. confidence -----------------------------------------------------------
  const fit = planeFit(z, inYard, nx, ny, cell);
  const slopePct = 100 * Math.hypot(fit.gx, fit.gy);
  if (wallGravityFailed) flags.push('wall unusable: |g| ~ 0 for some shifts (wall normal along the camera x axis)');
  let half = 0.5 * Math.abs(slopePct) + 2 * fit.se + heightSpread;
  if (source === 'wall') half += 1; // the no-roll assumption
  let lowPct = Math.max(0, slopePct - half);
  let highPct = slopePct + half;
  if (source === 'level-assumed') {
    // With no gravity the fitted plane's tilt is unknown, so the reading says
    // nothing about the overall slope: anything from 0 up to the steepest a
    // rain garden is sited on (12%, the guides' limit) is possible.
    lowPct = 0;
    highPct = Math.max(Math.abs(slopePct) + 3, 12);
  }
  const confidence = {
    slopePct: finite(slopePct),
    lowPct: finite(lowPct),
    highPct: finite(highPct),
    source,
    manualSuggested: false,
  };
  if (yardArea < 4) flags.push('yard under 4 m^2');
  if (confidence.highPct - confidence.lowPct > 8) flags.push('slope band wider than 8 pp');
  confidence.manualSuggested =
    source === 'level-assumed' || !scaleOk || yardArea < 4 || samples.length < 12 || confidence.highPct - confidence.lowPct > 8 ||
    flags.some((f) => /degenerate|infinity|clipped/.test(f));
  confidence.notes = flags;

  return {
    terrain: { nx, ny, cell, z, mask: inYard },
    confidence,
    toGround,
    toImage,
    meta: { cameraHeightM: finite(M.height), usedHeightPrior: usedPrior, downhill: [-fit.gx, -fit.gy], yardAreaM2: yardArea },
  };
}

// ---------------------------------------------------------------- helpers ----

const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
const add = (p, q) => [p[0] + q[0], p[1] + q[1], p[2] + q[2]];
const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const scl = (p, s) => [p[0] * s, p[1] * s, p[2] * s];
const cross = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
const unit = (p) => {
  const L = Math.hypot(...p) || 1;
  return scl(p, 1 / L);
};
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const finite = (v) => (Number.isFinite(v) ? v : 0);
const onPlane = (m, r) => scl(r, 1 / Math.max(dot(m, r), 1e-12));

function quantile(sorted, q) {
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

function bilinear(data, w, h, fx, fy) {
  const x = clamp(fx, 0, w - 1);
  const y = clamp(fy, 0, h - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, w - 1);
  const y1 = Math.min(y0 + 1, h - 1);
  const tx = x - x0;
  const ty = y - y0;
  const top = data[y0 * w + x0] * (1 - tx) + data[y0 * w + x1] * tx;
  const bot = data[y1 * w + x0] * (1 - tx) + data[y1 * w + x1] * tx;
  return top * (1 - ty) + bot * ty;
}

/**
 * Median of bilinear samples at the tap and +/-1 px around it. Centred on the
 * exact tap (not the nearest pixel): three wall taps are only a few pixels
 * apart, so a half-pixel offset would tilt the wall plane noticeably. On a
 * locally linear surface the median of this symmetric set is the centre value.
 */
function medianAround(data, w, h, u, v) {
  const fx = u * w - 0.5;
  const fy = v * h - 0.5;
  const vals = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const val = bilinear(data, w, h, fx + dx, fy + dy);
      if (Number.isFinite(val)) vals.push(val);
    }
  }
  if (!vals.length) return NaN;
  vals.sort((p, q) => p - q);
  return quantile(vals, 0.5);
}

/** True when the taps span (almost) no area: the 2-D spread's minor axis is < 2% of its major. */
function collinear(pts) {
  if (pts.length < 3) return true;
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p[0], 0) / n;
  const my = pts.reduce((s, p) => s + p[1], 0) / n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const [x, y] of pts) {
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
    sxy += (x - mx) * (y - my);
  }
  const tr = sxx + syy;
  const det = sxx * syy - sxy * sxy;
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const big = tr / 2 + disc;
  const small = Math.max(0, tr / 2 - disc);
  return !(big > 1e-12) || Math.sqrt(small / big) < 0.02;
}

function polyArea(p) {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const [ax, ay] = p[i];
    const [bx, by] = p[(i + 1) % p.length];
    s += ax * by - bx * ay;
  }
  return s / 2;
}

function inPolygon(p, [x, y]) {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i];
    const [xj, yj] = p[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** A k x k lattice over the polygon's bounding box, kept where inside. */
function samplePolygon(poly, k) {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const u0 = Math.max(0, Math.min(...xs));
  const u1 = Math.min(1, Math.max(...xs));
  const v0 = Math.max(0, Math.min(...ys));
  const v1 = Math.min(1, Math.max(...ys));
  const out = [];
  for (let j = 0; j < k; j++) {
    for (let i = 0; i < k; i++) {
      const uv = [u0 + ((i + 0.5) / k) * (u1 - u0), v0 + ((j + 0.5) / k) * (v1 - v0)];
      if (inPolygon(poly, uv)) out.push(uv);
    }
  }
  return out;
}

/** Least squares y ~ c . r for 3-vectors r (null if singular). */
function leastSquares3(rs, ys, ws = null) {
  const A = [new Float64Array(4), new Float64Array(4), new Float64Array(4)];
  for (let i = 0; i < rs.length; i++) {
    const r = rs[i];
    const w = ws ? ws[i] : 1;
    for (let p = 0; p < 3; p++) {
      for (let q = 0; q < 3; q++) A[p][q] += w * r[p] * r[q];
      A[p][3] += w * r[p] * ys[i];
    }
  }
  return solve3(A);
}

function solve3(A) {
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (!(Math.abs(A[p][c]) > 1e-14)) return null;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let q = c; q < 4; q++) A[r][q] -= f * A[c][q];
    }
  }
  return [A[0][3] / A[0][0], A[1][3] / A[1][1], A[2][3] / A[2][2]];
}

/** Huber IRLS: a few outliers (a toy, a shadow the model misreads) don't tilt the plane. */
function robustLinear(rs, ys) {
  let c = leastSquares3(rs, ys) || [0, 0, 0];
  for (let it = 0; it < 6; it++) {
    const res = ys.map((y, i) => y - dot(c, rs[i]));
    const abs = res.map(Math.abs).sort((p, q) => p - q);
    const sigma = 1.4826 * quantile(abs, 0.5);
    if (!(sigma > 1e-12)) break;
    const kH = 1.5 * sigma;
    const ws = res.map((r) => (Math.abs(r) <= kH ? 1 : kH / Math.abs(r)));
    const next = leastSquares3(rs, ys, ws);
    if (!next) break;
    c = next;
  }
  return c;
}

function smoothMasked(f, mask, nx, ny, passes) {
  const tmp = new Float64Array(f.length);
  for (let p = 0; p < passes; p++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const id = j * nx + i;
        if (!mask[id]) {
          tmp[id] = f[id];
          continue;
        }
        let s = 0;
        let c = 0;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const x = i + di;
            const y = j + dj;
            if (x < 0 || y < 0 || x >= nx || y >= ny) continue;
            const q = y * nx + x;
            if (!mask[q]) continue;
            s += f[q];
            c++;
          }
        }
        tmp[id] = s / c;
      }
    }
    f.set(tmp);
  }
}

/**
 * z = gx * x + gy * y + c over the yard cells (all cells if none). se is the
 * standard error of the slope magnitude in pp, with the sample count capped at
 * 64 because neighbouring cells share depth pixels and are not independent.
 */
function planeFit(z, mask, nx, ny, cell) {
  let any = false;
  for (let i = 0; i < mask.length; i++) if (mask[i]) any = true;
  const A = [new Float64Array(4), new Float64Array(4), new Float64Array(4)];
  const pts = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const id = j * nx + i;
      if (any && !mask[id]) continue;
      const r = [(i + 0.5) * cell, (j + 0.5) * cell, 1];
      pts.push([r, z[id]]);
      for (let p = 0; p < 3; p++) {
        for (let q = 0; q < 3; q++) A[p][q] += r[p] * r[q];
        A[p][3] += r[p] * z[id];
      }
    }
  }
  const A2 = A.map((row) => Float64Array.from(row));
  const c = solve3(A) || [0, 0, 0];
  const nPts = pts.length;
  let ss = 0;
  for (const [r, v] of pts) ss += (v - dot(c, r)) ** 2;
  const sigma2 = nPts > 3 ? ss / (nPts - 3) : 0;
  // variance of gx, gy from the inverse normal matrix (by solving unit RHS)
  const inv = (col) => {
    const B = A2.map((row, i) => {
      const nr = Float64Array.from(row);
      nr[3] = i === col ? 1 : 0;
      return nr;
    });
    return solve3(B);
  };
  const ix = inv(0);
  const iy = inv(1);
  const inflate = nPts > 64 ? nPts / 64 : 1;
  const vx = ix ? ix[0] * sigma2 * inflate : 0;
  const vy = iy ? iy[1] * sigma2 * inflate : 0;
  const se = 100 * Math.sqrt(Math.max(0, vx) + Math.max(0, vy));
  return { gx: finite(c[0]), gy: finite(c[1]), se: finite(se) };
}
