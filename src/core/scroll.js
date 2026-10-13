/**
 * A smoothed copy of the native scroll position.
 *
 * Why native: keyboard, touch, find-in-page and screen readers keep working
 * because the document really scrolls. Visuals read `scroll.y`, which
 * follows window.scrollY with s += (target - s)(1 - exp(-dt/0.30)): tau =
 * 300 ms, frame-rate independent (NOTES "Techniques" #1). Reduced motion
 * reads the raw value.
 */
import { env } from './env.js';
import { follow } from './ease.js';
import { onFrame } from './raf.js';

const TAU = 0.3;

export const scroll = {
  y: 0,
  target: 0,
  /** px/s of the smoothed value; the rain overlay leans on it. */
  velocity: 0,
};

let started = false;
export function startScroll() {
  if (started) return;
  started = true;
  scroll.y = scroll.target = window.scrollY;
  onFrame((dt) => {
    const target = window.scrollY;
    scroll.target = target;
    const prev = scroll.y;
    if (env.reducedMotion) scroll.y = target;
    else {
      scroll.y += (target - scroll.y) * follow(dt, TAU);
      if (Math.abs(target - scroll.y) < 0.05) scroll.y = target;
    }
    scroll.velocity = (scroll.y - prev) / dt;
  });
}

/** Snaps the smoothed value to the real one (after a resize or a programmatic jump). */
export function settleScroll() {
  scroll.y = scroll.target = window.scrollY;
  scroll.velocity = 0;
}
