#!/usr/bin/env node
/**
 * Measures WCAG contrast of the story's copy against the painted art behind it.
 *
 * Why: the text sits on illustrations, not flat colour, so contrast can only
 * be checked by rendering. For each scene at rest the frame is shot twice,
 * with the text and with its colour set transparent (backgrounds and scrims
 * stay). Pixels that differ are the glyphs; their rendered colour (90th
 * percentile luminance, so anti-aliased edges don't drag it down) is compared
 * with the 95th-percentile luminance of the same box without text. So text
 * dimmed by anything painted over it (a scrim, a filter) fails, which an
 * assumed text colour would miss. Headlines are large text (3:1); body,
 * links and labels need 4.5:1. Run with a dev server up:
 *   node scripts/check-story-contrast.mjs http://localhost:5173
 */
import { chromium } from 'playwright';
import sharp from 'sharp';

const base = process.argv[2] || 'http://localhost:5173';
const lum = (r, g, b) => {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const browser = await chromium.launch({ headless: false, args: ['--use-angle=d3d11', '--enable-gpu'] });
let fail = 0;
for (const [w, h] of [[1440, 900], [1920, 1080], [390, 844]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(base + '/?preloader=0');
  // INJECT_CSS lets a regression be reproduced on purpose (e.g. the labels under the scrim).
  if (process.env.INJECT_CSS) await page.addStyleTag({ content: process.env.INJECT_CSS });
  await page.waitForTimeout(1500);
  const rows = [];
  for (let i = 0; i < 6; i++) {
    await page.evaluate((i) => { const s = document.getElementById('story'); scrollTo(0, s.offsetTop + (i ? i + 0.3 : 0) * s.offsetHeight / 6); }, i);
    await page.waitForTimeout(2200);
    const boxes = await page.evaluate(() => {
      // Rain moves between the two shots; hide it so only the text differs.
      document.querySelector('.story-rain').style.visibility = 'hidden';
      const scene = document.querySelector('.story-scene.is-visible');
      const els = [...scene.querySelectorAll('.story-line-in, .story-body, .story-demo, .sl-label-text')];
      const r = els.map((e) => { const b = e.getBoundingClientRect(); return { k: e.className.split(' ')[0], x: b.x, y: b.y, w: b.width, h: b.height }; });
      return r;
    });
    const bufText = await page.screenshot();
    await page.evaluate(() => {
      for (const e of document.querySelectorAll('.story-scene.is-visible :is(.story-line-in, .story-body, .story-demo, .sl-label-text)')) { e.style.color = 'transparent'; e.style.textDecorationColor = 'transparent'; }
    });
    const bufBare = await page.screenshot();
    await page.evaluate(() => { for (const e of document.querySelectorAll('.story-line-in, .story-body, .story-demo, .sl-label-text')) { e.style.color = ''; e.style.textDecorationColor = ''; } });
    const bare = await sharp(bufBare).raw().toBuffer({ resolveWithObject: true });
    const text = await sharp(bufText).raw().toBuffer({ resolveWithObject: true });
    const { info } = bare;
    for (const b of boxes) {
      if (!b.w) continue;
      const bg = [], glyph = [];
      for (let y = Math.max(0, b.y | 0); y < Math.min(info.height, b.y + b.h); y++) {
        for (let x = Math.max(0, b.x | 0); x < Math.min(info.width, b.x + b.w); x++) {
          const o = (y * info.width + x) * info.channels;
          const lb = lum(bare.data[o], bare.data[o + 1], bare.data[o + 2]);
          const lt = lum(text.data[o], text.data[o + 1], text.data[o + 2]);
          bg.push(lb);
          if (Math.abs(lt - lb) > 0.08) glyph.push(lt);
        }
      }
      bg.sort((a, c) => a - c);
      glyph.sort((a, c) => a - c);
      const lText = glyph.length ? glyph[Math.floor(glyph.length * 0.9)] : 0;
      const lBg = bg[Math.floor(bg.length * 0.95)];
      const ratio = (Math.max(lText, lBg) + 0.05) / (Math.min(lText, lBg) + 0.05);
      const need = b.k === 'story-line-in' ? 3 : 4.5;
      if (ratio < need) fail++;
      rows.push(`${i + 1}:${b.k.replace('story-line-in', 'h').replace('story-', '').replace('sl-label-text', 'label')} ${ratio.toFixed(2)}${ratio < need ? ' FAIL' : ''}`);
    }
  }
  console.log(w, rows.join(' | '));
  await page.close();
}
await browser.close();
process.exit(fail ? 1 : 0);
