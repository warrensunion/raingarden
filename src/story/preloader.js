/**
 * The preloader: a raindrop hangs over a pool while the first scene really loads.
 *
 * Why real bytes: a fake progress bar lies on slow phones and wastes time on
 * fast ones. The pill fills with the bytes of scene 1's images, read once
 * through fetch streams and handed to the story as blobs (onBlobs), so
 * nothing downloads twice (85 %); each font counts when the browser has it
 * from its single @font-face download (5 % each); decoding is the last 5 %.
 *
 * Motion is always the specified length: hold 0.4 s, the drop falls into the
 * pool (0.6 s ease-in), a ripple ring floods the screen as a circular reveal
 * of scene 1 (1.2 s --ease-wipe). When the bytes come back fast (cached, under
 * 0.3 s) the hold is skipped and the fall overlaps decode and font readiness,
 * so the wait is load time, not choreography. Reduced motion: a 0.4 s
 * cross-fade. The markup and first-paint CSS live inline in index.html, so
 * it paints before this module arrives; the pill's 0.5 s step transition
 * there mirrors this file.
 */
import { env } from '../core/env.js';

const HOLD = 400;
const FALL = 600;
const FLOOD = 1200;
const QUICK_UNDER = 300;
const UNKNOWN_BYTES = 200_000;

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Streams every url, calling onBytes(loaded, total) as chunks arrive; resolves to Map(url -> Blob). */
async function fetchAll(urls, onBytes) {
  const sizes = urls.map(() => UNKNOWN_BYTES);
  const got = urls.map(() => 0);
  const blobs = new Map();
  const report = () => onBytes(got.reduce((a, b) => a + b, 0), sizes.reduce((a, b) => a + b, 0));
  await Promise.all(urls.map(async (url, i) => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      const len = Number(res.headers.get('content-length'));
      if (len > 0) sizes[i] = len;
      const type = res.headers.get('content-type') || '';
      const chunks = [];
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        got[i] += value.byteLength;
        if (got[i] > sizes[i]) sizes[i] = got[i];
        report();
      }
      blobs.set(url, new Blob(chunks, { type }));
    } catch {
      // A failed asset must not trap the reader behind the preloader; the <img> fetches it itself.
    }
    got[i] = sizes[i];
    report();
  }));
  return blobs;
}

/**
 * images: scene-1 urls; onBlobs(Map): gives them to the page; decode: resolves when scene 1
 * can paint; fonts: font shorthand strings to wait for; onReveal: called as the reveal starts.
 * Resolves when the preloader is gone.
 */
export async function runPreloader({ images, onBlobs, decode, fonts = [], onReveal }) {
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
  let imgPart = 0, fontPart = 0, decoded = 0;
  let shown = 0;
  const render = () => {
    const v = 0.85 * imgPart + fontPart + decoded;
    if (v <= shown) return;
    shown = v;
    fill.style.transform = `scaleY(${v.toFixed(3)})`;
    bar.setAttribute('aria-valuenow', String(Math.round(v * 100)));
  };
  const fontsReady = Promise.all(fonts.map((f) => (document.fonts?.load(f) ?? Promise.resolve()).catch(() => {})
    .then(() => { fontPart += 0.1 / fonts.length; render(); })));

  const blobs = await fetchAll(images, (a, b) => { imgPart = a / b; render(); });
  performance.mark('pl:bytes');
  onBlobs?.(blobs);
  const quick = performance.now() - t0 < QUICK_UNDER;
  const ready = Promise.all([Promise.resolve(decode?.()).catch(() => {}), fontsReady])
    .then(() => { decoded = 0.05; fontPart = 0.1; render(); performance.mark('pl:ready'); });

  if (env.reducedMotion) {
    await ready;
    html.classList.remove('pl-on');
    onReveal?.();
    await root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, easing: css('--ease-ui'), fill: 'forwards' }).finished;
    root.remove();
    return;
  }

  // Slow load: let the pill's last 0.5 s step land at 100 %, then hold. Fast load: fall now, overlapping decode.
  if (!quick) {
    await ready;
    await wait(500 + HOLD);
  }

  const pr = pool.getBoundingClientRect();
  const dr = drop.getBoundingClientRect();
  const cx = pr.left + pr.width / 2;
  const cy = pr.top + pr.height * 0.5;
  const fall = cy - (dr.top + dr.height * 0.85);

  bar.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, delay: quick ? 350 : 0, easing: css('--ease-ui'), fill: 'forwards' });
  const falling = drop.animate(
    [{ transform: 'translateY(0) scale(1, 1)', opacity: 1 }, { transform: `translateY(${fall}px) scale(0.7, 1.15)`, opacity: 1, offset: 0.9 }, { transform: `translateY(${fall}px) scale(0.2, 0.2)`, opacity: 0 }],
    { duration: FALL, easing: css('--ease-in'), fill: 'forwards' },
  ).finished;
  await Promise.all([falling, ready]);
  performance.mark('pl:flood');

  // Ripple, then the flood: scene 1 grows out of the pool.
  const siteTop = site.getBoundingClientRect().top;
  const R = Math.hypot(Math.max(cx, innerWidth - cx), Math.max(cy, innerHeight - cy)) + 40;
  const at = `${cx}px ${cy - siteTop}px`;
  const flood = site.animate(
    [{ clipPath: `circle(0px at ${at})` }, { clipPath: `circle(${R}px at ${at})` }],
    { duration: FLOOD, easing: css('--ease-wipe'), fill: 'backwards', delay: 80 },
  );
  html.classList.remove('pl-on');
  ring.animate(
    [{ transform: 'translate(-50%, -50%) scale(0.15)', opacity: 1 }, { transform: `translate(-50%, -50%) scale(${(R * 2.2) / ring.offsetWidth})`, opacity: 0 }],
    { duration: FLOOD, easing: css('--ease-wipe'), fill: 'forwards' },
  );
  setTimeout(() => onReveal?.(), 160);
  await flood.finished;
  performance.mark('pl:gone');
  root.remove();
}
