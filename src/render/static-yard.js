/**
 * Static yard: the same API as yard-scene.js, drawn top-down on Canvas2D.
 *
 * WHY: every WebGL surface needs a fallback (Global Constraints) — old phones,
 * blocked GPUs, lost contexts. The designer must still be usable: water as
 * teal by depth, the garden ellipse and plants, contours and marks, and
 * picking for marking. It draws only when something changes, so it costs
 * nothing while idle; fps() reports 60 because nothing animates.
 */

import { PALETTE, rgb } from './palette.js';
import { displayDepth } from './depth-display.js';
import { gridFrame } from './grid-coords.js';
import { formOf } from './plants.js';

const FIT = { capture: 0.92, mark: 0.92, storm: 0.92, optimize: 0.92, plants: 0.92, compare: 0.92, plan: 0.95 };

/**
 * Same contract as createYardScene (yard-scene.js): `terrain` is the UNCARVED
 * base yard, cell (i, j) is centred at ((i+0.5)·cell, (j+0.5)·cell), setWater
 * takes sim depth as-is (copied), setSplit shows before (otherDepth, no garden)
 * on the LEFT and now on the RIGHT. A photo without toImage is mapped with the
 * default planar UV (image top = far edge). DPR is capped at 1.5 on phones.
 * Attach pointer listeners to api.canvas.
 */
