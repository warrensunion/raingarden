/**
 * The raindrop you follow: the thread from roof to stream.
 *
 * Why scroll-mapped rather than timed: the reader drives the story, so the
 * drop must be exactly where their scroll says (and go back up when they
 * scroll back). Each scene gives a path in plate percent; story.js hands us
 * a mapper from plate percent to screen px through the subject layer, so the
 * drop stays on the gutter at any viewport size. On a mouse it leans toward
 * the cursor by up to 40 px with the camera's 0.30 s time constant; it lands
 * with a small splash once per scene.
 */
import { env } from '../core/env.js';
import { clamp, follow } from '../core/ease.js';

const TRAVEL_START = 0.02;
const TRAVEL_END = 0.6;
const SPLASH_LEN = 0.12;
const LEAN_MAX = 40;
const TAU = 0.3;

/** Precomputes arc lengths so travel speed is even along bent paths. */
function measure(path) {
  const seg = [0];
  for (let i = 1; i < path.length; i++) {
    const dx = path[i][0] - path[i - 1][0], dy = path[i][1] - path[i - 1][1];
    seg.push(seg[i - 1] + Math.hypot(dx, dy * 0.56));
  }
  const total = seg[seg.length - 1] || 1;
  return { path, cum: seg.map((s) => s / total) };
}

function along({ path, cum }, u, out) {
  let i = 1;
  while (i < path.length - 1 && cum[i] < u) i++;
  const t = clamp((u - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1));
  out[0] = path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t;
  out[1] = path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t;
  return out;
}

/** Fraction of the path at the vertex nearest the splash point. */
function splashAt(m, pt) {
  let best = 0, bd = Infinity;
  m.path.forEach((q, i) => {
    const d = Math.hypot(q[0] - pt[0], q[1] - pt[1]);
    if (d < bd) { bd = d; best = m.cum[i]; }
  });
  return best;
}

export function createDrop(stage, scenes) {
  const drop = document.createElement('img');
  drop.className = 'story-drop';
  drop.src = '/art/tex-raindrop.webp';
  drop.alt = '';
  drop.decoding = 'async';
  const splash = document.createElement('img');
  splash.className = 'story-splash';
  splash.src = '/art/tex-splash.webp';
  splash.alt = '';
  splash.decoding = 'async';
  splash.loading = 'lazy';
  stage.append(drop, splash);

  const paths = scenes.map((s) => {
    const m = measure(s.drop);
    m.splashU = splashAt(m, s.splash);
    return m;
  });
  const pt = [0, 0];
  const lean = { x: 0, y: 0 };
  let dw = 28, dh = 58, sw = 90, sh = 65;

  function resize() {
    dw = env.phone ? 20 : 28;
    dh = dw * (824 / 398);
    sw = env.phone ? 64 : 90;
    sh = sw * (739 / 1024);
    drop.style.width = dw + 'px';
    splash.style.width = sw + 'px';
  }
  resize();

  /**
   * scene: index; p: its progress; toScreen(xPct, yPct, out) maps plate percent to px;
   * cam: the camera (pointer position); dt seconds; show: false hides everything.
   */
  function update(scene, p, toScreen, cam, dt, show) {
    if (!show || env.reducedMotion) {
      drop.style.opacity = '0';
      splash.style.opacity = '0';
      return;
    }
    const m = paths[scene];
    const u = clamp((p - TRAVEL_START) / (TRAVEL_END - TRAVEL_START));
    along(m, u, pt);
    toScreen(pt[0], pt[1], pt);

    // Lean toward the cursor, capped, eased.
    let lx = 0, ly = 0;
    if (env.finePointer && !env.phone && cam.px >= 0) {
      lx = cam.px - pt[0];
      ly = cam.py - pt[1];
      const d = Math.hypot(lx, ly);
      const k = d > 0 ? Math.min(1, LEAN_MAX / d) * Math.min(1, d / 240) : 0;
      lx *= k;
      ly *= k;
    }
    const f = follow(dt, TAU);
    lean.x += (lx - lean.x) * f;
    lean.y += (ly - lean.y) * f;

    const fadeIn = clamp((p + 0.06) / 0.08);
    const fadeOut = 1 - clamp((p - TRAVEL_END) / 0.05);
    drop.style.opacity = String(fadeIn * fadeOut);
    const tilt = clamp(-lean.x * 0.35, -14, 14);
    drop.style.transform = `translate3d(${pt[0] + lean.x - dw / 2}px, ${pt[1] + lean.y - dh * 0.92}px, 0) rotate(${tilt}deg)`;

    // Splash when the drop reaches the landing point.
    const pSplash = TRAVEL_START + (TRAVEL_END - TRAVEL_START) * m.splashU;
    const sp = (p - pSplash) / SPLASH_LEN;
    if (sp > 0 && sp < 1) {
      along(m, m.splashU, pt);
      toScreen(pt[0], pt[1], pt);
      const s = 0.35 + 0.75 * Math.sqrt(sp);
      splash.style.opacity = String(Math.sin(Math.PI * Math.min(1, sp * 1.4)) * 0.95);
      splash.style.transform = `translate3d(${pt[0] - sw / 2}px, ${pt[1] - sh * 0.8}px, 0) scale(${s})`;
    } else splash.style.opacity = '0';
  }

  return {
    update,
    resize,
    destroy() { drop.remove(); splash.remove(); },
  };
}
