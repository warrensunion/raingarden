/**
 * Step 3 — Slope: the depth model reads the photo, heightfield.js turns it
 * into metres, and we say what it found with an honest band. If the band is
 * too wide (or the model is missing) the user sets the slope by hand: flat /
 * gentle / steep, a drag for which way it falls, and height points.
 *
 * WHY the manual path keeps the photo's ground frame: the marks, the metres
 * and the photo draped on the yard all come from that frame; only the heights
 * are replaced, so everything the user marked stays where they put it.
 */

import { toHeightfield } from '../../depth/heightfield.js';
import { manualTerrain } from '../../depth/manualTerrain.js';
import { contours } from '../../depth/contours.js';
import { logFallback } from '../../core/env.js';
import { radioKeys } from '../radio.js';
import { flatDepth, slopeSentence, manualDir, directionWords, niceInterval, groundMarks } from '../model.js';

const PRESETS = [['flat', 'Flat'], ['gentle', 'Gentle (2%)'], ['steep', 'Steep (8%)']];
const DEFAULT_GRAVITY = [0, 0.94, 0.342]; // a phone pitched about 20° down

function signedCm(m) {
  const d = Math.round(m * 100);
  return `${d > 0 ? '+' : ''}${d} cm`;
}

function range(z) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of z) { if (v < lo) lo = v; if (v > hi) hi = v; }
  return hi - lo;
}

