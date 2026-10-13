/**
 * Design-storm hyetographs: how a storm total is spread over time.
 *
 * Why: runoff depends on intensity, not just the total. 40 mm in one hour
 * floods a lawn that 40 mm over a day would not. The NRCS 24-hour
 * distributions are what municipal stormwater guidance in the US and much
 * of Canada designs against: Type IA for the Pacific maritime coast (our
 * Richmond default), Type II for the interior and Great Lakes (our modelling
 * choice for Ontario; see docs/research/hydrology.md). Integrating the
 * cumulative curve per step (rather than sampling an intensity) makes the
 * steps telescope, so every hyetograph sums to the requested total.
 *
 * Tables: TR-20 1982 tabular mass curves as reproduced by HydroCAD ("Type
 * IA / Type II 24-hr Tabular", hydrocad.net/rainfall/tables.htm),
 * cross-checked against WSDOT Highway Runoff Manual M 31-16.04 App. 4C;
 * hourly points (verified in docs/research/hydrology.md).
 */

/** NRCS Type IA cumulative fraction of the 24 h total at hours 0..24. */
export const TYPE_IA = Object.freeze([
  0.000, 0.022, 0.051, 0.083, 0.116, 0.156, 0.204, 0.268, 0.425, 0.520, 0.577, 0.623, 0.664,
  0.701, 0.736, 0.769, 0.800, 0.830, 0.858, 0.884, 0.908, 0.932, 0.956, 0.978, 1.000,
]);

/** NRCS Type II cumulative fraction of the 24 h total at hours 0..24. */
export const TYPE_II = Object.freeze([
  0.0000, 0.0105, 0.0220, 0.0345, 0.0480, 0.0630, 0.0800, 0.0990, 0.1200, 0.1470, 0.1810, 0.2350, 0.6630,
  0.7720, 0.8200, 0.8535, 0.8800, 0.9018, 0.9210, 0.9377, 0.9520, 0.9647, 0.9770, 0.9887, 1.0000,
]);

/** Cumulative fraction at x in [0,1] of the storm duration. */
function cumulative(shape, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  if (shape === 'uniform') return x;
  const t = shape === 'II' ? TYPE_II : TYPE_IA;
  const u = x * 24;
  const k = Math.floor(u);
  return t[k] + (t[k + 1] - t[k]) * (u - k);
}

/**
 * Rain per step (mm) for a storm of totalMm over durationH hours. The
 * 24-hour shape is stretched to durationH. The last step may be partial.
 * @param {number} totalMm
 * @param {'IA'|'II'|'uniform'} shape
 * @param {number} durationH
 * @param {number} stepS
 * @returns {Float64Array}
 */
export function hyetograph(totalMm, shape, durationH, stepS) {
  if (shape !== 'IA' && shape !== 'II' && shape !== 'uniform') {
    throw new Error(`unknown storm shape ${shape}`);
  }
  const D = durationH * 3600;
  const n = Math.ceil(D / stepS - 1e-9);
  const out = new Float64Array(n);
  if (!(totalMm > 0)) return out;
  let prev = 0;
  for (let k = 0; k < n; k++) {
    const c = cumulative(shape, Math.min(((k + 1) * stepS) / D, 1));
    out[k] = totalMm * (c - prev);
    prev = c;
  }
  return out;
}

/**
 * Hourly totals (e.g. an Open-Meteo forecast) to rain per step, uniform
 * within each hour. Missing/negative hours count as zero.
 * @param {Array<number|null>} hourlyMm
 * @param {number} stepS
 * @returns {Float64Array}
 */
export function fromHourly(hourlyMm, stepS) {
  const H = hourlyMm.length;
  const n = Math.ceil((H * 3600) / stepS - 1e-9);
  const out = new Float64Array(n);
  const cum = new Float64Array(H + 1);
  for (let h = 0; h < H; h++) {
    const v = Number(hourlyMm[h]);
    cum[h + 1] = cum[h] + (Number.isFinite(v) && v > 0 ? v : 0);
  }
  const at = (tS) => {
    const u = Math.min(tS / 3600, H);
    const h = Math.min(Math.floor(u), H - 1);
    return cum[h] + (cum[h + 1] - cum[h]) * (u - h);
  };
  let prev = 0;
  for (let k = 0; k < n; k++) {
    const c = at((k + 1) * stepS);
    out[k] = c - prev;
    prev = c;
  }
  return out;
}
