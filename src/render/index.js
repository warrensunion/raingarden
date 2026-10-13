/**
 * createYard: the one entry point the designer uses for the yard view.
 *
 * WHY: callers should not care whether they got the WebGL scene or the
 * Canvas2D fallback — both expose the same API. This module probes WebGL2 on a
 * throwaway canvas (a canvas that has handed out a webgl2 context can never
 * give a 2d one, so probing the real canvas would make the fallback
 * impossible), imports three only inside yard-scene.js, and on ANY failure
 * logs the fallback line the audit greps for. `?static=1` forces the fallback
 * so it can be tested on any machine.
 */

function forcedStatic() {
  try {
    return new URLSearchParams(location.search).get('static') === '1';
  } catch {
    return false;
  }
}

function probeWebGL2() {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2');
  if (!gl) return false;
  const lose = gl.getExtension('WEBGL_lose_context');
  if (lose) lose.loseContext();
  return true;
}

/** A canvas that still hands out a 2d context: the same one, or a fresh twin swapped into its place. */
function canvasFor2d(canvas) {
  if (canvas.getContext('2d')) return canvas;
  const twin = document.createElement('canvas');
  twin.className = canvas.className;
  twin.style.cssText = canvas.style.cssText;
  for (const a of canvas.getAttributeNames()) if (a !== 'width' && a !== 'height') twin.setAttribute(a, canvas.getAttribute(a));
  if (canvas.parentNode) canvas.replaceWith(twin);
  return twin;
}

export async function createYard(canvas, opts) {
  let reason;
  try {
    if (forcedStatic()) throw new Error('forced by ?static=1');
    if (!probeWebGL2()) throw new Error('no WebGL2');
    const { createYardScene } = await import('./yard-scene.js');
    return await createYardScene(canvas, opts);
  } catch (e) {
    reason = (e && e.message) || String(e);
  }
  console.info(`[raingarden] static fallback: yard — ${reason}`);
  const { createStaticYard } = await import('./static-yard.js');
  const target = canvasFor2d(canvas);
  const api = createStaticYard(target, opts);
  api.canvas = target;
  return api;
}
