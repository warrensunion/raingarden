/**
 * The designer: one continuous scene. A fixed full-viewport stage (the photo
 * while marking, then the WebGL yard) with the step sheet over it; between
 * steps the camera moves and the sheet's content cross-slides.
 *
 * WHY this file owns the state: every step reads what earlier steps decided
 * (the photo, the marks, the terrain, the storm, the garden). Keeping it in
 * one object here, with resetFrom() dropping whatever a change invalidates,
 * means Back / Next can never show a garden designed for a different storm.
 * Everything is lazy: three (via src/render), onnxruntime (via
 * src/depth/depth.js) and the sim worker load only once they are needed.
 * Nothing the user marks leaves memory.
 */

import '../styles/designer.css';
import { env } from '../core/env.js';
import { PALETTE } from '../render/palette.js';
import { createSheet } from './sheet.js';
import { createSimClient } from './sim-client.js';
import { siteInputs, rendererMarks, groundMarks, niceInterval } from './model.js';
import { contours } from '../depth/contours.js';
import capture from './steps/capture.js';
import mark from './steps/mark.js';
import slope from './steps/slope.js';
import soil from './steps/soil.js';
import storm from './steps/storm.js';
import before from './steps/before.js';
import design from './steps/design.js';
import plant from './steps/plant.js';
import compare from './steps/compare.js';
import plan from './steps/plan.js';

const STEPS = [capture, mark, slope, soil, storm, before, design, plant, compare, plan];
const POSES = ['capture', 'mark', 'mark', 'storm', 'storm', 'storm', 'optimize', 'plants', 'compare', 'plan'];

/** What each kind of change invalidates: everything downstream of it. */
const DOWNSTREAM = {
  photo: ['hf', 'terrain', 'before', 'design', 'plants', 'after'],
  marks: ['hf', 'terrain', 'before', 'design', 'plants', 'after'],
  terrain: ['before', 'design', 'plants', 'after'],
  soil: ['before', 'design', 'plants', 'after'],
  region: ['storms', 'before', 'design', 'plants', 'after'],
  storm: ['before', 'design', 'plants', 'after'],
  limits: ['design', 'plants', 'after'],
};

function freshState(mode) {
  return {
    mode,
    step: 0,
    reached: 0,
    photo: null,
    marks: { scale: { a: null, b: null, meters: 1 }, downspout: null, wall: [], outlet: null, yard: [], septic: null },
    gravity: null,
    roofAreaM2: 60,
    hf: null,
    gm: null,
    si: null,
    terrain: null,
    slope: { manual: false, preset: 'gentle', dir: null, pins: [], source: null },
    soil: 'loam',
    region: 'pnw',
    place: null,
    storms: null,
    stormId: 'design',
    before: null,
    limits: { budget: 1500, maxAreaM2: null },
    prior: null,
    design: null,
    plants: null,
    after: null,
  };
}

