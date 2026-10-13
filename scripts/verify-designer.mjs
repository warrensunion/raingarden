#!/usr/bin/env node
/**
 * Drives the designer's demo end to end in a real (headed, GPU) Chromium and
 * shoots every step: the designer brief's Verify list (both viewports,
 * downloads checked, console errors, storm-playback fps), plus a fake-camera
 * run through "Use my camera".
 *
 *   npx vite --port 5191 --strictPort        (another shell)
 *   node scripts/verify-designer.mjs [base] [outDir] [only: 1440|390|camera]
 *
 * The flow is driven through window.__raingarden (step, lastResult) and the
 * sheet's real buttons, never by calling internals.
 */
import { chromium } from 'playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';

const base = process.argv[2] || 'http://localhost:5191';
const out = process.argv[3] || 'docs/reports/designer-shots';
const only = process.argv[4];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GPU = ['--use-angle=d3d11', '--enable-gpu', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist'];
await mkdir(out, { recursive: true });
const results = {};

async function waitResult(page, step, timeout = 240000) {
  await page.waitForFunction((s) => window.__raingarden && window.__raingarden.lastResult && window.__raingarden.lastResult.step === s, step, { timeout, polling: 250 });
  return page.evaluate(() => {
    const r = { ...window.__raingarden.lastResult };
    for (const k of Object.keys(r)) if (typeof r[k] === 'object' && r[k] && !Array.isArray(r[k]) && k !== 'garden' && k !== 'cost' && k !== 'confidence') delete r[k];
    return r;
  });
}
async function waitStep(page, n, timeout = 60000) {
  await page.waitForFunction((n) => window.__raingarden && window.__raingarden.step === n, n, { timeout });
}
async function primary(page) {
  const b = page.locator('.dz-primary');
  await b.waitFor({ state: 'visible' });
  await page.waitForFunction(() => { const b = document.querySelector('.dz-primary'); return b && !b.disabled; }, null, { timeout: 240000 });
  await b.click();
}
async function shot(page, name) {
  await sleep(250);
  await page.screenshot({ path: `${out}/${name}.png` });
}

async function openSite(ctx, r, query = '') {
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') r.errors.push(m.text());
    if (m.text().includes('[raingarden]')) r.logs.push(m.text());
  });
  page.on('pageerror', (e) => r.errors.push(String(e)));
  page.on('response', (res) => { if (res.status() >= 400 && !res.url().endsWith('favicon.ico')) r.errors.push(`${res.status()} ${res.url()}`); });
  await page.goto(base + '/' + query, { waitUntil: 'load' });
  await page.waitForFunction(() => !document.documentElement.classList.contains('pl-on'), null, { timeout: 60000 }).catch(() => {});
  await sleep(1500);
  return page;
}

