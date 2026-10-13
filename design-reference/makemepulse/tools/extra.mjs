// Second-pass measurements without screenshot stalls:
//  - camera geometry per chapter (position, lookAt distance, fov) -> analytic parallax per depth
//  - depth distribution of scene nodes (distance from camera along view axis)
//  - DOM cursor follow lag (per rAF)
//  - transition offsetProgress per rAF (captured by hooking the 1.75s tween target)
// usage: node extra.mjs <width> <height>
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const W = +process.argv[2] || 1440, H = +process.argv[3] || 900;
const RAW = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'raw');
const browser = await chromium.launch({ headless: false, args: ['--use-angle=d3d11', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H } });
await ctx.addInitScript(() => {
  window.__samples = null; window.__tm = null;
  const iv = setInterval(() => {
    const TL = window.TweenLite; if (!TL) return; clearInterval(iv);
    const ft = TL.fromTo;
    TL.fromTo = function (t, d, f, v) { if (f && 'offsetProgress' in f) window.__tm = t; return ft.apply(this, arguments); };
  }, 2);
  const loop = () => { if (window.__samples && window.__sampleFn) { try { window.__samples.push({ t: performance.now(), ...window.__sampleFn() }); } catch (e) { window.__samples.push({ err: String(e) }); } } requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
});
const page = await ctx.newPage();
const ev = (f, a) => page.evaluate(f, a); const wait = ms => page.waitForTimeout(ms);
const out = { viewport: [W, H], chapters: [], cursor: null, transitions: [], fps: null };

await page.goto('https://2019.makemepulse.com/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => { const l = document.querySelector('.loader'); return l && /hide/.test(l.className); }, null, { timeout: 120000 });
await wait(2500);
await page.mouse.move(W / 2 - 200, H / 2); await wait(300); await page.mouse.move(W / 2, H / 2); await wait(800);
await page.mouse.click(W / 2, H / 2); await wait(4500);
const sb = await page.locator('.landing__button').boundingBox();
await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2); await wait(600);
await page.mouse.click(sb.x + sb.width / 2, sb.y + sb.height / 2);
await wait(5000);

// fps of the page's rAF
await ev(() => { window.__sampleFn = () => ({}); window.__samples = []; }); await wait(2000);
const fs_ = await ev(() => { const s = window.__samples; window.__samples = null; return s.map(x => x.t); });
out.fps = 1000 / ((fs_[fs_.length - 1] - fs_[0]) / (fs_.length - 1));

// DOM cursor follow: wrapper element of the cursor canvas carries translate3d
await page.mouse.move(W * 0.3, H * 0.3); await wait(800);
await ev(() => { const c = document.querySelector('canvas.cursor'); const el = c && c.parentElement; window.__sampleFn = () => ({ tr: el && el.style.transform }); window.__samples = []; });
await wait(100); const tc = await ev(() => performance.now());
await page.mouse.move(W * 0.7, H * 0.6); await wait(600);
out.cursor = { tStep: tc, target: [W * 0.7, H * 0.6], samples: await ev(() => { const s = window.__samples; window.__samples = null; return s; }) };

for (let k = 0; k < 5; k++) {
  await page.mouse.move(W / 2, H / 2); await wait(4000);
  const info = await ev(() => {
    const C = GLXP.chapters, ch = C.chapters[C._currentChapter];
    const r = { idx: C._currentChapter, id: ch.id };
    const cn = ch.cameraNode, la = ch.lookAtNode;
    if (cn) r.camPos = Array.from(cn.position);
    if (la) r.lookAt = Array.from(la.position);
    if (ch.initialCamPos) r.initialCamPos = Array.from(ch.initialCamPos);
    const lens = ch._camera && ch._camera.lens; if (lens) r.lens = { fov: lens._fov, hfov: lens._hfov, vfov: lens._vfov, near: lens.near, far: lens.far, aspect: lens.aspect, keys: Object.keys(lens).slice(0, 20) };
    // depth of nodes along the camera view axis
    try {
      const M = cn._wmatrix || cn._matrix; const fwd = [-M[8], -M[9], -M[10]]; const p = cn.position;
      const nodes = []; const visit = (n, d) => { if (!n || d > 6) return; const wm = n._wmatrix; if (wm && n.name) { const v = [wm[12] - p[0], wm[13] - p[1], wm[14] - p[2]]; nodes.push({ name: n.name, depth: +(v[0] * fwd[0] + v[1] * fwd[1] + v[2] * fwd[2]).toFixed(2), x: +(v[0]).toFixed(2), y: +(v[1]).toFixed(2) }); } (n._children || n.children || []).forEach(c => visit(c, d + 1)); };
      visit(ch.gltf && (ch.gltf.root || ch.root), 0);
      r.nodes = nodes.sort((a, b) => a.depth - b.depth).slice(0, 80);
    } catch (e) { r.nodesErr = String(e); }
    return r;
  });
  out.chapters.push(info);
  console.log(JSON.stringify({ idx: info.idx, id: info.id, camPos: info.camPos, lookAt: info.lookAt, lens: info.lens && { fov: info.lens.fov, hfov: info.lens.hfov }, nodes: info.nodes && info.nodes.length }));
  if (info.idx >= 4) break;
  // transition timing without screenshots
  await ev(() => {
    window.__sampleFn = () => { const C = GLXP.chapters; let act = -1; C.transitions.forEach((t, i) => { if (t.active) act = i; }); return { off: window.__tm ? window.__tm.offsetProgress : null, act, vis: C.chapters.map(c => c._active ? 1 : 0).join(''), ch: C._currentChapter }; };
    window.__samples = [];
  });
  const t0 = await ev(() => performance.now());
  await ev(() => GLXP.chapters.next());
  await wait(k === 3 ? 6000 : 3500);
  out.transitions.push({ from: k, t0, samples: await ev(() => { const s = window.__samples; window.__samples = null; return s; }) });
}
fs.writeFileSync(path.join(RAW, `extra-${W}.json`), JSON.stringify(out, null, 1));
await browser.close();
console.log('fps', out.fps);
