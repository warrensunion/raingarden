// Recon: list resources, DOM structure of landing; fetch main.css/main.js text to a scratch dir (outside the project) for analysis only.
import { chromium } from 'playwright';
import fs from 'node:fs';
const SCRATCH = process.argv[2];
const b = await chromium.launch({ headless: false, args: ['--use-angle=d3d11', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const reqs = []; p.on('request', r => reqs.push(r.resourceType() + ' ' + r.url()));
await p.goto('https://2019.makemepulse.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForTimeout(6000);
const info = await p.evaluate(async () => {
  const links = [...document.querySelectorAll('link[rel=stylesheet],script[src]')].map(e => e.href || e.src);
  const out = { links, globals: Object.keys(window).filter(k => /tween|timeline|gsap|ease|power|expo|three|vue|howl|sound/i.test(k)) };
  out.html = document.body.innerHTML.replace(/<svg[\s\S]*?<\/svg>/g, '<svg/>').slice(0, 8000);
  return out;
});
fs.writeFileSync(SCRATCH + '/recon.json', JSON.stringify({ info, reqs }, null, 1));
for (const u of info.links) {
  let txt; try { txt = await (await p.request.get(u)).text(); } catch (e) { console.log("skip", u); continue; }
  fs.writeFileSync(SCRATCH + '/' + u.split('/').pop().split('?')[0], txt);
}
await b.close();
