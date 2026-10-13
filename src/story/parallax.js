/**
 * The story's virtual camera: one set of numbers turns a layer's depth into its motion.
 *
 * Why a camera and not per-layer speeds: the reference gets its parallax for
 * free from true 3D (NOTES §1), and hand-tuned speeds drift out of agreement
 * the moment a layer is added. Here a camera orbits a pivot at depth 1 (the
 * scene's subject). A layer at depth z (in pivot distances) moves by
 * (1 - 1/z) x the camera offset: the pivot stays put, the back plate moves
 * with the camera, the foreground against it.
 *
 * Calibration (NOTES "Techniques" #2): camera offset ±0.8 x ±0.45 units at
 * pivot distance 50 gives the back plate (z = 3) +2.6 px per 100 px of mouse
 * at 1440 wide; so K_X = 0.026 / (1 - 1/3) = 0.039 px per px. Vertical uses
 * the same camera scaled by 0.45/0.8 and the viewport aspect. Resulting
 * px per 100 px of mouse at 1440: back +2.6, mist +2.3, subject 0, mid (0.7)
 * -1.7, band (0.2) -15.6, which is the reference's "foreground travels about
 * 2x the background, opposite" once its fore cards (0.1-0.3x) are counted.
 *
 * Scroll moves the same camera: it cranes down through each scene by
 * CRANE x viewport height and dollies in by DOLLY pivot units, so the plate
 * drifts down ~5 % of the screen while the band rises past it and grows.
 */
import { env } from '../core/env.js';
import { follow } from '../core/ease.js';

export const K_X = 0.039;
const K_Y_RATIO = 0.45 / 0.8;
const TAU = 0.3;
export const CRANE = 1.9;
export const DOLLY = 0.03;

export function createCamera() {
  const cam = { x: 0, y: 0, tx: 0, ty: 0, px: -1, py: -1 };
  const onMove = (e) => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    cam.px = e.clientX;
    cam.py = e.clientY;
    cam.tx = e.clientX - innerWidth / 2;
    cam.ty = e.clientY - innerHeight / 2;
  };
  const onLeave = () => { cam.tx = cam.ty = 0; cam.px = cam.py = -1; };
  window.addEventListener('pointermove', onMove, { passive: true });
  document.documentElement.addEventListener('pointerleave', onLeave);

  cam.update = (dt) => {
    // Mouse parallax only where there is a mouse and motion is welcome.
    const on = env.finePointer && !env.reducedMotion && !env.phone;
    const tx = on ? cam.tx : 0, ty = on ? cam.ty : 0;
    const k = follow(dt, TAU);
    cam.x += (tx - cam.x) * k;
    cam.y += (ty - cam.y) * k;
  };
  cam.destroy = () => {
    window.removeEventListener('pointermove', onMove);
    document.documentElement.removeEventListener('pointerleave', onLeave);
  };
  return cam;
}

/**
 * Screen motion of a layer at depth z.
 * p is the scene's scroll progress (0 entering, 1 leaving); vw/vh the stage size.
 * Returns translation in px and a scale applied about the viewport centre.
 */
export function layerMotion(z, cam, p, vw, vh, out = { tx: 0, ty: 0, s: 1 }) {
  const still = env.reducedMotion;
  const par = 1 - 1 / z;
  const ky = K_X * K_Y_RATIO * (vw / vh);
  const crane = still ? 0 : CRANE * vh * (p - 0.5);
  out.tx = par * K_X * cam.x;
  out.ty = par * (ky * cam.y + K_X * crane);
  out.s = still ? 1 : z / (z - DOLLY * Math.max(-0.3, Math.min(1.3, p)));
  return out;
}
