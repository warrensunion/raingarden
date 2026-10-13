import test from 'node:test';
import assert from 'node:assert/strict';
import {
  regionFromLon, round2, gravityFromOrientation, flatDepth, groundMarks, wallLine, houseMask,
  outletMask, snapCell, siteInputs, plantRows, fmtL, fmtHours, fmtNum, slopeSentence, directionWords,
  clockLabel, rainRateAt, lerpFrames, frameIndexAt, wrapText, sparkPath, gardenDims, manualDir, polyAreaM2, clipSegment, rendererMarks, niceInterval, ledgerAt, failureWords,
} from '../src/designer/model.js';
import { toHeightfield } from '../src/depth/heightfield.js';
import { manualTerrain } from '../src/depth/manualTerrain.js';
import { inPolygon } from '../src/garden/constraints.js';

const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test('regionFromLon: west of 100 W is the Pacific Northwest, east is Southern Ontario, junk falls back to pnw', () => {
  assert.equal(regionFromLon(-123.1), 'pnw');
  assert.equal(regionFromLon(-79.4), 'on');
  assert.equal(regionFromLon(NaN), 'pnw');
  assert.equal(regionFromLon(undefined), 'pnw');
});

test('round2 rounds coordinates to 2 dp before any request', () => {
  assert.equal(round2(49.16666), 49.17);
  assert.equal(round2(-123.13499), -123.13);
  assert.equal(round2(-0.004), -0);
});

test('gravityFromOrientation: upright portrait looks at the horizon; pitched 20 deg down matches the demo vector', () => {
  const up = gravityFromOrientation(90, 0, 0);
  assert.ok(close(up[0], 0) && close(up[1], 1) && close(up[2], 0, 1e-9), String(up));
  const pitched = gravityFromOrientation(70, 0, 0);
  assert.ok(close(pitched[1], 0.9397, 1e-3) && close(pitched[2], 0.342, 1e-3), String(pitched));
  // rolled right (gamma > 0): down leans toward +x of the camera
  const rolled = gravityFromOrientation(80, 10, 0);
  assert.ok(rolled[0] > 0.01, String(rolled));
  // landscape (screen turned 90): the camera's x and y swap roles
  const land = gravityFromOrientation(90, 0, 90);
  assert.ok(close(Math.abs(land[0]), 1, 1e-9) && close(land[1], 0, 1e-9), String(land));
  assert.equal(gravityFromOrientation(null, null, 0), null);
});

test('flatDepth: a level ground seen with the given gravity reads ~0% in toHeightfield', () => {
  const g = gravityFromOrientation(70, 0, 0);
  const scale = { a: [0.4, 0.9], b: [0.6, 0.9], meters: 1 };
  const depth = flatDepth({ w: 96, h: 64, gravity: g, aspect: 1.5, scale });
  assert.equal(depth.data.length, 96 * 64);
  assert.ok(depth.cameraHeightM > 0.3 && depth.cameraHeightM < 5, String(depth.cameraHeightM));
  const yard = [[0.1, 0.6], [0.9, 0.6], [0.9, 0.98], [0.1, 0.98]];
  const r = toHeightfield({ depth, gravity: g, yard, scale, n: 48, cameraHeightM: depth.cameraHeightM });
  assert.ok(r.confidence.slopePct < 0.5, `slope ${r.confidence.slopePct}`);
  assert.ok(r.terrain.nx >= 2 && r.terrain.ny >= 2);
});

test('groundMarks maps every image mark through toGround and keeps the scale length', () => {
  const toGround = ([u, v]) => [u * 10, (1 - v) * 8];
  const m = groundMarks({
    scale: { a: [0.1, 0.9], b: [0.2, 0.9], meters: 1.5 }, downspout: [0.1, 0.8], wall: [[0.05, 0.4], [0.06, 0.6], [0.04, 0.7]],
    outlet: [0.95, 0.5], yard: [[0.2, 0.4], [0.9, 0.4], [0.9, 1], [0.2, 1]], septic: null,
  }, toGround);
  assert.deepEqual(m.downspout.map((v) => +v.toFixed(6)), [1, 1.6]);
  assert.equal(m.yard.length, 4);
  assert.equal(m.septic, null);
  assert.equal(m.scale.meters, 1.5);
  assert.equal(m.wallPts.length, 3);
});

