/**
 * Load-on-demand helpers: memoised dynamic imports and ahead-of-time image decode.
 *
 * Why: the intro must paint without three.js or the depth model, and a
 * scene's images must be decoded before its wipe uncovers them, or the first
 * frame of the scene janks (NOTES "Hitch hygiene").
 */

/** Wraps a dynamic import so it runs once, however many callers ask. */
export function lazy(loader) {
  let p = null;
  return () => (p ??= loader());
}

/** Gives every <img data-src> under root its src; resolves when all are decoded. */
export function warmImages(root) {
  const jobs = [];
  for (const img of root.querySelectorAll('img[data-src]')) {
    img.loading = 'eager';
    img.src = img.dataset.src;
    img.removeAttribute('data-src');
    jobs.push(img.decode().catch(() => {}));
  }
  return Promise.all(jobs);
}

/** Runs fn when the browser is idle (or soon, where requestIdleCallback is missing). */
export function whenIdle(fn, timeout = 1500) {
  if ('requestIdleCallback' in window) return requestIdleCallback(fn, { timeout });
  return setTimeout(fn, 200);
}
