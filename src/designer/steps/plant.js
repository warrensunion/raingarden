/**
 * Step 8 — Plant: native plants by moisture zone, drawn on the yard at their
 * real mature spread, with a grow-in timelapse (planting day, year 1, year 3).
 * The season is the renderer's fast path (no re-carve), so the timelapse is
 * just a number animating 0.3 -> 0.7 -> 1.0.
 */

import { layoutPlants } from '../../garden/layout.js';
import { PLANTS, SOURCES } from '../../data/plants.js';
import { plantRows } from '../model.js';
import { easeUi } from '../../core/ease.js';
import { radioKeys } from '../radio.js';

const ZONES = [['wet', 'Wet', 'The bottom: fills first, drains last.'], ['middle', 'Middle', 'The sloped sides: wet, then dry.'], ['edge', 'Edge', 'The rim and berm: mostly dry.']];
const SEASONS = [['Planting day', 0.3], ['Year 1', 0.7], ['Year 3', 1]];

const size = (r) => {
  const [h0, h1] = r.heightM;
  const f = (v) => (v < 1 ? `${Math.round(v * 100)} cm` : `${v.toFixed(1)} m`);
  return h0 === h1 ? `to ${f(h1)} tall` : `${f(h0)}–${f(h1)} tall`;
};

export default function plant(sheet, ctx) {
  const { state } = ctx;
  const g = state.design.garden;
  if (!state.plants) state.plants = layoutPlants(g, PLANTS, { seed: 1, region: state.region });
  const placed = state.plants;
  const rows = plantRows(placed, PLANTS);
  ctx.setResult({ step: 'plant', plants: placed.length, species: rows.length, warnings: placed.warnings || [] });

  const b = sheet.body;
  b.innerHTML = `
    <h2 class="dz-h2">Plant it with natives</h2>
    <p class="dz-lede">${placed.length} plants, ${rows.length} species from ${state.region === 'pnw' ? 'the Pacific Northwest' : 'Southern Ontario'}, spaced for their size when grown.</p>
    <div class="dz-seg dz-seasons" role="radiogroup" aria-label="Grow-in">${SEASONS.map(([l, v], i) => `<button type="button" role="radio" data-i="${i}" aria-checked="${i === 2}">${l}</button>`).join('')}</div>
    ${(placed.warnings || []).length ? `<p class="dz-note">${placed.warnings.map((w) => w.message).join(' ')}</p>` : ''}
    ${ZONES.map(([z, name, say]) => {
      const zr = rows.filter((r) => r.zone === z);
      return `<section class="dz-zone dz-zone-${z}"><h3><span class="dz-zone-key" aria-hidden="true"></span>${name} <span class="dz-muted">· ${say}</span></h3>
        ${zr.length ? `<ul>${zr.map((r) => `<li class="dz-plant">
          <img src="/art/plants/${r.id}.webp" alt="" width="56" height="56" loading="lazy" decoding="async" onerror="this.style.visibility='hidden'">
          <div><p class="dz-plant-name">${r.common} <span class="dz-qty">× ${r.qty}</span></p>
          <p class="dz-plant-latin">${r.latin}</p>
          <p class="dz-plant-meta">${size(r)}, ${r.spreadM[1] < 1 ? `${Math.round(r.spreadM[1] * 100)} cm` : `${r.spreadM[1].toFixed(1)} m`} wide · ${r.sources.slice(0, 1).map((s) => SOURCES[s] ? `<a href="${SOURCES[s].url}" target="_blank" rel="noopener">source</a>` : '').join('')}</p></div></li>`).join('')}</ul>`
        : '<p class="dz-muted">Mulch only: nothing in the list fits this zone at this size.</p>'}</section>`;
    }).join('')}`;

  const yard = ctx.yard();
  let season = 1;
  let anim = null;
  let timer = null;
  yard?.setGarden(g, placed, { season });
  ctx.pose('plants');

  function setSeason(target, i) {
    b.querySelectorAll('.dz-seasons [data-i]').forEach((x) => x.setAttribute('aria-checked', String(Number(x.dataset.i) === i)));
    cancelAnimationFrame(anim);
    if (ctx.reducedMotion) {
      // reduced motion: cross-faded stills
      ctx.crossfade(() => { season = target; ctx.yard()?.setGarden(g, placed, { season }); });
      return;
    }
    const from = season;
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / 4000);
      season = from + (target - from) * easeUi(k);
      ctx.yard()?.setGarden(g, placed, { season });
      if (k < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  }
  radioKeys(b.querySelector('.dz-seasons'), '[data-i]', (x) => x.click());
  b.querySelector('.dz-seasons').addEventListener('click', (e) => {
    const x = e.target.closest('[data-i]');
    if (x) clearTimeout(timer); // the user's pick ends the timelapse
    if (x) setSeason(SEASONS[Number(x.dataset.i)][1], Number(x.dataset.i));
  });

  // the timelapse plays once on arrival: planting day -> year 1 -> year 3
  if (!ctx.reducedMotion) {
    season = 0.3;
    yard?.setGarden(g, placed, { season });
    let i = 0;
    const next = () => {
      i++;
      if (i >= SEASONS.length) return;
      setSeason(SEASONS[i][1], i);
      timer = setTimeout(next, 4100);
    };
    b.querySelectorAll('.dz-seasons [data-i]').forEach((x) => x.setAttribute('aria-checked', String(x.dataset.i === '0')));
    timer = setTimeout(next, 700);
  }

  sheet.setPrimary({ label: 'Next', onClick: () => ctx.next() });
  return {
    destroy() {
      cancelAnimationFrame(anim);
      clearTimeout(timer);
      ctx.yard()?.setGarden(g, placed, { season: 1 });
    },
  };
}