test('wallLine runs through the downspout along the nearest yard edge; houseMask is the far side outside the yard', () => {
  const yard = [[2, 0], [10, 0], [10, 8], [2, 8]];
  const spout = [1.6, 3];
  const seg = wallLine(yard, spout, 4);
  // nearest edge is x = 2 (vertical): the wall is vertical through x = 1.6
  assert.ok(close(seg[0][0], 1.6, 1e-9) && close(seg[1][0], 1.6, 1e-9), JSON.stringify(seg));
  assert.ok(close(Math.abs(seg[1][1] - seg[0][1]), 8, 1e-9));
  const terrain = { nx: 12, ny: 8, cell: 1, z: new Float64Array(96) };
  const mask = new Uint8Array(96);
  for (let j = 0; j < 8; j++) for (let i = 0; i < 12; i++) mask[j * 12 + i] = inPolygon(i + 0.5, j + 0.5, yard) ? 1 : 0;
  const house = houseMask(terrain, seg, yard, mask);
  assert.equal(house[3 * 12 + 0], 1); // x = 0.5, left of the wall
  assert.equal(house[3 * 12 + 1], 1); // x = 1.5, still left of the wall line at 1.6
  assert.equal(house[3 * 12 + 11], 0); // x = 11.5: outside the yard but on the yard's side of the wall
  assert.equal(house[3 * 12 + 5], 0); // in the yard
});

test('outletMask: water leaves over the edge of the ground grid, never into the house or at the downspout', () => {
  const nx = 6; const ny = 4;
  const house = new Uint8Array(nx * ny); house[0] = 1; house[6] = 1;
  const out = outletMask({ nx, ny, cell: 1 }, house, -1);
  assert.equal(out[0], 0); // house corner
  assert.equal(out[6], 0); // house, grid edge
  assert.equal(out[5], 1); // other corner
  assert.equal(out[1 * nx + 2], 0); // interior
  // 2 * (6 + 4) - 4 edge cells, minus the two house cells
  assert.equal(out.reduce((a, b) => a + b, 0), 14);
  const o3 = outletMask({ nx, ny, cell: 1 }, house, 5);
  assert.equal(o3[5], 0);
});

test('snapCell picks the nearest in-yard cell to a point outside the yard', () => {
  const nx = 10; const ny = 10;
  const mask = new Uint8Array(100);
  for (let j = 0; j < 10; j++) for (let i = 4; i < 10; i++) mask[j * 10 + i] = 1;
  assert.equal(snapCell({ nx, ny, cell: 1 }, mask, [1.2, 5.5]), 5 * 10 + 4);
  assert.equal(snapCell({ nx, ny, cell: 1 }, mask, [7.5, 2.5]), 2 * 10 + 7);
});

test('siteInputs builds the sim and optimizer inputs: roof mask = house, downspout snapped into the yard', () => {
  const terrain = manualTerrain({ widthM: 10, depthM: 8, preset: 'gentle', dir: [1, 0], n: 20 });
  const yard = [[2, 0.2], [9.8, 0.2], [9.8, 7.8], [2, 7.8]];
  const { nx, ny, cell } = terrain;
  terrain.mask = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) terrain.mask[j * nx + i] = inPolygon((i + 0.5) * cell, (j + 0.5) * cell, yard) ? 1 : 0;
  const gm = { downspout: [1.5, 4], yard, outlet: [9.9, 4], septic: null, wallPts: [], scale: null };
  const s = siteInputs(terrain, gm, 80);
  assert.equal(s.roof.areaM2, 80);
  assert.equal(terrain.mask[s.roof.cell], 1);
  assert.equal(s.outlet[s.roof.cell], 0);
  assert.ok(s.roof.mask.some((v) => v === 1));
  assert.deepEqual(s.imperv, s.roof.mask);
  assert.ok(s.site.wall.length === 2 && s.site.yard === yard);
  assert.ok(s.outlet.some((v) => v === 1));
});