export function openDesigner(root, { mode = 'capture' } = {}) {
  root.dataset.mode = mode;
  root.innerHTML = '';
  const reducedMotion = env.reducedMotion;
  const el = document.createElement('div');
  el.className = 'dz';
  el.setAttribute('role', 'region');
  el.setAttribute('aria-label', 'Rain garden designer');
  el.innerHTML = `
    <div class="dz-stage">
      <div class="dz-backdrop" aria-hidden="true"></div>
      <div class="dz-yard"><canvas class="dz-overlay" aria-hidden="true"></canvas></div>
      <div class="dz-photo-host" hidden></div>
    </div>
    <div class="dz-stage-ui"></div>
    <button class="dz-close" type="button" aria-label="Close the designer"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15"/></svg></button>`;
  root.appendChild(el);
  document.documentElement.classList.add('dz-lock');

  const yardHost = el.querySelector('.dz-yard');
  const overlayCanvas = el.querySelector('.dz-overlay');
  const photoHost = el.querySelector('.dz-photo-host');
  const backdrop = el.querySelector('.dz-backdrop');
  const stageUi = el.querySelector('.dz-stage-ui');

  let state = freshState(mode);
  let lastResult = null;
  let current = null;
  let yard = null;
  let yardKey = null;
  let building = null;
  let pose = 'capture';
  let destroyed = false;
  const sim = createSimClient();
  let depthModule = null;
  let depthLoad = null; // the loaded depth model (worker + ORT session + GPU device), disposed on close
  const opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;

  const sheet = createSheet(el, { count: STEPS.length, reducedMotion, onBack: () => go(state.step - 1, -1) });

  // ------------------------------------------------------------------ overlay
  // A 2D layer over the yard for things the renderer does not draw: the
  // optimizer's ghost gardens and the manual slope's height points.
  let drawer = null;
  let overlayRaf = 0;
  function overlayLoop(now) {
    overlayRaf = requestAnimationFrame(overlayLoop);
    const g = overlayCanvas.getContext('2d');
    if (!drawer) {
      if (overlayCanvas.width) { overlayCanvas.width = 0; overlayCanvas.height = 0; }
      return;
    }
    const r = overlayCanvas.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.round(r.width * dpr);
    const h = Math.round(r.height * dpr);
    if (overlayCanvas.width !== w || overlayCanvas.height !== h) { overlayCanvas.width = w; overlayCanvas.height = h; }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    // drawers work in client px; shift to the overlay's own origin
    g.setTransform(dpr, 0, 0, dpr, -r.left * dpr, -r.top * dpr);
    drawer(g, yard, now);
  }
  overlayRaf = requestAnimationFrame(overlayLoop);

  // ------------------------------------------------------------------ yard
  /**
   * The yard is created once per terrain. The terrain changes only when the
   * slope changes (the renderer takes it at creation), so the new canvas
   * fades in over the old one instead of the scene blinking.
   */
  async function buildYard(terrain) {
    if (yardKey === terrain && yard) return yard;
    if (building && building.key === terrain) return building.p;
    const p = (async () => {
      const { createYard } = await import('../render/index.js');
      const canvas = document.createElement('canvas');
      canvas.className = 'dz-canvas is-entering';
      yardHost.insertBefore(canvas, overlayCanvas);
      const api = await createYard(canvas, {
        terrain, photo: state.photo ? state.photo.bitmap : null, toImage: state.hf ? state.hf.toImage : null, reducedMotion,
      });
      if (destroyed || state.terrain !== terrain) { api.destroy(); api.canvas.remove(); return yard; }
      const old = yard;
      yard = api;
      yardKey = terrain;
      api.canvas.classList.add('dz-canvas');
      paintYard();
      yard.cameraTo(pose, 0);
      requestAnimationFrame(() => requestAnimationFrame(() => api.canvas.classList.remove('is-entering')));
      el.classList.add('has-yard');
      el.classList.toggle('is-pre-yard', state.step <= 2);
      if (old) setTimeout(() => { old.destroy(); old.canvas.remove(); }, reducedMotion ? 0 : 450);
      return api;
    })();
    building = { key: terrain, p };
    try {
      return await p;
    } finally {
      if (building && building.p === p) building = null;
    }
  }

  /** Re-apply what the yard shows for the current step (after a rebuild or a step change). */
  function paintYard() {
    if (!yard || !state.terrain) return;
    const t = state.terrain;
    if (state.gm) yard.setMarks(rendererMarks(state.gm, state.si && state.si.site, t.nx * t.cell, t.ny * t.cell));
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of t.z) { if (v < lo) lo = v; if (v > hi) hi = v; }
    yard.setContours(state.step <= 5 ? contours(t, niceInterval(hi - lo)) : null);
    if (state.design && state.design.ok && state.step >= 7) yard.setGarden(state.design.garden, state.step >= 8 ? state.plants || [] : [], { season: 1 });
    else yard.setGarden(null);
  }

  function teardownYard() {
    if (yard) { yard.destroy(); yard.canvas.remove(); }
    yard = null;
    yardKey = null;
    el.classList.remove('has-yard');
  }

  function showBackdrop(url) {
    backdrop.style.backgroundImage = url ? `url("${url}")` : '';
    backdrop.classList.toggle('has-photo', !!url);
  }

  // ------------------------------------------------------------------ pointer on the yard
  // Listeners live on the yard's host (the fallback may swap the canvas); steps
  // register handlers and the first that claims a pointerdown gets the drag.
  const pointerHandlers = new Set();
  let activePointer = null;
  yardHost.addEventListener('pointerdown', (e) => {
    for (const h of pointerHandlers) {
      if (h.down && h.down(e, yard)) { activePointer = h; yardHost.setPointerCapture(e.pointerId); e.preventDefault(); return; }
    }
  });
  yardHost.addEventListener('pointermove', (e) => { if (activePointer && activePointer.move) activePointer.move(e, yard); });
  const pointerEnd = (e) => { if (activePointer && activePointer.up) activePointer.up(e, yard); activePointer = null; };
  yardHost.addEventListener('pointerup', pointerEnd);
  yardHost.addEventListener('pointercancel', pointerEnd);

  // ------------------------------------------------------------------ context for steps
  const ctx = {
    get state() { return state; },
    reducedMotion,
    colors: PALETTE,
    sim,
    playback: null,
    yard: () => yard,
    terrain: () => state.terrain,
    yardRect: () => yardHost.getBoundingClientRect(),
    pose(name) {
      pose = name;
      if (yard) yard.cameraTo(name, reducedMotion ? 0 : 1200);
    },
    next: () => go(state.step + 1, 1),
    back: () => go(state.step - 1, -1),
    restart() {
      if (state.photo?.url) URL.revokeObjectURL(state.photo.url);
      teardownYard();
      state = freshState('capture');
      root.dataset.mode = 'capture';
      showBackdrop(null);
      go(1, -1);
    },
    setResult(r) { lastResult = r; },
    depthModule: () => (depthModule ??= import('../depth/depth.js')),
    keepDepth(p) { depthLoad = p; },
    /** Call fn whenever the yard's area changes size (the compare divider follows it). */
    observeYard(fn) {
      const ro = new ResizeObserver(() => fn());
      ro.observe(yardHost);
      return () => ro.disconnect();
    },
    resetFrom(kind) {
      for (const k of DOWNSTREAM[kind] || []) {
        if (k === 'hf') { state.hf = null; state.gm = null; state.si = null; state.slope = { manual: false, preset: 'gentle', dir: null, pins: [], source: null }; } else state[k] = null;
      }
      state.reached = Math.min(state.reached, state.step);
    },
    /** Set the yard's terrain (with .mask), recompute the site inputs and (re)build the 3D yard. */
    async applyTerrain(t) {
      state.terrain = t;
      if (state.hf) state.gm = groundMarks(state.marks, state.hf.toGround);
      state.si = siteInputs(t, state.gm, state.roofAreaM2);
      await buildYard(t);
      paintYard();
    },
    photoStage(on) {
      photoHost.hidden = !on;
      el.classList.toggle('is-photo', on);
      if (!on) photoHost.innerHTML = '';
      return photoHost;
    },
    showPhotoBackdrop: (url) => showBackdrop(url),
    /** Add an element over the stage (e.g. the compare divider); the step removes it. */
    stageUi(html) {
      const wrap = document.createElement('div');
      wrap.innerHTML = html.trim();
      const node = wrap.firstChild;
      stageUi.appendChild(node);
      return node;
    },
    overlay: { set(fn) { drawer = fn; } },
    onYardPointer(h) { pointerHandlers.add(h); return () => pointerHandlers.delete(h); },
    /** Reduced motion: change the yard behind a short dip instead of animating it. */
    crossfade(fn) {
      yardHost.classList.add('is-dip');
      setTimeout(() => { fn(); yardHost.classList.remove('is-dip'); }, 250);
    },
    /** Scroll the sheet (not the page) so a just-filled element is in view. */
    reveal(node) {
      const panes = node.closest('.dz-panes');
      if (!panes) return;
      const over = node.getBoundingClientRect().bottom - panes.getBoundingClientRect().bottom + 12;
      if (over > 0) panes.scrollBy({ top: over, behavior: reducedMotion ? 'auto' : 'smooth' });
    },
    startDemo,
  };

  // ------------------------------------------------------------------ navigation
  function go(n, dir = 1) {
    if (destroyed || n < 1 || n > STEPS.length) return;
    if (current) {
      try { current.destroy && current.destroy(); } catch (e) { console.warn('[raingarden] step teardown:', e); }
    }
    current = null;
    drawer = null;
    state.step = n;
    state.reached = Math.max(state.reached, n);
    root.dataset.step = String(n);
    el.dataset.step = String(n);
    const pane = sheet.show(n, dir);
    pose = POSES[n - 1];
    if (yard) {
      yard.cameraTo(pose, reducedMotion ? 0 : 1200);
      paintYard();
    }
    el.classList.toggle('is-pre-yard', n <= 2 || !yard);
    const api = {
      body: pane,
      setPrimary: (p) => sheet.setPrimary(p),
      setBack: (v) => sheet.setBack(v),
      focusPrimary: () => sheet.focusPrimary(),
    };
    current = STEPS[n - 1](api, ctx) || null;
    const h = pane.querySelector('.dz-h2');
    if (h && dir !== 0) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
  }

  async function startDemo() {
    const demoData = (await import('../data/demo-yard.json')).default;
    const blob = await (await fetch(demoData.image)).blob();
    const bitmap = await createImageBitmap(blob);
    if (destroyed) return;
    if (state.photo?.url) URL.revokeObjectURL(state.photo.url);
    teardownYard();
    state = freshState('demo');
    state.photo = { bitmap, url: URL.createObjectURL(blob), w: bitmap.width, h: bitmap.height, source: 'demo' };
    state.marks = {
      scale: { a: [...demoData.scale.a], b: [...demoData.scale.b], meters: demoData.scale.meters },
      downspout: [...demoData.downspout], wall: demoData.wall.map((p) => [...p]), outlet: [...demoData.outlet],
      yard: demoData.yard.map((p) => [...p]), septic: demoData.septic ? demoData.septic.map((p) => [...p]) : null,
    };
    state.gravity = demoData.gravity;
    state.roofAreaM2 = demoData.roofAreaM2;
    state.soil = demoData.soil;
    state.region = demoData.region;
    state.reached = 2;
    showBackdrop(state.photo.url);
    go(3, 1);
  }

  // ------------------------------------------------------------------ close + test hook
  function close() {
    handle.destroy();
    root.closest('.designer')?.classList.remove('is-open');
    // back to whatever opened the designer; a scripted open (no focused opener) lands on the header's "Design yours"
    const back = opener && opener.isConnected ? opener : document.querySelector('.hdr a[data-design]');
    if (back) back.focus();
  }
  el.querySelector('.dz-close').addEventListener('click', close);
  const onKey = (e) => { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); close(); } };
  addEventListener('keydown', onKey);

  const hook = {
    get step() { return state.step; },
    /** Jump to step n (only steps already reached, so their inputs exist). */
    goTo(n) { if (n >= 1 && n <= state.reached) go(n, n >= state.step ? 1 : -1); return state.step; },
    get state() { return state; },
    get lastResult() { return lastResult; },
    /** The yard renderer's measured frame rate (0 before the yard exists). */
    fps: () => (yard ? yard.fps() : 0),
  };
  window.__raingarden = hook;

  const handle = {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      try { current && current.destroy && current.destroy(); } catch { /* already gone */ }
      cancelAnimationFrame(overlayRaf);
      removeEventListener('keydown', onKey);
      sim.destroy();
      if (depthLoad) depthLoad.then((m) => m.dispose()).catch(() => {});
      teardownYard();
      sheet.destroy();
      if (state.photo?.url) URL.revokeObjectURL(state.photo.url);
      document.documentElement.classList.remove('dz-lock');
      root.innerHTML = '';
      delete root.dataset.mode;
      delete root.dataset.step;
      if (window.__raingarden === hook) window.__raingarden = { step: 0, goTo: () => 0, state: null, lastResult: null };
    },
  };

  if (mode === 'demo') {
    sheet.show(1, 0);
    sheet.setPrimary(null);
    startDemo().catch((e) => { console.warn('[raingarden] demo failed:', e); go(1, 0); });
  } else {
    go(1, 0);
  }
  return handle;
}
