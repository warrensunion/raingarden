/**
 * Verify the yard renderer in a real Chromium: screenshots of every camera
 * pose at desktop and phone sizes, an fps measurement, zero console errors,
 * and the static fallback log line.
 *
 * WHY a script: the water has to be judged by eye and the fps measured on a
 * real GPU; this makes that repeatable. Usage: `node scripts/verify-yard.mjs
 * [--headed]`. Writes PNGs to docs/reports/render-shots/ and prints JSON.
 */

import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'docs/reports/render-shots');
mkdirSync(outDir, { recursive: true });
const headed = process.argv.includes('--headed');
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);

const server = await createServer({ root, logLevel: 'error', server: { port: 5199, strictPort: false } });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');

const browser = await chromium.launch({
  headless: !headed,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const POSES = ['capture', 'mark', 'storm', 'optimize', 'plants', 'compare', 'plan'];
const result = { gpu: null, errors: [], missingArt: 0, shots: [], fps: {}, staticLog: null };

function watch(page) {
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const url = m.location()?.url || '';
    if (/404/.test(m.text()) && /\/art\//.test(url)) { result.missingArt++; return; }
    result.errors.push(m.text());
  });
  page.on('pageerror', (e) => result.errors.push('pageerror: ' + e.message));
}

async function open(page, query) {
  await page.goto(`${base}/dev/yard.html${query}`);
  await page.waitForFunction(() => window.demo && window.demo.ready, null, { timeout: 120000 });
  await page.waitForTimeout(1500);
}

for (const [vw, vh, tag, dsf] of [[1440, 900, 'desktop', 1], [390, 844, 'phone', 3]]) {
  if (only && only !== tag) continue;
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dsf, isMobile: tag === 'phone', hasTouch: tag === 'phone' });
  const page = await ctx.newPage();
  watch(page);
  await open(page, '?t=17');
  if (!result.gpu) {
    result.gpu = await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
    });
  }
  for (const pose of POSES) {
    await page.evaluate((p) => window.demo.api.cameraTo(p, 0), pose);
    await page.waitForTimeout(700);
    const file = path.join(outDir, `${tag}-${pose}.png`);
    await page.screenshot({ path: file });
    result.shots.push(path.relative(root, file));
  }
  // before/after split
  await page.evaluate(() => { window.demo.api.cameraTo('compare', 0); window.demo.setSplit(0.5); });
  await page.waitForTimeout(700);
  let file = path.join(outDir, `${tag}-compare-split.png`);
  await page.screenshot({ path: file });
  result.shots.push(path.relative(root, file));
  await page.evaluate(() => { window.demo.setSplit(null); window.demo.setContours(true); window.demo.api.cameraTo('mark', 0); });
  await page.waitForTimeout(700);
  file = path.join(outDir, `${tag}-mark-contours.png`);
  await page.screenshot({ path: file });
  result.shots.push(path.relative(root, file));

  // fps: live storm, storm pose, 3 s of requestAnimationFrame
  await open(page, '');
  await page.evaluate(() => window.demo.api.cameraTo('storm', 0));
  await page.waitForTimeout(800);
  result.fps[tag] = await page.evaluate(() => new Promise((res) => {
    let n = 0;
    const t0 = performance.now();
    const f = (now) => {
      n++;
      if (now - t0 < 3000) requestAnimationFrame(f);
      else res({ raf: +(n / ((now - t0) / 1000)).toFixed(1), rolling: +window.demo.api.fps().toFixed(1) });
    };
    requestAnimationFrame(f);
  }));
  // a camera move mid-flight, to see the arc
  await page.evaluate(() => window.demo.api.cameraTo('plants', 1400));
  await page.waitForTimeout(600);
  file = path.join(outDir, `${tag}-move-midflight.png`);
  await page.screenshot({ path: file });
  result.shots.push(path.relative(root, file));
  // pick, setWater CPU cost, destroy
  result.pick = result.pick || {};
  result.pick[tag] = await page.evaluate(() => window.demo.api.pick(innerWidth / 2, innerHeight / 2));
  result.setWaterMs = result.setWaterMs || {};
  result.setWaterMs[tag] = await page.evaluate(() => {
    const d = new Float32Array(128 * 128).map((_, i) => (i % 7 === 0 ? 0.02 : 0));
    const t0 = performance.now();
    for (let i = 0; i < 50; i++) window.demo.api.setWater(d, { rainMmH: 10 });
    return +((performance.now() - t0) / 50).toFixed(2);
  });
  await page.evaluate(() => { window.demo.stopped = true; window.demo.api.destroy(); });
  await page.waitForTimeout(300);
  await ctx.close();
}

// uncapped fps (no vsync) as a headroom indicator for the GPU cost
if (!only) {
  const b2 = await chromium.launch({ headless: !headed, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  for (const [vw, vh, tag, dsf] of [[1440, 900, 'desktop', 1], [390, 844, 'phone', 3]]) {
    const ctx = await b2.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dsf, isMobile: tag === 'phone', hasTouch: tag === 'phone' });
    const page = await ctx.newPage();
    watch(page);
    await open(page, '');
    await page.evaluate(() => window.demo.api.cameraTo('storm', 0));
    await page.waitForTimeout(800);
    result.fps[tag + 'Uncapped'] = await page.evaluate(() => new Promise((res) => {
      let n = 0;
      const t0 = performance.now();
      const f = (now) => { n++; if (now - t0 < 3000) requestAnimationFrame(f); else res(+(n / ((now - t0) / 1000)).toFixed(1)); };
      requestAnimationFrame(f);
    }));
    await ctx.close();
  }
  await b2.close();
}

// no WebGL at all -> fallback logged
{
  const b3 = await chromium.launch({ headless: true, args: ['--disable-gpu', '--disable-webgl', '--disable-webgl2'] });
  const page = await b3.newPage();
  const logs = [];
  page.on('console', (m) => logs.push(m.text()));
  page.on('pageerror', (e) => result.errors.push('pageerror(noGL): ' + e.message));
  await open(page, '?t=17');
  result.noWebGLLog = logs.find((l) => l.startsWith('[raingarden] static fallback')) || null;
  await b3.close();
}

// static fallback
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  watch(page);
  const logs = [];
  page.on('console', (m) => logs.push(m.text()));
  await open(page, '?static=1&t=17');
  await page.evaluate(() => window.demo.api.cameraTo('plan', 0));
  await page.waitForTimeout(300);
  let file = path.join(outDir, 'static-plan.png');
  await page.screenshot({ path: file });
  result.shots.push(path.relative(root, file));
  await page.evaluate(() => { window.demo.api.cameraTo('compare', 0); window.demo.setSplit(0.5); });
  await page.waitForTimeout(300);
  file = path.join(outDir, 'static-compare-split.png');
  await page.screenshot({ path: file });
  result.shots.push(path.relative(root, file));
  result.staticLog = logs.find((l) => l.startsWith('[raingarden] static fallback')) || null;
  result.staticPick = await page.evaluate(() => window.demo.api.pick(innerWidth / 2, innerHeight / 2));
  await ctx.close();
}

await browser.close();
await server.close();
console.log(JSON.stringify(result, null, 2));