export default function slope(sheet, ctx) {
  const { state } = ctx;
  const b = sheet.body;
  b.innerHTML = `
    <h2 class="dz-h2">Your yard’s slope</h2>
    <p class="dz-progress-line" role="status"></p>
    <canvas class="dz-thumb" hidden aria-label="Your photo with the slope's contour lines"></canvas>
    <p class="dz-reading" hidden></p>
    <div class="dz-band" hidden aria-hidden="true"><div class="dz-band-track"><span class="dz-band-range"></span><span class="dz-band-dot"></span></div><div class="dz-band-scale"><span>0%</span><span class="dz-band-max"></span></div></div>
    <button type="button" class="dz-text-btn dz-wrong" hidden>That doesn’t look right</button>
    <div class="dz-manual" hidden>
      <p class="dz-manual-why"></p>
      <div class="dz-seg" role="radiogroup" aria-label="How steep is the yard">${PRESETS.map(([k, l]) => `<button type="button" role="radio" data-p="${k}" aria-checked="false">${l}</button>`).join('')}</div>
      <p class="dz-dir"></p>
      <div class="dz-pins"></div>
      <button type="button" class="dz-text-btn dz-add-pin">Add a height point</button>
    </div>`;
  const line = b.querySelector('.dz-progress-line');
  const thumb = b.querySelector('.dz-thumb');
  const reading = b.querySelector('.dz-reading');
  const band = b.querySelector('.dz-band');
  const wrong = b.querySelector('.dz-wrong');
  const manual = b.querySelector('.dz-manual');
  const why = b.querySelector('.dz-manual-why');
  const dirP = b.querySelector('.dz-dir');
  const pinsBox = b.querySelector('.dz-pins');
  const addPin = b.querySelector('.dz-add-pin');
  let alive = true;
  let timer = null;
  let placingPin = false;
  /** Next never leaves a slope change behind: a pending (debounced) terrain is applied first. */
  async function next() {
    if (applyPending) await apply(true);
    if (alive) ctx.next();
  }
  sheet.setPrimary({ label: 'Next', disabled: true, onClick: next });

  // ---------------------------------------------------------------- reading
  const onProg = (p) => {
    if (alive && p.phase === 'download' && p.fraction >= 0) line.textContent = `Loading the depth model… ${Math.round(p.fraction * 100)}%`;
    else if (alive && p.phase === 'init') line.textContent = 'Starting the depth model…';
  };

  async function read() {
    if (state.hf) return;
    let depth = null;
    let failure = null;
    try {
      line.textContent = 'Loading the depth model…';
      const { loadDepth } = await ctx.depthModule();
      const loading = loadDepth({ onProgress: onProg });
      ctx.keepDepth(loading); // the designer disposes the model (worker, ORT session, GPU device) when it closes
      const model = await loading;
      const t0 = performance.now();
      const tick = () => { if (alive) line.textContent = `Reading depth… ${Math.max(1, Math.round((performance.now() - t0) / 1000))} s`; };
      tick();
      timer = setInterval(tick, 500);
      depth = await model.estimate(await createImageBitmap(state.photo.bitmap));
      clearInterval(timer);
      state.depthBackend = model.backend;
    } catch (e) {
      clearInterval(timer);
      failure = e;
      logFallback('depth', `${e.code || 'error'}: ${e.message}`);
    }
    if (!alive) return;
    const m = state.marks;
    const g = state.gravity || DEFAULT_GRAVITY;
    if (depth) {
      state.hf = toHeightfield({ depth, gravity: state.gravity, wallPts: m.wall, yard: m.yard, scale: m.scale });
      state.slope.source = 'photo';
    } else {
      const aspect = state.photo.w / state.photo.h;
      const fd = flatDepth({ w: 192, h: Math.max(32, Math.round(192 / aspect)), gravity: g, aspect, scale: m.scale });
      state.hf = toHeightfield({ depth: fd, gravity: g, yard: m.yard, scale: m.scale, cameraHeightM: fd.cameraHeightM });
      state.slope.source = 'none';
      state.slope.failure = failure.code === 'model-missing'
        ? 'The depth model isn’t installed on this site — use the slope buttons instead.'
        : 'This device couldn’t run the depth model — use the slope buttons instead.';
    }
    state.gm = groundMarks(m, state.hf.toGround);
    const conf = state.hf.confidence;
    state.slope.manual = state.slope.source !== 'photo' || conf.manualSuggested;
    if (!state.slope.dir) state.slope.dir = manualDir(state.gm.downspout, state.gm.outlet);
  }

  // ------------------------------------------------------------ terrain out
  function currentTerrain() {
    const hf = state.hf;
    if (!state.slope.manual) return hf.terrain;
    const t = manualTerrain({
      widthM: hf.terrain.nx * hf.terrain.cell, depthM: hf.terrain.ny * hf.terrain.cell,
      preset: state.slope.preset, dir: state.slope.dir, pins: state.slope.pins, n: Math.max(hf.terrain.nx, hf.terrain.ny),
    });
    // same grid as the photo's (same formula); keep the yard mask
    if (t.nx === hf.terrain.nx && t.ny === hf.terrain.ny) t.mask = hf.terrain.mask;
    else t.mask = new Uint8Array(t.nx * t.ny).fill(1);
    return t;
  }

  let applyTimer = null;
  let applyPending = false;
  function apply(now = false) {
    clearTimeout(applyTimer);
    applyPending = !now;
    const go = async () => {
      applyPending = false;
      const t = currentTerrain();
      await ctx.applyTerrain(t);
      if (!alive) return;
      drawThumb(t);
      describe(t);
    };
    if (now) return go();
    applyTimer = setTimeout(go, 220);
    return null;
  }

  function drawThumb(t) {
    const p = state.photo;
    const W = 640;
    const H = Math.round((W * p.h) / p.w);
    thumb.width = W;
    thumb.height = H;
    const g = thumb.getContext('2d');
    g.drawImage(p.bitmap, 0, 0, W, H);
    const lv = contours(t, niceInterval(range(t.z)));
    g.strokeStyle = getComputedStyle(thumb).getPropertyValue('--teal') || '#49A3A0';
    g.lineWidth = 2;
    g.globalAlpha = 0.9;
    g.beginPath();
    const { nx, cell, mask } = t;
    for (const l of lv) {
      const s = l.segs;
      for (let i = 0; i < s.length; i += 4) {
        const mx = (s[i] + s[i + 2]) / 2;
        const my = (s[i + 1] + s[i + 3]) / 2;
        const k = Math.floor(my / cell) * nx + Math.floor(mx / cell);
        if (mask && !mask[k]) continue;
        const a = state.hf.toImage([s[i], s[i + 1]]);
        const c = state.hf.toImage([s[i + 2], s[i + 3]]);
        if (![...a, ...c].every(Number.isFinite)) continue;
        g.moveTo(a[0] * W, a[1] * H);
        g.lineTo(c[0] * W, c[1] * H);
      }
    }
    g.stroke();
    thumb.hidden = false;
  }

  function describe() {
    const conf = state.hf.confidence;
    const s = state.slope;
    if (s.source === 'photo') {
      reading.hidden = false;
      reading.textContent = slopeSentence(conf, state.hf.meta.downhill) + '.';
      band.hidden = false;
      const max = Math.max(15, Math.ceil(conf.highPct + 2));
      band.querySelector('.dz-band-max').textContent = `${max}%`;
      const r = band.querySelector('.dz-band-range');
      r.style.left = `${(conf.lowPct / max) * 100}%`;
      r.style.width = `${Math.max(1, ((conf.highPct - conf.lowPct) / max) * 100)}%`;
      band.querySelector('.dz-band-dot').style.left = `${(Math.min(conf.slopePct, max) / max) * 100}%`;
    }
    wrong.hidden = s.source !== 'photo' || s.manual;
    manual.hidden = !s.manual;
    if (s.manual) {
      why.textContent = s.source === 'none' ? s.failure
        : conf.manualSuggested ? 'We’re not sure about that reading, so set the slope yourself:' : 'Set the slope yourself:';
      for (const btn of manual.querySelectorAll('[data-p]')) btn.setAttribute('aria-checked', String(btn.dataset.p === s.preset));
      dirP.textContent = s.preset === 'flat'
        ? 'Flat: water spreads and soaks in where it lands.'
        : `Falls toward ${directionWords(s.dir)}. Drag on the yard from high to low to change it.`;
      pinsBox.innerHTML = s.pins.map((p, i) => `<div class="dz-pin-row"><span>Height point ${i + 1}: ${signedCm(p.h - p.h0)}</span>
        <button type="button" class="dz-mini" data-i="${i}" data-d="0.05" aria-label="Raise height point ${i + 1} by 5 cm">↑</button>
        <button type="button" class="dz-mini" data-i="${i}" data-d="-0.05" aria-label="Lower height point ${i + 1} by 5 cm">↓</button>
        <button type="button" class="dz-mini" data-i="${i}" data-x="1" aria-label="Remove height point ${i + 1}">×</button></div>`).join('');
    }
    ctx.overlay.set(drawPins);
    sheet.setPrimary({ label: 'Next', onClick: next });
  }

  function drawPins(g, yard) {
    if (!state.slope.manual || !yard) return;
    g.font = '600 13px "Atkinson Hyperlegible Next", system-ui, sans-serif';
    state.slope.pins.forEach((p, i) => {
      const q = yard.project(p.x, p.y);
      if (!q) return;
      g.fillStyle = ctx.colors.marigold;
      g.strokeStyle = ctx.colors.slate900;
      g.lineWidth = 2;
      g.beginPath(); g.arc(q[0], q[1], 9, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = ctx.colors.paper;
      g.fillText(`${i + 1}`, q[0] + 12, q[1] - 10);
    });
    if (dragDir) {
      g.strokeStyle = ctx.colors.marigold;
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(dragDir.sx, dragDir.sy); g.lineTo(dragDir.ex, dragDir.ey); g.stroke();
    }
  }

  // ------------------------------------------------------------ manual UI
  radioKeys(manual.querySelector('.dz-seg'), '[data-p]', (x) => x.click());
  manual.querySelector('.dz-seg').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-p]');
    if (!btn) return;
    state.slope.preset = btn.dataset.p;
    ctx.resetFrom('terrain');
    describe();
    apply();
  });
  wrong.addEventListener('click', () => {
    state.slope.manual = true;
    ctx.resetFrom('terrain');
    describe();
    apply();
  });
  pinsBox.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const i = Number(btn.dataset.i);
    if (btn.dataset.x) state.slope.pins.splice(i, 1);
    else state.slope.pins[i].h += Number(btn.dataset.d);
    ctx.resetFrom('terrain');
    describe();
    apply();
  });
  addPin.addEventListener('click', () => {
    placingPin = true;
    dirP.textContent = 'Tap the yard where you want the height point.';
  });

  let dragDir = null;
  const offPointer = ctx.onYardPointer({
    down(e, yard) {
      if (!state.slope.manual || !yard) return false;
      const p = yard.pick(e.clientX, e.clientY);
      if (!p) return false;
      dragDir = { p0: p, sx: e.clientX, sy: e.clientY, ex: e.clientX, ey: e.clientY };
      return true;
    },
    move(e) {
      if (!dragDir) return;
      dragDir.ex = e.clientX;
      dragDir.ey = e.clientY;
    },
    up(e, yard) {
      if (!dragDir) return;
      const d = dragDir;
      dragDir = null;
      const p1 = yard && yard.pick(e.clientX, e.clientY);
      const moved = Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 12;
      if (placingPin && !moved) {
        placingPin = false;
        const t = ctx.terrain();
        const { nx, cell } = t;
        const k = Math.min(t.ny - 1, Math.floor(d.p0[1] / cell)) * nx + Math.min(nx - 1, Math.floor(d.p0[0] / cell));
        state.slope.pins.push({ x: d.p0[0], y: d.p0[1], h: t.z[k], h0: t.z[k] });
      } else if (moved && p1) {
        const dx = p1[0] - d.p0[0];
        const dy = p1[1] - d.p0[1];
        const L = Math.hypot(dx, dy);
        if (L > 0.2) state.slope.dir = [dx / L, dy / L];
        if (state.slope.preset === 'flat') state.slope.preset = 'gentle';
      } else return;
      ctx.resetFrom('terrain');
      describe();
      apply();
    },
  });

  // ------------------------------------------------------------- run it
  ctx.pose('mark');
  (async () => {
    await read();
    if (!alive) return;
    line.textContent = '';
    if (state.terrain) {
      // back from a later step: same terrain, same yard (no rebuild)
      drawThumb(state.terrain);
      describe();
    } else await apply(true);
    if (!alive) return;
    setTimeout(() => alive && ctx.pose('storm'), 900);
    ctx.setResult({ step: 'slope', confidence: state.hf.confidence, manual: state.slope.manual, source: state.slope.source, backend: state.depthBackend || null });
  })().catch((e) => {
    console.warn('[raingarden] slope step failed:', e);
    line.textContent = 'Something went wrong reading the slope. Go back and check the marks.';
  });

  return {
    destroy() {
      alive = false;
      clearInterval(timer);
      clearTimeout(applyTimer);
      ctx.depthModule().then((m) => m.removeProgressListener(onProg)).catch(() => {});
      offPointer();
      ctx.overlay.set(null);
    },
  };
}
