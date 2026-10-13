/**
 * The preloader: a raindrop hangs over a pool while the first scene really loads.
 *
 * Why real bytes: a fake progress bar lies on slow phones and wastes time on
 * fast ones. The pill fills with the bytes of scene 1's images and both
 * fonts, read through fetch streams (the <img>s and @font-faces then hit the
 * HTTP cache), plus a final slice for decoding. At 100 %: hold 0.4 s, the
 * drop falls into the pool (0.6 s ease-in), and a ripple ring floods the
 * screen as a circular reveal of scene 1 (1.2 s --ease-wipe). Already cached
 * (loaded in under 0.3 s): no hold and half-length motion, under a second
 * in all. Reduced motion: a 0.4 s cross-fade. The markup and first-paint CSS
 * live inline in index.html, so it paints before this module arrives;
 * timings here are mirrored there (the pill's 0.5 s step transition).
 */
import { env } from '../core/env.js';

const HOLD = 400;
const FALL = 600;
const FLOOD = 1200;
const QUICK_UNDER = 300;
const UNKNOWN_BYTES = 200_000;

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Streams every url, calling onBytes(loaded, total) as chunks arrive. */
async function fetchAll(urls, onBytes) {
  const sizes = urls.map(() => UNKNOWN_BYTES);
  const got = urls.map(() => 0);
  const report = () => onBytes(got.reduce((a, b) => a + b, 0), sizes.reduce((a, b) => a + b, 0));
  await Promise.all(urls.map(async (url, i) => {
    try {
      const res = await fetch(url);
      const len = Number(res.headers.get('content-length'));
      if (len > 0) sizes[i] = len;
      if (!res.body) { await res.arrayBuffer(); got[i] = sizes[i]; report(); return; }
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        got[i] += value.byteLength;
        if (got[i] > sizes[i]) sizes[i] = got[i];
        report();
      }
      got[i] = sizes[i];
      report();
    } catch {
      // A failed asset must not trap the reader behind the preloader.
      got[i] = sizes[i];
      report();
    }
  }));
}

/**
 * assets: urls to count; decode: async fn that resolves when scene 1 is ready to paint;
 * onReveal: called as the reveal starts. Resolves when the preloader is gone.
 */
export async function runPreloader({ assets, decode, onReveal }) {
  const root = document.getElementById('pl');
  const site = document.querySelector('.site');
  const html = document.documentElement;
  if (!root || html.classList.contains('pl-skip')) {
    html.classList.remove('pl-on');
    root?.remove();
    onReveal?.();
    return;
  }
  const bar = root.querySelector('.pl-bar');
  const fill = root.querySelector('.pl-fill');
  const drop = root.querySelector('.pl-drop');
  const pool = root.querySelector('.pl-pool');
  const ring = root.querySelector('.pl-ring');

  const t0 = performance.now();
  let shown = 0;
  const set = (v) => {
    if (v <= shown) return;
    shown = v;
    fill.style.transform = `scaleY(${v.toFixed(3)})`;
    bar.setAttribute('aria-valuenow', String(Math.round(v * 100)));
  };
  await fetchAll(assets, (a, b) => set(0.9 * (a / b)));
  await Promise.all([decode?.(), document.fonts?.load('20px "Young Serif"'), document.fonts?.load('16px "Atkinson Hyperlegible Next"')].map((p) => Promise.resolve(p).catch(() => {})));
  set(1);
  const quick = performance.now() - t0 < QUICK_UNDER;

  if (env.reducedMotion) {
    html.classList.remove('pl-on');
    onReveal?.();
    await root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, easing: css('--ease-ui'), fill: 'forwards' }).finished;
    root.remove();
    return;
  }

  // Let the pill's last 0.5 s step land, then hold.
  await wait(quick ? 120 : 500 + HOLD);

  const pr = pool.getBoundingClientRect();
  const dr = drop.getBoundingClientRect();
  const cx = pr.left + pr.width / 2;
  const cy = pr.top + pr.height * 0.5;
  const fall = cy - (dr.top + dr.height * 0.85);
  const fallMs = quick ? FALL / 2 : FALL;
  const floodMs = quick ? FLOOD / 2 : FLOOD;

  bar.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, easing: css('--ease-ui'), fill: 'forwards' });
  await drop.animate(
    [{ transform: 'translateY(0) scale(1, 1)', opacity: 1 }, { transform: `translateY(${fall}px) scale(0.7, 1.15)`, opacity: 1, offset: 0.9 }, { transform: `translateY(${fall}px) scale(0.2, 0.2)`, opacity: 0 }],
    { duration: fallMs, easing: css('--ease-in'), fill: 'forwards' },
  ).finished;

  // Ripple, then the flood: scene 1 grows out of the pool.
  const siteTop = site.getBoundingClientRect().top;
  const R = Math.hypot(Math.max(cx, innerWidth - cx), Math.max(cy, innerHeight - cy)) + 40;
  const at = `${cx}px ${cy - siteTop}px`;
  html.classList.remove('pl-on');
  ring.animate(
    [{ transform: 'translate(-50%, -50%) scale(0.15)', opacity: 1 }, { transform: `translate(-50%, -50%) scale(${(R * 2.2) / ring.offsetWidth})`, opacity: 0 }],
    { duration: floodMs, easing: css('--ease-wipe'), fill: 'forwards' },
  );
  const flood = site.animate(
    [{ clipPath: `circle(0px at ${at})` }, { clipPath: `circle(${R}px at ${at})` }],
    { duration: floodMs, easing: css('--ease-wipe'), fill: 'backwards', delay: quick ? 0 : 120 },
  );
  setTimeout(() => onReveal?.(), quick ? 0 : 200);
  await flood.finished;
  root.remove();
}
