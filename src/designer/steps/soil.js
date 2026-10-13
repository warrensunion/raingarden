/**
 * Step 4 — Soil: sand, loam or clay. The sim's Green-Ampt numbers and the
 * sizing method's bands both key off this one choice, so it is a plain
 * three-way pick with the jar test for anyone who is unsure (Clemson HGIC
 * 1656, via docs/research/sizing.md).
 */

const SOILS = [
  ['sand', 'Sand', 'Gritty and loose. Water vanishes in minutes.'],
  ['loam', 'Loam', 'Crumbly garden soil. Puddles soak in within hours.'],
  ['clay', 'Clay', 'Sticky when wet, cracks when dry. Puddles linger for a day.'],
];

const JAR_URL = 'https://hgic.clemson.edu/factsheet/soil-texture-analysis-the-jar-test/';

export default function soil(sheet, ctx) {
  const { state } = ctx;
  const b = sheet.body;
  b.innerHTML = `
    <h2 class="dz-h2">What’s your soil like?</h2>
    <div class="dz-cards" role="radiogroup" aria-label="Soil">
      ${SOILS.map(([k, name, say]) => `<button type="button" class="dz-card dz-soil dz-soil-${k}" role="radio" data-s="${k}" aria-checked="${state.soil === k}">
        <span class="dz-card-swatch" aria-hidden="true"></span><span class="dz-card-name">${name}</span><span class="dz-card-say">${say}</span></button>`).join('')}
    </div>
    <details class="dz-jar">
      <summary>Not sure? Do the jar test</summary>
      <ol>
        <li>Sift a few handfuls of soil to take out stones and roots.</li>
        <li>Fill a straight-sided clear jar one-third with soil, then nearly to the top with water.</li>
        <li>Cap it and shake hard until it is an even slurry.</li>
        <li>Set it down. After 1 minute, mark the top of the sand layer.</li>
        <li>After 2 hours, mark the top of the silt.</li>
        <li>After 48 hours, mark the top of the clay.</li>
        <li>Each layer ÷ the total height is its share. Mostly sand: pick Sand. Lots of clay (a thick top layer): pick Clay. A mix: Loam.</li>
      </ol>
      <p class="dz-cite">Source: <a href="${JAR_URL}" target="_blank" rel="noopener">Clemson Cooperative Extension, HGIC 1656, “Soil Texture Analysis: The Jar Test”</a>.</p>
    </details>`;
  const cards = [...b.querySelectorAll('.dz-soil')];
  const pick = (k) => {
    if (state.soil !== k) ctx.resetFrom('soil');
    state.soil = k;
    cards.forEach((c) => c.setAttribute('aria-checked', String(c.dataset.s === k)));
  };
  cards.forEach((c) => c.addEventListener('click', () => pick(c.dataset.s)));
  b.querySelector('.dz-cards').addEventListener('keydown', (e) => {
    const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!d) return;
    e.preventDefault();
    const i = (cards.findIndex((c) => c.dataset.s === state.soil) + d + cards.length) % cards.length;
    pick(cards[i].dataset.s);
    cards[i].focus();
  });
  ctx.pose('storm');
  sheet.setPrimary({ label: 'Next', onClick: () => ctx.next() });
  return { destroy() {} };
}