export function createStaticYard(canvas, { terrain, photo = null, toImage = null } = {}) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  const { nx, ny, cell, z } = terrain;
  const grid = gridFrame(terrain);
  const { W, D } = grid;
  const uvOf = toImage || (([x, y]) => grid.planarUV(x, y));
  const n = nx * ny;

  // ---- base image: hillshade × (photo | lawn), rows flipped so far (large y) is up ----
  const base = document.createElement('canvas');
  base.width = nx;
  base.height = ny;
  const bctx = base.getContext('2d');
  const img = bctx.createImageData(nx, ny);
  let pix = null;
  let pw = 0;
  let ph = 0;
  if (photo) {
    const s = Math.min(1, 1024 / Math.max(photo.width, photo.height));
    pw = Math.max(1, Math.round(photo.width * s));
    ph = Math.max(1, Math.round(photo.height * s));
    const pc = document.createElement('canvas');
    pc.width = pw;
    pc.height = ph;
    const pctx = pc.getContext('2d');
    pctx.drawImage(photo, 0, 0, pw, ph);
    pix = pctx.getImageData(0, 0, pw, ph).data;
  }
  const moss = rgb(PALETTE.moss);
  const fern = rgb(PALETTE.fern);
  const L = [-0.5, 0.8, 0.3];
  const ll = Math.hypot(...L);
  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      const i = iy * nx + ix;
      const zx = (z[iy * nx + Math.min(nx - 1, ix + 1)] - z[iy * nx + Math.max(0, ix - 1)]) / (2 * cell);
      const zy = (z[Math.min(ny - 1, iy + 1) * nx + ix] - z[Math.max(0, iy - 1) * nx + ix]) / (2 * cell);
      const nl = Math.hypot(zx, zy, 1);
      const shade = 0.72 + 0.45 * Math.max(0, (-zx * L[0] - zy * L[2] + L[1]) / (nl * ll));
      let c;
      const uv = pix ? uvOf(grid.center(ix, iy)) : null;
      if (uv && uv[0] >= 0 && uv[0] <= 1 && uv[1] >= 0 && uv[1] <= 1) {
        const p = (Math.min(ph - 1, Math.floor(uv[1] * ph)) * pw + Math.min(pw - 1, Math.floor(uv[0] * pw))) * 4;
        c = [pix[p] / 255, pix[p + 1] / 255, pix[p + 2] / 255];
      } else {
        const t = ((ix * 7919 + iy * 104729) % 97) / 97;
        c = moss.map((m, k) => m + (fern[k] - m) * t * 0.35);
      }
      const o = ((ny - 1 - iy) * nx + ix) * 4;
      img.data[o] = Math.min(255, c[0] * shade * 255);
      img.data[o + 1] = Math.min(255, c[1] * shade * 255);
      img.data[o + 2] = Math.min(255, c[2] * shade * 255);
      img.data[o + 3] = 255;
    }
  }
  bctx.putImageData(img, 0, 0);

  // ---- water layers ----
  const teal = rgb(PALETTE.teal);
  const slate = rgb(PALETTE.slate900);
  function waterCanvas() {
    const c = document.createElement('canvas');
    c.width = nx;
    c.height = ny;
    return c;
  }
  const waterNow = waterCanvas();
  const waterBefore = waterCanvas();
  let haveBefore = false;
  const disp = new Float32Array(n);
  const scratch = new Float32Array(n);
  function paintWater(c, src) {
    const depth = displayDepth(src, z, disp, scratch, nx, ny);
    const wctx = c.getContext('2d');
    const im = wctx.createImageData(nx, ny);
    for (let iy = 0; iy < ny; iy++) {
      for (let ix = 0; ix < nx; ix++) {
        const d = depth[iy * nx + ix] || 0;
        if (d < 0.0005) continue;
        const t = Math.min(1, d / 0.5);
        const o = ((ny - 1 - iy) * nx + ix) * 4;
        im.data[o] = 255 * (teal[0] + (slate[0] - teal[0]) * t);
        im.data[o + 1] = 255 * (teal[1] + (slate[1] - teal[1]) * t);
        im.data[o + 2] = 255 * (teal[2] + (slate[2] - teal[2]) * t);
        im.data[o + 3] = 255 * Math.min(0.92, 0.35 + 1.6 * Math.sqrt(d));
      }
    }
    wctx.putImageData(im, 0, 0);
  }

  // ---- state ----
  let garden = null;
  let plants = [];
  let season = 1;
  let levels = null;
  let marks = [];
  let split = null;
  let pose = 'capture';
  let s = 1;
  let ox = 0;
  let oy = 0;
  let dpr = 1;

  function frame() {
    const phone = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
      && Math.min(screen.width, screen.height) < 820;
    dpr = Math.min(window.devicePixelRatio || 1, phone ? 1.5 : 2);
    const cw = Math.max(1, canvas.clientWidth || canvas.width);
    const chh = Math.max(1, canvas.clientHeight || canvas.height);
    if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(chh * dpr)) {
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(chh * dpr);
    }
    let bx = 0;
    let by = 0;
    let bw = W;
    let bh = D;
    if (pose === 'plants' && garden) {
      const r = Math.max(garden.lenM, garden.widM) / 2 + 1;
      bx = garden.cx - r; by = garden.cy - r; bw = bh = 2 * r;
    }
    const f = FIT[pose] || 0.92;
    s = Math.min((cw * f) / bw, (chh * f) / bh);
    ox = cw / 2 - (bx + bw / 2) * s;
    oy = chh / 2 - (D - (by + bh / 2)) * s;
  }
  const sx = (x) => ox + x * s;
  const sy = (y) => oy + (D - y) * s;

  function drawGarden() {
    if (!garden) return;
    ctx.save();
    ctx.translate(sx(garden.cx), sy(garden.cy));
    ctx.rotate(-(garden.rot || 0));
    ctx.beginPath();
    ctx.ellipse(0, 0, ((garden.lenM / 2) + 0.25) * s, ((garden.widM / 2) + 0.25) * s, 0, 0, Math.PI * 2);
    ctx.strokeStyle = PALETTE.fern;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = Math.max(2, 0.25 * s);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.ellipse(0, 0, (garden.lenM / 2) * s, (garden.widM / 2) * s, 0, 0, Math.PI * 2);
    ctx.fillStyle = PALETTE.clay;
    ctx.fill();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = PALETTE.asphalt;
    ctx.fill();
    ctx.restore();
  }
  function drawPlants() {
    const k = 0.3 + 0.7 * Math.min(1, Math.max(0, season));
    for (const p of plants) {
      ctx.beginPath();
      ctx.arc(sx(p.x), sy(p.y), Math.max(2, p.r * k * s), 0, Math.PI * 2);
      const form = formOf(p);
      ctx.fillStyle = form === 'shrub' || form === 'tree' ? PALETTE.moss : PALETTE.fern;
      ctx.globalAlpha = 0.9;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1;
      ctx.strokeStyle = PALETTE.slate700;
      ctx.stroke();
    }
  }
  function drawContours() {
    if (!levels) return;
    ctx.strokeStyle = PALETTE.teal;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const l of levels) {
      const g = l.segs;
      for (let i = 0; i < g.length; i += 4) {
        ctx.moveTo(sx(g[i]), sy(g[i + 1]));
        ctx.lineTo(sx(g[i + 2]), sy(g[i + 3]));
      }
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  function drawMarks() {
    for (const m of marks) {
      const pts = m.pts || [];
      if (!pts.length) continue;
      ctx.beginPath();
      if (m.kind === 'downspout' || m.kind === 'outlet') {
        for (const [x, y] of pts) {
          ctx.moveTo(sx(x) + 6, sy(y));
          ctx.arc(sx(x), sy(y), 6, 0, Math.PI * 2);
        }
        ctx.lineWidth = 3;
        ctx.strokeStyle = m.kind === 'downspout' ? PALETTE.marigold : PALETTE.teal;
        ctx.stroke();
        continue;
      }
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(sx(x), sy(y)) : ctx.moveTo(sx(x), sy(y))));
      if (m.kind === 'septic') ctx.closePath();
      ctx.lineWidth = m.kind === 'wall' ? 5 : 2;
      ctx.strokeStyle = { wall: PALETTE.slate700, septic: PALETTE.clay, scale: PALETTE.paper }[m.kind] || PALETTE.paper;
      ctx.stroke();
    }
  }

  function drawScene(before) {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(base, sx(0), sy(D), W * s, D * s);
    if (!before) drawGarden();
    ctx.drawImage(before && haveBefore ? waterBefore : waterNow, sx(0), sy(D), W * s, D * s);
    drawContours();
    if (!before) drawPlants();
    drawMarks();
  }

  function draw() {
    frame();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cw = canvas.width / dpr;
    const chh = canvas.height / dpr;
    ctx.fillStyle = PALETTE.slate900;
    ctx.fillRect(0, 0, cw, chh);
    if (split === null) {
      drawScene(false);
      return;
    }
    const x = split * cw;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, x, chh); ctx.clip();
    drawScene(true);
    ctx.restore();
    ctx.save();
    ctx.beginPath(); ctx.rect(x, 0, cw - x, chh); ctx.clip();
    drawScene(false);
    ctx.restore();
    ctx.fillStyle = PALETTE.paper;
    ctx.fillRect(x - 1, 0, 2, chh);
  }

  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => draw()) : null;
  if (ro) ro.observe(canvas);
  draw();

  return {
    kind: 'static',
    canvas,
    setWater(depth) {
      if (depth) paintWater(waterNow, depth);
      draw();
    },
    setGarden(g, p = [], { season: se = 1 } = {}) {
      garden = g || null;
      plants = garden ? p || [] : [];
      season = se;
      draw();
    },
    setContours(lv) { levels = lv || null; draw(); },
    setMarks(m) { marks = m || []; draw(); },
    cameraTo(name) { pose = name; draw(); },
    setSplit(x01, otherDepth) {
      if (otherDepth) { paintWater(waterBefore, otherDepth); haveBefore = true; }
      split = x01 === null || x01 === undefined ? null : Math.min(1, Math.max(0, x01));
      draw();
    },
    pick(clientX, clientY) {
      const r = canvas.getBoundingClientRect();
      const x = (clientX - r.left - ox) / s;
      const y = D - (clientY - r.top - oy) / s;
      if (!(x >= 0 && x <= W && y >= 0 && y <= D)) return null;
      return [x, y];
    },
    /** Ground metres -> client px (same contract as the WebGL scene's project). */
    project(x, y) {
      const r = canvas.getBoundingClientRect();
      return [r.left + sx(x), r.top + sy(y)];
    },
    fps() { return 60; },
    resize() { draw(); },
    destroy() {
      if (ro) ro.disconnect();
      base.width = waterNow.width = waterBefore.width = 0;
    },
  };
}
