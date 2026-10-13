/**
 * One requestAnimationFrame loop for everything that moves.
 *
 * Why: separate loops drift out of phase (the drop would read the scroll
 * value a frame late) and keep running in background tabs. Callbacks run in
 * the order they were added; main.js adds scroll first.
 */

const subs = [];
let id = 0;
let last = 0;

function frame(t) {
  id = requestAnimationFrame(frame);
  // Clamp dt so a long stall (tab switch, GC) doesn't fling the followers.
  const dt = last ? Math.min((t - last) / 1000, 0.1) : 1 / 60;
  last = t;
  for (let i = 0; i < subs.length; i++) subs[i](dt, t);
}

function start() {
  if (!id && !document.hidden && subs.length) { last = 0; id = requestAnimationFrame(frame); }
}
function stop() {
  if (id) cancelAnimationFrame(id);
  id = 0;
}

document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));

/** Adds fn(dt seconds, t ms) to the loop; returns a remover. */
export function onFrame(fn) {
  subs.push(fn);
  start();
  return () => {
    const i = subs.indexOf(fn);
    if (i >= 0) subs.splice(i, 1);
    if (!subs.length) stop();
  };
}
