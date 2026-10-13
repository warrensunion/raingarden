#!/usr/bin/env node
/**
 * Puts our shots next to the makemepulse recordings' key frames in
 * design-reference/compare/ - one sheet per width (1440, 1920), each row a
 * pair: theirs (left) / ours (right), same viewport, labelled.
 *
 * Why: the brief's bar is "match makemepulse's LEVEL of craft", and that is
 * judged by looking, side by side, at the same size - not from memory. Their
 * frames are reference only (design-reference/, never shipped); nothing of
 * theirs is traced or reused.
 *
 *   node scripts/compare-reference.mjs <our shots dir> [their frame numbers per width, e.g. 1440:05,12,20,31,44,58]
 */
import sharp from 'sharp';
import { readdirSync, mkdirSync, existsSync } from 'node:fs';

const ours = process.argv[2];
const pick = Object.fromEntries((process.argv.slice(3)).map((a) => { const [w, l] = a.split(':'); return [w, l.split(',')]; }));
const REF = 'design-reference/makemepulse';
const OUT = 'design-reference/compare';
mkdirSync(OUT, { recursive: true });

const OUR_FRAMES = ['00-preloader', '01-roof', '02-drive', '03-drain', '04-creek', '05-garden', '06-stream', '07-wipe', '08-how', 'demo-16-before', 'demo-19-designed', 'demo-22-compare'];

for (const w of ['1440', '1920']) {
  const theirsAll = readdirSync(REF).filter((f) => f.startsWith(`shot-${w}-`) && f.endsWith('.png')).sort();
  if (!theirsAll.length) continue;
  const chosen = pick[w]
    ? pick[w].map((n) => `shot-${w}-${n.padStart(2, '0')}.png`)
    : OUR_FRAMES.map((_, i) => theirsAll[Math.round((i / (OUR_FRAMES.length - 1)) * (theirsAll.length - 1))]);
  const colW = 960, colH = Math.round(colW * (w === '1440' ? 900 / 1440 : 1080 / 1920)), pad = 16, labelH = 40;
  const rows = [];
  for (let i = 0; i < OUR_FRAMES.length; i++) {
    const mine = `${ours}/${w}-${OUR_FRAMES[i]}.png`;
    const theirs = `${REF}/${chosen[i]}`;
    if (!existsSync(mine) || !existsSync(theirs)) continue;
    rows.push({ mine, theirs, label: OUR_FRAMES[i] });
  }
  const H = rows.length * (colH + labelH + pad) + pad;
  const W = colW * 2 + pad * 3;
  const comps = [];
  for (let r = 0; r < rows.length; r++) {
    const y = pad + r * (colH + labelH + pad);
    const label = (t, x) => ({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${colW}" height="${labelH}"><text x="0" y="28" font-family="sans-serif" font-size="22" fill="#ECE6DA">${t}</text></svg>`), left: x, top: y });
    comps.push(label(`makemepulse (reference) - ${rows[r].theirs.split('/').pop()}`, pad));
    comps.push(label(`Raingarden - ${rows[r].label}`, pad * 2 + colW));
    comps.push({ input: await sharp(rows[r].theirs).resize(colW, colH, { fit: 'cover' }).png().toBuffer(), left: pad, top: y + labelH });
    comps.push({ input: await sharp(rows[r].mine).resize(colW, colH, { fit: 'cover' }).png().toBuffer(), left: pad * 2 + colW, top: y + labelH });
  }
  await sharp({ create: { width: W, height: H, channels: 3, background: '#1b2229' } }).composite(comps).jpeg({ quality: 82 }).toFile(`${OUT}/compare-${w}.jpg`);
  console.log(`${OUT}/compare-${w}.jpg`, rows.length, 'pairs');
}
