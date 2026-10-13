/**
 * Real local storms from Open-Meteo, with a bundled offline Richmond, BC set.
 *
 * WHY: the sim needs believable rain for the user's own place, but the demo
 * must always work (offline, location denied, API down, or a dry month), so
 * getStorms NEVER throws: any failure yields the bundled Richmond numbers
 * labelled "offline sample". Only Open-Meteo is ever called and coordinates are
 * rounded to 2 dp (about 1 km) before they leave the device (privacy rule).
 * Pure module: fetch and the 24 h shape function are injected, so tests never
 * touch the network and this file does not depend on src/sim/storm.js.
 *
 * Storms: 'recent' = heaviest complete calendar day in the last 30 days (its real
 * hourly profile); 'typical' = median wet-day (>= 1 mm) daily total over the last
 * 10 full years; 'design' = 90th-percentile wet-day total (nearest rank), the
 * rain-garden / LID capture criterion. The archive lags a few days, so the newest
 * days come from the forecast API's past_days and are merged in.
 */
import bundled from '../data/storms-richmond.json' with { type: 'json' };

const STEP_S = 300;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';
const FORECAST = 'https://api.open-meteo.com/v1/forecast';

/** Spread hourly depths uniformly into stepS-second steps (mass conserving). */
export function hourlyToSteps(hourlyMm, stepS = STEP_S) {
  const per = Math.max(1, Math.round(3600 / stepS));
  const out = new Float64Array(hourlyMm.length * per);
  for (let h = 0; h < hourlyMm.length; h++) {
    const v = (Number.isFinite(hourlyMm[h]) ? hourlyMm[h] : 0) / per;
    for (let k = 0; k < per; k++) out[h * per + k] = v;
  }
  return out;
}

/** Heaviest calendar day (by summed precipitation) among complete 24 h days. */
export function heaviestDay(hourly) {
  const days = new Map();
  hourly.time.forEach((t, i) => {
    const d = String(t).slice(0, 10);
    if (!days.has(d)) days.set(d, []);
    days.get(d).push(Number.isFinite(hourly.precipitation[i]) ? hourly.precipitation[i] : 0);
  });
  let best = null;
  let bestSum = -1;
  for (const [date, v] of days) {
    if (v.length !== 24) continue;
    const sum = v.reduce((a, b) => a + b, 0);
    if (sum > bestSum) { best = { date, hourlyMm: v }; bestSum = sum; }
  }
  return best;
}

/** Nearest-rank percentile of the wet days (>= wetMm) only; 0 when there are none. */
export function wetDayPercentile(dailyMm, p, wetMm = 1) {
  const wet = dailyMm.filter((x) => Number.isFinite(x) && x >= wetMm).sort((a, b) => a - b);
  if (!wet.length) return 0;
  const rank = Math.max(1, Math.ceil((p / 100) * wet.length));
  return wet[Math.min(wet.length, rank) - 1];
}

function wetDayMedian(dailyMm, wetMm = 1) {
  const wet = dailyMm.filter((x) => Number.isFinite(x) && x >= wetMm).sort((a, b) => a - b);
  if (!wet.length) return 0;
  const m = wet.length >> 1;
  return wet.length % 2 ? wet[m] : (wet[m - 1] + wet[m]) / 2;
}

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
const niceDate = (s) => `${Number(s.slice(8, 10))} ${MONTHS[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}`;
const uniformShape = (total, shape, durH, stepS) => {
  const n = Math.round((durH * 3600) / stepS);
  return new Float64Array(n).fill(total / n);
};

/** The exact API URLs used (coordinates rounded to 2 dp). Exported for the build script. */
export function apiUrls(lat, lon, today) {
  const q = `latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}`;
  const y = today.getUTCFullYear();
  const from = iso(addDays(today, -30));
  const to = iso(addDays(today, -1));
  return {
    window: { from, to },
    years: { from: `${y - 10}-01-01`, to: `${y - 1}-12-31` },
    archive: `${ARCHIVE}?${q}&start_date=${from}&end_date=${to}&hourly=precipitation&timezone=auto`,
    forecast: `${FORECAST}?${q}&hourly=precipitation&past_days=7&forecast_days=1&timezone=auto`,
    history: `${ARCHIVE}?${q}&start_date=${y - 10}-01-01&end_date=${y - 1}-12-31&daily=precipitation_sum&timezone=auto`,
  };
}

async function getJson(fetchFn, url) {
  const res = await fetchFn(url);
  if (!res || !res.ok) throw new Error(`HTTP ${res && res.status} for ${url}`);
  return res.json();
}

function build({ id, label, totalMm, mm, when, text, url }) {
  let peak = 0;
  for (let i = 0; i < mm.length; i++) if (mm[i] > peak) peak = mm[i];
  const s = { id, label, totalMm, mm, stepS: STEP_S, peakMmH: (peak * 3600) / STEP_S, source: { text, url } };
  if (when) s.when = when;
  return s;
}

/**
 * Fetch and reduce the raw numbers (throws on any problem). Exported so the
 * Richmond build script stores exactly what the app would compute.
 */
