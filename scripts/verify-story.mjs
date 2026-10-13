#!/usr/bin/env node
/**
 * Shoots and measures the story in a real (headed, GPU) Chromium.
 *
 * Why its own script: the story brief's "Verify" list (preloader mid-fill,
 * six scenes at rest, a mid-wipe frame, #how, three viewports, console
 * errors, fps while auto-scrolling, reduced motion, no horizontal scroll)
 * has to be rerun after every visual change. Task 14's shoot.mjs covers the
 * whole site; this one is the story's quick loop.
 *
 * Run with a dev server up: node scripts/verify-story.mjs http://localhost:5181 docs/reports/story-shots
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.argv[2] || 'http://localhost:5173';
const out = process.argv[3] || 'docs/reports/story-shots';
const only = process.argv[4];
const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '1920', width: 1920, height: 1080 },
  { name: '390', width: 390, height: 844, mobile: true },
].filter((v) => !only || v.name === only);
const SCENES = ['roof', 'drive', 'drain', 'creek', 'garden', 'stream'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: false, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const results = { viewports: {} };

async function scrollToScene(page, f) {
  await page.evaluate((f) => {
    const s = document.getElementById('story');
    const top = s.getBoundingClientRect().top + scrollY;
    window.scrollTo({ top: top + (f * s.offsetHeight) / 6, behavior: 'instant' });
  }, f);
}

for (const vp of VIEWPORTS) {
  const r = { errors: [] };
  results.viewports[vp.name] = r;
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    isMobile: !!vp.mobile,
    hasTouch: !!vp.mobile,
  });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') r.errors.push(m.text()); if (m.text().includes('[raingarden]')) r.info = m.text(); });
  page.on('pageerror', (e) => r.errors.push(String(e)));
  page.on('response', (res) => { if (res.status() >= 400) r.errors.push(res.status() + ' ' + res.url()); });

  // Preloader mid-fill: throttle the network so the pill is caught filling.
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 80, downloadThroughput: 350_000, uploadThroughput: 100_000 });
  await page.goto(base + '/', { waitUntil: 'commit' });
  await page.waitForFunction(() => {
    const f = document.querySelector('.pl-bar');
    return f && Number(f.getAttribute('aria-valuenow')) >= 30;
  }, null, { timeout: 60000 }).catch(() => {});
  await page.screenshot({ path: `${out}/${vp.name}-0-preloader.png` });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: false });
  const t0 = Date.now();
  await page.waitForSelector('#pl', { state: 'detached', timeout: 60000 });
  r.preloaderTailMs = Date.now() - t0;

  // Cached reload: preloader must finish fast.
  const t1 = Date.now();
  await page.reload({ waitUntil: 'commit' });
  await page.waitForSelector('#pl', { state: 'detached', timeout: 30000 });
  r.preloaderCachedMs = Date.now() - t1;
  await sleep(1800);

  if (!vp.mobile) await page.mouse.move(vp.width * 0.62, vp.height * 0.45);
  for (let i = 0; i < SCENES.length; i++) {
    await scrollToScene(page, i === 0 ? 0 : i + 0.3);
    await sleep(2200);
    await page.screenshot({ path: `${out}/${vp.name}-${i + 1}-${SCENES[i]}.png` });
  }
  // Mid-wipe, drive -> drain, just before the swap (curtain over the frame). Snap off to hold it there.
  await page.evaluate(() => { document.documentElement.dataset.snap = 'off'; document.documentElement.style.scrollSnapType = 'none'; });
  await scrollToScene(page, 1 + 0.7 + 0.3 * 0.42);
  await sleep(1800);
  await page.screenshot({ path: `${out}/${vp.name}-wipe.png` });
  await scrollToScene(page, 1 + 0.7 + 0.3 * 0.5);
  await sleep(1800);
  await page.screenshot({ path: `${out}/${vp.name}-wipe-mid.png` });
  await scrollToScene(page, 3 + 0.7 + 0.3 * 0.25);
  await sleep(1800);
  await page.screenshot({ path: `${out}/${vp.name}-wipe-early.png` });

  await page.evaluate(() => { delete document.documentElement.dataset.snap; document.documentElement.style.scrollSnapType = ''; });
  await page.evaluate(() => document.getElementById('how').scrollIntoView({ behavior: 'instant' }));
  await sleep(1200);
  await page.screenshot({ path: `${out}/${vp.name}-how.png` });
  await page.screenshot({ path: `${out}/${vp.name}-how-full.png`, fullPage: false, clip: undefined });

  r.overflowX = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);

  // fps while auto-scrolling the whole story.
  await scrollToScene(page, 0);
  await sleep(800);
  r.fps = await page.evaluate(async () => {
    const s = document.getElementById('story');
    const end = s.offsetHeight - innerHeight;
    const frames = [];
    let last = performance.now();
    const t0 = last;
    const D = 9000;
    await new Promise((done) => {
      const step = (t) => {
        frames.push(t - last);
        last = t;
        const k = (t - t0) / D;
        window.scrollTo(0, Math.min(1, k) * end);
        if (k < 1) requestAnimationFrame(step); else done();
      };
      requestAnimationFrame(step);
    });
    frames.shift();
    const avg = frames.reduce((a, b) => a + b, 0) / frames.length;
    const sorted = [...frames].sort((a, b) => a - b);
    return {
      fps: Math.round(10000 / avg) / 10,
      p95ms: Math.round(sorted[Math.floor(sorted.length * 0.95)] * 10) / 10,
      over33ms: frames.filter((f) => f > 33).length,
      frames: frames.length,
    };
  });

  // Reduced motion: cross-fade at the boundary, no wipe.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await scrollToScene(page, 2.3);
  await sleep(900);
  await scrollToScene(page, 2.9);
  await sleep(220);
  await page.screenshot({ path: `${out}/${vp.name}-reduced-crossfade.png` });
  await sleep(900);
  r.reduced = await page.evaluate(() => ({
    wipeVisible: getComputedStyle(document.querySelector('.story-wipe')).visibility,
    visible: document.querySelector('.story-scene.is-visible')?.dataset.scene,
  }));
  await page.screenshot({ path: `${out}/${vp.name}-reduced-after.png` });
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  await ctx.close();
  console.log(vp.name, JSON.stringify(r));
}

await browser.close();
await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2));
