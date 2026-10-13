/**
 * Native-plant layout inside a garden ellipse, by moisture zone.
 *
 * Why it works this way:
 *  - Zones follow the guides' bottom / side slope / rim split (WSU zones 1-3,
 *    CVC Low/Middle/High, CRD zones 1-3) as radius fractions of the ellipse:
 *    wet 0-0.45, middle 0.45-0.8, edge 0.8-1.0 plus the 0.6 m berm ring.
 *  - Each zone gets 3-5 species from the user's region (and light, if given),
 *    planted in drifts of 3-7 of one species: Wisconsin 2003 p. 15 says to clump
 *    species in groups of 3 to 7.
 *  - Spacing is each plant's published on-centre spacing (src/data/plants.js);
 *    two plants are never closer than the larger of their spacings. Placement is
 *    dart-throwing Poisson-disc sampling grown outward from each drift's seed.
 *  - Species too big for a zone (spacing wider than the zone) are skipped, so a
 *    small garden does not get a 3.7 m shrub in a 1 m wet centre. Each species
 *    first gets an equal share of its zone's area, then small ones fill the gaps;
 *    rim shrubs (PNW rim plants are all shrubs) stay on the outer half of the berm.
 *  - Because two plants keep the LARGER spacing apart, a few shrubs can block a
 *    lot of ground: small gardens may get fewer than 3 species in a zone.
 *  - Seeded mulberry32, so a seed always gives the same plan.
 * If the light filter leaves a zone with no species (e.g. Ontario wet zone in
 * full shade) the zone is left as mulch rather than given a plant that will fail.
 * Pure module: no window/document.
 */

import { PLANTS } from '../data/plants.js';
import { ellipseRho, BERM_WIDTH_M } from './constraints.js';
import { mulberry32 } from './rng.js';

const ZONES = ['wet', 'middle', 'edge'];
const ZONE_ORDER = { wet: 0, middle: 1, edge: 2 };
const DART_TRIES = 40;
const GROW_TRIES = 30;
const MAX_PLANTS = 6000;

/** Zone rings as radius fractions of the garden ellipse. */
export function zonesOf(g) {
  return {
    wet: { r0: 0, r1: 0.45 },
    middle: { r0: 0.45, r1: 0.8 },
    edge: { r0: 0.8, r1: 1, bermM: BERM_WIDTH_M },
  };
}

/** Which zone a point (m) falls in, or null outside the garden and berm. */
export function zoneOfPoint(g, x, y) {
  const rho = ellipseRho(g, x, y);
  if (rho < 0.45) return 'wet';
  if (rho < 0.8) return 'middle';
  if (rho <= 1 || ellipseRho(g, x, y, BERM_WIDTH_M) <= 1) return 'edge';
  return null;
}

/**
 * Widest plant spacing a zone takes (m): the wet disc's semi-minor radius, the
 * side-slope ring's width, twice the rim ring's width (rim shrubs sit on the berm).
 */
function zoneExtent(g, zone) {
  const b = Math.min(g.lenM, g.widM) / 2;
  if (zone === 'wet') return 0.45 * b;
  if (zone === 'middle') return 0.35 * b;
  return 2 * (0.2 * b + BERM_WIDTH_M);
}

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function chooseSpecies(g, pool, zone, rng) {
  const inZone = pool.filter((p) => p.zone === zone);
  if (!inZone.length) return [];
  const ext = zoneExtent(g, zone);
  let fits = inZone.filter((p) => p.spacing_m <= ext);
  if (!fits.length) fits = [inZone.reduce((a, p) => (p.spacing_m < a.spacing_m ? p : a))];
  const k = Math.min(fits.length, 3 + Math.floor(rng() * 3));
  return shuffle(fits, rng).slice(0, k).sort((a, b) => b.spacing_m - a.spacing_m || (a.id < b.id ? -1 : 1));
}

/**
 * @param {{cx:number, cy:number, lenM:number, widM:number, rot:number}} g
 * @param {Array} plants usually PLANTS
 * @param {{seed?:number, region:'pnw'|'on', sun?:'full'|'part'|'shade'}} opts
 * @returns {Array<{id:string, x:number, y:number, r:number, zone:string, drift:number}>}
 *   The array also carries `.warnings`: [{ code, zone, message }] (see layoutWarnings).
 */
