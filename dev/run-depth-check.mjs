/**
 * Real-browser check of the depth worker: opens dev/depth.html on a running
 * Vite dev server in Playwright Chromium (WebGPU flags on), waits for the
 * page's window.__depthCheck, prints it and saves the depth map as a PNG.
 *
 *   npx vite --port 5199 --strictPort      (in another shell)
 *   node dev/run-depth-check.mjs [url] [outPrefix]
 *
 * For the WASM path pass the page URL with ?backend=wasm (forces the worker).
 */

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const url = args[0] || 'http://localhost:5199/dev/depth.html';
const prefix = args[1] || 'docs/reports/depth-shots/demo-yard';

const browser = await chromium.launch({
  headless: false,
  args: ['--enable-unsafe-webgpu', '--use-angle=d3d11'],
});
const page = await browser.newPage();
page.on('console', (m) => console.log('[page]', m.type(), m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('worker', (w) => console.log('[worker]', w.url()));
await page.goto(url);
await page.waitForFunction(() => window.__depthCheck && window.__depthCheck.done, null, { timeout: 15 * 60 * 1000, polling: 1000 });
const r = await page.evaluate(() => window.__depthCheck);
const { png, raw, ...rest } = r;
console.log(JSON.stringify(rest, null, 2));
mkdirSync('docs/reports/depth-shots', { recursive: true });
if (raw) writeFileSync(`${prefix}-depth-f32-${r.w}x${r.h}.bin`, Buffer.from(raw, 'base64'));
if (png) writeFileSync(`${prefix}-depth.png`, Buffer.from(png.split(',')[1], 'base64'));
await page.screenshot({ path: `${prefix}-page.jpg`, type: 'jpeg', quality: 80, fullPage: true });
await browser.close();