test('plantRows: one row per species with latin, zone, qty and spacing, wet first', () => {
  const plants = [
    { id: 'a', common: 'Alpha', latin: 'A. alpha', zone: 'edge', spacing_m: 1.2, spread_m: [1, 2], height_m: [0.5, 1] },
    { id: 'b', common: 'Beta', latin: 'B. beta', zone: 'wet', spacing_m: 0.3, spread_m: [0.3, 0.6], height_m: [0.2, 0.4] },
  ];
  const placed = [{ id: 'a', zone: 'edge' }, { id: 'b', zone: 'wet' }, { id: 'b', zone: 'wet' }];
  const rows = plantRows(placed, plants);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].id, 'b');
  assert.equal(rows[0].qty, 2);
  assert.equal(rows[0].latin, 'B. beta');
  assert.equal(rows[0].spacingM, 0.3);
  assert.equal(rows[1].zone, 'edge');
});

test('number formatting: litres with thousands separators, hours honest about never and under 1 h', () => {
  assert.equal(fmtL(1840.4), '1,840 L');
  assert.equal(fmtL(0.2), '0 L');
  assert.equal(fmtL(-3), '0 L');
  assert.equal(fmtNum(12345.6), '12,346');
  assert.equal(fmtHours(18.2), '18 h');
  assert.equal(fmtHours(0.3), 'under 1 h');
  assert.equal(fmtHours(0), 'no standing water');
  assert.equal(fmtHours(Infinity), 'more than 48 h');
});

test('slope sentence and direction words (x right, y away from the camera)', () => {
  assert.equal(directionWords([0, 1]), 'the back');
  assert.equal(directionWords([1, 1]), 'the back right');
  assert.equal(directionWords([-1, 0]), 'the left');
  assert.equal(directionWords([0.2, -1]), 'the front');
  assert.equal(slopeSentence({ slopePct: 3.2, lowPct: 1.1, highPct: 5.9 }, [0.7, 0.7]), 'Falls about 3% toward the back right (likely 1–6%)');
  assert.equal(slopeSentence({ slopePct: 0.3, lowPct: 0, highPct: 2 }, [1, 0]), 'Nearly flat (likely 0–2%)');
});

test('clock label for storm time from midnight, and rain intensity at a time', () => {
  assert.equal(clockLabel(14 * 3600), '2:00 pm');
  assert.equal(clockLabel(0), '12:00 am');
  assert.equal(clockLabel(12.5 * 3600), '12:30 pm');
  assert.equal(clockLabel(27 * 3600), 'next day 3:00 am');
  assert.equal(clockLabel(51 * 3600), 'day 3, 3:00 am');
  const mm = new Float64Array([1, 2, 0.5]); // per 300 s step
  assert.equal(rainRateAt(mm, 300, 0), 12);
  assert.equal(rainRateAt(mm, 300, 450), 24);
  assert.equal(rainRateAt(mm, 300, 5000), 0);
});

test('frames: index at a time and linear blend between neighbours, holding the last frame', () => {
  const frames = [{ t: 900, depth: new Float32Array([0, 0]) }, { t: 1800, depth: new Float32Array([1, 2]) }];
  assert.deepEqual(frameIndexAt(frames, 1350), { i: 0, k: 0.5 });
  const out = new Float32Array(2);
  lerpFrames(frames, 1350, out);
  assert.deepEqual([...out], [0.5, 1]);
  lerpFrames(frames, 99999, out);
  assert.deepEqual([...out], [1, 2]);
  lerpFrames(frames, 0, out);
  assert.deepEqual([...out], [0, 0]);
  lerpFrames([], 10, out);
  assert.deepEqual([...out], [0, 0]);
});

test('wrapText wraps at word boundaries within the width', () => {
  const lines = wrapText('Call before you dig: BC 1 Call in BC, Ontario One Call in Ontario.', 24);
  assert.ok(lines.every((l) => l.length <= 24), JSON.stringify(lines));
  assert.equal(lines.join(' '), 'Call before you dig: BC 1 Call in BC, Ontario One Call in Ontario.');
});

test('sparkPath draws a hyetograph polyline within the box', () => {
  const d = sparkPath([0, 1, 4, 1, 0], 100, 20);
  assert.match(d, /^M0 20/);
  assert.ok(d.includes('L50 0'), d);
  assert.equal(sparkPath([], 100, 20), '');
});

