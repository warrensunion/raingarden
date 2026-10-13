/**
 * Step 10 — Plan: the one-page plan (A4 at 300 dpi) as PNG and PDF. Location
 * is the region (and Richmond, BC only when that was the fallback): never an
 * address or coordinates.
 */

import { drawPlan, PLAN_W, PLAN_H, SAFETY } from '../plan-canvas.js';
import { makePdf } from '../../plan/pdf.js';
import { plantRows, planPdfLines, stormPhrase, fmtL, fmtNum } from '../model.js';
import { PLANTS, SOURCES, REGIONS } from '../../data/plants.js';

const SIZING_NAME = {
  pnw: 'WSU Extension, Rain Garden Handbook for Western Washington (2013)',
  on: 'Wisconsin DNR / UW-Extension, Rain Gardens: A how-to manual for homeowners (2003)',
};
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function save(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export default function plan(sheet, ctx) {
  const { state } = ctx;
  const b = sheet.body;
  b.innerHTML = `
    <h2 class="dz-h2">Your plan</h2>
    <p class="dz-progress-line" role="status">Drawing your plan…</p>
    <img class="dz-plan-img" alt="Your one-page rain garden plan" hidden>
    <div class="dz-plan-btns" hidden>
      <button type="button" class="btn btn-ghost dz-pdf">Download PDF</button>
      <button type="button" class="dz-text-btn dz-restart">Start over</button>
    </div>`;
  const line = b.querySelector('.dz-progress-line');
  const img = b.querySelector('.dz-plan-img');
  const btns = b.querySelector('.dz-plan-btns');
  let alive = true;
  let canvas = null;
  let pngUrl = null;
  sheet.setPrimary({ label: 'Download PNG', disabled: true });
  ctx.pose('plan');
  ctx.yard()?.setSplit(null);

  const storm = state.storms.find((s) => s.id === state.stormId);
  const now = new Date();
  const date = `${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
  const region = REGIONS[state.region].name;
  const placeLine = state.place && state.place.fallback ? `${region} (storm data for Richmond, BC)` : region;
  const rows = plantRows(state.plants, PLANTS);
  const plantSources = [...new Set(REGIONS[state.region].plant_sources)].map((k) => SOURCES[k]).filter(Boolean).map((s) => `${s.publisher}${s.year ? ` ${s.year}` : ''}`);
  const sources = [
    `Sizing: ${SIZING_NAME[state.region]}.`,
    `Plants: ${plantSources.join('; ')}.`,
    `Storm: ${storm.source.text}`,
    'Siting: WSU 2013; Metro Vancouver 2023. Made with Raingarden.',
  ];
  const outBefore = state.before.result.ledger.outL;
  const outAfter = state.after.result.ledger.outL;
  const data = {
    date, placeLine, terrain: ctx.terrain(), yard: state.gm.yard, wall: state.si.site.wall, spout: state.gm.downspout,
    inlet: state.si.inlet, outlet: state.gm.outlet, septic: state.gm.septic, garden: state.design.garden,
    plants: state.plants, rows, soil: state.soil, storm,
    capturedL: Math.max(0, outBefore - outAfter), outBeforeL: outBefore, outAfterL: outAfter,
    drainH: state.design.drainH, areaM2: state.design.areaM2, costTotal: state.design.cost.total, sources,
  };

  async function pdfBytes() {
    const jpegBlob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
    const jpeg = new Uint8Array(await jpegBlob.arrayBuffer());
    // every source line goes into the PDF (planPdfLines drops spacers before text, never text)
    const lines = planPdfLines({
      head: `Your rain garden - ${date} - ${region}`,
      summary: `${fmtNum(data.areaM2, 1)} m2 garden: catches about ${fmtL(data.capturedL)} of the ${stormPhrase(storm.label, storm.totalMm)}; ${fmtL(outAfter)} still leaves the yard.`,
      safety: SAFETY,
      sources,
    });
    return makePdf({ jpeg, imgW: PLAN_W, imgH: PLAN_H, title: 'Your rain garden', lines });
  }

  (async () => {
    canvas = await drawPlan(data);
    if (!alive) return;
    const png = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    pngUrl = URL.createObjectURL(png);
    img.src = pngUrl;
    img.hidden = false;
    btns.hidden = false;
    line.textContent = '';
    ctx.setResult({ step: 'plan', pngW: canvas.width, pngH: canvas.height, pngBytes: png.size });
    sheet.setPrimary({ label: 'Download PNG', onClick: () => save(png, 'rain-garden-plan.png') });
    b.querySelector('.dz-pdf').addEventListener('click', async () => {
      const bytes = await pdfBytes();
      save(new Blob([bytes], { type: 'application/pdf' }), 'rain-garden-plan.pdf');
    });
    b.querySelector('.dz-restart').addEventListener('click', () => ctx.restart());
  })().catch((e) => {
    console.warn('[raingarden] plan failed:', e);
    if (alive) line.textContent = 'The plan could not be drawn on this device.';
  });

  return {
    destroy() {
      alive = false;
      if (pngUrl) URL.revokeObjectURL(pngUrl);
    },
  };
}
