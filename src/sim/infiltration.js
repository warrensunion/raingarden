/**
 * Soil infiltration: Green-Ampt (the sim's model) and Horton (for the
 * "how it works" comparison).
 *
 * Why Green-Ampt: it is physically based, needs only four published
 * numbers per soil texture, and has an exact ponded solution, so each sim
 * step can take the exact increment over dt instead of an Euler guess. That
 * keeps a 5-minute step honest on sand, where the rate collapses fast.
 * Units at the API edge are millimetres and hours (how soils are tabulated);
 * greenAmptStep works in metres and seconds (the sim's units).
 *
 * Parameters: Rawls, Brakensiek & Miller (1983), J. Hydraulic Eng.
 * 109(1):62-70, Table 2 (reproduced in Chow, Maidment & Mays 1988, Applied
 * Hydrology, Table 4.3.1); values as verified in docs/research/hydrology.md.
 * Equations: Chow et al. 1988 sections 4.3-4.4.
 */

/** Green-Ampt soils: porosity n, effective porosity thetaE, wetting-front suction psi (mm), Ks (mm/h). */
export const SOILS = {
  sand: { name: 'sand', porosity: 0.437, thetaE: 0.417, psiMm: 49.5, kMmH: 117.8 },
  loam: { name: 'loam', porosity: 0.463, thetaE: 0.434, psiMm: 88.9, kMmH: 3.4 },
  siltLoam: { name: 'silt loam', porosity: 0.501, thetaE: 0.486, psiMm: 166.8, kMmH: 6.5 },
  clay: { name: 'clay', porosity: 0.475, thetaE: 0.385, psiMm: 316.3, kMmH: 0.3 },
};

/**
 * Horton f = fc + (f0 - fc) e^(-k t), mm/h and 1/h. From US EPA (2016) SWMM
 * Reference Manual Vol. I, Tables 4-4 (fc by hydrologic soil group, Musgrave
 * 1955) and 4-6 (f0, dry soil), k = 4 /h ("an estimate of 4 hr-1 could be
 * used"). Picking a point inside each fc range is our choice: sand = top of
 * HSG A, loam and silt loam = middle of HSG B, clay = middle of HSG D.
 */
export const HORTON = {
  sand: { f0: 127, fc: 11.4, k: 4 },
  loam: { f0: 76, fc: 5.7, k: 4 },
  siltLoam: { f0: 76, fc: 5.7, k: 4 },
  clay: { f0: 25, fc: 0.6, k: 4 },
};

/** Smallest cumulative depth (m) used so the rate at F = 0 stays finite. */
export const F_MIN_M = 1e-7;

const deficit = (soil, Se) => (1 - Se) * soil.thetaE;

/**
 * Cumulative infiltration (mm) after tH hours of continuous ponding from dry
 * start: Newton on F - a ln(1 + F/a) = K t with a = psi * dTheta.
 */
export function greenAmptF(tH, soil, Se) {
  const K = soil.kMmH;
  const a = soil.psiMm * deficit(soil, Se);
  const Kt = K * tH;
  if (!(Kt > 0)) return 0;
  if (!(a > 0)) return Kt;
  // Kt + sqrt(2 a K t) bounds F from above; g is convex and increasing, so
  // Newton from above converges monotonically.
  let F = Kt + Math.sqrt(2 * a * Kt);
  for (let it = 0; it < 100; it++) {
    const g = F - a * Math.log(1 + F / a) - Kt;
    const step = g / (F / (a + F));
    F -= step;
    if (Math.abs(step) < 1e-12 * Math.max(1, F)) break;
  }
  return F;
}

/** Infiltration capacity (mm/h) at cumulative depth Fmm: K (a/F + 1). */
export function greenAmptRate(Fmm, soil, Se) {
  const a = soil.psiMm * deficit(soil, Se);
  return soil.kMmH * (a / Math.max(Fmm, F_MIN_M * 1000) + 1);
}

/**
 * Raw step in SI with precomputed a (m) and K (m/s); the sim's hot path.
 * Exact ponded increment from F over dt, capped at `avail`.
 */
export function gaStepRaw(F, avail, dt, a, K) {
  if (!(avail > 0) || !(dt > 0)) return 0;
  const F1 = F > F_MIN_M ? F : F_MIN_M;
  if (!(a > 0)) return Math.min(avail, K * dt);
  // Cheap exit: if even the slowest rate this step could reach, K(a/(F1+avail)+1),
  // swallows all the water, the capacity is not binding.
  if (avail <= dt * K * (a / (F1 + avail) + 1)) return avail;
  const Kdt = K * dt;
  const up1 = dt * K * (a / F1 + 1);
  const up2 = Kdt + Math.sqrt(2 * a * Kdt);
  let F2 = F1 + (up1 < up2 ? up1 : up2);
  const c = F1 + a;
  for (let it = 0; it < 60; it++) {
    const g = F2 - F1 - a * Math.log((F2 + a) / c) - Kdt;
    const step = (g * (F2 + a)) / F2;
    F2 -= step;
    if (step < 1e-14) break;
  }
  const dF = F2 - F1;
  return dF < avail ? (dF > 0 ? dF : 0) : avail;
}

/**
 * Depth (m) infiltrated during dtS from state Fm (m) with at most availM (m)
 * of water on the surface. Exact ponded solution of
 * F2 - F1 - a ln((F2 + a)/(F1 + a)) = K dt (Chow et al. 1988 eq. 4.4.x),
 * capped at availM. F = 0 starts at 1e-7 m.
 */
export function greenAmptStep(Fm, availM, dtS, soil, Se) {
  const a = (soil.psiMm / 1000) * deficit(soil, Se);
  const K = soil.kMmH / 1000 / 3600;
  return gaStepRaw(Fm, availM, dtS, a, K);
}

/** Horton capacity (mm/h) at tH hours. */
export function hortonRate(tH, { f0, fc, k }) {
  return fc + (f0 - fc) * Math.exp(-k * tH);
}