export function layoutPlants(g, plants = PLANTS, { seed = 1, region, sun } = {}) {
  if (!region) throw new TypeError('layoutPlants needs a region (pnw or on)');
  const rng = mulberry32(seed);
  const pool = plants.filter((p) => p.region === region && (!sun || p.sun.includes(sun)));
  const chosen = ZONES.map((z) => chooseSpecies(g, pool, z, rng));
  const maxSp = Math.max(0.1, ...chosen.flat().map((p) => p.spacing_m));

  // spatial hash, cell = widest spacing, so neighbours are within one cell
  const hash = new Map();
  const key = (ix, iy) => ix * 1000003 + iy;
  const placed = [];
  const spOf = [];
  const fits = (x, y, sp) => {
    const ix = Math.floor(x / maxSp);
    const iy = Math.floor(y / maxSp);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const bucket = hash.get(key(ix + dx, iy + dy));
        if (!bucket) continue;
        for (const k of bucket) {
          const need = Math.max(sp, spOf[k]);
          const ddx = placed[k].x - x;
          const ddy = placed[k].y - y;
          if (ddx * ddx + ddy * ddy < need * need) return false;
        }
      }
    }
    return true;
  };
  const add = (p, x, y, zone, drift) => {
    const k = placed.length;
    placed.push({ id: p.id, x, y, r: p.spread_m[1] / 2, zone, drift });
    spOf.push(p.spacing_m);
    const hk = key(Math.floor(x / maxSp), Math.floor(y / maxSp));
    if (!hash.has(hk)) hash.set(hk, []);
    hash.get(hk).push(k);
  };

  const a = g.lenM / 2;
  const b = g.widM / 2;
  const c = Math.cos(g.rot || 0);
  const s = Math.sin(g.rot || 0);
  const zr = zonesOf(g);
  const randomIn = (zone) => {
    const r0 = zr[zone].r0;
    const r1 = zone === 'edge' ? 1 + BERM_WIDTH_M / Math.min(a, b) : zr[zone].r1;
    for (let t = 0; t < 30; t++) {
      const rho = Math.sqrt(r0 * r0 + rng() * (r1 * r1 - r0 * r0));
      const th = rng() * 2 * Math.PI;
      const u = rho * Math.cos(th) * a;
      const v = rho * Math.sin(th) * b;
      const x = g.cx + u * c - v * s;
      const y = g.cy + u * s + v * c;
      if (zoneOfPoint(g, x, y) === zone) return [x, y];
    }
    return null;
  };

  // Zone areas, for each species' fair share (footprint ~ spacing^2 per plant).
  const ab = Math.PI * a * b;
  const zoneArea = {
    wet: ab * 0.45 * 0.45,
    middle: ab * (0.8 * 0.8 - 0.45 * 0.45),
    edge: Math.PI * (a + BERM_WIDTH_M) * (b + BERM_WIDTH_M) - ab * 0.64,
  };

  // Rim plants wider than the rim ring (PNW rim shrubs) go on the outer half of
  // the berm, so they block as little of the side slope as possible.
  const rimWidth = 0.2 * Math.min(a, b) + BERM_WIDTH_M;
  const isBig = (p, zone) => zone === 'edge' && p.spacing_m > rimWidth;
  const onBerm = (p, zone, x, y) => !isBig(p, zone) || ellipseRho(g, x, y, BERM_WIDTH_M / 2) >= 1;

  let drift = 0;
  // One drift per species per round, until a species finds no room or reaches its cap.
  const fill = (zone, species, capOf) => {
    const used = new Map(species.map((p) => [p.id, 0]));
    let active = species.slice();
    while (active.length && placed.length < MAX_PLANTS) {
      const next = [];
      for (const p of active) {
        if (used.get(p.id) + p.spacing_m ** 2 > capOf(p) + 1e-9) continue;
        let seedPt = null;
        for (let t = 0; t < DART_TRIES && !seedPt; t++) {
          const pt = randomIn(zone);
          if (pt && onBerm(p, zone, pt[0], pt[1]) && fits(pt[0], pt[1], p.spacing_m)) seedPt = pt;
        }
        if (!seedPt) continue; // no room left for this species in this zone
        next.push(p);
        const want = 3 + Math.floor(rng() * 5); // 3..7
        const members = [seedPt];
        add(p, seedPt[0], seedPt[1], zone, drift);
        const room = Math.max(1, Math.floor((capOf(p) - used.get(p.id)) / p.spacing_m ** 2 + 1e-9));
        for (let t = 0; t < want * GROW_TRIES && members.length < Math.min(want, room); t++) {
          const [mx, my] = members[Math.floor(rng() * members.length)];
          const d = p.spacing_m * (1 + 0.5 * rng());
          const th = rng() * 2 * Math.PI;
          const x = mx + d * Math.cos(th);
          const y = my + d * Math.sin(th);
          if (zoneOfPoint(g, x, y) === zone && onBerm(p, zone, x, y) && fits(x, y, p.spacing_m)) {
            members.push([x, y]);
            add(p, x, y, zone, drift);
          }
        }
        used.set(p.id, used.get(p.id) + members.length * p.spacing_m ** 2);
        drift++;
      }
      active = next;
    }
  };
  // Order: rim shrubs first (outer berm, widest spacing), then the wet centre
  // (the zone that does the work), then the side slope fills what is left.
  ['edge', 'wet', 'middle'].forEach((zone) => {
    const species = chosen[ZONE_ORDER[zone]];
    if (!species.length) return;
    // Pass 1: each species up to an equal share of the zone, so big shrubs cannot
    // crowd the others out. Pass 2: fill the remaining gaps, smallest first.
    const share = zoneArea[zone] / species.length;
    fill(zone, species, (p) => Math.max(share, p.spacing_m ** 2));
    // Big rim shrubs stop at their share: they shade out the side slope.
    fill(zone, species.slice().reverse(), (p) => (isBig(p, zone) ? 0 : Infinity));
  });
  placed.warnings = layoutWarnings(pool, placed);
  return placed;
}

