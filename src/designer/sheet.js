/**
 * The step sheet: a bottom sheet on phones (drag handle, at most 62vh, the yard
 * stays visible above it) and a 400 px side panel on wider screens.
 *
 * WHY one element for both: the designer is one continuous scene; only the
 * sheet's content changes between steps. Content cross-slides (0.5 s,
 * --ease-ui), the footer keeps one marigold primary and a quiet "Back", and a
 * thin 10-segment line says where you are (the steps are a sequence, so the
 * numbering is honest; no "Step 3 of 10" eyebrow).
 *
 * The sheet publishes its height as --dz-sheet-h on the designer root so the
 * stage above it (the WebGL yard) can size itself to the visible area.
 */

const PHONE = '(max-width: 1023px)';

export function createSheet(root, { count = 10, reducedMotion = false, onBack } = {}) {
  const el = document.createElement('aside');
  el.className = 'dz-sheet';
  el.setAttribute('aria-label', 'Designer steps');
  el.innerHTML = `
    <button class="dz-handle" type="button" aria-label="Expand or collapse the panel" aria-expanded="true"><span></span></button>
    <ol class="dz-progress" aria-label="Progress">${Array.from({ length: count }, (_, i) => `<li data-i="${i + 1}"><span class="vh">Step ${i + 1}</span></li>`).join('')}</ol>
    <div class="dz-panes"></div>
    <div class="dz-foot">
      <button class="dz-back" type="button">Back</button>
      <button class="btn btn-primary dz-primary" type="button"></button>
    </div>`;
  root.appendChild(el);
  const panes = el.querySelector('.dz-panes');
  const primary = el.querySelector('.dz-primary');
  const back = el.querySelector('.dz-back');
  const handle = el.querySelector('.dz-handle');
  const progress = [...el.querySelectorAll('.dz-progress li')];
  let current = null;
  let primaryFn = null;

  primary.addEventListener('click', () => { if (primaryFn && !primary.disabled) primaryFn(); });
  back.addEventListener('click', () => onBack && onBack());

  // ---- height published for the stage ----
  const publish = () => {
    const phone = matchMedia(PHONE).matches;
    root.style.setProperty('--dz-sheet-h', phone ? `${Math.round(el.getBoundingClientRect().height)}px` : '0px');
  };
  const ro = new ResizeObserver(publish);
  ro.observe(el);
  addEventListener('resize', publish);

  // ---- phone: drag the handle to collapse / expand ----
  let collapsed = false;
  const setCollapsed = (c) => {
    collapsed = c;
    el.classList.toggle('is-collapsed', c);
    handle.setAttribute('aria-expanded', String(!c));
  };
  let drag = null;
  handle.addEventListener('pointerdown', (e) => {
    drag = { y: e.clientY, moved: false };
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dy = e.clientY - drag.y;
    if (Math.abs(dy) > 6) drag.moved = true;
    if (drag.moved) el.style.transform = `translateY(${Math.max(collapsed ? -200 : 0, dy)}px)`;
  });
  const endDrag = (e) => {
    if (!drag) return;
    const dy = e.clientY - drag.y;
    el.style.transform = '';
    if (!drag.moved) setCollapsed(!collapsed);
    else if (dy > 40) setCollapsed(true);
    else if (dy < -40) setCollapsed(false);
    drag = null;
  };
  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', endDrag);

  return {
    el,
    /**
     * Swap in a new pane for step n. dir: 1 forward, -1 back.
     * @returns {HTMLElement} the pane's body to render into
     */
    show(n, dir = 1) {
      progress.forEach((li, i) => {
        li.classList.toggle('is-done', i + 1 < n);
        li.classList.toggle('is-on', i + 1 === n);
      });
      el.querySelector('.dz-progress').setAttribute('aria-label', `Progress: step ${n} of ${count}`);
      const pane = document.createElement('div');
      pane.className = 'dz-pane';
      const old = current;
      current = pane;
      if (old) {
        if (reducedMotion) {
          old.remove();
          pane.classList.add('is-fade');
        } else {
          old.classList.add(dir > 0 ? 'is-out-left' : 'is-out-right');
          pane.classList.add(dir > 0 ? 'is-in-right' : 'is-in-left');
          setTimeout(() => old.remove(), 520);
        }
      }
      panes.appendChild(pane);
      requestAnimationFrame(() => requestAnimationFrame(() => pane.classList.remove('is-in-right', 'is-in-left', 'is-fade')));
      panes.scrollTop = 0;
      setCollapsed(false);
      this.setPrimary(null);
      back.hidden = n <= 1;
      return pane;
    },
    /** One marigold primary per step: { label, onClick, disabled } or null to hide it. */
    setPrimary(p) {
      if (!p) { primary.hidden = true; primaryFn = null; return; }
      primary.hidden = false;
      primary.textContent = p.label;
      primary.disabled = !!p.disabled;
      primary.setAttribute('aria-disabled', String(!!p.disabled));
      primaryFn = p.onClick || null;
    },
    setBack(visible) { back.hidden = !visible; },
    focusPrimary() { if (!primary.hidden) primary.focus({ preventScroll: true }); },
    destroy() {
      ro.disconnect();
      removeEventListener('resize', publish);
      el.remove();
    },
  };
}
