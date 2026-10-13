/**
 * Step 9 — Compare: the same storm on the dug yard (applyGarden, with the
 * amended soil's water store), then before | after with a swipe divider and
 * one clock for both sides. Three big numbers count up: captured, leaving the
 * yard (against before), and how long water stands in the garden.
 */

import { applyGarden } from '../../garden/constraints.js';
import { GARDEN_STORAGE_M } from '../../garden/optimizer.js';
import { createPlayback } from '../playback.js';
import { lerpFrames, fmtL, fmtNum } from '../model.js';
import { easeReveal } from '../../core/ease.js';

export default function compare(sheet, ctx) {
  const { state } = ctx;
  const storm = state.storms.find((s) => s.id === state.stormId);
  const g = state.design.garden;
  const b = sheet.body;
  b.innerHTML = `
    <h2 class="dz-h2">Before and after</h2>
    <p class="dz-progress-line" role="status"></p>
    <div class="dz-big" hidden>
      <div><p class="dz-big-n n-cap">0 L</p><p class="dz-big-l">captured</p></div>
      <div><p class="dz-big-n n-out">0 L</p><p class="dz-big-l">leave the yard <span class="dz-muted n-was"></span></p></div>
      <div><p class="dz-big-n n-h">0 h</p><p class="dz-big-l">water stands</p></div>
    </div>
    <p class="dz-hint dz-split-hint" hidden>Drag the divider, or focus it and use ← →.</p>
    <div class="dz-play-host"></div>`;
  const line = b.querySelector('.dz-progress-line');
  const big = b.querySelector('.dz-big');
  let alive = true;
  let pb = null;
  let split = 0.5;
  sheet.setPrimary({ label: 'Get my plan', disabled: true });
  ctx.pose('compare');
  ctx.yard()?.setGarden(g, state.plants, { season: 1 });

  // ---- the divider (a DOM handle over the stage) ----
  const handle = ctx.stageUi(`<div class="dz-split" role="slider" tabindex="0" aria-label="Before and after divider" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50">
    <span class="dz-split-tag l">Before</span><span class="dz-split-knob" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 7l-4 5 4 5M15 7l4 5-4 5"/></svg></span><span class="dz-split-tag r">With the garden</span></div>`);
  handle.hidden = true;
  function placeSplit() {
    const r = ctx.yardRect();
    handle.style.left = `${r.left + split * r.width}px`;
    handle.style.top = `${r.top}px`;
    handle.style.height = `${r.height}px`;
    handle.setAttribute('aria-valuenow', String(Math.round(split * 100)));
  }
  let dragging = false;
  handle.addEventListener('pointerdown', (e) => { dragging = true; handle.setPointerCapture(e.pointerId); });
  handle.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const r = ctx.yardRect();
    split = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    placeSplit();
    pb && pb.seek(pb.progress); // re-draw both sides at the current time
  });
  handle.addEventListener('pointerup', () => { dragging = false; });
  handle.addEventListener('keydown', (e) => {
    const d = { ArrowLeft: -0.05, ArrowRight: 0.05, Home: -1, End: 1 }[e.key];
    if (d === undefined) return;
    e.preventDefault();
    split = Math.min(1, Math.max(0, split + d));
    placeSplit();
    pb && pb.seek(pb.progress);
  });
  const onResize = () => placeSplit();
  addEventListener('resize', onResize);

  function countUp(el, to, fmt) {
    if (ctx.reducedMotion) { el.textContent = fmt(to); return; }
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / 1600);
      el.textContent = fmt(to * easeReveal(k));
      if (k < 1 && alive) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  async function run() {
    if (!state.after) {
      line.textContent = 'Running the storm on your garden…';
      const si = state.si;
      const dug = applyGarden(ctx.terrain(), g);
      state.after = await ctx.sim.run({
        terrain: dug.terrain, soil: state.soil, outlet: si.outlet, imperv: si.imperv, roof: si.roof,
        garden: { mask: dug.mask, storageM: GARDEN_STORAGE_M },
        mmSteps: storm.mm, stepS: storm.stepS, frameEveryS: 900,
      }, (n, t) => { if (alive) line.textContent = `Running the storm on your garden… ${Math.round(t / 3600)} h`; });
    }
    if (!alive) return;
    line.textContent = '';
    const bf = state.before.frames;
    const af = state.after.frames;
    const outBefore = state.before.result.ledger.outL;
    const outAfter = state.after.result.ledger.outL;
    const captured = Math.max(0, outBefore - outAfter);
    const drainH = state.design.drainH;
    ctx.setResult({ step: 'compare', capturedL: captured, outBeforeL: outBefore, outAfterL: outAfter, drainH, simDrainH: state.after.result.drainH, areaM2: state.design.areaM2, plants: state.plants.length });
    big.hidden = false;
    countUp(big.querySelector('.n-cap'), captured, fmtL);
    countUp(big.querySelector('.n-out'), outAfter, fmtL);
    big.querySelector('.n-was').textContent = `(${fmtNum(outBefore)} L before)`;
    const hFmt = (v) => (!Number.isFinite(drainH) ? 'over 48 h' : drainH > 0 && drainH < 1 ? 'under 1 h' : `${Math.round(v)} h`);
    countUp(big.querySelector('.n-h'), Number.isFinite(drainH) ? drainH : 48, hFmt);
    b.querySelector('.dz-split-hint').hidden = false;
    handle.hidden = false;
    placeSplit();
    const n = ctx.terrain().nx * ctx.terrain().ny;
    const dA = new Float32Array(n);
    const dB = new Float32Array(n);
    const spanS = Math.max(storm.mm.length * storm.stepS, bf.length ? bf[bf.length - 1].t : 0, af.length ? af[af.length - 1].t : 0);
    pb = createPlayback(b.querySelector('.dz-play-host'), {
      spanS, mm: storm.mm, stepS: storm.stepS, reducedMotion: ctx.reducedMotion,
      onTime(t, rate) {
        lerpFrames(af, t, dA, state.after.result.drained ? 900 : 0);
        lerpFrames(bf, t, dB, state.before.result.drained ? 900 : 0);
        const y = ctx.yard();
        if (!y) return;
        y.setWater(dA, { rainMmH: rate });
        y.setSplit(split, dB);
      },
    });
    ctx.playback = pb;
    sheet.setPrimary({ label: 'Get my plan', onClick: () => ctx.next() });
  }
  run().catch((e) => {
    console.warn('[raingarden] after run failed:', e);
    if (alive) line.textContent = 'The storm sim stopped with an error.';
  });

  return {
    destroy() {
      alive = false;
      removeEventListener('resize', onResize);
      pb?.destroy();
      if (ctx.playback === pb) ctx.playback = null;
      handle.remove();
      ctx.yard()?.setSplit(null);
    },
  };
}
