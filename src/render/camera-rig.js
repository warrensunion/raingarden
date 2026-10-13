/**
 * Named camera poses for the designer steps, and the eased move between them.
 *
 * WHY: the designer is "one continuous scene" (spec §4) — each step is a camera
 * move, not a page change. Poses are described as (target, elevation,
 * azimuth, fov) and the distance is solved per viewport so the yard always
 * fills the frame, whether the screen is a 1440-wide desktop or a 390-wide
 * phone in portrait. Moves interpolate the pose parameters (not positions),
 * so the camera swings in an arc instead of cutting through the ground.
 */

const DEG = Math.PI / 180;

/**
 * fit: share of the frame the subject should fill (NDC half-extent).
 * crop: on a portrait screen, how far past the sides the subject may run —
 * cinematic poses crop the yard's flanks rather than shrink it to a sliver;
 * poses where the user must see everything (mark, plan, capture) never crop.
 */
export const POSES = {
  capture: { elev: 24, az: 0, fov: 46, fit: 0.98, crop: 1, focus: 'yard' },
  mark: { elev: 64, az: 0, fov: 34, fit: 0.92, crop: 1, focus: 'yard' },
  storm: { elev: 33, az: -22, fov: 36, fit: 0.96, crop: 1.35, focus: 'yard' },
  optimize: { elev: 50, az: 16, fov: 34, fit: 0.9, crop: 1.2, focus: 'yard' },
  plants: { elev: 30, az: -14, fov: 36, fit: 0.8, crop: 1.1, focus: 'garden' },
  compare: { elev: 42, az: 0, fov: 34, fit: 0.94, crop: 1.15, focus: 'yard' },
  plan: { elev: 87, az: 0, fov: 30, fit: 0.92, crop: 1, focus: 'yard' },
};

/** Portrait screens look more steeply down, so a wide yard projects taller. */
function elevFor(pose, aspect) {
  if (aspect >= 0.9 || pose.elev > 80) return pose.elev;
  return Math.min(80, pose.elev + 18 * Math.min(1, (0.9 - aspect) / 0.4));
}

/** Smooth exponential in-out. */
export function easeExpoInOut(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Rig around a PerspectiveCamera.
 * subject(focus) -> { center: Vector3, pts: Vector3[] } — the points that must be in frame.
 */
export function createCameraRig(THREE, camera, subject) {
  let cur = null;   // { tx, ty, tz, dist, elev, az, fov }
  let anim = null;  // { from, to, t0, ms }
  let poseName = 'capture';
  const tmp = new THREE.Vector3();

  function apply(p) {
    camera.fov = p.fov;
    const ce = Math.cos(p.elev * DEG);
    camera.position.set(
      p.tx + p.dist * Math.sin(p.az * DEG) * ce,
      p.ty + p.dist * Math.sin(p.elev * DEG),
      p.tz + p.dist * Math.cos(p.az * DEG) * ce,
    );
    camera.lookAt(p.tx, p.ty, p.tz);
    const span = p.dist * 3 + 20;
    camera.near = Math.max(0.05, p.dist * 0.02);
    camera.far = span;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }

  /** Solve the distance so every subject point lands inside ±fit NDC. */
  function solve(name) {
    const pose = POSES[name] || POSES.capture;
    const s = subject(pose.focus);
    const portrait = camera.aspect < 0.9;
    const p = { tx: s.center.x, ty: s.center.y, tz: s.center.z, elev: elevFor(pose, camera.aspect), az: pose.az, fov: pose.fov, dist: 10 };
    const fx = pose.fit * (portrait ? pose.crop : 1);
    let lo = 0.5;
    let hi = 400;
    for (let k = 0; k < 28; k++) {
      p.dist = (lo + hi) / 2;
      apply(p);
      let worst = 0;
      for (const v of s.pts) {
        tmp.copy(v).project(camera);
        if (tmp.z > 1 || tmp.z < -1) { worst = 9; break; }
        worst = Math.max(worst, Math.abs(tmp.x) / fx, Math.abs(tmp.y) / pose.fit);
      }
      if (worst > 1) lo = p.dist; else hi = p.dist;
    }
    p.dist = hi;
    return p;
  }

  return {
    get pose() { return poseName; },
    get moving() { return !!anim; },
    to(name, ms, now) {
      poseName = POSES[name] ? name : 'capture';
      const goal = solve(poseName);
      if (!cur || !(ms > 0)) {
        anim = null;
        cur = goal;
        apply(cur);
        return;
      }
      anim = { from: { ...cur }, to: goal, t0: now, ms };
    },
    /** Re-solve the current pose (viewport changed or the garden moved). */
    refit(now) {
      const goal = solve(poseName);
      if (anim) anim.to = goal;
      else { cur = goal; apply(cur); }
      if (anim) this.update(now);
    },
    /** Advance; returns true while moving. */
    update(now) {
      if (!anim) { if (cur) apply(cur); return false; }
      const t = Math.min(1, (now - anim.t0) / anim.ms);
      const e = easeExpoInOut(t);
      const a = anim.from;
      const b = anim.to;
      const daz = b.az - a.az;
      cur = {
        tx: lerp(a.tx, b.tx, e), ty: lerp(a.ty, b.ty, e), tz: lerp(a.tz, b.tz, e),
        dist: Math.exp(lerp(Math.log(a.dist), Math.log(b.dist), e)),
        elev: lerp(a.elev, b.elev, e), az: a.az + daz * e, fov: lerp(a.fov, b.fov, e),
      };
      apply(cur);
      if (t >= 1) anim = null;
      return true;
    },
  };
}
