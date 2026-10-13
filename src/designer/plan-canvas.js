/**
 * The one-page plan: an A4 sheet at 300 dpi (2480 x 3508 px) drawn on a
 * canvas, saved as PNG and wrapped as a PDF.
 *
 * WHY a canvas and not HTML-to-PDF: the plan must be built offline on the
 * phone with no library (constraints: runtime deps are only three and ORT),
 * and one bitmap looks the same everywhere it is printed. The look follows
 * art-src/gen/comp-plan.png: paper, a serif title, a top-down drawing with
 * dimensions, the plant list, soil mix, build steps and a boxed safety note.
 *
 * Ground frame (heightfield.js): x right, y away from the camera. The drawing
 * puts "photo up" (away from the camera) at the top of the page.
 */

import { niceInterval, gardenDims, fmtNum, fmtL, stormPhrase } from './model.js';
import { contours } from '../depth/contours.js';
import { BERM_WIDTH_M } from '../garden/constraints.js';
import { PALETTE } from '../render/palette.js';

export const PLAN_W = 2480;
export const PLAN_H = 3508;
export const SAFETY = 'Call before you dig: BC 1 Call (bc1c.ca) in BC, Ontario One Call (ontarioonecall.ca) in Ontario, or your local service. Keep it at least 3 m from foundations and away from septic fields. Check your local bylaws. This plan is guidance, not engineering.';

const C = PALETTE; // the tokens, mirrored 1:1 (src/render/palette.js)
const SERIF = '"Young Serif", Georgia, serif';
const SANS = '"Atkinson Hyperlegible Next", system-ui, sans-serif';
const M = 150;
/** Plant table height between its header (y 2068) and the "Build steps" title. */
const TABLE_H = 650;
const STEPS_Y = 2790;

/** Six build steps; the soil line depends on clay (WSU: never add sand to clay). */
export function buildSteps(d) {
  const dig = Math.round((d.depthM + 0.3) * 100);
  return [
    ['Call, then mark it out', 'Call before you dig. Mark the outline with a hose or flour.'],
    ['Dig the basin', `Dig about ${dig} cm down: ${Math.round(d.depthM * 100)} cm of pond plus 30 cm for soil mix. Level the floor; slope the sides gently.`],
    ['Build the berm', `Heap the dug soil on the downhill side ${d.bermM > 0.005 ? `${Math.round(d.bermM * 100)} cm` : 'a little'} above the rim, 60 cm wide, with a rock-lined overflow notch.`],
    ['Bring the water', 'Extend the downspout at least 2 m from the wall with a pipe or a shallow swale into the garden.'],
    ['Fill and plant', 'Fill with the soil mix. Wet-zone plants in the middle, edge plants on the rim and berm.'],
    ['Mulch and water', 'Spread 5–8 cm of shredded wood mulch. Water weekly through the first summer.'],
  ];
}

/** Soil mix lines (WSU 2013 pp. 33-36, 50; docs/research/sizing.md). */
export function soilMix(soil) {
  return soil === 'clay'
    ? ['Mix 65% of your own soil with 35% compost.', 'Don’t add sand to clay: it sets like concrete.']
    : ['Mix about 60% screened sand with 40% compost.', 'Or mix 65% of your own soil with 35% compost.'];
}

/**
 * A painted cut-out is mostly transparent just inside its edges; a labelled
 * placeholder card (art-src/MISSING.md) is opaque all round that ring, so it
 * gets the plain plant symbol instead of a grey card on the plan.
 */
function isCutout(img) {
  if (!img || !img.naturalWidth) return false;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, 16, 16);
    const px = g.getImageData(0, 0, 16, 16).data;
    let ring = 0;
    let opaque = 0;
    for (let y = 2; y <= 13; y++) {
      for (let x = 2; x <= 13; x++) {
        if (x !== 2 && x !== 13 && y !== 2 && y !== 13) continue;
        ring++;
        if (px[(y * 16 + x) * 4 + 3] > 200) opaque++;
      }
    }
    return opaque / ring < 0.7;
  } catch {
    return false;
  }
}

function loadImg(src) {
  return new Promise((resolve) => {
    const i = new Image();
    i.decoding = 'async';
    i.onload = () => resolve(i);
    i.onerror = () => resolve(null);
    i.src = src;
  });
}

async function ensureFonts() {
  if (!document.fonts) return;
  await Promise.all([
    document.fonts.load(`400 100px ${SERIF}`), document.fonts.load(`400 40px ${SANS}`),
    document.fonts.load(`700 40px ${SANS}`), document.fonts.load(`italic 400 40px ${SANS}`),
  ]).catch(() => {});
}

