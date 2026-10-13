/**
 * Rain-garden sizing by a published homeowner method, chosen by region.
 *
 * Why two methods: no single guide covers both target regions with a usable
 * worked example (see docs/research/sizing.md and DECISIONS.md).
 *  - 'pnw' -> WSU Rain Garden Handbook for Western Washington (2013) sizing chart,
 *    keyed to soil drainage rate, WSU rainfall region, performance level and ponding.
 *  - 'on'  -> Wisconsin DNR / UW-Extension (2003) size factors, keyed to soil
 *    (sandy/silty/clayey), depth and distance from the downspout. Essex Region CA
 *    (Ontario) adopts it nearly verbatim.
 *
 * The tables are transcribed exactly as printed (factors in the guides' own
 * units: inches, ft, in/h). We work in metres and convert only at the method
 * boundary (1 ft = 0.3048 m, 1 in = 0.0254 m). A size factor is a ratio of
 * areas, so it is unit-free; only the band lookups need converting.
 *
 * Our soil classes map to each method's bands (our simplification, not published):
 *  - Wisconsin: sand -> sandy, loam -> silty, clay -> clayey (sizing.md's texture
 *    mapping puts loam/silt loam/silt in "silty").
 *  - WSU: when no measured drainage rate is given, use the Rawls et al. (1983)
 *    saturated conductivity for the class (the same table the infiltration sim
 *    uses): sand 117.8 mm/h, loam 3.4 mm/h, clay 0.3 mm/h. Clay falls below the
 *    chart (< 0.1 in/h, where WSU says "consider a different location"), so it is
 *    clamped to the lowest band with a warning.
 *
 * Pure: no window/document. Runs in Node tests and the Web Worker.
 */

export const FT_M = 0.3048;
export const IN_M = 0.0254;
export const FT2_M2 = FT_M * FT_M;

export const CITES = {
  pnw: 'Hinman, C. (WSU Extension). Rain Garden Handbook for Western Washington. Washington State Dept. of Ecology Pub. 13-10-027, 2013, sizing chart p. 21, example p. 25.',
  on: 'Bannerman, R., Considine, E., Horwatich, J. Rain Gardens: A how-to manual for homeowners. Wisconsin DNR PUB-WT-776 / UW-Extension GWQ037, 2003, Tables 1-2 p. 9.',
};

export const SIZING_CITE = `Pacific NW: ${CITES.pnw} Southern Ontario: ${CITES.on}`;

// ---------------------------------------------------------------- Wisconsin 2003
const WI_SOIL = { sand: 'sandy', loam: 'silty', clay: 'clayey' };
// Table 1 (< 30 ft from downspout): columns 3-5 in, 6-7 in, 8 in.
const WI_NEAR = { sandy: [0.19, 0.15, 0.08], silty: [0.34, 0.25, 0.16], clayey: [0.43, 0.32, 0.20] };
// Table 2 (> 30 ft): all depths.
const WI_FAR = { sandy: 0.03, silty: 0.06, clayey: 0.10 };
const WI_DEPTH_BANDS = ['3-5 in', '6-7 in', '8 in'];

function sizeWisconsin({ drainageAreaM2, soil, depthM, downspoutDistM = 0 }) {
  const soilClass = WI_SOIL[soil];
  const depthIn = depthM / IN_M;
  const warnings = [];
  const far = downspoutDistM / FT_M >= 30;
  let factor;
  let depthBand;
  if (far) {
    factor = WI_FAR[soilClass];
    depthBand = 'all';
  } else {
    // The manual's bands have gaps (5-6, 7-8 in); split them at the midpoints.
    const col = depthIn < 5.5 ? 0 : depthIn < 7.5 ? 1 : 2;
    factor = WI_NEAR[soilClass][col];
    depthBand = WI_DEPTH_BANDS[col];
    if (depthIn < 3) warnings.push('Shallower than the manual\'s 3 in minimum; sized with the 3-5 in factor.');
    if (depthIn > 8.5) warnings.push('Deeper than 8 in "might pond water too long" (manual p. 7); sized with the 8 in factor.');
  }
  const areaM2 = drainageAreaM2 * factor;
  if (areaM2 / FT2_M2 > 300) warnings.push('Over 300 ft2 (28 m2): the manual suggests splitting it into smaller gardens.');
  return {
    areaM2,
    factor,
    method: 'Wisconsin DNR / UW-Extension (2003) size factor',
    cite: CITES.on,
    inputs: { soil, soilClass, depthIn, depthBand, distance: far ? '>=30 ft' : '<30 ft', drainageAreaFt2: drainageAreaM2 / FT2_M2 },
    warnings,
  };
}