async function demoRun(vp) {
  const r = { errors: [], logs: [] };
  results[vp.name] = r;
  const browser = await chromium.launch({ headless: false, args: GPU });
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, isMobile: !!vp.mobile, hasTouch: !!vp.mobile, acceptDownloads: true,
    reducedMotion: vp.reduced ? 'reduce' : 'no-preference',
  });
  const page = await openSite(ctx, r, vp.query || '');
  const p = `${vp.name}`;
  await page.evaluate(() => document.querySelector('a[data-design="demo"]').click());
  await waitStep(page, 3, 60000);
  const t0 = Date.now();
  r.slope = await waitResult(page, 'slope', 600000);
  r.slopeMs = Date.now() - t0;
  await sleep(1800);
  await shot(page, `${p}-03-slope`);
  r.hscroll = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  await primary(page); await waitStep(page, 4); await sleep(1300); await shot(page, `${p}-04-soil`);
  await primary(page); await waitStep(page, 5);
  await page.waitForSelector('.dz-storm', { timeout: 60000 }); await sleep(1200); await shot(page, `${p}-05-storm`);
  r.storms = await page.evaluate(() => window.__raingarden.state.storms.map((s) => ({ id: s.id, mm: s.totalMm, src: s.source.text.slice(0, 60) })));
  await primary(page); await waitStep(page, 6);
  r.before = await waitResult(page, 'before', 240000);
  await sleep(6000);
  r.fpsStorm = await page.evaluate(() => window.__raingarden.fps());
  await shot(page, `${p}-06-before`);
  await page.locator('.dz-scrub').evaluate((el) => { el.value = '330'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await sleep(400);
  await shot(page, `${p}-06-before-scrubbed`);
  await primary(page); await waitStep(page, 7); await sleep(1400); await shot(page, `${p}-07-design`);
  await primary(page); // Design my garden
  await sleep(4000);
  await shot(page, `${p}-07-design-running`);
  r.design = await waitResult(page, 'design', 600000);
  await sleep(1500);
  await shot(page, `${p}-07-design-done`);
  await primary(page); await waitStep(page, 8);
  r.plant = await waitResult(page, 'plant');
  await sleep(1500); await shot(page, `${p}-08-plant-early`);
  await sleep(9000); await shot(page, `${p}-08-plant`);
  await primary(page); await waitStep(page, 9);
  r.compare = await waitResult(page, 'compare', 240000);
  await sleep(5000);
  r.fpsCompare = await page.evaluate(() => window.__raingarden.fps());
  await shot(page, `${p}-09-compare`);
  await primary(page); await waitStep(page, 10);
  r.plan = await waitResult(page, 'plan', 120000);
  await sleep(1500); await shot(page, `${p}-10-plan`);
  // downloads
  const [dlPng] = await Promise.all([page.waitForEvent('download'), page.locator('.dz-primary').click()]);
  const pngPath = `${out}/${p}-plan.png`;
  await dlPng.saveAs(pngPath);
  const meta = await sharp(pngPath).metadata();
  r.png = { w: meta.width, h: meta.height, format: meta.format };
  const [dlPdf] = await Promise.all([page.waitForEvent('download'), page.locator('.dz-pdf').click()]);
  const pdfPath = `${out}/${p}-plan.pdf`;
  await dlPdf.saveAs(pdfPath);
  const pdf = await readFile(pdfPath);
  r.pdf = { bytes: pdf.length, header: pdf.subarray(0, 5).toString('latin1'), eof: pdf.subarray(-6).toString('latin1').trim() };
  r.hscrollEnd = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  // back to the marks (the demo skips them): the editor with the demo's marks
  await page.evaluate(() => window.__raingarden.goTo(2));
  await waitStep(page, 2);
  await sleep(1200);
  await shot(page, `${p}-02-mark-demo`);
  await browser.close();
}

async function cameraRun() {
  const r = { errors: [], logs: [] };
  results.camera = r;
  const y4m = resolve(out, '..', 'demo-yard.y4m');
  if (!existsSync(y4m)) { r.skipped = `no ${y4m}`; return; }
  const browser = await chromium.launch({
    headless: false,
    args: [...GPU, '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${y4m}`],
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await ctx.grantPermissions(['camera']);
  const page = await openSite(ctx, r);
  await page.evaluate(() => document.querySelector('.hdr a[data-design="capture"]').click());
  await waitStep(page, 1, 60000);
  await sleep(1200);
  await shot(page, 'camera-01-capture');
  await page.locator('[data-way=camera]').click();
  await page.waitForFunction(() => { const v = document.querySelector('.dz-video'); return v && v.videoWidth > 0; }, null, { timeout: 30000 });
  await sleep(1200);
  await shot(page, 'camera-01-live');
  await page.locator('.dz-shutter').click();
  await page.waitForFunction(() => window.__raingarden.state.photo, null, { timeout: 30000 });
  await sleep(600);
  await shot(page, 'camera-01-taken');
  r.photo = await page.evaluate(() => ({ w: window.__raingarden.state.photo.w, h: window.__raingarden.state.photo.h, source: window.__raingarden.state.photo.source }));
  await primary(page); await waitStep(page, 2);
  await sleep(800);
  await shot(page, 'camera-02-mark-start');
  // place marks by tapping the photo at the demo yard's positions (scaled into the box)
  const demo = JSON.parse(await readFile('src/data/demo-yard.json', 'utf8'));
  const tap = async (u, v) => {
    const box = await page.locator('.dz-photo-box').boundingBox();
    await page.mouse.click(box.x + u * box.width, box.y + v * box.height);
    await sleep(120);
  };
  const next = async () => { await primary(page); await sleep(200); };
  await tap(...demo.scale.a); await tap(...demo.scale.b);
  await shot(page, 'camera-02-mark-scale');
  await next();
  await tap(...demo.downspout); await next();
  for (const w of demo.wall.slice(0, 3)) await tap(...w);
  await next();
  await tap(...demo.outlet); await next();
  for (const q of demo.yard) await tap(...q);
  await page.locator('.dz-close-poly').click();
  await sleep(200);
  await shot(page, 'camera-02-mark-yard');
  await next(); // to septic
  await page.locator('.dz-skip').click();
  await waitStep(page, 3);
  r.slope = await waitResult(page, 'slope', 600000);
  await sleep(1800);
  await shot(page, 'camera-03-slope');
  await browser.close();
}

const VPS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '390', width: 390, height: 844, mobile: true },
  // the Canvas2D fallback with reduced motion: the same flow must work end to end
  { name: 'static', width: 1440, height: 900, query: '?static=1', reduced: true, optional: true },
];
for (const vp of VPS) {
  if (only ? only !== vp.name : vp.optional) continue;
  try { await demoRun(vp); } catch (e) { results[vp.name].fatal = String(e && e.stack || e); console.error(e); }
}
if (!only || only === 'camera') {
  try { await cameraRun(); } catch (e) { results.camera.fatal = String(e && e.stack || e); console.error(e); }
}
await writeFile(`${out}/results${only ? '-' + only : ''}.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
