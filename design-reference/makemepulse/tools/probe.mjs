// First look: what the page is made of (canvas? DOM layers? fonts?), at 1440x900.
import { chromium } from 'playwright';
const b = await chromium.launch({ headless: false, args: ['--use-angle=d3d11', '--enable-gpu'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const logs = []; p.on('console', m => logs.push(m.type() + ' ' + m.text()));
const reqs = []; p.on('request', r => reqs.push(r.resourceType() + ' ' + r.url()));
await p.goto('https://2019.makemepulse.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
const t0 = Date.now();
const snaps = [];
for (let i = 0; i < 16; i++) {
  await p.waitForTimeout(500);
  snaps.push(await p.evaluate(() => ({ t: performance.now() | 0, title: document.title, canv: [...document.querySelectorAll('canvas')].map(c => c.width + 'x' + c.height), body: document.body.innerText.slice(0, 200).replace(/\s+/g, ' ') })));
  if (i % 4 === 0) await p.screenshot({ path: `design-reference/makemepulse/probe-${i}.png` });
}
const info = await p.evaluate(() => {
  const all = [...document.querySelectorAll('*')];
  const fonts = new Set(all.map(e => getComputedStyle(e).fontFamily));
  const sh = document.documentElement.scrollHeight;
  return { fonts: [...fonts].slice(0, 20), sh, html: document.body.innerHTML.slice(0, 3000), libs: Object.keys(window).filter(k => /three|pixi|gsap|tween|vue|react|nuxt/i.test(k)) };
});
console.log(JSON.stringify({ snaps, info }, null, 1));
console.log(reqs.filter(r => !/image/.test(r)).slice(0, 60).join('\n'));
console.log(logs.slice(0, 20).join('\n'));
await b.close();
