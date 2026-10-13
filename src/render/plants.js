/**
 * Plant billboards for the garden.
 *
 * WHY sprites: the plants are painted cut-outs (Task 10 art), and a painted
 * plant should always face the viewer like a pop-up book, never be seen
 * edge-on. A missing sprite must not break the scene, so every plant starts
 * as a soft tinted blob (drawn once per growth form on a small canvas) and is
 * swapped for its painting when /art/plants/<id>.webp arrives.
 */

import { PALETTE } from './palette.js';

const TINTS = {
  grass: [PALETTE.fern, PALETTE.moss, null],
  sedge: [PALETTE.fern, PALETTE.moss, null],
  rush: [PALETTE.moss, PALETTE.fern, null],
  fern: [PALETTE.fern, PALETTE.moss, null],
  perennial: [PALETTE.fern, PALETTE.moss, PALETTE.marigold],
  shrub: [PALETTE.moss, PALETTE.fern, PALETTE.clay],
  tree: [PALETTE.moss, PALETTE.slate700, null],
};

function blobCanvas(form) {
  const [a, b, dot] = TINTS[form] || TINTS.perennial;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  let seed = 7;
  for (const ch of form || 'x') seed = (seed * 31 + ch.charCodeAt(0)) % 9973;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const tall = form === 'grass' || form === 'sedge' || form === 'rush';
  for (let i = 0; i < 9; i++) {
    const x = 64 + (rnd() - 0.5) * (tall ? 40 : 60);
    const y = tall ? 50 + rnd() * 60 : 60 + rnd() * 40;
    const r = tall ? 14 + rnd() * 10 : 22 + rnd() * 16;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    const col = i % 3 === 0 ? b : a;
    grd.addColorStop(0, col + 'ee');
    grd.addColorStop(0.6, col + 'aa');
    grd.addColorStop(1, col + '00');
    g.fillStyle = grd;
    g.beginPath();
    if (tall) g.ellipse(x, y, r * 0.45, r * 1.6, (rnd() - 0.5) * 0.5, 0, Math.PI * 2);
    else g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  if (dot) {
    g.fillStyle = dot;
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.arc(40 + rnd() * 48, 44 + rnd() * 40, 3 + rnd() * 3, 0, Math.PI * 2);
      g.fill();
    }
  }
  return c;
}

export function createPlantLayer(THREE, { onChange }) {
  const group = new THREE.Group();
  const blobs = new Map();   // form -> Texture
  const art = new Map();     // id -> Promise<Texture|null>
  const loader = new THREE.TextureLoader();
  let disposed = false;

  function blob(form) {
    if (!blobs.has(form)) {
      const t = new THREE.CanvasTexture(blobCanvas(form));
      t.colorSpace = THREE.SRGBColorSpace;
      blobs.set(form, t);
    }
    return blobs.get(form);
  }

  function sprite(id) {
    if (!art.has(id)) {
      art.set(id, new Promise((resolve) => {
        loader.load(`/art/plants/${encodeURIComponent(id)}.webp`, (t) => {
          t.anisotropy = 4;
          t.colorSpace = THREE.SRGBColorSpace;
          resolve(t);
        }, undefined, () => resolve(null));
      }));
    }
    return art.get(id);
  }

  function clear() {
    for (const s of group.children) s.material.dispose();
    group.clear();
  }

  /** plants: [{ x, y, r, id, form }]; h(x,y) world height; toWorld(x,y,h). */
  function set(plants, season, h, toWorld) {
    clear();
    const k = 0.3 + 0.7 * Math.min(1, Math.max(0, season));
    for (const p of plants || []) {
      const mat = new THREE.SpriteMaterial({ map: blob(p.form), transparent: true, alphaTest: 0.04, depthWrite: false });
      const s = new THREE.Sprite(mat);
      s.center.set(0.5, 0.06);
      const size = 2 * p.r * k;
      s.scale.set(size, size, 1);
      s.position.set(...toWorld(p.x, p.y, h(p.x, p.y)));
      s.renderOrder = 4;
      group.add(s);
      sprite(p.id).then((t) => {
        if (!t || disposed || s.parent !== group) return;
        s.material.map = t;
        s.material.needsUpdate = true;
        const img = t.image;
        const aspect = img && img.width ? img.height / img.width : 1;
        s.scale.set(size, size * aspect, 1);
        onChange();
      });
    }
    return k;
  }

  function dispose() {
    disposed = true;
    clear();
    for (const t of blobs.values()) t.dispose();
    for (const p of art.values()) p.then((t) => t && t.dispose());
  }

  return { group, set, dispose };
}
