/**
 * Contour lines and user marks, draped on the terrain.
 *
 * WHY separate from yard-scene.js: these are rebuilt from plain data whenever
 * the designer changes them, and they all share one trick — sample the ground
 * height on the CPU (garden-shape.js groundHeight, the twin of the GPU
 * displacement) and lift a few centimetres so they sit on the surface without
 * z-fighting. Everything here is flat, unlit colour: marks are UI drawn into
 * the painting, not objects in it.
 */

import { PALETTE } from './palette.js';

/**
 * Build contour LineSegments. h(x, y) -> world height. toWorld(x, y, h) -> [X, Y, Z].
 * size = [W, D] metres: lines fade out toward the yard's edge like the ground does.
 */
export function buildContours(THREE, levels, h, toWorld, size) {
  const [W, D] = size;
  const fade = (x, y) => {
    const e = Math.min(x / W, 1 - x / W, y / D, 1 - y / D);
    const t = Math.min(1, Math.max(0, (e - 0.01) / 0.05));
    return t * t * (3 - 2 * t);
  };
  const teal = new THREE.Color(PALETTE.teal);
  let count = 0;
  for (const l of levels) count += l.segs.length / 4;
  if (!count) return null;
  const pos = new Float32Array(count * 6);
  const col = new Float32Array(count * 8);
  let k = 0;
  let c = 0;
  for (const l of levels) {
    const s = l.segs;
    for (let i = 0; i < s.length; i += 4) {
      for (let e = 0; e < 2; e++) {
        const x = s[i + e * 2];
        const y = s[i + e * 2 + 1];
        const w = toWorld(x, y, h(x, y) + 0.02);
        pos[k++] = w[0]; pos[k++] = w[1]; pos[k++] = w[2];
        col[c++] = teal.r; col[c++] = teal.g; col[c++] = teal.b; col[c++] = 0.75 * fade(x, y);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false });
  const lines = new THREE.LineSegments(geo, mat);
  lines.renderOrder = 1;
  return lines;
}

/** Resample a polyline every `step` metres so ribbons follow the terrain. */
function densify(pts, step, closed) {
  const src = closed && pts.length > 2 ? [...pts, pts[0]] : pts;
  const out = [];
  for (let i = 0; i < src.length - 1; i++) {
    const [x0, y0] = src[i];
    const [x1, y1] = src[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let k = 0; k < n; k++) out.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n]);
  }
  out.push(src[src.length - 1]);
  return out;
}

/** A flat ribbon of width w along pts, lifted `lift` m (or a vertical fence of height `up`). */
function ribbon(THREE, pts, w, h, toWorld, { lift = 0.03, up = 0, closed = false } = {}) {
  const p = densify(pts, 0.15, closed);
  if (p.length < 2) return null;
  const pos = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[Math.max(0, i - 1)];
    const b = p[Math.min(p.length - 1, i + 1)];
    let tx = b[0] - a[0];
    let ty = b[1] - a[1];
    const len = Math.hypot(tx, ty) || 1;
    tx /= len; ty /= len;
    const [x, y] = p[i];
    if (up > 0) {
      const g = h(x, y);
      pos.push(...toWorld(x, y, g - 0.05), ...toWorld(x, y, g + up));
    } else {
      const nx = -ty * w / 2;
      const ny = tx * w / 2;
      pos.push(...toWorld(x + nx, y + ny, h(x + nx, y + ny) + lift), ...toWorld(x - nx, y - ny, h(x - nx, y - ny) + lift));
    }
  }
  const idx = [];
  for (let i = 0; i < p.length - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  return geo;
}

function disc(THREE, x, y, r, h, toWorld, inner = 0) {
  const geo = inner > 0 ? new THREE.RingGeometry(inner, r, 32) : new THREE.CircleGeometry(r, 32);
  geo.rotateX(-Math.PI / 2);
  const w = toWorld(x, y, h(x, y) + 0.035);
  geo.translate(w[0], w[1], w[2]);
  return geo;
}

/** Build a Group for marks [{ kind, pts }]. */
export function buildMarks(THREE, marks, h, toWorld) {
  const group = new THREE.Group();
  const mat = (color, opacity = 1) => new THREE.MeshBasicMaterial({
    color, transparent: opacity < 1, opacity, side: THREE.DoubleSide, depthWrite: opacity >= 1,
  });
  const add = (geo, m) => {
    if (!geo) return;
    const mesh = new THREE.Mesh(geo, m);
    mesh.renderOrder = 3;
    group.add(mesh);
  };
  for (const mk of marks || []) {
    const pts = (mk.pts || []).filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (!pts.length) continue;
    if (mk.kind === 'downspout') {
      const [x, y] = pts[0];
      add(disc(THREE, x, y, 0.28, h, toWorld, 0.2), mat(PALETTE.marigold));
      const pipe = new THREE.CylinderGeometry(0.05, 0.05, 0.9, 12);
      const w = toWorld(x, y, h(x, y) + 0.45);
      pipe.translate(w[0], w[1], w[2]);
      add(pipe, mat(PALETTE.marigold));
    } else if (mk.kind === 'outlet') {
      for (const [x, y] of pts) add(disc(THREE, x, y, 0.32, h, toWorld, 0.22), mat(PALETTE.teal));
    } else if (mk.kind === 'wall') {
      add(ribbon(THREE, pts, 0, h, toWorld, { up: 0.6 }), mat(PALETTE.slate700, 0.9));
      add(ribbon(THREE, pts, 0.1, h, toWorld), mat(PALETTE.asphalt));
    } else if (mk.kind === 'septic') {
      add(ribbon(THREE, pts, 0.1, h, toWorld, { closed: true }), mat(PALETTE.clay));
    } else if (mk.kind === 'scale') {
      add(ribbon(THREE, pts, 0.06, h, toWorld), mat(PALETTE.paper));
      for (const [x, y] of [pts[0], pts[pts.length - 1]]) add(disc(THREE, x, y, 0.12, h, toWorld), mat(PALETTE.marigold));
    }
  }
  return group;
}