export async function fetchNumbers({ lat, lon, fetchFn, today }) {
  const u = apiUrls(lat, lon, today);
  const [arch, fc, hist] = await Promise.all([
    getJson(fetchFn, u.archive), getJson(fetchFn, u.forecast), getJson(fetchFn, u.history),
  ]);
  // Merge: archive wins where it has data; the forecast's past_days fills the lag.
  const merged = new Map();
  for (const src of [fc.hourly, arch.hourly]) {
    if (!src || !Array.isArray(src.time) || !Array.isArray(src.precipitation)) throw new Error('bad hourly payload');
    src.time.forEach((t, i) => {
      const v = src.precipitation[i];
      if (Number.isFinite(v)) merged.set(t, v);
    });
  }
  const times = [...merged.keys()]
    .filter((t) => t.slice(0, 10) >= u.window.from && t.slice(0, 10) <= u.window.to)
    .sort();
  const day = heaviestDay({ time: times, precipitation: times.map((t) => merged.get(t)) });
  if (!day) throw new Error('no complete day in the last 30 days');
  const d = hist.daily;
  if (!d || !Array.isArray(d.precipitation_sum) || d.precipitation_sum.length < 300) throw new Error('bad daily payload');
  const recentTotal = day.hourlyMm.reduce((a, b) => a + b, 0);
  const typical = wetDayMedian(d.precipitation_sum);
  const design = wetDayPercentile(d.precipitation_sum, 90);
  if (!(recentTotal > 0) || !(typical > 0) || !(design > 0)) throw new Error('no rain in the data');
  return { urls: u, day, recentTotal, typical, design };
}

async function live({ lat, lon, region, fetchFn, today, shapeFn }) {
  const { urls: u, day, recentTotal, typical, design } = await fetchNumbers({ lat, lon, fetchFn, today });
  const shape = region === 'on' ? 'II' : 'IA';
  const years = `${u.years.from.slice(0, 4)}-${u.years.to.slice(0, 4)}`;
  const base = 'Open-Meteo (open-meteo.com)';
  return [
    build({
      id: 'recent', label: `Heaviest day last month (${niceDate(day.date)})`, totalMm: recentTotal,
      mm: hourlyToSteps(day.hourlyMm, STEP_S), when: day.date, url: u.archive,
      text: `${base} hourly precipitation, ${u.window.from} to ${u.window.to}; heaviest day ${day.date}, real hourly profile.`,
    }),
    build({
      id: 'typical', label: 'A typical rainy day', totalMm: typical,
      mm: shapeFn(typical, shape, 24, STEP_S), url: u.history,
      text: `${base} archive ${years}: median wet-day (>= 1 mm) total, Type ${shape} 24 h shape.`,
    }),
    build({
      id: 'design', label: 'Design storm (90th percentile)', totalMm: design,
      mm: shapeFn(design, shape, 24, STEP_S), url: u.history,
      text: `${base} archive ${years}: 90th-percentile wet day, the rain-garden / LID capture criterion, Type ${shape} 24 h shape.`,
    }),
  ];
}

/** The bundled Richmond, BC set (real numbers from scripts/make-richmond-storms.mjs). */
function offline({ region, shapeFn }) {
  const b = bundled;
  const shape = region === 'on' ? 'II' : 'IA';
  const note = (t) => `${t} This is an offline sample (Richmond, BC; bundled copy of Open-Meteo data, ${b.generated}).`;
  return [
    build({
      id: 'recent', label: `Heaviest day last month (${niceDate(b.recent.date)})`, totalMm: b.recent.totalMm,
      mm: hourlyToSteps(b.recent.hourlyMm, STEP_S), when: b.recent.date, url: b.recent.url,
      text: note(`Open-Meteo hourly precipitation, heaviest day ${b.recent.date}.`),
    }),
    build({
      id: 'typical', label: 'A typical rainy day', totalMm: b.typical.totalMm,
      mm: shapeFn(b.typical.totalMm, shape, 24, STEP_S), url: b.typical.url,
      text: note(`Median wet day ${b.years}, Type ${shape} shape.`),
    }),
    build({
      id: 'design', label: 'Design storm (90th percentile)', totalMm: b.design.totalMm,
      mm: shapeFn(b.design.totalMm, shape, 24, STEP_S), url: b.design.url,
      text: note(`90th-percentile wet day ${b.years}, the rain-garden / LID capture criterion, Type ${shape} shape.`),
    }),
  ];
}

/**
 * @param {{lat:number, lon:number, region?:'pnw'|'on', fetchFn?:Function, today?:Date, shapeFn?:Function}} o
 * @returns {Promise<Array>} three storms; never rejects.
 */
export async function getStorms({ lat, lon, region = 'pnw', fetchFn, today = new Date(), shapeFn = uniformShape } = {}) {
  try {
    const f = fetchFn || (typeof fetch === 'function' ? fetch : null);
    if (!f || !Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('no fetch or coordinates');
    return await live({ lat, lon, region, fetchFn: f, today, shapeFn });
  } catch (err) {
    return offline({ region, shapeFn });
  }
}
