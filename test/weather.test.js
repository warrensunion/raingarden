/**
 * Weather tests: pure helpers plus getStorms with an injected fetch (never the network).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { heaviestDay, wetDayPercentile, hourlyToSteps, getStorms } from '../src/weather/openmeteo.js';

const uniform = (total, shape, durH, stepS) => {
  const n = Math.round(durH * 3600 / stepS);
  return new Float64Array(n).fill(total / n);
};

test('heaviestDay picks the max-sum calendar day', () => {
  const time = [];
  const precipitation = [];
  for (const [d, v] of [['2026-09-20', 0.1], ['2026-09-21', 0.5], ['2026-09-22', 0.2]]) {
    for (let h = 0; h < 24; h++) { time.push(`${d}T${String(h).padStart(2, '0')}:00`); precipitation.push(v); }
  }
  const r = heaviestDay({ time, precipitation });
  assert.equal(r.date, '2026-09-21');
  assert.equal(r.hourlyMm.length, 24);
  assert.equal(r.hourlyMm[3], 0.5);
});

test('wetDayPercentile nearest-rank on wet days only', () => {
  const a = Array.from({ length: 100 }, (_, i) => i + 1);
  assert.equal(wetDayPercentile(a, 90), 90);
  assert.equal(wetDayPercentile([0, 0, 0.5, 2, 4], 50), 2); // wet = [2,4] -> rank 1 -> 2
  assert.equal(wetDayPercentile([0, 0.2], 90), 0);
});

test('hourlyToSteps spreads uniformly and conserves mass', () => {
  const s = hourlyToSteps([12, 0, 6], 300);
  assert.equal(s.length, 36);
  assert.equal(s[0], 1);
  assert.equal(s[12], 0);
  assert.ok(Math.abs(s.reduce((a, b) => a + b, 0) - 18) < 1e-9);
});

function mkFetch() {
  const urls = [];
  const fn = async (url) => {
    urls.push(url);
    const u = new URL(url);
    const hourly = u.searchParams.get('hourly');
    if (hourly) {
      const time = []; const precipitation = [];
      const days = u.hostname.startsWith('archive') ? ['2026-09-20', '2026-09-21'] : ['2026-09-21', '2026-09-22', '2026-10-12'];
      for (const d of days) for (let h = 0; h < 24; h++) {
        time.push(`${d}T${String(h).padStart(2, '0')}:00`);
        precipitation.push(d === '2026-09-22' ? (h === 5 ? 20 : 0) : 0.1);
      }
      return { ok: true, json: async () => ({ hourly: { time, precipitation } }) };
    }
    const time = []; const precipitation_sum = [];
    for (let i = 0; i < 1000; i++) { time.push(`d${i}`); precipitation_sum.push(i % 2 ? 0 : (i % 100) + 1); }
    return { ok: true, json: async () => ({ daily: { time, precipitation_sum } }) };
  };
  fn.urls = urls;
  return fn;
}

test('getStorms builds three storms from API data, rounds coords', async () => {
  const f = mkFetch();
  const s = await getStorms({ lat: 49.1712345, lon: -123.1398, region: 'pnw', fetchFn: f, today: new Date('2026-10-13T12:00:00Z'), shapeFn: uniform });
  assert.deepEqual(s.map((x) => x.id), ['recent', 'typical', 'design']);
  assert.equal(s[0].totalMm, 20);
  assert.match(s[0].label, /Heaviest day last month \(22 Sep 2026\)/);
  assert.equal(s[0].stepS, 300);
  assert.equal(s[0].mm.length, 288);
  assert.match(s[2].source.text, /90th-percentile wet day/);
  assert.match(s[0].source.text, /Open-Meteo/);
  for (const u of f.urls) assert.ok(u.includes('latitude=49.17') && u.includes('longitude=-123.14') && !u.includes('49.1712'));
  assert.ok(s[1].totalMm < s[2].totalMm);
});

test('getStorms falls back offline when fetch throws', async () => {
  const s = await getStorms({ lat: 1, lon: 2, region: 'pnw', fetchFn: async () => { throw new Error('net'); }, shapeFn: uniform });
  assert.equal(s.length, 3);
  for (const x of s) {
    assert.match(x.source.text, /offline sample/);
    assert.ok(x.totalMm > 0 && x.mm.length > 0);
    assert.ok(Math.abs(x.mm.reduce((a, b) => a + b, 0) - x.totalMm) < 1e-6);
  }
});

test('getStorms falls back on bad payload and non-ok response', async () => {
  for (const fetchFn of [async () => ({ ok: false, status: 500 }), async () => ({ ok: true, json: async () => ({}) })]) {
    const s = await getStorms({ lat: 49, lon: -123, region: 'on', fetchFn, shapeFn: uniform });
    assert.match(s[0].source.text, /offline sample/);
  }
});

// --- pinned rulings -------------------------------------------------------

function hourlyOf(days) {
  const time = []; const precipitation = [];
  for (const [d, f] of days) for (let h = 0; h < 24; h++) {
    time.push(`${d}T${String(h).padStart(2, '0')}:00`);
    precipitation.push(f(h));
  }
  return { time, precipitation };
}

function pinnedFetch({ archive, forecast, offset = 0 }) {
  return async (url) => {
    const u = new URL(url);
    if (u.searchParams.get('hourly')) {
      const hourly = u.hostname.startsWith('archive') ? archive : forecast;
      return { ok: true, json: async () => ({ utc_offset_seconds: offset, hourly }) };
    }
    // 10 dry days (0.5), wet days 1..10, padded with zeros to >= 300 values.
    const precipitation_sum = [...Array(10).fill(0.5), 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, ...Array(300).fill(0)];
    return { ok: true, json: async () => ({ daily: { time: precipitation_sum.map((_, i) => `d${i}`), precipitation_sum } }) };
  };
}

test('pins typical = median wet day, design = nearest-rank P90, shapes, urls, peakMmH', async () => {
  const calls = [];
  const shapeFn = (total, shape, durH, stepS) => { calls.push([total, shape, durH, stepS]); return uniform(total, shape, durH, stepS); };
  const archive = hourlyOf([['2026-10-04', () => 0], ['2026-10-05', (h) => (h === 3 ? 6 : 0)]]);
  const run = (region) => getStorms({
    lat: 49.1712, lon: -123.1398, region, today: new Date('2026-10-13T12:00:00Z'), shapeFn,
    fetchFn: pinnedFetch({ archive, forecast: { time: [], precipitation: [] } }),
  });
  const s = await run('pnw');
  assert.equal(s[0].totalMm, 6);
  assert.equal(s[0].when, '2026-10-05');
  assert.equal(s[0].peakMmH, 6); // 6 mm in the hour -> 0.5 mm per 300 s step -> 6 mm/h
  assert.equal(s[1].totalMm, 5.5); // median of wet days 1..10
  assert.equal(s[2].totalMm, 9); // nearest-rank P90 of 10 wet days
  assert.ok(Math.abs(s[1].peakMmH - (5.5 / 288) * 12) < 1e-12);
  assert.deepEqual(calls.map((c) => c[1]), ['IA', 'IA']);
  assert.deepEqual(calls[0], [5.5, 'IA', 24, 300]);
  assert.equal(s[0].source.url, 'https://archive-api.open-meteo.com/v1/archive?latitude=49.17&longitude=-123.14&start_date=2026-09-13&end_date=2026-10-12&hourly=precipitation&timezone=auto');
  assert.equal(s[1].source.url, 'https://archive-api.open-meteo.com/v1/archive?latitude=49.17&longitude=-123.14&start_date=2016-01-01&end_date=2025-12-31&daily=precipitation_sum&timezone=auto');
  assert.equal(s[2].source.url, s[1].source.url);
  calls.length = 0;
  await run('on');
  assert.deepEqual(calls.map((c) => c[1]), ['II', 'II']);
});

test('the current local day (forecast hours) is never the heaviest day', async () => {
  // 02:00 UTC on 14 Oct is 19:00 on 13 Oct in BC (UTC-7): UTC date - 1 would be the local today.
  const archive = hourlyOf([['2026-10-10', (h) => (h === 1 ? 4 : 0)]]);
  const forecast = hourlyOf([['2026-10-12', () => 0], ['2026-10-13', () => 50]]);
  const s = await getStorms({
    lat: 49.17, lon: -123.14, region: 'pnw', shapeFn: uniform,
    today: new Date('2026-10-14T02:00:00Z'),
    fetchFn: pinnedFetch({ archive, forecast, offset: -7 * 3600 }),
  });
  assert.equal(s[0].when, '2026-10-10');
  assert.equal(s[0].totalMm, 4);
});

test('a throwing shapeFn still yields storms (never throws)', async () => {
  const bad = () => { throw new Error('boom'); };
  const warn = console.warn; console.warn = () => {};
  try {
    const offline = await getStorms({ lat: 1, lon: 2, fetchFn: async () => { throw new Error('net'); }, shapeFn: bad });
    assert.equal(offline.length, 3);
    assert.match(offline[1].source.text, /offline sample/);
    assert.ok(offline[1].mm.length === 288);
    const live = await getStorms({ lat: 49.17, lon: -123.14, shapeFn: bad, today: new Date('2026-10-13T12:00:00Z'),
      fetchFn: pinnedFetch({ archive: hourlyOf([['2026-10-05', (h) => (h === 3 ? 6 : 0)]]), forecast: { time: [], precipitation: [] } }) });
    assert.equal(live.length, 3);
  } finally { console.warn = warn; }
});
