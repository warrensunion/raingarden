// Measurement session for the makemepulse 2019 reference.
// usage: node record.mjs <width> <height>
// Records video + key-frame screenshots, logs every GSAP tween, samples camera / cursor per rAF,
// tests wheel response, measures mouse-parallax per depth band and camera follow lag.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const W = +process.argv[2] || 1440, H = +process.argv[3] || 900;
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(OUT, 'tools', 'raw'); fs.mkdirSync(RAW, { recursive: true });
const VID = path.join(RAW, 'video-' + W); fs.mkdirSync(VID, { recursive: true });
const log = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(1)}s]`, ...a);
const T0 = Date.now();

const browser = await chromium.launch({ headless: false, args: ['--use-angle=d3d11', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: VID, size: { width: W, height: H } } });

// ---- instrumentation injected before any page script ----
await ctx.addInitScript(() => {
  window.__tweens = []; window.__marks = []; window.__samples = null;
  const mark = (name, extra) => window.__marks.push({ t: performance.now(), name, ...extra });
  window.__mark = mark;
  const descTarget = t => {
    if (!t) return String(t);
    if (Array.isArray(t) || (t.length !== undefined && typeof t !== 'string' && t[0])) return '[' + Array.from(t).map(descTarget).join(',') + ']';
    if (t.nodeType === 1) return (t.tagName.toLowerCase() + (t.id ? '#' + t.id : '') + (typeof t.className === 'string' && t.className ? '.' + t.className.trim().split(/\s+/).join('.') : '')).slice(0, 120);
    const keys = Object.keys(t).slice(0, 8).join(',');
    return ((t.constructor && t.constructor.name) || 'Object') + '{' + keys + '}';
  };
  const descEase = e => {
    if (!e) return { name: 'default(Power1.easeOut)' };
    if (typeof e === 'function') return { name: 'fn' };
    const r = {};
    try { r.samples = [0.25, 0.5, 0.75].map(p => +e.getRatio(p).toFixed(4)); } catch (_) {}
    r.type = e._type; r.power = e._power; r.id = e.id || (e.data && e.data.id);
    const pw = { 0: 'Power0', 1: 'Power1', 2: 'Power2', 3: 'Power3', 4: 'Power4' };
    const ty = { 1: 'easeOut', 2: 'easeIn', 3: 'easeInOut' };
    if (r.id) r.name = 'CustomEase(' + r.id + ')';
    else if (e._power !== undefined && e._type) r.name = pw[e._power] + '.' + ty[e._type];
    else r.name = (e.constructor && e.constructor.name) || '?';
    return r;
  };
  const wrap = () => {
    const TL = window.TweenLite; if (!TL || TL.__wrapped) return !!(TL && TL.__wrapped);
    TL.__wrapped = true; mark('tweenlite-ready');
    for (const m of ['to', 'from', 'fromTo', 'set', 'staggerTo', 'delayedCall']) {
      const orig = TL[m]; if (!orig) continue;
      TL[m] = function (...args) {
        try {
          let rec;
          if (m === 'delayedCall') rec = { delay: args[0] };
          else {
            const vars = m === 'fromTo' ? args[3] : (m === 'set' ? args[1] : args[2]);
            const from = m === 'fromTo' ? args[2] : null;
            rec = { target: descTarget(args[0]), duration: m === 'set' ? 0 : args[1], delay: vars && vars.delay || 0, ease: descEase(vars && vars.ease),
              vars: vars ? Object.keys(vars).filter(k => !/^on/.test(k)).reduce((o, k) => (o[k] = typeof vars[k] === 'object' ? '[obj]' : vars[k], o), {}) : null,
              from: from ? Object.keys(from).reduce((o, k) => (o[k] = typeof from[k] === 'object' ? '[obj]' : from[k], o), {}) : null };
          }
          rec.t = +performance.now().toFixed(1); rec.method = m;
          window.__tweens.push(rec);
        } catch (e) { window.__tweens.push({ err: String(e) }); }
        return orig.apply(this, args);
      };
    }
    return true;
  };
  const iv = setInterval(() => { if (wrap()) clearInterval(iv); }, 2);
  // generic rAF sampler: window.__sampleFn returns a record; collected while __samples is an array
  const loop = () => { if (window.__samples && window.__sampleFn) { try { window.__samples.push({ t: performance.now(), ...window.__sampleFn() }); } catch (e) {} } requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
});

const page = await ctx.newPage();
const consoleLog = []; page.on('console', m => consoleLog.push(m.type() + ' ' + m.text()));
const results = { viewport: [W, H], loader: [], shots: [], wheel: [], parallax: [], lag: [], transitions: [], cursor: null, chapters: [] };
let shotN = 0;
const shot = async (label) => {
  const f = `shot-${W}-${String(shotN++).padStart(2, '0')}.png`;
  await page.screenshot({ path: path.join(OUT, f) });
  results.shots.push({ file: f, label, t: Date.now() - T0 });
  log('shot', f, label);
  return f;
};
const raw = async (name) => { const f = path.join(RAW, `${W}-${name}.png`); await page.screenshot({ path: f }); return f; };
const ev = (fn, arg) => page.evaluate(fn, arg);
const wait = ms => page.waitForTimeout(ms);
const smoothMove = async (x0, y0, x1, y1, ms, steps) => { for (let i = 1; i <= steps; i++) { const p = i / steps; await page.mouse.move(x0 + (x1 - x0) * p, y0 + (y1 - y0) * p); await wait(ms / steps); } };
const circles = async (r, turns, msPerTurn) => {
  const cx = W / 2, cy = H / 2, n = 48;
  for (let k = 0; k < turns * n; k++) { const a = k / n * Math.PI * 2; await page.mouse.move(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.6); await wait(msPerTurn / n); }
};

// ---------- 1. Preloader ----------
await page.goto('https://2019.makemepulse.com/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await ev(() => window.__mark('domcontentloaded'));
await shot('loader start');
// sample loader bar until landing reveals
for (let i = 0; i < 400; i++) {
  const s = await ev(() => {
    const fg = document.querySelector('.loader__bar__foreground'); const ld = document.querySelector('.loader');
    const land = document.querySelector('.landing');
    return { t: performance.now(), fg: fg && fg.style.transform, loaderCls: ld && ld.className, landingCls: land && land.className, bodyCls: document.body.className };
  });
  results.loader.push(s);
  if (i === 8) await shot('loader mid');
  if (s.loaderCls && /hide/.test(s.loaderCls) && i > 5) break;
  await wait(100);
}
await wait(400); await shot('landing circle appears');
await wait(1500); await shot('landing circle idle');

// ---------- 2. Landing: hover + click circle, then START ----------
await smoothMove(W * 0.1, H * 0.1, W / 2 - 300, H / 2, 600, 15);
await smoothMove(W / 2 - 300, H / 2, W / 2, H / 2, 900, 25);
await wait(1200); await shot('landing circle hover');
await page.mouse.click(W / 2, H / 2); await ev(() => window.__mark('circle-click'));
{ let prev = 0; for (const ms of [300, 600, 900, 1200, 1800]) { await wait(ms - prev); prev = ms; await shot(`landing reveal +${ms}ms`); } }
await wait(2500); await shot('landing revealed');
// hover START
const startBox = await page.locator('.landing__button').boundingBox().catch(() => null);
log('start box', startBox);
if (startBox) {
  await smoothMove(W / 2, H / 2, startBox.x + startBox.width / 2, startBox.y + startBox.height / 2, 700, 20);
  await wait(900); await shot('START hover');
  await smoothMove(startBox.x + startBox.width / 2, startBox.y + startBox.height / 2, startBox.x + startBox.width / 2 + 200, startBox.y - 100, 400, 10);
  await wait(500);
  await smoothMove(startBox.x + startBox.width / 2 + 200, startBox.y - 100, startBox.x + startBox.width / 2, startBox.y + startBox.height / 2, 400, 10);
  await wait(600);
  await page.mouse.click(startBox.x + startBox.width / 2, startBox.y + startBox.height / 2);
} else {
  await page.mouse.click(W / 2, H * 0.8);
}
await ev(() => window.__mark('start-click'));
{ let prev = 0; for (const ms of [250, 500, 750, 1000, 1500, 2500]) { await wait(ms - prev); prev = ms; await shot(`after START +${ms}ms`); } }

// ---------- helpers for chapter measurement ----------
const camSampler = () => ev(() => {
  window.__sampleFn = () => {
    const C = window.GLXP && GLXP.chapters; if (!C) return {};
    const ch = C.chapters[C._currentChapter]; const p = ch && ch.cameraNode && ch.cameraNode.position;
    const cur = document.querySelector('canvas.cursor') || document.querySelector('.cursor');
    return { ch: C._currentChapter, cam: p ? [p[0], p[1], p[2]] : null, cursor: cur ? cur.style.transform : null, off: (window.__tm ? window.__tm.offsetProgress : undefined) };
  };
  window.__samples = [];
});
const stopSampler = () => ev(() => { const s = window.__samples; window.__samples = null; return s; });

async function measureChapter(idx) {
  const rec = { idx };
  rec.id = await ev(() => GLXP.chapters.chapters[GLXP.chapters._currentChapter].id).catch(() => '?');
  log('chapter', idx, rec.id);
  await wait(3500);
  await shot(`chapter ${idx} ${rec.id} entered`);

  // (a) wheel test: 12 x 100px every 80 ms, pause, 12 more; compare camera + image
  await page.mouse.move(W / 2, H / 2); await wait(1500);
  await camSampler();
  const a = await raw(`ch${idx}-wheel-before`);
  for (let k = 0; k < 12; k++) { await page.mouse.wheel(0, 100); await wait(80); }
  await wait(600);
  for (let k = 0; k < 12; k++) { await page.mouse.wheel(0, 100); await wait(80); }
  await wait(800);
  const b = await raw(`ch${idx}-wheel-after`);
  const ws = await stopSampler();
  const cams = ws.filter(s => s.cam).map(s => s.cam);
  rec.wheel = { before: a, after: b, camFirst: cams[0], camLast: cams[cams.length - 1], camMaxDev: cams.length ? Math.max(...cams.map(c => Math.hypot(c[0] - cams[0][0], c[1] - cams[0][1], c[2] - cams[0][2]))) : null, chapterAfter: ws.length ? ws[ws.length - 1].ch : null };
  for (let k = 0; k < 10; k++) { await page.mouse.wheel(0, -100); await wait(80); }

  // (b) mouse parallax: settle at left, then right -> image pair
  await smoothMove(W / 2, H / 2, W * 0.1, H / 2, 600, 15); await wait(3000);
  const pl = await raw(`ch${idx}-par-left`);
  await smoothMove(W * 0.1, H / 2, W * 0.9, H / 2, 900, 25); await wait(3000);
  const pr = await raw(`ch${idx}-par-right`);
  await smoothMove(W * 0.9, H / 2, W * 0.5, H * 0.1, 600, 15); await wait(3000);
  const pu = await raw(`ch${idx}-par-up`);
  await smoothMove(W * 0.5, H * 0.1, W * 0.5, H * 0.9, 900, 25); await wait(3000);
  const pd = await raw(`ch${idx}-par-down`);
  rec.parallax = { left: pl, right: pr, up: pu, down: pd, mouseLeft: [W * 0.1, H / 2], mouseRight: [W * 0.9, H / 2] };

  // (c) step jump: camera follow lag (sampled per rAF)
  await page.mouse.move(W * 0.2, H / 2); await wait(3000);
  await camSampler(); await wait(150);
  await ev(() => window.__mark('step'));
  const tStep = await ev(() => performance.now());
  await page.mouse.move(W * 0.8, H / 2);
  await wait(2600);
  rec.lag = { tStep, samples: await stopSampler() };
  // and back (horizontal + vertical jump)
  await camSampler(); await wait(150);
  const tStep2 = await ev(() => performance.now());
  await page.mouse.move(W * 0.2, H * 0.2);
  await wait(2600);
  rec.lag2 = { tStep: tStep2, samples: await stopSampler() };

  // (d) slow circles + sharp jumps for the video
  await circles(250, 2, 3000);
  for (const [x, y] of [[0.1, 0.1], [0.9, 0.9], [0.1, 0.9], [0.9, 0.1], [0.5, 0.5]]) { await page.mouse.move(W * x, H * y); await wait(500); }
  await shot(`chapter ${idx} ${rec.id} after mouse play`);
  return rec;
}

async function interactUntilNext(idx) {
  // drag, click hotspots, hold — whatever the chapter asks — until NEXT shows
  const visibleNext = () => ev(() => { const n = document.querySelector('.next-btn'); return n && !n.classList.contains('is-hidden') && getComputedStyle(n).display !== 'none' ? n.getBoundingClientRect().toJSON() : null; });
  const t0 = Date.now(); let n = null; let round = 0;
  while (!(n = await visibleNext()) && Date.now() - t0 < 70000) {
    round++;
    // drag strokes across the lower half (grows flowers in drag chapters)
    for (let s = 0; s < 3; s++) {
      const y = H * (0.55 + 0.12 * s);
      await page.mouse.move(W * 0.15, y); await page.mouse.down();
      await smoothMove(W * 0.15, y, W * 0.85, y - 60, 900, 25); await page.mouse.up(); await wait(200);
    }
    // click a grid (hotspots)
    for (const [x, y] of [[0.5, 0.5], [0.3, 0.45], [0.7, 0.45], [0.4, 0.6], [0.6, 0.6], [0.5, 0.35], [0.25, 0.6], [0.75, 0.6]]) { await page.mouse.click(W * x, H * y); await wait(250); }
    // hold
    await page.mouse.move(W / 2, H / 2); await page.mouse.down(); await wait(3500); await page.mouse.up();
    if (round === 1) await shot(`chapter ${idx} interacting`);
  }
  if (n) {
    log('NEXT visible', n);
    await shot(`chapter ${idx} NEXT visible`);
    const cx = n.x + n.width / 2, cy = n.y + n.height / 2;
    await smoothMove(W / 2, H / 2, cx, cy, 700, 20); await wait(900);
    await shot(`chapter ${idx} NEXT hover`);
    return { cx, cy };
  }
  log('NEXT never visible; using debug next');
  return null;
}

async function goNext(btn, idx) {
  // sample transition progress per rAF while clicking NEXT
  await ev(() => {
    window.__sampleFn = () => { const C = GLXP.chapters; const tr = C.transitions; let act = -1; tr.forEach((t, i) => { if (t.active) act = i; }); return { ch: C._currentChapter, act, vis: C.chapters.map(c => c._active ? 1 : 0).join('') }; };
    window.__samples = [];
  });
  const tClick = await ev(() => performance.now());
  if (btn) await page.mouse.click(btn.cx, btn.cy); else await ev(() => document.querySelector('.nextDebug').click());
  for (let k = 0; k < 8; k++) { await wait(300); await shot(`transition ${idx}->${idx + 1} +${(k + 1) * 300}ms`); }
  await wait(1200);
  const s = await stopSampler();
  results.transitions.push({ from: idx, tClick, samples: s });
}

// ---------- 3. Chapters ----------
await wait(3000);
for (let idx = 0; idx < 5; idx++) {
  const ok = await ev(() => !!(window.GLXP && GLXP.chapters)).catch(() => false);
  if (!ok) { log('no GLXP'); break; }
  const cur = await ev(() => GLXP.chapters._currentChapter);
  if (cur !== idx && idx > 0) log('chapter index mismatch', cur, idx);
  const rec = await measureChapter(cur);
  results.chapters.push(rec);
  if (cur >= 4) {
    await wait(4000); await shot('ending'); await circles(200, 1, 3000);
    const links = await page.locator('.ending__social__link').all();
    for (const l of links) { await l.hover().catch(() => {}); await wait(600); }
    await shot('ending hover'); break;
  }
  const btn = await interactUntilNext(cur);
  await goNext(btn, cur);
  await wait(2500);
}

// ---------- 4. cursor follow (DOM cursor) ----------
await ev(() => { window.__sampleFn = () => { const c = document.querySelector('canvas.cursor') || document.querySelector('.cursor'); return { tr: c && c.style.transform }; }; window.__samples = []; });
const tc = await ev(() => performance.now());
await page.mouse.move(W * 0.3, H * 0.3); await wait(800); await page.mouse.move(W * 0.7, H * 0.6); await wait(800);
results.cursor = { t: tc, samples: await stopSampler() };

// ---------- dump ----------
results.tweens = await ev(() => window.__tweens);
results.marks = await ev(() => window.__marks);
results.console = consoleLog.slice(0, 200);
fs.writeFileSync(path.join(OUT, `tweens-${W}.json`), JSON.stringify(results.tweens, null, 1));
fs.writeFileSync(path.join(RAW, `results-${W}.json`), JSON.stringify(results, null, 1));
const v = page.video();
await ctx.close();
const vp = await v.path();
fs.copyFileSync(vp, path.join(OUT, `recording-${W}.webm`));
await browser.close();
log('done', vp);