/**
 * Say so when a zone came out thin, instead of failing silently.
 * - no-species-for-light: the region has none for this zone in this light.
 * - small-garden-few-species: fewer than 3 species placed (and the pool has more).
 * - small-garden-small-drifts: under half the zone's plants are in drifts of 3+.
 */
function layoutWarnings(pool, placed) {
  const out = [];
  for (const zone of ZONES) {
    const available = new Set(pool.filter((p) => p.zone === zone).map((p) => p.id)).size;
    const here = placed.filter((p) => p.zone === zone);
    if (!available) {
      out.push({ code: 'no-species-for-light', zone, message: `No native ${zone}-zone plants for this light; leave it mulched.` });
      continue;
    }
    const species = new Set(here.map((p) => p.id)).size;
    if (species < Math.min(3, available)) {
      out.push({ code: 'small-garden-few-species', zone, message: `Only ${species} species fit the ${zone} zone; a larger garden takes 3-5.` });
    }
    const drifts = new Map();
    for (const p of here) drifts.set(p.drift, (drifts.get(p.drift) || 0) + 1);
    let inBig = 0;
    for (const [, k] of drifts) if (k >= 3) inBig += k;
    if (here.length && inBig < here.length / 2) {
      out.push({ code: 'small-garden-small-drifts', zone, message: `The ${zone} zone is too small for drifts of 3-7 of one species.` });
    }
  }
  return out;
}

/** Shopping list: one row per species, sorted by zone (wet, middle, edge) then qty desc. */
export function plantList(placed, plants = PLANTS) {
  const byId = new Map(plants.map((p) => [p.id, p]));
  const rows = new Map();
  for (const p of placed) {
    if (!rows.has(p.id)) {
      const info = byId.get(p.id);
      rows.set(p.id, { id: p.id, common: info.common, latin: info.latin, qty: 0, zone: p.zone });
    }
    rows.get(p.id).qty++;
  }
  return [...rows.values()].sort((x, y) => ZONE_ORDER[x.zone] - ZONE_ORDER[y.zone] || y.qty - x.qty || (x.id < y.id ? -1 : 1));
}