function ellipsePath(g, ctx, cx, cy, rx, ry, rot) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, Math.max(0.5, rx), Math.max(0.5, ry), rot, 0, Math.PI * 2);
}

/** Clip the grid rectangle to the house side of the wall line -> polygon in ground metres. */
function houseRegion(wall, yardCentroid, W, D) {
  const [a, b] = wall;
  const side = (p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  const yardSide = Math.sign(side(yardCentroid)) || 1;
  const keep = (p) => side(p) * yardSide <= 0;
  const rect = [[0, 0], [W, 0], [W, D], [0, D]];
  const out = [];
  for (let i = 0; i < rect.length; i++) {
    const p = rect[i];
    const q = rect[(i + 1) % rect.length];
    const kp = keep(p);
    const kq = keep(q);
    if (kp) out.push(p);
    if (kp !== kq) {
      const sp = side(p);
      const sq = side(q);
      const t = sp / (sp - sq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

function text(ctx, s, x, y, { font, color = C.slate900, align = 'left', base = 'alphabetic', track = 0 } = {}) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = base;
  if (track && 'letterSpacing' in ctx) ctx.letterSpacing = `${track}px`;
  ctx.fillText(s, x, y);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

/** Word-wrap s to maxW px in the given font. */
function wrapPx(ctx, s, maxW, font) {
  ctx.font = font;
  const out = [];
  let line = '';
  for (const w of s.split(/\s+/)) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t;
  }
  if (line) out.push(line);
  return out;
}

function para(ctx, s, x, y, maxW, lineH, font, color = C.slate900) {
  const lines = wrapPx(ctx, s, maxW, font);
  lines.forEach((l, i) => text(ctx, l, x, y + i * lineH, { font, color }));
  return y + lines.length * lineH;
}

function arrow(ctx, x0, y0, x1, y1, color, w = 6, head = 26) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  const a = Math.atan2(y1 - y0, x1 - x0);
  ctx.beginPath();
  ctx.moveTo(x1 + Math.cos(a) * 4, y1 + Math.sin(a) * 4);
  ctx.lineTo(x1 - Math.cos(a - 0.45) * head, y1 - Math.sin(a - 0.45) * head);
  ctx.lineTo(x1 - Math.cos(a + 0.45) * head, y1 - Math.sin(a + 0.45) * head);
  ctx.closePath();
  ctx.fill();
}

function dimLine(ctx, x0, y0, x1, y1, label) {
  ctx.strokeStyle = C.slate900;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  const a = Math.atan2(y1 - y0, x1 - x0);
  const nx = -Math.sin(a) * 16;
  const ny = Math.cos(a) * 16;
  for (const [x, y] of [[x0, y0], [x1, y1]]) {
    ctx.beginPath();
    ctx.moveTo(x - nx, y - ny);
    ctx.lineTo(x + nx, y + ny);
    ctx.stroke();
  }
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  ctx.save();
  ctx.translate(mx, my);
  let r = a;
  if (r > Math.PI / 2) r -= Math.PI;
  if (r < -Math.PI / 2) r += Math.PI;
  ctx.rotate(r);
  ctx.font = `700 40px ${SANS}`;
  const w = ctx.measureText(label).width + 28;
  ctx.fillStyle = C.paper;
  ctx.fillRect(-w / 2, -28, w, 56);
  text(ctx, label, 0, 0, { font: `700 40px ${SANS}`, align: 'center', base: 'middle' });
  ctx.restore();
}

/**
 * Draw the plan. d: {
 *   date, placeLine, terrain, yard, wall, house?, spout, inlet, outlet, septic,
 *   garden, plants (placed), rows (plantRows), soil, storm {label,totalMm},
 *   capturedL, outBeforeL, outAfterL, drainH, areaM2, costTotal, sources [string]
 * }
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function drawPlan(d, canvas = document.createElement('canvas')) {
  canvas.width = PLAN_W;
  canvas.height = PLAN_H;
  const ctx = canvas.getContext('2d');
  const ids = [...new Set(d.plants.map((p) => p.id))];
  const [paperTex, ...imgs] = await Promise.all([loadImg('/art/tex-paper-light.webp'), ...ids.map((id) => loadImg(`/art/plants/${id}.webp`))]);
  // only real cut-outs (transparent corners); a labelled placeholder gets the plain symbol
  const IMG = new Map(ids.map((id, i) => [id, isCutout(imgs[i]) ? imgs[i] : null]));
  await ensureFonts();

  // ---- paper ----
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, PLAN_W, PLAN_H);
  if (paperTex) {
    ctx.globalAlpha = 0.5;
    const pat = ctx.createPattern(paperTex, 'repeat');
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, PLAN_W, PLAN_H);
    ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = C.slate700;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 3;
  ctx.strokeRect(60, 60, PLAN_W - 120, PLAN_H - 120);
  ctx.globalAlpha = 1;

  // ---- header ----
  text(ctx, 'Your rain garden', M, 300, { font: `400 156px ${SERIF}` });
  text(ctx, `${d.date}  ·  ${d.placeLine}`, M + 4, 384, { font: `400 44px ${SANS}`, color: C.slate700 });
  ['NATIVE PLANTS', 'CLEANER WATER', 'HEALTHIER HABITAT'].forEach((s, i) => text(ctx, s, PLAN_W - M, 196 + i * 50, { font: `700 30px ${SANS}`, color: C.slate700, align: 'right', track: 4 }));
  ctx.fillStyle = C.slate700;
  ctx.globalAlpha = 0.4;
  ctx.fillRect(M, 432, PLAN_W - 2 * M, 3);
  ctx.globalAlpha = 1;

  // ---- top-down drawing ----
  const t = d.terrain;
  const W = t.nx * t.cell;
  const D = t.ny * t.cell;
  const box = { x: M, y: 470, w: PLAN_W - 2 * M, h: 1240 };
  const s = Math.min(box.w / W, box.h / D) * 0.9;
  const ox = box.x + (box.w - W * s) / 2;
  const oy = box.y + (box.h - D * s) / 2;
  const P = (x, y) => [ox + x * s, oy + (D - y) * s];
  const poly = (pts) => {
    ctx.beginPath();
    pts.forEach((p, i) => { const q = P(p[0], p[1]); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); });
    ctx.closePath();
  };
  ctx.save();
  ctx.beginPath();
  ctx.rect(ox, oy, W * s, D * s);
  ctx.clip();
  // ground outside the yard: pale
  ctx.fillStyle = C.fern;
  ctx.globalAlpha = 0.1;
  ctx.fillRect(ox, oy, W * s, D * s);
  // yard lawn
  ctx.globalAlpha = 0.32;
  poly(d.yard);
  ctx.fill();
  ctx.globalAlpha = 1;
  // contours
  const z = t.z;
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of z) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const lv = contours(t, niceInterval(hi - lo));
  ctx.strokeStyle = C.teal;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (const l of lv) {
    for (let i = 0; i < l.segs.length; i += 4) {
      const a = P(l.segs[i], l.segs[i + 1]);
      const b = P(l.segs[i + 2], l.segs[i + 3]);
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
    }
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  // house
  const cen = d.yard.reduce((a, p) => [a[0] + p[0] / d.yard.length, a[1] + p[1] / d.yard.length], [0, 0]);
  const hr = houseRegion(d.wall, cen, W, D);
  if (hr.length >= 3) {
    poly(hr);
    ctx.fillStyle = C.slate700;
    ctx.globalAlpha = 0.85;
    ctx.fill();
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = C.paper;
    ctx.lineWidth = 2;
    ctx.save();
    ctx.clip();
    for (let k = -PLAN_H; k < PLAN_W + PLAN_H; k += 34) { ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(k + PLAN_H, PLAN_H); ctx.stroke(); }
    ctx.restore();
    ctx.globalAlpha = 1;
  }
  // yard outline
  poly(d.yard);
  ctx.strokeStyle = C.moss;
  ctx.lineWidth = 7;
  ctx.setLineDash([]);
  ctx.stroke();
  if (d.septic) {
    poly(d.septic);
    ctx.strokeStyle = C.clay;
    ctx.setLineDash([18, 12]);
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // wall line
  const w0 = P(...d.wall[0]);
  const w1 = P(...d.wall[1]);
  ctx.strokeStyle = C.asphalt;
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(w0[0], w0[1]);
  ctx.lineTo(w1[0], w1[1]);
  ctx.stroke();

  // garden
  const g = d.garden;
  const gc = P(g.cx, g.cy);
  const rot = -(g.rot || 0);
  const ringFill = (k, color, alpha, inflate = 0) => {
    ellipsePath(g, ctx, gc[0], gc[1], (g.lenM / 2 * k + inflate) * s, (g.widM / 2 * k + inflate) * s, rot);
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    ctx.fill();
    ctx.globalAlpha = 1;
  };
  ringFill(1, C.clay, 0.55, BERM_WIDTH_M);
  ringFill(1, C.moss, 0.55);
  ringFill(0.8, C.fern, 0.75);
  ringFill(0.45, C.teal, 0.6);
  ellipsePath(g, ctx, gc[0], gc[1], (g.lenM / 2) * s, (g.widM / 2) * s, rot);
  ctx.strokeStyle = C.slate900;
  ctx.lineWidth = 3;
  ctx.stroke();
  // plants: a canopy disc at mature spread, the painted cut-out inside it
  const sorted = [...d.plants].sort((a, b) => b.y - a.y);
  for (const p of sorted) {
    const q = P(p.x, p.y);
    const r = Math.max(12, p.r * s);
    ctx.fillStyle = p.zone === 'wet' ? C.teal : p.zone === 'middle' ? C.fern : C.moss;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.arc(q[0], q[1], r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = C.slate900;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 1;
    const im = IMG.get(p.id);
    if (im) {
      const k = (1.7 * r) / Math.max(im.naturalWidth, im.naturalHeight);
      ctx.drawImage(im, q[0] - (im.naturalWidth * k) / 2, q[1] - (im.naturalHeight * k) / 2, im.naturalWidth * k, im.naturalHeight * k);
    }
  }
  // downspout, extension, outlet
  const sp = P(...d.spout);
  const inl = P(...d.inlet);
  ctx.setLineDash([22, 14]);
  ctx.strokeStyle = C.slate900;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(sp[0], sp[1]);
  ctx.lineTo(inl[0], inl[1]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = C.marigold;
  ctx.strokeStyle = C.slate900;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(sp[0], sp[1], 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (d.outlet) {
    const o = P(...d.outlet);
    arrow(ctx, o[0] - 70, o[1], o[0] + 10, o[1], C.teal, 10, 34);
  }
  ctx.restore();

  // labels (outside the clip so they can overhang)
  const label = (s0, x, y, color = C.slate900, align = 'left') => {
    ctx.font = `700 34px ${SANS}`;
    const w = ctx.measureText(s0).width;
    const x0 = align === 'right' ? x - w - 14 : align === 'center' ? x - w / 2 - 14 : x - 14;
    ctx.fillStyle = C.paper;
    ctx.globalAlpha = 0.86;
    ctx.fillRect(x0, y - 34, w + 28, 48);
    ctx.globalAlpha = 1;
    text(ctx, s0, x, y, { font: `700 34px ${SANS}`, color, align });
  };
  label('Downspout (extend it 2 m)', sp[0] + 40, sp[1] + 50);
  if (d.outlet) { const o = P(...d.outlet); label('Water leaves', Math.min(o[0], PLAN_W - M - 10), o[1] - 40, C.slate900, 'right'); }
  if (hr.length >= 3) {
    const hc = hr.reduce((a, p) => [a[0] + p[0] / hr.length, a[1] + p[1] / hr.length], [0, 0]);
    const q = P(...hc);
    label('House', Math.max(box.x + 90, Math.min(box.x + box.w - 90, q[0])), q[1], C.slate900, 'center');
  }

  // dimensions
  const dims = gardenDims(g, d.wall);
  const ca = Math.cos(g.rot || 0);
  const sa = Math.sin(g.rot || 0);
  const off = g.widM / 2 + BERM_WIDTH_M + 0.45;
  const L0 = P(g.cx - (ca * g.lenM) / 2 - sa * off, g.cy - (sa * g.lenM) / 2 + ca * off);
  const L1 = P(g.cx + (ca * g.lenM) / 2 - sa * off, g.cy + (sa * g.lenM) / 2 + ca * off);
  dimLine(ctx, L0[0], L0[1], L1[0], L1[1], `${dims.lengthM.toFixed(1)} m`);
  const offW = g.lenM / 2 + BERM_WIDTH_M + 0.45;
  const W0 = P(g.cx + ca * offW + (sa * g.widM) / 2, g.cy + sa * offW - (ca * g.widM) / 2);
  const W1 = P(g.cx + ca * offW - (sa * g.widM) / 2, g.cy + sa * offW + (ca * g.widM) / 2);
  dimLine(ctx, W0[0], W0[1], W1[0], W1[1], `${dims.widthM.toFixed(1)} m`);
  // gap to the house: from the nearest garden edge point to the wall
  if (dims.houseM !== null) {
    let best = null;
    for (let k = 0; k < 144; k++) {
      const th = (k / 144) * Math.PI * 2;
      const lx = (Math.cos(th) * g.lenM) / 2;
      const ly = (Math.sin(th) * g.widM) / 2;
      const ex = g.cx + lx * ca - ly * sa;
      const ey = g.cy + lx * sa + ly * ca;
      const [a, b] = d.wall;
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const tt = ((ex - a[0]) * dx + (ey - a[1]) * dy) / (dx * dx + dy * dy);
      const fx = a[0] + tt * dx;
      const fy = a[1] + tt * dy;
      const dd = Math.hypot(ex - fx, ey - fy);
      if (!best || dd < best.d) best = { d: dd, e: [ex, ey], f: [fx, fy] };
    }
    const e = P(...best.e);
    const f = P(...best.f);
    ctx.setLineDash([12, 10]);
    dimLine(ctx, f[0], f[1], e[0], e[1], `${dims.houseM.toFixed(1)} m to the house`);
    ctx.setLineDash([]);
  }
  // photo-up arrow and scale bar
  const ax = box.x + box.w - 60;
  arrow(ctx, ax, box.y + 150, ax, box.y + 40, C.slate900, 6, 26);
  text(ctx, 'Photo up', ax, box.y + 200, { font: `700 30px ${SANS}`, align: 'center' });
  const bar = Math.max(1, Math.round(3 / Math.max(1, Math.round(W / 6))) * Math.max(1, Math.round(W / 6)));
  const bx = box.x + 20;
  const by = box.y + box.h - 30;
  ctx.fillStyle = C.slate900;
  ctx.fillRect(bx, by, bar * s, 10);
  for (let k = 0; k <= bar; k++) ctx.fillRect(bx + k * s - 2, by - 14, 4, 24);
  text(ctx, `${bar} m`, bx + bar * s + 18, by + 12, { font: `700 30px ${SANS}` });

  // ---- facts ----
  let y = 1780;
  text(ctx, `${fmtNum(d.areaM2, 1)} m²  ·  ${dims.lengthM.toFixed(1)} × ${dims.widthM.toFixed(1)} m  ·  ${Math.round(dims.depthM * 100)} cm deep  ·  berm ${Math.round(dims.bermM * 100)} cm  ·  ${dims.houseM === null ? '' : `${dims.houseM.toFixed(1)} m from the house`}`, M, y, { font: `700 48px ${SANS}` });
  y += 66;
  para(ctx, `In the ${stormPhrase(d.storm.label, d.storm.totalMm)} it catches about ${fmtL(d.capturedL)}; ${fmtL(d.outAfterL)} still leaves the yard (${fmtL(d.outBeforeL)} before). The pond drains in about ${Math.max(1, Math.round(d.drainH))} h. About $${fmtNum(d.costTotal)} to build yourself.`, M, y, PLAN_W - 2 * M, 50, `400 38px ${SANS}`, C.slate700);

  // ---- plant list ----
  y = 1990;
  const colR = 1380;
  text(ctx, 'Plant list', M, y, { font: `400 68px ${SERIF}` });
  y += 60;
  const heads = [['Plant', M + 96], ['Zone', 870], ['Qty', 1060], ['Spacing', 1150]];
  heads.forEach(([h, x]) => text(ctx, h, x, y, { font: `700 28px ${SANS}`, color: C.slate700 }));
  y += 18;
  // every species fits above "Build steps" (at most 15: 3 zones x 5): rows shrink, never overflow
  const rows = d.rows;
  const rowH = Math.min(64, Math.floor(TABLE_H / Math.max(1, rows.length)));
  const f1 = Math.round(rowH * 0.48);
  const f2 = Math.round(rowH * 0.39);
  for (const r of rows) {
    ctx.fillStyle = C.slate700;
    ctx.globalAlpha = 0.25;
    ctx.fillRect(M, y, colR - M - 60, 2);
    ctx.globalAlpha = 1;
    const im = IMG.get(r.id);
    if (im && im.naturalWidth) {
      const k = (rowH - 8) / Math.max(im.naturalWidth, im.naturalHeight);
      ctx.drawImage(im, M + 4, y + 4, im.naturalWidth * k, im.naturalHeight * k);
    } else {
      ctx.fillStyle = r.zone === 'wet' ? C.teal : r.zone === 'middle' ? C.fern : C.moss;
      ctx.beginPath();
      ctx.arc(M + 34, y + rowH / 2, Math.min(20, rowH * 0.32), 0, Math.PI * 2);
      ctx.fill();
    }
    text(ctx, r.common, M + 96, y + rowH * 0.47, { font: `700 ${f1}px ${SANS}` });
    text(ctx, r.latin, M + 96, y + rowH * 0.89, { font: `italic 400 ${f2}px ${SANS}`, color: C.slate700 });
    const mid = y + rowH * 0.66;
    text(ctx, r.zone[0].toUpperCase() + r.zone.slice(1), 870, mid, { font: `400 ${f1}px ${SANS}` });
    text(ctx, String(r.qty), 1060, mid, { font: `700 ${f1}px ${SANS}` });
    text(ctx, r.spacingM < 1 ? `${Math.round(r.spacingM * 100)} cm` : `${r.spacingM.toFixed(1)} m`, 1150, mid, { font: `400 ${f1}px ${SANS}` });
    y += rowH;
  }

  // ---- soil mix (cross-section) ----
  let ry = 1990;
  text(ctx, 'Soil mix', colR, ry, { font: `400 68px ${SERIF}` });
  ctx.font = `400 68px ${SERIF}`;
  text(ctx, '(side view)', colR + ctx.measureText('Soil mix').width + 20, ry, { font: `400 34px ${SANS}`, color: C.slate700 });
  ry += 50;
  const sx = colR;
  const sw = 520;
  const layer = (h, color, alpha, lab) => {
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    ctx.fillRect(sx, ry, sw, h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = C.slate900;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx + sw + 10, ry + h / 2);
    ctx.lineTo(sx + sw + 48, ry + h / 2);
    ctx.stroke();
    text(ctx, lab, sx + sw + 60, ry + h / 2 + 11, { font: `700 30px ${SANS}` });
    ry += h;
  };
  layer(40, C.clay, 0.9, '5–8 cm mulch');
  layer(150, C.asphalt, 0.75, '30 cm soil mix');
  layer(120, C.clay, 0.45, 'your soil');
  ry += 44;
  for (const l of soilMix(d.soil)) ry = para(ctx, l, colR, ry, PLAN_W - M - colR, 42, `400 32px ${SANS}`);

  // ---- build steps ----
  y = STEPS_Y;
  text(ctx, 'Build steps', M, y, { font: `400 68px ${SERIF}` });
  y += 40;
  const steps = buildSteps(dims);
  const cw = (PLAN_W - 2 * M) / 3;
  steps.forEach(([h, body], i) => {
    const cx = M + (i % 3) * cw;
    const cy = y + Math.floor(i / 3) * 200;
    ctx.fillStyle = C.moss;
    ctx.beginPath();
    ctx.arc(cx + 30, cy + 40, 30, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, String(i + 1), cx + 30, cy + 41, { font: `700 34px ${SANS}`, color: C.paper, align: 'center', base: 'middle' });
    text(ctx, h, cx + 78, cy + 52, { font: `700 36px ${SANS}` });
    para(ctx, body, cx + 78, cy + 98, cw - 110, 38, `400 28px ${SANS}`, C.slate700);
  });

  // ---- safety box ----
  y = 3222;
  const bh = 130;
  ctx.strokeStyle = C.marigold;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(M, y, PLAN_W - 2 * M, bh, 24) : ctx.rect(M, y, PLAN_W - 2 * M, bh);
  ctx.stroke();
  para(ctx, SAFETY, M + 40, y + 58, PLAN_W - 2 * M - 80, 42, `700 32px ${SANS}`);

  // ---- sources: every line, inside the border (bottom at PLAN_H - 60), below the safety box ----
  let srcFont = 22;
  let srcLines = wrapPx(ctx, d.sources.join('  ·  '), PLAN_W - 2 * M, `400 ${srcFont}px ${SANS}`);
  if (srcLines.length > 2) { srcFont = 19; srcLines = wrapPx(ctx, d.sources.join('  ·  '), PLAN_W - 2 * M, `400 ${srcFont}px ${SANS}`); }
  const srcLead = srcFont + 7;
  const srcY = Math.max(3222 + 130 + srcFont + 6, PLAN_H - 60 - 14 - (srcLines.length - 1) * srcLead);
  srcLines.forEach((l, i) => text(ctx, l, M, srcY + i * srcLead, { font: `400 ${srcFont}px ${SANS}`, color: C.slate700 }));
  return canvas;
}
