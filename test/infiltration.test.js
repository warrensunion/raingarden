import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SOILS, HORTON, greenAmptF, greenAmptRate, greenAmptStep, hortonRate,
} from '../src/sim/infiltration.js';

// Chow, Maidment & Mays (1988) Example 4.3.1 uses its own inputs:
// psi = 16.7 cm, K = 0.65 cm/h, thetaE = 0.486, Se = 0.3 (dTheta = 0.340).
// Published answers at t = 1 h: F = 3.17 cm, f = 1.81 cm/h.
// psi is 167 mm here, not SOILS.siltLoam's 166.8 mm: the book rounds psi to
// 16.7 cm (psi*dTheta = 5.68 cm) and its answers follow that rounding, so the
// test uses the example's own inputs to compare like with like.
const CHOW_431 = { name: 'silt loam (Chow Ex. 4.3.1)', porosity: 0.501, thetaE: 0.486, psiMm: 167, kMmH: 6.5 };

test('Green-Ampt matches Chow Example 4.3.1', () => {
  const F = greenAmptF(1, CHOW_431, 0.3);
  assert.ok(Math.abs(F - 31.7) <= 0.1, `F = ${F}`);
  const f = greenAmptRate(F, CHOW_431, 0.3);
  assert.ok(Math.abs(f - 18.1) <= 0.1, `f = ${f}`);
});

test('SOILS carry the Rawls et al. (1983) parameters', () => {
  assert.equal(SOILS.siltLoam.thetaE, 0.486);
  assert.equal(SOILS.sand.kMmH, 117.8);
  assert.equal(SOILS.clay.psiMm, 316.3);
  for (const s of Object.values(SOILS)) {
    for (const k of ['porosity', 'thetaE', 'psiMm', 'kMmH']) assert.ok(s[k] > 0, `${s.name}.${k}`);
  }
});

test('greenAmptF is 0 at t = 0 and increasing', () => {
  assert.equal(greenAmptF(0, SOILS.loam, 0.3), 0);
  assert.ok(greenAmptF(2, SOILS.loam, 0.3) > greenAmptF(1, SOILS.loam, 0.3));
});

test('step agrees with closed form', () => {
  for (const soil of [SOILS.siltLoam, SOILS.sand, SOILS.clay]) {
    let F = 0;
    for (let k = 0; k < 3600; k++) F += greenAmptStep(F, 1, 1, soil, 0.3);
    const ref = greenAmptF(1, soil, 0.3) / 1000;
    assert.ok(Math.abs(F - ref) / ref < 0.005, `${soil.name}: ${F} vs ${ref}`);
  }
});

test('one large step equals the closed form too (exact increment)', () => {
  const dF = greenAmptStep(0, 1, 3600, SOILS.siltLoam, 0.3);
  const ref = greenAmptF(1, SOILS.siltLoam, 0.3) / 1000;
  assert.ok(Math.abs(dF - ref) / ref < 0.005, `${dF} vs ${ref}`);
});

test('step never exceeds available water', () => {
  for (const avail of [0, 1e-9, 1e-5, 1e-3, 0.05]) {
    for (const F of [0, 0.001, 0.05]) {
      const dF = greenAmptStep(F, avail, 300, SOILS.sand, 0.1);
      assert.ok(dF <= avail && dF >= 0, `F ${F} avail ${avail} -> ${dF}`);
    }
  }
  assert.equal(greenAmptStep(0.01, 0, 300, SOILS.loam, 0.3), 0);
});

test('Horton decays from f0 to fc', () => {
  const p = HORTON.loam;
  assert.equal(hortonRate(0, p), p.f0);
  assert.ok(Math.abs(hortonRate(100, p) - p.fc) < 1e-9);
  assert.ok(hortonRate(0.5, p) < p.f0 && hortonRate(0.5, p) > p.fc);
});
