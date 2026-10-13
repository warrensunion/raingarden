import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zonesOf, layoutPlants, plantList, zoneOfPoint } from '../src/garden/layout.js';
import { mulberry32 } from '../src/garden/rng.js';
import { ellipseRho } from '../src/garden/constraints.js';
import { PLANTS } from '../src/data/plants.js';

const BY_ID = new Map(PLANTS.map((p) => [p.id, p]));
const G = { cx: 6, cy: 5, lenM: 8, widM: 4, rot: 0.4, depthM: 0.15, bermM: 0.15 };
// WSU worked-example size (391 ft2 = 36 m2) for the species-mix check: PNW rim plants
// are all shrubs (1.2-1.8 m spacing) and need a garden this size to fit three kinds.
const WSU_SIZE = { cx: 7, cy: 5, lenM: 9.5, widM: 4.8, rot: 0.4, depthM: 0.15, bermM: 0.15 };
const SMALL = { cx: 3, cy: 3, lenM: 5, widM: 2.5, rot: -1.1, depthM: 0.15, bermM: 0.15 };

function cases() {
  const out = [];
  for (const region of ['pnw', 'on']) for (const g of [G, SMALL]) for (const seed of [1, 7, 42]) out.push({ region, g, seed });
  return out;
}

test('mulberry32 is deterministic and in [0, 1)', () => {
  const a = mulberry32(5);
  const b = mulberry32(5);
  for (let i = 0; i < 100; i++) {
    const v = a();
    assert.equal(v, b());
    assert.ok(v >= 0 && v < 1);
  }
});

test('zonesOf gives the plan radii fractions', () => {
  const z = zonesOf(G);
  assert.deepEqual([z.wet.r0, z.wet.r1], [0, 0.45]);
  assert.deepEqual([z.middle.r0, z.middle.r1], [0.45, 0.8]);
  assert.deepEqual([z.edge.r0, z.edge.r1], [0.8, 1]);
  assert.equal(z.edge.bermM, 0.6);
});

test('no two plants closer than the larger spacing x 0.9', () => {
  for (const { region, g, seed } of cases()) {
    const placed = layoutPlants(g, PLANTS, { seed, region });
    assert.ok(placed.length > 10, `${region} seed ${seed}: only ${placed.length}`);
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i];
        const b = placed[j];
        const s = Math.max(BY_ID.get(a.id).spacing_m, BY_ID.get(b.id).spacing_m);
        assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 0.9 * s, `${a.id}/${b.id} too close`);
      }
    }
  }
});

test('every plant inside its zone ring and of that zone', () => {
  for (const { region, g, seed } of cases()) {
    for (const p of layoutPlants(g, PLANTS, { seed, region })) {
      const rho = ellipseRho(g, p.x, p.y);
      const plant = BY_ID.get(p.id);
      assert.equal(plant.zone, p.zone);
      assert.equal(plant.region, region);
      if (p.zone === 'wet') assert.ok(rho < 0.45);
      if (p.zone === 'middle') assert.ok(rho >= 0.45 && rho < 0.8);
      if (p.zone === 'edge') assert.ok(rho >= 0.8 && ellipseRho(g, p.x, p.y, 0.6) <= 1);
      assert.equal(zoneOfPoint(g, p.x, p.y), p.zone);
      assert.ok(p.r > 0);
    }
  }
});

test('3-5 species per zone and drifts of at most 7 (mostly 3+)', () => {
  for (const region of ['pnw', 'on']) {
    for (const seed of [1, 2, 3]) {
      const placed = layoutPlants(WSU_SIZE, PLANTS, { seed, region });
      for (const zone of ['wet', 'middle', 'edge']) {
        const n = new Set(placed.filter((p) => p.zone === zone).map((p) => p.id)).size;
        assert.ok(n >= 3 && n <= 5, `${region} ${zone}: ${n} species`);
      }
      const drifts = new Map();
      for (const p of placed) drifts.set(p.drift, (drifts.get(p.drift) || 0) + 1);
      let inBig = 0;
      for (const [, k] of drifts) {
        assert.ok(k <= 7);
        if (k >= 3) inBig += k;
      }
      assert.ok(inBig >= placed.length / 2, `${region}: only ${inBig}/${placed.length} plants in drifts of 3+`);
    }
  }
});

test('never more than 5 species in a zone, any size', () => {
  for (const { region, g, seed } of cases()) {
    const placed = layoutPlants(g, PLANTS, { seed, region });
    for (const zone of ['wet', 'middle', 'edge']) {
      assert.ok(new Set(placed.filter((p) => p.zone === zone).map((p) => p.id)).size <= 5);
    }
  }
});

test('deterministic for a seed', () => {
  const a = layoutPlants(G, PLANTS, { seed: 9, region: 'on' });
  const b = layoutPlants(G, PLANTS, { seed: 9, region: 'on' });
  assert.deepEqual(a, b);
  const c = layoutPlants(G, PLANTS, { seed: 10, region: 'on' });
  assert.notDeepEqual(a, c);
});

test('sun filter keeps only plants that take that light', () => {
  const placed = layoutPlants(G, PLANTS, { seed: 3, region: 'pnw', sun: 'shade' });
  assert.ok(placed.length > 0);
  for (const p of placed) assert.ok(BY_ID.get(p.id).sun.includes('shade'));
});

test('region is required', () => {
  assert.throws(() => layoutPlants(G, PLANTS, { seed: 1 }));
});

test('quantities sum to placed length; sorted by zone then qty desc', () => {
  const placed = layoutPlants(G, PLANTS, { seed: 4, region: 'pnw' });
  const list = plantList(placed);
  assert.equal(list.reduce((s, r) => s + r.qty, 0), placed.length);
  const order = { wet: 0, middle: 1, edge: 2 };
  for (let i = 1; i < list.length; i++) {
    const a = list[i - 1];
    const b = list[i];
    assert.ok(order[a.zone] < order[b.zone] || (a.zone === b.zone && a.qty >= b.qty));
  }
  assert.ok(list.every((r) => r.common && r.latin));
});

test('a garden too small for anything returns an empty layout, not a hang', () => {
  const placed = layoutPlants({ cx: 0, cy: 0, lenM: 0.05, widM: 0.05, rot: 0, depthM: 0.1, bermM: 0 }, PLANTS, { seed: 1, region: 'on' });
  assert.ok(Array.isArray(placed));
  assert.deepEqual(plantList([]), []);
});
