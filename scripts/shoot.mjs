#!/usr/bin/env node
/**
 * The whole site, shot and checked in a real (headed, GPU) Chromium - the
 * "done" gate. Exits 1 on any console error, page error, failed request,
 * horizontal scroll, a broken export or a garden that doesn't help.
 *
 * Why one script and not the per-task verify-*.mjs: those are each task's
 * quick loop; this one proves the parts work together as a visitor meets
 * them - every story scene, every designer step, at 1440x900, 1920x1080 and
 * 390x844, the demo yard end to end, the "Use my camera" path end to end
 * with Chromium's fake camera (fed the demo yard photo as a .y4m), before
 * and after compared, the plan exported as PNG and PDF and checked, and fps
 * measured (story scroll, storm playback, and storm playback on the phone
 * size with the CPU throttled 4x as a mid-range-phone stand-in).
 *
 *   node scripts/shoot.mjs [--dev] [--only story|demo|camera] [--sizes 1440,390] [--out design-reference/shots/<stamp>]
 *
 * Default serves the production build (`vite build` first if dist/ is
 * missing, then `vite preview`); --dev uses the dev server instead.
 * Results: <out>/results.json; screenshots <out>/<size>-<step>.png.
 */
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : args[i + 1]; };
const DEV = args.includes('--dev');
const ONLY = opt('only', '');
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const OUT = opt('out', `design-reference/shots/${stamp}`);
const SIZES = [
  { name: '1440', width: 1440, height: 900 },
  { name: '1920', width: 1920, height: 1080 },
  { name: '390', width: 390, height: 844, mobile: true },
].filter((s) => !opt('sizes') || opt('sizes').split(',').includes(s.name));
const PORT = 5299;
const BASE = `http://127.0.0.1:${PORT}`;
const GPU = ['--use-angle=d3d11', '--enable-gpu', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist'];
const SCENES = ['roof', 'drive', 'drain', 'creek', 'garden', 'stream'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await mkdir(OUT, { recursive: true });
const results = { base: DEV ? 'dev' : 'build', out: OUT, runs: {}, failures: [] };
const fail = (where, what) => { results.failures.push(`${where}: ${what}`); console.error(`FAIL ${where}: ${what}`); };

// ---- server ----
if (!DEV && !existsSync('dist/index.html')) execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], { stdio: 'inherit' });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', ...(DEV ? [] : ['preview']), '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' });
for (let i = 0; i < 120; i++) { try { if ((await fetch(BASE + '/')).ok) break; } catch {} await sleep(500); }

