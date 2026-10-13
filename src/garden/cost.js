/**
 * Rough DIY cost of a rain garden, in CAD, broken down so the UI can show where
 * the money goes and the user can edit any unit price.
 *
 * Why these quantities:
 *  - Excavation = area x (ponding depth + amended layer): the bowl plus the native
 *    soil removed to make room for the amended soil that is backfilled.
 *  - Amended soil = area x 0.3048 m: WSU 2013 (p. 30-34) recommends a 12-24 in
 *    soil-mix layer; we take the 12 in lower bound.
 *  - Mulch and plants are per m2 of garden surface.
 * Unit prices are rough 2026 Metro Vancouver retail guesses (DECISIONS.md),
 * not quotes. Pure module.
 */

export const AMENDED_DEPTH_M = 0.3048;

export const COST_DEFAULTS = { excavPerM3: 60, soilPerM3: 90, mulchPerM2: 12, plantPerM2: 45 };

/** Plan area of the garden ellipse, m2 (lenM and widM are full axes). */
export function gardenArea(g) {
  return (Math.PI / 4) * g.lenM * g.widM;
}

/**
 * @param {{lenM:number, widM:number, depthM:number}} g
 * @param {Partial<typeof COST_DEFAULTS>} [prices]
 * @returns {{total:number, excavation:number, soil:number, mulch:number, plants:number}} CAD
 */
export function costOf(g, prices = {}) {
  const p = { ...COST_DEFAULTS, ...prices };
  const area = gardenArea(g);
  const excavation = area * (g.depthM + AMENDED_DEPTH_M) * p.excavPerM3;
  const soil = area * AMENDED_DEPTH_M * p.soilPerM3;
  const mulch = area * p.mulchPerM2;
  const plants = area * p.plantPerM2;
  return { total: excavation + soil + mulch + plants, excavation, soil, mulch, plants };
}
