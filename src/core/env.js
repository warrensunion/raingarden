/**
 * What this device can do, read once and kept live.
 *
 * Why one module: reduced motion, WebGL2 and pointer type each change what
 * the story draws, and every fallback must say why it fell back in the same
 * words (constraints.md), so the decision and the log line live together.
 * Getters, not snapshots: a user can flip "reduce motion" mid-visit and the
 * story follows on the next frame.
 */

const mq = (q) => (typeof matchMedia === 'function' ? matchMedia(q) : { matches: false, addEventListener() {} });

const reduceQ = mq('(prefers-reduced-motion: reduce)');
const fineQ = mq('(hover: hover) and (pointer: fine)');
const phoneQ = mq('(max-width: 768px)');

const listeners = new Set();
for (const q of [reduceQ, fineQ, phoneQ]) q.addEventListener('change', () => listeners.forEach((fn) => fn(env)));

let gl2 = null;
function probeWebgl2() {
  try {
    const c = document.createElement('canvas');
    const ctx = c.getContext('webgl2', { failIfMajorPerformanceCaveat: true });
    if (!ctx) return { ok: false, reason: 'WebGL2 unavailable' };
    ctx.getExtension('WEBGL_lose_context')?.loseContext();
    return { ok: true, reason: '' };
  } catch (err) {
    return { ok: false, reason: 'WebGL2 probe threw: ' + err.message };
  }
}

export const env = {
  get reducedMotion() { return reduceQ.matches; },
  /** Lazy: creating a context costs a few ms, so only the first caller pays. */
  get webgl2() { gl2 ??= probeWebgl2(); return gl2.ok; },
  get webgl2Reason() { gl2 ??= probeWebgl2(); return gl2.reason; },
  get finePointer() { return fineQ.matches; },
  get phone() { return phoneQ.matches; },
};

/** Calls fn(env) whenever reduced motion, pointer type or the phone breakpoint flips. */
export function onEnvChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function logFallback(where, reason) {
  console.info('[raingarden] static fallback: ' + where + ' — ' + reason);
}