test('gardenDims: full axes, depth, berm and the gap from the house wall to the garden edge', () => {
  const g = { cx: 6, cy: 4, lenM: 3, widM: 2, rot: 0, depthM: 0.15, bermM: 0.1 };
  const d = gardenDims(g, [[1, 0], [1, 8]]);
  assert.equal(d.lengthM, 3);
  assert.equal(d.widthM, 2);
  assert.ok(close(d.houseM, 3.5, 0.02), String(d.houseM));
  assert.equal(gardenDims(g, null).houseM, null);
});

test('manualDir: downhill from the downspout toward the outlet, default away from the camera', () => {
  assert.deepEqual(manualDir([1, 1], [4, 5]).map((v) => +v.toFixed(3)), [0.6, 0.8]);
  assert.deepEqual(manualDir(null, null), [0, 1]);
});

test('polyAreaM2 is the absolute shoelace area', () => {
  assert.equal(polyAreaM2([[0, 0], [2, 0], [2, 3], [0, 3]]), 6);
  assert.equal(polyAreaM2([[0, 0], [0, 3], [2, 3], [2, 0]]), 6);
});

test('clipSegment clips a long wall line to the ground rectangle', () => {
  const s = clipSegment([[-5, 4], [15, 4]], 10, 8);
  assert.deepEqual(s, [[0, 4], [10, 4]]);
  assert.equal(clipSegment([[-5, -1], [15, -1]], 10, 8), null);
});

test('rendererMarks: downspout, outlet, wall (clipped), scale and septic for the yard view', () => {
  const gm = { downspout: [1, 2], outlet: [9, 3], scale: { a: [2, 1], b: [3, 1], meters: 1 }, septic: [[5, 5], [6, 5], [6, 6]], yard: [], wallPts: [] };
  const marks = rendererMarks(gm, { wall: [[1, -20], [1, 20]] }, 10, 8);
  const kinds = marks.map((m) => m.kind).sort();
  assert.deepEqual(kinds, ['downspout', 'outlet', 'scale', 'septic', 'wall']);
  const wall = marks.find((m) => m.kind === 'wall');
  assert.deepEqual(wall.pts, [[1, 0], [1, 8]]);
});

test('niceInterval picks a round contour step giving about 4 to 12 lines', () => {
  assert.equal(niceInterval(0.8), 0.1);
  assert.equal(niceInterval(2.1), 0.25);
  assert.equal(niceInterval(0.05), 0.01);
  assert.equal(niceInterval(0), 0.05);
});

test('ledgerAt ramps from zero before the first frame and blends between frames', () => {
  const frames = [
    { t: 900, ledger: { rainL: 10, roofL: 20, infiltratedL: 5, outL: 1, storedL: 0 } },
    { t: 1800, ledger: { rainL: 30, roofL: 40, infiltratedL: 15, outL: 11, storedL: 2 } },
  ];
  assert.deepEqual(ledgerAt(frames, 450), { rainL: 5, roofL: 10, infiltratedL: 2.5, outL: 0.5, storedL: 0 });
  assert.deepEqual(ledgerAt(frames, 1350), { rainL: 20, roofL: 30, infiltratedL: 10, outL: 6, storedL: 1 });
  assert.deepEqual(ledgerAt(frames, 1e9), frames[1].ledger);
  assert.deepEqual(ledgerAt([], 10), { rainL: 0, roofL: 0, infiltratedL: 0, outL: 0, storedL: 0 });
});

test('optimizer failures in plain words, each with suggestions', () => {
  for (const r of ['budget too small for the smallest garden', 'the area limit is below the smallest garden (0.28 m²)', 'the yard is too small',
    'everything is within 3 m of the house', 'the septic buffer covers the yard', 'no garden here drains within 48 h (the soil is too slow)', 'something new']) {
    const w = failureWords(r);
    assert.ok(w.say.length > 10 && /[.]$/.test(w.say), r);
    assert.ok(Array.isArray(w.tips) && w.tips.length >= 1, r);
  }
  assert.match(failureWords('everything is within 3 m of the house').say, /3 m/);
});
