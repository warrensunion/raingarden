/**
 * Step 6 — Before: the chosen storm runs over the yard as it is today, in the
 * sim worker, and plays back in 24 s with live litres: fallen, leaving the
 * yard, soaked in. This is the "before" the garden is judged against.
 */

import { createPlayback } from '../playback.js';
import { lerpFrames, ledgerAt, fmtL, playSpan } from '../model.js';

export default function before(sheet, ctx) {
  const { state } = ctx;
  const b = sheet.body;
  const storm = state.storms.find((s) => s.id === state.stormId);
  b.innerHTML = `
    <h2 class="dz-h2">Today, in this storm</h2>
    <p class="dz-lede">${storm.label}: ${storm.totalMm.toFixed(1)} mm on ${Math.round(state.roofAreaM2)} m² of roof and your yard (${state.soil}).</p>
    <p class="dz-progress-line" role="status"></p>
    <dl class="dz-counters" hidden>
      <div><dt>Rain on roof and ground</dt><dd class="c-fallen">0 L</dd></div>
      <div><dt>Leaving the yard</dt><dd class="c-out">0 L</dd></div>
      <div><dt>Soaked in</dt><dd class="c-in">0 L</dd></div>
    </dl>
    <div class="dz-play-host"></div>`;
  const line = b.querySelector('.dz-progress-line');
  const counters = b.querySelector('.dz-counters');
  const cFallen = b.querySelector('.c-fallen');
  const cOut = b.querySelector('.c-out');
  const cIn = b.querySelector('.c-in');
  let alive = true;
  let pb = null;
  sheet.setPrimary({ label: 'Next', disabled: true });
  ctx.pose('storm');
  ctx.yard()?.setGarden(null);
  ctx.yard()?.setSplit(null);

  async function run() {
    if (!state.before) {
      const rainH = (storm.mm.length * storm.stepS) / 3600;
      line.textContent = 'Running the storm…';
      const si = state.si;
      const res = await ctx.sim.run({
        terrain: ctx.terrain(), soil: state.soil, outlet: si.outlet, imperv: si.imperv, roof: si.roof,
        mmSteps: storm.mm, stepS: storm.stepS, frameEveryS: 900,
      }, (n, t) => { if (alive) line.textContent = `Running the storm… ${Math.min(Math.round(t / 3600), Math.round(rainH))} of ${Math.round(rainH)} h`; });
      state.before = res;
    }
    if (!alive) return;
    line.textContent = '';
    counters.hidden = false;
    const { frames, result } = state.before;
    ctx.setResult({ step: 'before', ...result.ledger, drainH: result.drainH, frames: frames.length });
    const depth = new Float32Array(ctx.terrain().nx * ctx.terrain().ny);
    // past the last frame of a drained run, so playback ends on a dry yard
    const spanS = playSpan(storm.mm.length * storm.stepS, [{ frames, drained: result.drained }]);
    pb = createPlayback(b.querySelector('.dz-play-host'), {
      spanS, mm: storm.mm, stepS: storm.stepS, reducedMotion: ctx.reducedMotion,
      onTime(t, rate) {
        lerpFrames(frames, t, depth, state.before.result.drained ? 900 : 0);
        ctx.yard()?.setWater(depth, { rainMmH: rate });
        const l = ledgerAt(frames, t);
        cFallen.textContent = fmtL(l.rainL + l.roofL);
        cOut.textContent = fmtL(l.outL);
        cIn.textContent = fmtL(l.infiltratedL);
      },
    });
    ctx.playback = pb;
    sheet.setPrimary({ label: 'Next', onClick: () => ctx.next() });
  }
  run().catch((e) => {
    console.warn('[raingarden] storm run failed:', e);
    if (alive) line.textContent = 'The storm sim stopped with an error. Go back and try another storm.';
  });

  return {
    destroy() {
      alive = false;
      pb?.destroy();
      if (ctx.playback === pb) ctx.playback = null;
    },
  };
}
