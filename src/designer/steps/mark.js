/**
 * Step 2 — Mark: one sentence per mark, in the order the maths needs them.
 *
 * The scale line gives metres; the downspout is where the roof water enters;
 * three wall taps give gravity when the phone could not; the outlet sets which
 * way the yard drains in the manual fallback; the yard outline bounds the
 * sim; a septic field (optional) keeps the garden away from it.
 */

import { createMarkerEditor } from '../marker-editor.js';

const SUBS = [
  { kind: 'scale', say: 'Draw a line along something 1 m long.', done: (m) => m.scale && m.scale.a && m.scale.b },
  { kind: 'downspout', say: 'Tap the downspout.', done: (m) => !!m.downspout },
  { kind: 'wall', say: 'Tap the house wall three times.', done: (m) => (m.wall || []).length >= 3 },
  { kind: 'outlet', say: 'Tap where water leaves the yard.', done: (m) => !!m.outlet },
  { kind: 'yard', say: 'Outline the yard.', done: (m, ed) => (m.yard || []).length >= 3 && ed.isClosed('yard') },
  { kind: 'septic', say: 'Mark a septic field, if you have one.', optional: true, done: (m, ed) => !m.septic || m.septic.length === 0 || ed.isClosed('septic') },
];

export default function mark(sheet, ctx) {
  const { state } = ctx;
  const m = state.marks;
  const host = ctx.photoStage(true);
  const ed = createMarkerEditor(host, {
    photoUrl: state.photo.url, aspect: state.photo.w / state.photo.h, marks: m,
    onChange: () => { ctx.resetFrom('marks'); render(); },
  });
  let i = Math.max(0, SUBS.findIndex((s) => !s.done(m, ed)));
  if (i < 0 || SUBS.every((s) => s.done(m, ed))) i = 0;

  const b = sheet.body;
  b.innerHTML = `
    <h2 class="dz-h2">Mark your yard</h2>
    <ol class="dz-subs" aria-label="Marks">${SUBS.map((s, k) => `<li data-k="${k}"><button type="button" class="dz-sub">${s.say}</button></li>`).join('')}</ol>
    <div class="dz-sub-tools">
      <label class="dz-field dz-meters" hidden>Its length <input type="number" inputmode="decimal" min="0.1" max="20" step="0.1" value="1.0"> m</label>
      <label class="dz-field dz-roof" hidden>Roof area draining to it <input type="number" inputmode="numeric" min="5" max="2000" step="5"> m²</label>
      <button type="button" class="dz-text-btn dz-close-poly" hidden>Done outlining</button>
      <button type="button" class="dz-text-btn dz-skip" hidden>Skip</button>
      <button type="button" class="dz-text-btn dz-undo">Undo</button>
    </div>
    <p class="dz-hint">Tap the photo to place a mark, drag it to adjust. Arrow keys nudge a focused mark.</p>`;
  const subs = [...b.querySelectorAll('.dz-subs li')];
  const meters = b.querySelector('.dz-meters');
  const metersIn = meters.querySelector('input');
  const roof = b.querySelector('.dz-roof');
  const roofIn = roof.querySelector('input');
  const closeBtn = b.querySelector('.dz-close-poly');
  const skip = b.querySelector('.dz-skip');
  const undo = b.querySelector('.dz-undo');
  roofIn.value = String(state.roofAreaM2);
  metersIn.value = String((m.scale && m.scale.meters) || 1);

  metersIn.addEventListener('input', () => {
    const v = parseFloat(metersIn.value);
    if (v > 0) { m.scale = m.scale || { a: null, b: null, meters: 1 }; m.scale.meters = v; ctx.resetFrom('marks'); ed.redraw(); }
  });
  roofIn.addEventListener('input', () => {
    const v = parseFloat(roofIn.value);
    if (v > 0) { state.roofAreaM2 = v; ctx.resetFrom('marks'); }
  });
  closeBtn.addEventListener('click', () => ed.close(SUBS[i].kind));
  skip.addEventListener('click', () => { m.septic = null; i = SUBS.length - 1; finish(); });
  undo.addEventListener('click', () => ed.undo());
  subs.forEach((li, k) => li.querySelector('button').addEventListener('click', () => { i = k; render(); }));

  function finish() {
    if (SUBS.every((s) => s.done(m, ed))) ctx.next();
  }

  function render() {
    const s = SUBS[i];
    ed.setTask(s.kind);
    subs.forEach((li, k) => {
      li.classList.toggle('is-on', k === i);
      li.classList.toggle('is-done', SUBS[k].done(m, ed) && !(SUBS[k].optional && !m.septic && k !== i));
      li.querySelector('button').setAttribute('aria-current', k === i ? 'step' : 'false');
    });
    meters.hidden = s.kind !== 'scale';
    roof.hidden = s.kind !== 'downspout';
    closeBtn.hidden = !((s.kind === 'yard' || s.kind === 'septic') && (m[s.kind] || []).length >= 3 && !ed.isClosed(s.kind));
    skip.hidden = !s.optional;
    undo.disabled = !ed.canUndo();
    const ok = s.done(m, ed);
    const last = i === SUBS.length - 1;
    sheet.setPrimary({
      label: 'Next',
      disabled: !ok || (last && !SUBS.every((x) => x.done(m, ed))),
      onClick: () => {
        if (last) finish();
        else { i++; render(); }
      },
    });
  }
  render();

  return {
    destroy() {
      ed.destroy();
      ctx.photoStage(false);
    },
  };
}
