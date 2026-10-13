/**
 * The curves the whole site moves on, as JS functions.
 *
 * Why: scroll-driven motion (the wipe, the drop) can't use CSS transitions,
 * but it must feel identical to the CSS that uses the same tokens in
 * tokens.css. Numbers come from design-reference/makemepulse/NOTES.md §4/§6.
 */

/** Cubic-bezier timing function, same maths as CSS (Newton, then bisection). */
export function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t;
  const sy = (t) => ((ay * t + by) * t + cy) * t;
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) {
      const e = sx(t) - x;
      if (Math.abs(e) < 1e-5) return sy(t);
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    let lo = 0, hi = 1;
    t = x;
    for (let i = 0; i < 30; i++) {
      const v = sx(t);
      if (Math.abs(v - x) < 1e-5) break;
      if (v < x) lo = t; else hi = t;
      t = (lo + hi) / 2;
    }
    return sy(t);
  };
}

/** --ease-ui: easeOutCubic, every CSS UI transition (0.25 / 0.5 / 0.8 s). */
export const easeUi = bezier(0.215, 0.61, 0.355, 1);
/** --ease-reveal: the reference's "fast-out" CustomEase fit (1.0 s reveals). */
export const easeReveal = bezier(0.05, 0.75, 0.1, 1);
/** --ease-wipe: scene-change wipe; the reference's camera flight, Power3.easeInOut (quart). */
export const easeWipe = bezier(0.76, 0, 0.24, 1);
/** Power4.easeInOut (GSAP Power4 = quint): passe-partout frame zoom. */
export const easeFrame = bezier(0.83, 0, 0.17, 1);
/** easeInCubic: the preloader drop falling into the pool. */
export const easeIn = bezier(0.55, 0.055, 0.675, 0.19);

export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
/** Frame-rate independent follow: the fraction of the gap closed in dt seconds for time constant tau. */
export const follow = (dt, tau) => 1 - Math.exp(-dt / tau);
