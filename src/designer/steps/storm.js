/**
 * Step 5 — Storm: three real storms for where the user is (Open-Meteo, coords
 * rounded to 2 dp), or for Richmond, BC when location is denied or missing.
 * The design storm (90th-percentile wet day) is the default: it is the
 * capture criterion the guides size for.
 */

import { getStorms } from '../../weather/openmeteo.js';
import { hyetograph } from '../../sim/storm.js';
import { radioKeys } from '../radio.js';
import { regionFromLon, round2, sparkPath, fmtNum } from '../model.js';

const RICHMOND = { lat: 49.17, lon: -123.14, label: 'Richmond, BC' };
const REGION_NAMES = { pnw: 'Pacific Northwest', on: 'Southern Ontario' };

export default function storm(sheet, ctx) {
  const { state } = ctx;
  const b = sheet.body;
  b.innerHTML = `
    <h2 class="dz-h2">Pick a real storm</h2>
    <div class="dz-loc">
      <button type="button" class="dz-chip dz-locate">Use my location</button>
      <p class="dz-loc-say" role="status"></p>
    </div>
    <div class="dz-seg dz-region" role="radiogroup" aria-label="Region">
      <button type="button" role="radio" data-r="pnw">Pacific Northwest</button>
      <button type="button" role="radio" data-r="on">Southern Ontario</button>
    </div>
    <div class="dz-cards dz-storms" role="radiogroup" aria-label="Storm"><p class="dz-muted">Fetching storms…</p></div>`;
  const say = b.querySelector('.dz-loc-say');
  const list = b.querySelector('.dz-storms');
  const regionBtns = [...b.querySelectorAll('[data-r]')];
  let alive = true;
  let seq = 0;

  if (!state.place) state.place = { ...RICHMOND, fallback: true };

  function sayPlace(extra = '') {
    const p = state.place;
    say.textContent = p.fallback
      ? `Using Richmond, BC${extra}.`
      : `Using your location (${REGION_NAMES[state.region]}, rounded to about 1 km).`;
  }
  function setRegionUi() {
    regionBtns.forEach((x) => x.setAttribute('aria-checked', String(x.dataset.r === state.region)));
  }

  async function load() {
    const my = ++seq;
    list.innerHTML = '<p class="dz-muted">Fetching storms…</p>';
    sheet.setPrimary({ label: 'Run the storm', disabled: true });
    const storms = await getStorms({ lat: round2(state.place.lat), lon: round2(state.place.lon), region: state.region, shapeFn: hyetograph });
    if (!alive || my !== seq) return;
    state.storms = storms;
    if (!storms.some((s) => s.id === state.stormId)) state.stormId = 'design';
    render();
  }

  function pickStorm(id) {
    if (state.stormId !== id) ctx.resetFrom('storm');
    state.stormId = id;
    render();
  }

  function render() {
    // the source link sits outside the radio button: no interactive element inside role="radio"
    list.innerHTML = state.storms.map((s) => `
      <div class="dz-storm-item">
        <button type="button" class="dz-card dz-storm" role="radio" data-id="${s.id}" aria-checked="${s.id === state.stormId}">
          <span class="dz-card-name">${s.label}</span>
          <span class="dz-storm-mm"><strong>${fmtNum(s.totalMm, 1)}</strong> mm</span>
          <svg class="dz-spark" viewBox="0 0 120 28" preserveAspectRatio="none" aria-hidden="true"><path d="${sparkPath(s.mm, 120, 26)}" transform="translate(0 1)"/></svg>
        </button>
        <p class="dz-card-src">${s.source.text} <a href="${s.source.url}" target="_blank" rel="noopener">Data</a></p>
      </div>`).join('');
    for (const c of list.querySelectorAll('.dz-storm')) c.addEventListener('click', () => pickStorm(c.dataset.id));
    sheet.setPrimary({ label: 'Run the storm', onClick: () => ctx.next() });
  }

  b.querySelector('.dz-locate').addEventListener('click', () => {
    if (!navigator.geolocation) { sayPlace(': this browser has no location'); return; }
    say.textContent = 'Finding you…';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!alive) return;
        state.place = { lat: round2(pos.coords.latitude), lon: round2(pos.coords.longitude), label: null, fallback: false };
        state.region = regionFromLon(state.place.lon);
        ctx.resetFrom('storm');
        setRegionUi();
        sayPlace();
        load();
      },
      () => { if (alive) sayPlace(': location is off or blocked'); },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  });

  radioKeys(list, '.dz-storm', (x) => pickStorm(x.dataset.id));
  radioKeys(b.querySelector('.dz-region'), '[data-r]', (x) => x.click());
  b.querySelector('.dz-region').addEventListener('click', (e) => {
    const r = e.target.closest('[data-r]');
    if (!r || r.dataset.r === state.region) return;
    state.region = r.dataset.r;
    ctx.resetFrom('region');
    setRegionUi();
    load();
  });

  ctx.pose('storm');
  setRegionUi();
  sayPlace(state.place.fallback ? ' until you share your location' : '');
  if (state.storms) render();
  else load();

  return { destroy() { alive = false; } };
}
