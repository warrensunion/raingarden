/**
 * The scroll story: six layered scenes on one sticky stage, changed by a foreground wipe.
 *
 * Why this shape: the reference never fades between chapters; a painted
 * foreground layer sweeps up over the whole frame and the scene is swapped
 * behind it at the halfway point (NOTES §4, "Techniques" #4). Here that wipe
 * is mapped to the last 30 % of each scene's 160vh of scroll and eased
 * through --ease-wipe, so a reader controls it but can't leave it
 * half-covered (scroll snap plus a settle on scrollend).
 *
 * Only the visible scene is drawn; its neighbour is decoded but hidden, and
 * the wipe is the third layer at most. Every frame writes transforms and
 * opacities only. Copy lives in normal DOM (opacity, never display:none) so
 * screen readers and find-in-page reach all six scenes; focusing a scene's
 * button scrolls that scene into view.
 *
 * Returns { enter(), destroy() }: enter() runs the first-scene choreography
 * once the preloader has uncovered the page.
 */
import { scenes, soilLabels } from './scenes.js';
import { env, onEnvChange } from '../core/env.js';
import { scroll, settleScroll } from '../core/scroll.js';
import { onFrame } from '../core/raf.js';
import { easeWipe, clamp, lerp } from '../core/ease.js';
import { warmImages, whenIdle } from '../core/lazy.js';
import { createCamera, layerMotion, FORE_Z } from './parallax.js';
import { createDrop } from './drop.js';

const PLATE_W = 1672;
const PLATE_H = 941;
const WIPE_FROM = 0.7;
const SWAP = 0.5;
const COPY_CLEAR = 0.2;
/** Rest position inside a scene that keyboard focus scrolls to. */
const REST = 0.25;

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function el(tag, cls, attrs = {}) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}

function buildLayer(layer, sceneIndex) {
  const eager = sceneIndex === 0;
  if (layer.kind === 'mist') return el('div', 'sl sl-mist');
  if (layer.kind === 'section') {
    const fig = el('figure', 'sl sl-section');
    const img = el('img', 'sl-section-img', { alt: layer.alt, width: 874, height: 1330, decoding: 'async', loading: 'lazy' });
    img.dataset.src = layer.src;
    fig.append(img);
    const ul = el('ul', 'sl-labels', { 'aria-label': 'Garden soil layers' });
    for (const l of soilLabels) {
      const li = el('li', 'sl-label');
      li.style.setProperty('--at', l.at);
      li.innerHTML = `<span class="sl-leader" aria-hidden="true"></span><span class="sl-label-text">${esc(l.text)}</span>`;
      ul.append(li);
    }
    fig.append(ul);
    return fig;
  }
  const img = el('img', `sl sl-${layer.kind}`, { alt: layer.alt ?? '', decoding: 'async' });
  if (layer.kind === 'plate') { img.width = PLATE_W; img.height = PLATE_H; }
  // Scene 1's bytes are fetched once by the preloader and handed over as blobs (adopt()).
  if (eager) img.setAttribute('fetchpriority', 'high');
  else img.loading = 'lazy';
  img.dataset.src = layer.src;
  return img;
}

/** Splits a headline into rendered lines so each can rise on its own (NOTES #6). */
function splitLines(h) {
  const text = h.dataset.text;
  const words = text.split(' ');
  h.innerHTML = words.map((w) => `<span class="story-word">${esc(w)}</span>`).join(' ');
  const lines = [];
  let top = null;
  for (const w of h.querySelectorAll('.story-word')) {
    if (w.offsetTop !== top) { lines.push([]); top = w.offsetTop; }
    lines[lines.length - 1].push(w.textContent);
  }
  const mid = (lines.length - 1) / 2;
  // Stagger 0.15 s from the centre line outwards.
  h.innerHTML = lines
    .map((l, i) => `<span class="story-line"><span class="story-line-in" style="--d:${(Math.abs(i - mid) * 0.15).toFixed(2)}s">${esc(l.join(' '))}</span></span>`)
    .join(' ');
}

