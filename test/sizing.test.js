import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sizeGarden, SIZING_CITE, FT2_M2 } from '../src/garden/sizing.js';
import { costOf } from '../src/garden/cost.js';

const FT = 0.3048;
const IN = 0.0254;

test('WSU (pnw) reproduces the published worked example: 1,150 ft2 -> 391 ft2', () => {
  // WSU 2013 p. 25: 0.50 in/h, 1,150 SF, 6 in ponding, Best, Region 4 -> 0.34 -> 391 SF.
  const r = sizeGarden({
    region: 'pnw',
    drainageAreaM2: 1150 * FT2_M2,
    soil: 'loam',
    depthM: 6 * IN,
    drainRateMmH: 0.5 * 25.4,
    rainRegion: 4,
    performance: 'best',
  });
  assert.equal(r.factor, 0.34);
  assert.equal(Math.round(r.areaM2 / FT2_M2), 391);
  assert.match(r.method, /WSU/);
  assert.match(r.cite, /Rain Garden Handbook for Western Washington/);
  assert.equal(r.inputs.rainRegion, 4);
  assert.equal(r.inputs.pondingIn, 6);
});

test('Wisconsin (on) reproduces the published worked example: 600 ft2, silty, 6 in -> 150 ft2', () => {
  // Bannerman et al. 2003 pp. 7-10: < 30 ft from downspout, 6 in deep, silty -> 0.25 -> 150 ft2.
  const r = sizeGarden({
    region: 'on',
    drainageAreaM2: 600 * FT2_M2,
    soil: 'loam', // our loam maps to the manual's "silty"
    depthM: 6 * IN,
    downspoutDistM: 5,
  });
  assert.equal(r.factor, 0.25);
  assert.equal(Math.round(r.areaM2 / FT2_M2), 150);
  assert.match(r.method, /Wisconsin/);
  assert.equal(r.inputs.soilClass, 'silty');
  assert.equal(r.inputs.depthBand, '6-7 in');
  assert.equal(r.inputs.distance, '<30 ft');
});

test('Wisconsin far table (>= 30 ft from downspout) applies at all depths', () => {
  const base = { region: 'on', drainageAreaM2: 100, downspoutDistM: 30 * FT };
  assert.equal(sizeGarden({ ...base, soil: 'sand', depthM: 0.1 }).factor, 0.03);
  assert.equal(sizeGarden({ ...base, soil: 'loam', depthM: 0.2 }).factor, 0.06);
  assert.equal(sizeGarden({ ...base, soil: 'clay', depthM: 0.15 }).factor, 0.10);
});

test('Wisconsin near table depth bands', () => {
  const base = { region: 'on', drainageAreaM2: 100, soil: 'clay' };
  assert.equal(sizeGarden({ ...base, depthM: 4 * IN }).factor, 0.43);
  assert.equal(sizeGarden({ ...base, depthM: 7 * IN }).factor, 0.32);
  assert.equal(sizeGarden({ ...base, depthM: 8 * IN }).factor, 0.20);
  assert.equal(sizeGarden({ ...base, soil: 'sand', depthM: 8 * IN }).factor, 0.08);
});

test('WSU transcribes the non-monotonic Region 5 Best cell as printed (75% > Region 6 72%)', () => {
  const base = { region: 'pnw', drainageAreaM2: 100, soil: 'loam', depthM: 6 * IN, performance: 'best', drainRateMmH: 0.15 * 25.4 };
  assert.equal(sizeGarden({ ...base, rainRegion: 5 }).factor, 0.75);
  assert.equal(sizeGarden({ ...base, rainRegion: 6 }).factor, 0.72);
});

test('WSU Best 12 in ponding is N/A at the lowest drainage band: falls back to the 6 in row', () => {
  const r = sizeGarden({ region: 'pnw', drainageAreaM2: 100, soil: 'loam', depthM: 12 * IN, rainRegion: 4, drainRateMmH: 0.2 * 25.4 });
  assert.equal(r.factor, 0.54);
  assert.equal(r.inputs.pondingIn, 6);
  assert.ok(r.warnings.some((w) => /12-inch/.test(w)));
});

test('WSU defaults: Region 4, Best, drainage rate from soil class (Rawls 1983 Ks)', () => {
  const sand = sizeGarden({ region: 'pnw', drainageAreaM2: 100, soil: 'sand', depthM: 0.15 });
  assert.equal(sand.inputs.rainRegion, 4);
  assert.equal(sand.inputs.performance, 'best');
  assert.equal(sand.factor, 0.18); // 2.50+ in/h band, 6 in
  const clay = sizeGarden({ region: 'pnw', drainageAreaM2: 100, soil: 'clay', depthM: 0.15 });
  assert.equal(clay.factor, 0.54); // clamped to 0.10-0.24 band
  assert.ok(clay.warnings.length > 0);
});

test('WSU Good and Better ignore ponding depth', () => {
  const base = { region: 'pnw', drainageAreaM2: 100, soil: 'loam', rainRegion: 3, drainRateMmH: 1.5 * 25.4 };
  assert.equal(sizeGarden({ ...base, depthM: 0.15, performance: 'good' }).factor, 0.07);
  assert.equal(sizeGarden({ ...base, depthM: 0.30, performance: 'better' }).factor, 0.10);
});

test('sizeGarden rejects unknown region or soil', () => {
  assert.throws(() => sizeGarden({ region: 'xx', drainageAreaM2: 1, soil: 'loam', depthM: 0.15 }));
  assert.throws(() => sizeGarden({ region: 'on', drainageAreaM2: 1, soil: 'peat', depthM: 0.15 }));
});

test('SIZING_CITE names both published methods', () => {
  assert.match(SIZING_CITE, /Wisconsin/);
  assert.match(SIZING_CITE, /Western Washington/);
});

test('costOf returns a CAD breakdown from area, depth and the amended layer', () => {
  const g = { cx: 0, cy: 0, lenM: 4, widM: 2, rot: 0, depthM: 0.15, bermM: 0.1 };
  const area = Math.PI * 2 * 1;
  const c = costOf(g);
  assert.ok(Math.abs(c.excavation - area * 0.15 * 60) < 1e-9);
  assert.ok(Math.abs(c.soil - area * 0.3048 * 90) < 1e-9);
  assert.ok(Math.abs(c.mulch - area * 12) < 1e-9);
  assert.ok(Math.abs(c.plants - area * 45) < 1e-9);
  assert.ok(Math.abs(c.total - (c.excavation + c.soil + c.mulch + c.plants)) < 1e-9);
  assert.equal(costOf(g, { plantPerM2: 0 }).plants, 0);
});
