/**
 * Build src/data/storms-richmond.json from the live Open-Meteo API (Richmond, BC).
 *
 * WHY: getStorms falls back to this bundled copy whenever the network, the
 * location or the API is unavailable, so the demo always has real numbers. It
 * reuses fetchNumbers() from the app module, so the stored values are exactly
 * what the app would compute for the same place. Run: node scripts/make-richmond-storms.mjs
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fetchNumbers } from '../src/weather/openmeteo.js';

const LAT = 49.17;
const LON = -123.14;
const today = new Date();
const r = (x) => Math.round(x * 100) / 100;

const n = await fetchNumbers({ lat: LAT, lon: LON, fetchFn: fetch, today });
const out = {
  place: 'Richmond, BC',
  lat: LAT,
  lon: LON,
  generated: today.toISOString().slice(0, 10),
  years: `${n.urls.years.from.slice(0, 4)}-${n.urls.years.to.slice(0, 4)}`,
  recent: { date: n.day.date, totalMm: r(n.recentTotal), hourlyMm: n.day.hourlyMm.map(r), url: n.urls.archive },
  typical: { totalMm: r(n.typical), url: n.urls.history },
  design: { totalMm: r(n.design), url: n.urls.history },
};
// Keep total consistent with the stored (rounded) hourly values.
out.recent.totalMm = r(out.recent.hourlyMm.reduce((a, b) => a + b, 0));
const dest = fileURLToPath(new URL('../src/data/storms-richmond.json', import.meta.url));
writeFileSync(dest, JSON.stringify(out, null, 2) + '\n');
console.log('wrote', dest, JSON.stringify({ recent: out.recent.totalMm, typical: out.typical.totalMm, design: out.design.totalMm, date: out.recent.date }));