// ---- helpers ----
function watch(page, r) {
  page.on('console', (m) => {
    if (m.type() === 'error') r.errors.push(m.text());
    if (m.text().includes('[raingarden]')) r.logs.push(m.text());
  });
  page.on('pageerror', (e) => r.errors.push(String(e)));
  page.on('response', (res) => { if (res.status() >= 400 && !/favicon/.test(res.url())) r.errors.push(`${res.status()} ${res.url()}`); });
}
async function context(browser, s, extra = {}) {
  return browser.newContext({ viewport: { width: s.width, height: s.height }, deviceScaleFactor: 1, isMobile: !!s.mobile, hasTouch: !!s.mobile, acceptDownloads: true, ...extra });
}
async function open(ctx, r, query = '') {
  const page = await ctx.newPage();
  watch(page, r);
  await page.goto(`${BASE}/${query}`, { waitUntil: 'load' });
  await page.waitForSelector('#pl', { state: 'detached', timeout: 90000 }).catch(() => {});
  await sleep(1200);
  return page;
}
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` });
async function hscroll(page, where) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (over > 0) fail(where, `horizontal scroll ${over}px`);
  return over;
}
async function waitStep(page, n, timeout = 90000) {
  await page.waitForFunction((n) => window.__raingarden && window.__raingarden.step === n, n, { timeout });
}
async function waitResult(page, step, timeout = 600000) {
  await page.waitForFunction((s) => window.__raingarden?.lastResult?.step === s, step, { timeout, polling: 250 });
  return page.evaluate(() => {
    const r = { ...window.__raingarden.lastResult };
    for (const k of Object.keys(r)) if (r[k] && typeof r[k] === 'object' && !Array.isArray(r[k]) && !['garden', 'cost', 'confidence'].includes(k)) delete r[k];
    return r;
  });
}
async function primary(page) {
  await page.waitForFunction(() => { const b = document.querySelector('.dz-primary'); return b && !b.disabled && b.offsetParent; }, null, { timeout: 600000 });
  await page.locator('.dz-primary').click();
}
async function storyScroll(page, f) {
  await page.evaluate((f) => {
    const s = document.getElementById('story');
    window.scrollTo({ top: s.getBoundingClientRect().top + scrollY + (f * s.offsetHeight) / 6, behavior: 'instant' });
  }, f);
}
async function rafFps(page, ms = 4000) {
  return page.evaluate((ms) => new Promise((done) => {
    const frames = []; let last = performance.now(); const t0 = last;
    const step = (t) => { frames.push(t - last); last = t; if (t - t0 < ms) requestAnimationFrame(step); else {
      frames.shift(); const avg = frames.reduce((a, b) => a + b, 0) / frames.length;
      const sorted = [...frames].sort((a, b) => a - b);
      done({ fps: Math.round(10000 / avg) / 10, p95ms: Math.round(sorted[Math.floor(sorted.length * 0.95)] * 10) / 10 });
    } };
    requestAnimationFrame(step);
  }), ms);
}

// ---- the story: preloader, six scenes, a wipe, How it works, scroll fps ----
async function story(browser, s) {
  const r = { errors: [], logs: [] };
  results.runs[`story-${s.name}`] = r;
  const ctx = await context(browser, s);
  const page = await ctx.newPage();
  watch(page, r);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 80, downloadThroughput: 400_000, uploadThroughput: 100_000 });
  await page.goto(`${BASE}/?preloader=1`, { waitUntil: 'commit' });
  await page.waitForFunction(() => Number(document.querySelector('.pl-bar')?.getAttribute('aria-valuenow')) >= 30, null, { timeout: 90000 }).catch(() => {});
  await shot(page, `${s.name}-00-preloader`);
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: false });
  await page.waitForSelector('#pl', { state: 'detached', timeout: 90000 });
  if (!s.mobile) await page.mouse.move(s.width * 0.62, s.height * 0.45);
  for (let i = 0; i < SCENES.length; i++) {
    await storyScroll(page, i === 0 ? 0 : i + 0.3);
    await sleep(2200);
    await shot(page, `${s.name}-0${i + 1}-${SCENES[i]}`);
  }
  await page.evaluate(() => { document.documentElement.dataset.snap = 'off'; document.documentElement.style.scrollSnapType = 'none'; });
  await storyScroll(page, 2 + 0.7 + 0.3 * 0.45);
  await sleep(1600);
  await shot(page, `${s.name}-07-wipe`);
  await page.evaluate(() => { delete document.documentElement.dataset.snap; document.documentElement.style.scrollSnapType = ''; });
  await page.evaluate(() => document.getElementById('how').scrollIntoView({ behavior: 'instant' }));
  await sleep(1200);
  await shot(page, `${s.name}-08-how`);
  r.hscroll = await hscroll(page, `story ${s.name}`);
  await storyScroll(page, 0);
  await sleep(600);
  r.scrollFps = await page.evaluate(async () => {
    const s = document.getElementById('story'); const end = s.offsetHeight - innerHeight;
    const frames = []; let last = performance.now(); const t0 = last;
    await new Promise((done) => { const step = (t) => { frames.push(t - last); last = t; const k = (t - t0) / 9000; window.scrollTo(0, Math.min(1, k) * end); if (k < 1) requestAnimationFrame(step); else done(); }; requestAnimationFrame(step); });
    frames.shift(); const avg = frames.reduce((a, b) => a + b, 0) / frames.length;
    return { fps: Math.round(10000 / avg) / 10, over33ms: frames.filter((f) => f > 33).length };
  });
  await ctx.close();
}

// ---- the designer: demo yard end to end (or the fake camera), exports, fps ----
async function designer(browser, s, { camera = false } = {}) {
  const key = camera ? `camera-${s.name}` : `demo-${s.name}`;
  const r = { errors: [], logs: [] };
  results.runs[key] = r;
  const ctx = await context(browser, s);
  if (camera) await ctx.grantPermissions(['camera'], { origin: BASE });
  const page = await open(ctx, r);
  const p = `${s.name}-${camera ? 'cam' : 'demo'}`;
  if (camera) {
    await page.evaluate(() => document.querySelector('[data-design="capture"]').click());
    await waitStep(page, 1);
    await sleep(1000); await shot(page, `${p}-10-capture`);
    await page.locator('[data-way=camera]').click();
    await page.waitForFunction(() => { const v = document.querySelector('.dz-video'); return v && v.videoWidth > 0; }, null, { timeout: 60000 });
    await sleep(1000); await shot(page, `${p}-11-live`);
    await page.locator('.dz-shutter').click();
    await page.waitForFunction(() => window.__raingarden.state.photo, null, { timeout: 30000 });
    await primary(page); await waitStep(page, 2); await sleep(800);
    const demo = JSON.parse(await readFile('src/data/demo-yard.json', 'utf8'));
    const tap = async (u, v) => { const b = await page.locator('.dz-photo-box').boundingBox(); await page.mouse.click(b.x + u * b.width, b.y + v * b.height); await sleep(120); };
    await tap(...demo.scale.a); await tap(...demo.scale.b); await primary(page); await sleep(200);
    await tap(...demo.downspout); await primary(page); await sleep(200);
    for (const w of demo.wall.slice(0, 3)) await tap(...w);
    await primary(page); await sleep(200);
    await tap(...demo.outlet); await primary(page); await sleep(200);
    for (const q of demo.yard) await tap(...q);
    await page.locator('.dz-close-poly').click();
    await sleep(300); await shot(page, `${p}-12-marks`);
    await primary(page); await sleep(200);
    await page.locator('.dz-skip').click();
  } else {
    await page.evaluate(() => document.querySelector('a[data-design="demo"]').click());
  }
  await waitStep(page, 3);
  r.slope = await waitResult(page, 'slope');
  await sleep(1500); await shot(page, `${p}-13-slope`);
  await primary(page); await waitStep(page, 4); await sleep(1200); await shot(page, `${p}-14-soil`);
  await primary(page); await waitStep(page, 5);
  await page.waitForSelector('.dz-storm', { timeout: 90000 }); await sleep(1000); await shot(page, `${p}-15-storm`);
  r.storms = await page.evaluate(() => window.__raingarden.state.storms.map((x) => ({ id: x.id, mm: x.totalMm, source: x.source.text })));
  await primary(page); await waitStep(page, 6);
  r.before = await waitResult(page, 'before');
  await sleep(5000);
  r.stormFps = await rafFps(page);
  await shot(page, `${p}-16-before`);
  if (s.mobile && !camera) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    r.stormFpsThrottled4x = await rafFps(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  }
  await primary(page); await waitStep(page, 7); await sleep(1200); await shot(page, `${p}-17-design`);
  await primary(page);
  await sleep(3500); await shot(page, `${p}-18-optimizing`);
  r.design = await waitResult(page, 'design');
  await sleep(1200); await shot(page, `${p}-19-designed`);
  await primary(page); await waitStep(page, 8);
  r.plant = await waitResult(page, 'plant');
  await sleep(1200); await shot(page, `${p}-20-planting-day`);
  await sleep(9000); await shot(page, `${p}-21-year-3`);
  await primary(page); await waitStep(page, 9);
  r.compare = await waitResult(page, 'compare');
  await sleep(4000);
  r.compareFps = await rafFps(page);
  await shot(page, `${p}-22-compare`);
  await primary(page); await waitStep(page, 10);
  r.plan = await waitResult(page, 'plan', 180000);
  await sleep(1200); await shot(page, `${p}-23-plan`);
  const [png] = await Promise.all([page.waitForEvent('download'), page.locator('.dz-primary').click()]);
  await png.saveAs(`${OUT}/${p}-plan.png`);
  const m = await sharp(`${OUT}/${p}-plan.png`).metadata();
  r.png = { w: m.width, h: m.height };
  const [pdf] = await Promise.all([page.waitForEvent('download'), page.locator('.dz-pdf').click()]);
  await pdf.saveAs(`${OUT}/${p}-plan.pdf`);
  const bytes = await readFile(`${OUT}/${p}-plan.pdf`);
  r.pdf = { bytes: bytes.length, header: bytes.subarray(0, 5).toString('latin1'), eof: bytes.subarray(-8).toString('latin1').trim() };
  r.hscroll = await hscroll(page, key);
  // checks
  if (r.png.w !== 2480 || r.png.h !== 3508) fail(key, `plan PNG is ${r.png.w}x${r.png.h}, not 2480x3508`);
  if (r.pdf.header !== '%PDF-' || !r.pdf.eof.endsWith('%%EOF')) fail(key, `plan PDF malformed (${r.pdf.header} … ${r.pdf.eof})`);
  const c = await page.evaluate(() => window.__raingarden.state && window.__raingarden.state.compare
    ? { outBeforeL: window.__raingarden.state.compare.outBeforeL, outAfterL: window.__raingarden.state.compare.outAfterL, capturedL: window.__raingarden.state.compare.capturedL } : null);
  r.compareNumbers = c || { outBeforeL: r.compare.outBeforeL, outAfterL: r.compare.outAfterL, capturedL: r.compare.capturedL };
  const { outBeforeL, outAfterL } = r.compareNumbers;
  if (!(Number.isFinite(outBeforeL) && Number.isFinite(outAfterL))) fail(key, `compare numbers missing ${JSON.stringify(r.compareNumbers)}`);
  else if (outBeforeL > 0 && !(outAfterL < outBeforeL)) fail(key, `the garden did not reduce runoff: before ${outBeforeL} L, after ${outAfterL} L`);
  await ctx.close();
}

// ---- run ----
const y4m = resolve(OUT, 'demo-yard.y4m');
if (!ONLY || ONLY === 'camera') {
  // A 5 s 1280x720 clip of the demo photo for Chromium's fake camera.
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-loop', '1', '-i', 'art-src/gen/demo-yard.png', '-t', '5', '-vf', 'scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,fps=15', '-pix_fmt', 'yuv420p', y4m]);
}
try {
  const browser = await chromium.launch({ headless: false, args: GPU });
  for (const s of SIZES) {
    if (!ONLY || ONLY === 'story') try { await story(browser, s); } catch (e) { fail(`story-${s.name}`, String(e.message || e)); }
    if (!ONLY || ONLY === 'demo') try { await designer(browser, s); } catch (e) { fail(`demo-${s.name}`, String(e.message || e)); }
  }
  await browser.close();
  if (!ONLY || ONLY === 'camera') {
    const cam = await chromium.launch({ headless: false, args: [...GPU, '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${y4m}`] });
    for (const s of SIZES.filter((x) => x.name !== '1920')) {
      try { await designer(cam, s, { camera: true }); } catch (e) { fail(`camera-${s.name}`, String(e.message || e)); }
    }
    await cam.close();
  }
} finally {
  server.kill();
}
for (const [k, r] of Object.entries(results.runs)) for (const e of r.errors) fail(k, `console/page/network error: ${e}`);
await writeFile(`${OUT}/results.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify({ out: OUT, failures: results.failures, fps: Object.fromEntries(Object.entries(results.runs).map(([k, r]) => [k, r.scrollFps || r.stormFps])) }, null, 2));
process.exit(results.failures.length ? 1 : 0);