// ---------------------------------------------------------------- WSU 2013
// Columns: drainage rate (in/h) 0.10-0.24 | 0.25-0.49 | 0.50-0.99 | 1.00-2.49 | 2.50+
const WSU_BANDS = ['0.10-0.24', '0.25-0.49', '0.50-0.99', '1.00-2.49', '2.50+'];
const WSU_EDGES = [0.25, 0.5, 1.0, 2.5];
// Percent of contributing area, rows = regions 1..6, transcribed as printed (p. 21).
const WSU = {
  good: [
    [8, 7, 7, 6, 6], [14, 10, 8, 6, 6], [16, 11, 8, 7, 6],
    [19, 12, 10, 7, 6], [23, 15, 11, 9, 6], [28, 18, 13, 10, 7],
  ],
  better: [
    [9, 9, 8, 8, 7], [20, 14, 11, 9, 7], [22, 15, 12, 10, 7],
    [29, 18, 14, 11, 8], [34, 22, 16, 13, 9], [42, 27, 19, 15, 10],
  ],
  // Best: separate 6 in and 12 in ponding rows. null = printed "N/A".
  // NOTE: Region 5 / 6 in / 0.10-0.24 is printed as 75%, larger than Region 6's 72%.
  // Kept as printed (plausibly a misprint); nothing here assumes monotonic regions.
  best6: [
    [13, 10, 9, 9, 8], [39, 32, 26, 21, 15], [45, 36, 30, 25, 17],
    [54, 43, 34, 27, 18], [75, 47, 35, 26, 17], [72, 56, 42, 30, 19],
  ],
  best12: [
    [null, 10, 9, 8, 8], [null, 27, 23, 20, 15], [null, 31, 26, 22, 17],
    [null, 36, 31, 25, 17], [null, 45, 31, 25, 17], [null, 48, 39, 29, 19],
  ],
};
// Rawls, Brakensiek & Miller (1983) Table 2 Ks, cm/h -> mm/h.
const RAWLS_KS_MMH = { sand: 117.8, loam: 3.4, clay: 0.3 };

function sizeWsu({ drainageAreaM2, soil, depthM, drainRateMmH, rainRegion = 4, performance = 'best' }) {
  const warnings = [];
  if (!Number.isInteger(rainRegion) || rainRegion < 1 || rainRegion > 6) throw new RangeError(`WSU rainfall region must be 1-6, got ${rainRegion}`);
  if (!['good', 'better', 'best'].includes(performance)) throw new RangeError(`unknown performance level ${performance}`);
  const measured = Number.isFinite(drainRateMmH);
  const rateMmH = measured ? drainRateMmH : RAWLS_KS_MMH[soil];
  const rateInH = rateMmH / 25.4;
  const eps = 1e-9; // keep exact band edges (e.g. 0.50 in/h) in the upper band despite float division
  let col = 0;
  while (col < WSU_EDGES.length && rateInH + eps >= WSU_EDGES[col]) col++;
  if (rateInH + eps < 0.1) warnings.push(`Drainage rate ${rateInH.toFixed(2)} in/h is below 0.1 in/h: WSU says consider a different location. Sized with the 0.10-0.24 band.`);
  // Ponding: the chart has 6 in and 12 in; split at 9 in.
  const depthIn = depthM / IN_M;
  let pondingIn = depthIn >= 9 ? 12 : 6;
  let pct;
  if (performance === 'best') {
    pct = (pondingIn === 12 ? WSU.best12 : WSU.best6)[rainRegion - 1][col];
    if (pct === null) {
      warnings.push('At this drainage rate a 12-inch pond will not drain within 3 days (WSU); sized with the 6-inch row.');
      pondingIn = 6;
      pct = WSU.best6[rainRegion - 1][col];
    }
  } else {
    pct = WSU[performance][rainRegion - 1][col]; // same for 6 and 12 in
  }
  const factor = pct / 100;
  return {
    areaM2: drainageAreaM2 * factor,
    factor,
    method: 'WSU Rain Garden Handbook for Western Washington (2013) sizing chart',
    cite: CITES.pnw,
    inputs: {
      soil, drainRateInH: rateInH, rateSource: measured ? 'measured' : 'Rawls 1983 Ks for soil class',
      rateBand: WSU_BANDS[col], rainRegion, performance, pondingIn, depthIn,
      drainageAreaFt2: drainageAreaM2 / FT2_M2,
    },
    warnings,
  };
}

/**
 * Size a rain garden by the published method for the region.
 * @param {object} o
 * @param {'pnw'|'on'} o.region
 * @param {number} o.drainageAreaM2 contributing (roof + paving [+ lawn]) area, m2
 * @param {'sand'|'loam'|'clay'} o.soil
 * @param {number} o.depthM ponding depth, m
 * @param {number} [o.downspoutDistM=0] 'on': distance from the downspout (>= 30 ft uses Table 2)
 * @param {number} [o.drainRateMmH] 'pnw': measured drainage rate; default from soil class
 * @param {number} [o.rainRegion=4] 'pnw': WSU rainfall region 1-6
 * @param {'good'|'better'|'best'} [o.performance='best'] 'pnw'
 * @returns {{areaM2:number, factor:number, method:string, cite:string, inputs:object, warnings:string[]}}
 */
export function sizeGarden(o) {
  if (!(o.soil in RAWLS_KS_MMH)) throw new RangeError(`unknown soil ${o.soil}`);
  if (!(o.drainageAreaM2 >= 0)) throw new RangeError('drainageAreaM2 must be >= 0');
  if (!(o.depthM > 0)) throw new RangeError('depthM must be > 0');
  if (o.region === 'pnw') return sizeWsu(o);
  if (o.region === 'on') return sizeWisconsin(o);
  throw new RangeError(`unknown region ${o.region}`);
}
