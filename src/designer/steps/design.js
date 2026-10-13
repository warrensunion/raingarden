/**
 * Step 7 — Design: the published sizing answer first, then the optimizer
 * (simulated annealing over the real storm sim, in the worker) searches for
 * where and how big. Every try it reports is drawn as a ghost on the yard,
 * the best so far solid, with a running count.
 */

import { sizeGarden } from '../../garden/sizing.js';
import { costOf } from '../../garden/cost.js';
import { fmtL, fmtNum, failureWords, polyAreaM2 } from '../model.js';

const METHOD = { pnw: 'The WSU Rain Garden Handbook', on: 'The Wisconsin DNR rain garden manual' };
const GHOST_MS = 600;
const PRIOR_DEPTH_M = 0.15;

function ellipsePts(g, n = 28) {
  const c = Math.cos(g.rot || 0);
  const s = Math.sin(g.rot || 0);
  const out = [];
  for (let k = 0; k < n; k++) {
    const t = (k / n) * Math.PI * 2;
    const lx = (Math.cos(t) * g.lenM) / 2;
    const ly = (Math.sin(t) * g.widM) / 2;
    out.push([g.cx + lx * c - ly * s, g.cy + lx * s + ly * c]);
  }
  return out;
}

export default function design(sheet, ctx) {
  const { state } = ctx;
  const storm = state.storms.find((s) => s.id === state.stormId);
  let prior = null;
  try {
    prior = sizeGarden({ region: state.region, drainageAreaM2: state.roofAreaM2, soil: state.soil, depthM: PRIOR_DEPTH_M });
  } catch (e) {
    console.warn('[raingarden] sizing failed:', e.message);
  }
  state.prior = prior;
  const yardArea = polyAreaM2(state.gm.yard);
  if (!state.limits.maxAreaM2) state.limits.maxAreaM2 = Math.max(1, Math.round(prior ? 2 * prior.areaM2 : 20));

  const b = sheet.body;
  const septic = state.gm.septic
    ? 'Away from your septic field: 10 ft (3 m) if it is uphill of the garden, 50 ft (15 m) if downhill.'
    : 'No septic field marked.';
  b.innerHTML = `
    <h2 class="dz-h2">Design the garden</h2>
    ${prior ? `<p class="dz-lede">${METHOD[state.region]} says about <strong>${fmtNum(prior.areaM2, prior.areaM2 < 10 ? 1 : 0)} m²</strong> for ${Math.round(state.roofAreaM2)} m² of roof on ${state.soil}${prior.areaM2 > yardArea ? `, more than this ${fmtNum(yardArea)} m² yard has room for, so we’ll find the best that fits` : ''}.</p>
    <p class="dz-cite">${prior.cite}</p>${prior.warnings.length ? `<p class="dz-warn">${prior.warnings.join(' ')}</p>` : ''}` : ''}
    <div class="dz-limits">
      <label class="dz-field"><span>Budget</span><input type="number" inputmode="numeric" min="50" step="50" class="l-budget" value="${state.limits.budget}"><span class="dz-unit">CAD</span></label>
      <label class="dz-field"><span>Largest area</span><input type="number" inputmode="decimal" min="1" step="1" class="l-area" value="${state.limits.maxAreaM2}"><span class="dz-unit">m²</span></label>
      <label class="dz-check"><input type="checkbox" checked disabled> Keep 3 m from the house</label>
      <p class="dz-note">Locked on: water held next to a foundation can seep into a basement or crawl space (WSU, Metro Vancouver).</p>
      <p class="dz-note">${septic}</p>
    </div>
    <p class="dz-progress-line" role="status"></p>
    <div class="dz-outcome"></div>`;
  const line = b.querySelector('.dz-progress-line');
  const outcome = b.querySelector('.dz-outcome');
  const budgetIn = b.querySelector('.l-budget');
  const areaIn = b.querySelector('.l-area');
  let alive = true;
  let job = null;
  let ghosts = [];
  let best = null;

  budgetIn.addEventListener('change', () => { const v = parseFloat(budgetIn.value); if (v > 0) { state.limits.budget = v; ctx.resetFrom('limits'); idle(); } });
  areaIn.addEventListener('change', () => { const v = parseFloat(areaIn.value); if (v > 0) { state.limits.maxAreaM2 = v; ctx.resetFrom('limits'); idle(); } });

  ctx.pose('optimize');
  ctx.yard()?.setSplit(null);
  ctx.yard()?.setWater(new Float32Array(ctx.terrain().nx * ctx.terrain().ny), { rainMmH: 0 });

  function drawGhosts(g, yard, now) {
    if (!yard) return;
    const proj = (pts) => pts.map((p) => yard.project(p[0], p[1])).filter(Boolean);
    ghosts = ghosts.filter((x) => now - x.t0 < GHOST_MS);
    for (const x of ghosts) {
      const a = 1 - (now - x.t0) / GHOST_MS;
      const pts = proj(ellipsePts(x.g));
      if (pts.length < 3) continue;
      g.globalAlpha = 0.65 * a;
      g.strokeStyle = ctx.colors.paper;
      g.lineWidth = 1.5;
      g.beginPath();
      pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
      g.closePath();
      g.stroke();
    }
    if (best) {
      const pts = proj(ellipsePts(best, 48));
      if (pts.length >= 3) {
        g.fillStyle = ctx.colors.marigold;
        g.strokeStyle = ctx.colors.marigold;
        g.lineWidth = 3;
        g.beginPath();
        pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
        g.closePath();
        g.globalAlpha = 0.28;
        g.fill();
        g.globalAlpha = 1;
        g.stroke();
      }
    }
    g.globalAlpha = 1;
  }

  function idle() {
    if (state.design) return showResult(state.design);
    outcome.innerHTML = '';
    sheet.setPrimary({ label: 'Design my garden', onClick: run });
  }

  async function run() {
    const si = state.si;
    outcome.innerHTML = '<button type="button" class="dz-text-btn dz-stop">Stop</button>';
    outcome.querySelector('.dz-stop').addEventListener('click', () => job && job.cancel());
    sheet.setPrimary({ label: 'Design my garden', disabled: true });
    line.textContent = 'Trying gardens…';
    ghosts = [];
    best = null;
    ctx.yard()?.setGarden(null);
    ctx.overlay.set(drawGhosts);
    let tried = 0;
    job = ctx.sim.optimize({
      terrain: ctx.terrain(), soil: state.soil, outlet: si.outlet, imperv: si.imperv, roof: si.roof, site: si.site,
      mmSteps: storm.mm, stepS: storm.stepS,
      limits: { budget: state.limits.budget, maxAreaM2: state.limits.maxAreaM2 },
      prior: prior ? { areaM2: prior.areaM2, depthM: PRIOR_DEPTH_M } : undefined,
      seed: 1,
    }, (m) => {
      tried = m.i + 1;
      ghosts.push({ g: m.garden, t0: performance.now() });
      best = m.best.garden;
      if (alive) line.textContent = `Tried ${fmtNum(tried)} gardens`;
    });
    let res;
    try {
      res = await job.promise;
    } catch (e) {
      job = null;
      if (!alive) return;
      ctx.overlay.set(null);
      line.textContent = e.cancelled ? 'Stopped.' : 'The optimizer stopped with an error.';
      if (!e.cancelled) console.warn('[raingarden] optimize failed:', e);
      idle();
      return;
    }
    job = null;
    if (!alive) return;
    state.design = res;
    ctx.overlay.set(null);
    line.textContent = res.ok ? `Tried ${fmtNum(res.tries)} gardens.` : '';
    showResult(res);
  }

  function showResult(res) {
    ctx.setResult({ step: 'design', ...res });
    if (!res.ok) {
      const w = failureWords(res.reason);
      outcome.innerHTML = `<p class="dz-warn">${w.say}</p><ul class="dz-tips">${w.tips.map((t) => `<li>${t}</li>`).join('')}</ul>`;
      sheet.setPrimary({ label: 'Design my garden', onClick: run });
      return;
    }
    const g = res.garden;
    ctx.yard()?.setGarden(g);
    const cost = res.cost || costOf(g);
    const dims = `${g.lenM.toFixed(1)} × ${g.widM.toFixed(1)} m, ${Math.round(g.depthM * 100)} cm deep`;
    let say;
    if (res.outBeforeL < 1) {
      say = `Your soil already soaks this storm up: almost nothing leaves the yard today, so a garden is a bonus for wildlife, not a fix. Here is the smallest one that fits (${fmtNum(res.areaM2, 1)} m²).`;
    } else if (res.capturedL < 1) {
      say = 'None of the spots we tried catches the downspout’s water. Check the downspout and outline marks, or raise the budget.';
    } else {
      say = `A <strong>${fmtNum(res.areaM2, 1)} m²</strong> garden (${dims}) catches about <strong>${fmtL(res.capturedL)}</strong> of the ${fmtL(res.outBeforeL)} that leaves your yard today.`;
    }
    outcome.innerHTML = `<p class="dz-result">${say}</p>
      <p class="dz-note">About $${fmtNum(cost.total)} to build yourself (digging, soil, mulch, plants). Ponded water drains in ${Math.round(res.drainH)} h (the limit is 48 h).</p>
      <button type="button" class="dz-text-btn dz-again">Try again</button>`;
    outcome.querySelector('.dz-again').addEventListener('click', () => { state.design = null; ctx.resetFrom('limits'); run(); });
    sheet.setPrimary({ label: 'Plant it', onClick: () => ctx.next() });
  }

  idle();

  return {
    destroy() {
      alive = false;
      if (job) job.cancel();
      ctx.overlay.set(null);
    },
  };
}