export function startStory(root, { onDesign } = {}) {
  const n = scenes.length;
  root.style.setProperty('--scenes', n);
  const stage = el('div', 'story-stage');
  const snaps = el('div', 'story-snaps', { 'aria-hidden': 'true' });
  root.append(stage, snaps);

  // Scenes.
  const views = scenes.map((scene, i) => {
    const wrap = el('div', 'story-scene', { 'data-scene': scene.id });
    const layers = el('div', 'story-layers');
    const above = [];
    const items = scene.layers.map((layer) => {
      const node = buildLayer(layer, i);
      // The soil cut-away carries text, so it sits above the scrim (z 3), not in the art stack.
      if (layer.kind === 'section') above.push(node); else layers.append(node);
      return { layer, node, cx: 0, cy: 0 };
    });
    const copy = el('section', 'story-copy', { 'aria-labelledby': `scene-${scene.id}` });
    const h = el(i === 0 ? 'h1' : 'h2', 'story-h', { id: `scene-${scene.id}` });
    h.dataset.text = scene.headline;
    h.textContent = scene.headline;
    copy.append(h);
    if (scene.body) {
      const p = el('p', 'story-body');
      p.textContent = scene.body;
      copy.append(p);
    }
    if (scene.cta) {
      const actions = el('div', 'story-actions');
      actions.innerHTML = `<a class="btn btn-primary" href="#designer" data-design="capture">Point your phone at your yard</a>
        <a class="story-demo" href="#designer" data-design="demo">Try a demo yard</a>`;
      copy.append(actions);
    }
    wrap.append(layers, ...above, copy);
    return { scene, wrap, layers, items, copy, h, warmed: i === 0 };
  });

  const rainCanvas = el('canvas', 'story-rain', { 'aria-hidden': 'true' });
  const scrim = el('div', 'story-scrim', { 'aria-hidden': 'true' });
  // The wipe: the next scene's band twice (offset, mirrored) at the leading edge, a painted
  // veil (its far plate, blurred and darkened offline) as the body, the band mirrored as the tail.
  const wipe = el('div', 'story-wipe', { 'aria-hidden': 'true' });
  const wipeImg = (cls) => el('img', 'story-wipe-' + cls, { alt: '', decoding: 'async' });
  const wipeBands = [wipeImg('band story-wipe-band2'), wipeImg('band')];
  const wipeVeil = wipeImg('veil');
  const wipeBody = el('div', 'story-wipe-body');
  wipeBody.append(wipeVeil);
  const wipeTail = wipeImg('band story-wipe-tail');
  wipe.append(...wipeBands, wipeBody, wipeTail);
  const frame = el('div', 'story-frame', { 'aria-hidden': 'true' });
  stage.append(...views.map((v) => v.wrap), rainCanvas, scrim);
  const drop = createDrop(stage, scenes);
  stage.append(wipe, frame);

  const cam = createCamera();
  let rain = null;

  // Layout cache, refreshed on resize only (no reads in the frame loop).
  const L = { vw: 1, vh: 1, top: 0, sceneH: 1, wipeH: 1, plate: { x: 0, y: 0, w: 1, h: 1, posX: 0.5 } };
  function placeCut(item) {
    const { layer, node } = item;
    const o = { ...layer, ...(env.phone ? layer.phone : null) };
    node.style.left = o.x * 100 + '%';
    node.style.bottom = (1 - o.y) * 100 + '%';
    node.style.width = o.w + 'vw';
  }
  function layout() {
    L.vw = stage.clientWidth;
    L.vh = stage.clientHeight;
    L.top = root.getBoundingClientRect().top + window.scrollY;
    L.sceneH = root.offsetHeight / n;
    for (const v of views) {
      for (const it of v.items) {
        if (it.layer.kind === 'cut') placeCut(it);
        const nd = it.node;
        it.cx = nd.offsetLeft + nd.offsetWidth / 2;
        it.cy = nd.offsetTop + nd.offsetHeight / 2;
      }
      splitLines(v.h);
    }
    const plateEl = views[0].items[0].node;
    L.plate = { x: plateEl.offsetLeft, y: plateEl.offsetTop, w: plateEl.offsetWidth, h: plateEl.offsetHeight, posX: env.phone ? 0.7 : 0.5 };
    L.wipeH = wipe.offsetHeight;
    // Snap points: each wipe's start and end, so a reader never rests half-covered.
    snaps.innerHTML = '';
    const marks = [0];
    for (let i = 0; i < n - 1; i++) marks.push(i + WIPE_FROM, i + 1);
    for (const m of marks) {
      const s = el('div', 'story-snap');
      s.style.top = m * L.sceneH + 'px';
      snaps.append(s);
    }
    drop.resize();
  }

  // Plate percent -> stage px, through the subject layer (z = 1: no slide, only the dolly).
  let pivotScale = 1;
  function toScreen(xp, yp, out) {
    const P = L.plate;
    const sc = Math.max(P.w / PLATE_W, P.h / PLATE_H);
    const iw = PLATE_W * sc, ih = PLATE_H * sc;
    const x = P.x + (P.w - iw) * P.posX + (xp / 100) * iw;
    const y = P.y + (P.h - ih) * 0.5 + (yp / 100) * ih;
    out[0] = L.vw / 2 + (x - L.vw / 2) * pivotScale;
    out[1] = L.vh / 2 + (y - L.vh / 2) * pivotScale;
    return out;
  }

  // Visible-scene bookkeeping.
  let visible = -1;
  let copyIn = -1;
  let wipeFor = -1;
  let entered = false;
  const motion = { tx: 0, ty: 0, s: 1 };

  function warm(i) {
    const v = views[i];
    if (!v || v.warmed) return;
    v.warmed = true;
    warmImages(v.wrap);
  }

  function setVisible(i) {
    if (i === visible) return;
    views.forEach((v, k) => {
      v.wrap.classList.toggle('is-visible', k === i);
      v.wrap.classList.toggle('is-active', k === i);
    });
    visible = i;
    warm(i);
    // Neighbours only once the preloader is done, so they don't race scene 1's decode.
    if (entered) {
      warm(i + 1);
      whenIdle(() => warm(i + 2));
    }
  }

  function setCopy(i) {
    if (i === copyIn) return;
    views.forEach((v, k) => v.copy.classList.toggle('is-in', entered && k === i));
    copyIn = i;
  }

  /** Loads the wipe for scene i as soon as the scene before it is current, so its first frame has art. */
  function setWipeScene(i) {
    if (i === wipeFor) return;
    wipeFor = i;
    const src = `/art/band-${scenes[i].id}.webp`;
    for (const b of wipeBands) b.src = src;
    wipeTail.src = src;
    wipeVeil.src = `/art/story/plate-${scenes[i].id}-veil.webp`;
  }

  let lastKey = '';
  let offscreen = false;
  let wiping = false;
  function frameUpdate(dt) {
    cam.update(dt);
    const f = (scroll.y - L.top) / L.sceneH;
    const i = clamp(Math.floor(f), 0, n - 1);
    const p = f - i;
    const still = env.reducedMotion;

    // Story scrolled fully past: nothing to draw.
    const off = f > n;
    if (off !== offscreen) { offscreen = off; rain?.setIntensity(0); }
    if (off) return;
    // Settled (no scroll, camera and cursor at rest): nothing changed since the last write.
    const key = `${f.toFixed(4)}|${cam.x.toFixed(2)}|${cam.y.toFixed(2)}|${cam.px}|${cam.py}|${L.vw}|${L.vh}|${still}|${entered}`;
    if (key === lastKey) return;
    lastKey = key;
    setWipeScene(Math.min(i + 1, n - 1));

    let w = -1;
    if (!still && i < n - 1 && p > WIPE_FROM) w = easeWipe((p - WIPE_FROM) / (1 - WIPE_FROM));
    let vis = i;
    if (w >= SWAP) vis = i + 1;
    if (still && i < n - 1 && p >= WIPE_FROM + (1 - WIPE_FROM) * SWAP) vis = i + 1;
    setVisible(vis);

    const clear = w < 0 || w <= COPY_CLEAR || w >= 1 - COPY_CLEAR;
    setCopy(clear ? vis : -1);

    // Layers of the visible scene.
    const sp = f - vis;
    const v = views[vis];
    for (const it of v.items) {
      const { layer, node } = it;
      if (layer.kind === 'mist' && still) continue;
      layerMotion(layer.z, cam, sp, L.vw, L.vh, motion);
      let tx = motion.tx + (it.cx - L.vw / 2) * (motion.s - 1);
      const ty = motion.ty + (it.cy - L.vh / 2) * (motion.s - 1);
      if (layer.drift && !still) tx += layer.drift * L.vw * (sp - 0.5);
      node.style.transform = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0) scale(${motion.s.toFixed(4)})`;
      if (layer.z === 1) pivotScale = motion.s;
    }

    // The wipe: next scene's foreground, 1.6x, sweeping up over the frame.
    if ((w >= 0) !== wiping) { wiping = w >= 0; stage.classList.toggle('is-wiping', wiping); }
    if (w >= 0) {
      const y = L.vh - w * (L.vh + L.wipeH);
      const x = layerMotion(FORE_Z, cam, 0.5, L.vw, L.vh, motion).tx; // foreground depth
      wipe.style.visibility = 'visible';
      wipe.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
    } else wipe.style.visibility = 'hidden';

    drop.update(vis, sp, toScreen, cam, dt, f < n - 0.4);

    if (rain) {
      const a = scenes[i].rain, b = scenes[Math.min(i + 1, n - 1)].rain;
      const past = clamp((f - (n - 1)) / 0.4);
      // During the wipe the rain sits above the curtain and peaks at full intensity at the swap.
      rain.setIntensity(w >= 0 ? Math.max(lerp(a, b, w), Math.sin(Math.PI * w)) : scenes[vis].rain * (1 - past));
      rain.setVelocity(scroll.velocity);
    }
  }

  // Settle out of a half-finished wipe when scrolling stops.
  let lastY = window.scrollY, dir = 1;
  const onScroll = () => { const y = window.scrollY; if (y !== lastY) dir = y > lastY ? 1 : -1; lastY = y; };
  const settle = () => {
    // data-snap="off" on <html> lets scripts/verify-story.mjs hold a mid-wipe frame.
    if (env.reducedMotion || document.documentElement.dataset.snap === 'off') return;
    const f = (window.scrollY - L.top) / L.sceneH;
    const i = Math.floor(f), p = f - i;
    if (i < 0 || i >= n - 1 || p <= WIPE_FROM + 0.01 || p >= 0.995) return;
    const t = (p - WIPE_FROM) / (1 - WIPE_FROM);
    // Hysteresis: finish in the direction of travel once a third of the way in.
    const forward = dir > 0 ? t > 0.33 : t > 0.67;
    const to = L.top + (i + (forward ? 1 : WIPE_FROM)) * L.sceneH;
    window.scrollTo({ top: Math.round(to), behavior: 'smooth' });
  };
  let settleTimer = 0;
  const onScrollIdle = () => { clearTimeout(settleTimer); settleTimer = setTimeout(settle, 180); };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('scroll', onScrollIdle, { passive: true });

  // Keyboard: focusing something inside a scene brings that scene to rest.
  const onFocus = (e) => {
    const k = views.findIndex((v) => v.copy.contains(e.target));
    if (k < 0 || k === visible) return;
    const top = L.top + (k + (k === 0 ? 0 : REST)) * L.sceneH;
    window.scrollTo({ top: Math.round(top), behavior: 'instant' });
    settleScroll();
  };
  root.addEventListener('focusin', onFocus);

  const onClick = (e) => {
    const a = e.target.closest('[data-design]');
    if (!a) return;
    e.preventDefault();
    onDesign?.(a.dataset.design);
  };
  root.addEventListener('click', onClick);

  let resizeTimer = 0;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { layout(); settleScroll(); lastKey = ''; }, 120);
  };
  window.addEventListener('resize', onResize);
  const offEnv = onEnvChange(() => { layout(); visible = -1; copyIn = -1; lastKey = ''; });

  function adopt(blobs) {
    for (const img of stage.querySelectorAll('.story-scene:first-child img[data-src], img.story-drop[data-src]')) {
      const blob = blobs.get(img.dataset.src);
      img.src = blob ? URL.createObjectURL(blob) : img.dataset.src;
      img.removeAttribute('data-src');
    }
  }

  layout();
  document.fonts?.ready.then(() => { layout(); lastKey = ''; });
  const offFrame = onFrame(frameUpdate);

  return {
    /** First-scene choreography once the page is uncovered. */
    /** Hands scene 1 (and the drop) the preloader's already-fetched bytes: one download each. */
    adopt,
    enter() {
      adopt(new Map());
      entered = true;
      copyIn = -1;
      stage.classList.add('is-entered');
      import('./rain-overlay.js').then(({ startRain }) => { rain = startRain(rainCanvas); });
      warm(Math.max(visible, 0) + 1);
      whenIdle(() => warm(Math.max(visible, 0) + 2));
    },
    destroy() {
      offFrame();
      offEnv();
      cam.destroy();
      drop.destroy();
      rain?.destroy();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('scroll', onScrollIdle);
      window.removeEventListener('resize', onResize);
      root.removeEventListener('focusin', onFocus);
      root.removeEventListener('click', onClick);
      stage.remove();
      snaps.remove();
    },
  };
}
