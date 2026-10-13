/**
 * Marks on the photo: tap to place, drag to adjust, arrow keys to nudge.
 *
 * WHY its own module: marking is the one place the user draws, and it must
 * work with a thumb on a 390 px phone, a mouse, and a keyboard. Everything is
 * kept in image coordinates (u, v in 0..1, u right, v down), the frame
 * heightfield.js reads, so the marks never depend on how big the photo is
 * drawn. The SVG overlay sits exactly on the letterboxed photo.
 *
 * Marks (shared with the designer's state, mutated in place):
 *   scale {a, b, meters}, downspout [u, v], wall [[u, v] x3], outlet [u, v],
 *   yard [[u, v] ...], septic [[u, v] ...] | null.
 */

const NS = 'http://www.w3.org/2000/svg';
const ICONS = {
  downspout: 'M0-7c3 4 5 6.2 5 8.6A5 5 0 0 1-5 1.6C-5-.8-3-3 0-7z',
  wall: 'M-6 1 0-5 6 1M-4 0v6h8V0',
  outlet: 'M0-6v10M-4.5 0 0 4.5 4.5 0',
};
const LABEL = {
  downspout: 'Downspout', wall: 'House wall', outlet: 'Where water leaves', yard: 'Yard corner', septic: 'Septic corner', scale: 'Scale end',
};

const clamp01 = (v) => Math.min(1, Math.max(0, v));

export function createMarkerEditor(host, { photoUrl, aspect, marks, onChange }) {
  const wrap = document.createElement('div');
  wrap.className = 'dz-photo';
  wrap.innerHTML = `<div class="dz-photo-box"><img alt="Your yard photo" draggable="false"><svg class="dz-marks" role="group" aria-label="Marks on your photo"></svg></div>`;
  host.appendChild(wrap);
  const box = wrap.querySelector('.dz-photo-box');
  const img = wrap.querySelector('img');
  const svg = wrap.querySelector('svg');
  img.src = photoUrl;
  const VW = 1000 * aspect;
  const VH = 1000;
  svg.setAttribute('viewBox', `0 0 ${VW} ${VH}`);
  svg.setAttribute('preserveAspectRatio', 'none');

  let task = null;
  let closed = { yard: (marks.yard || []).length >= 3, septic: (marks.septic || []).length >= 3 };
  const history = [];
  let overlay = []; // contour polylines in uv

  // letterbox the photo into the host
  function layout() {
    const r = wrap.getBoundingClientRect();
    if (!r.width || !r.height) return;
    let w = r.width;
    let h = w / aspect;
    if (h > r.height) { h = r.height; w = h * aspect; }
    box.style.width = `${w}px`;
    box.style.height = `${h}px`;
    draw();
  }
  const ro = new ResizeObserver(layout);
  ro.observe(wrap);

  const snapshot = () => JSON.stringify({ marks, closed });
  function remember() {
    history.push(snapshot());
    if (history.length > 80) history.shift();
  }
  function changed() {
    draw();
    if (onChange) onChange(task);
  }

  function uvOf(e) {
    const r = box.getBoundingClientRect();
    return [clamp01((e.clientX - r.left) / r.width), clamp01((e.clientY - r.top) / r.height)];
  }
  const X = (p) => p[0] * VW;
  const Y = (p) => p[1] * VH;
  const k = () => VW / Math.max(1, box.getBoundingClientRect().width); // svg units per css px

  function el(tag, attrs, parent = svg) {
    const n = document.createElementNS(NS, tag);
    for (const a in attrs) n.setAttribute(a, attrs[a]);
    parent.appendChild(n);
    return n;
  }

  /** A draggable, focusable handle bound to get/set of one point. */
  function handle(kind, get, set, { idx = 0, label, icon = null, cls = '' } = {}) {
    const s = k();
    const g = el('g', {
      class: `dz-h dz-h-${kind} ${cls}`, tabindex: '0', role: 'button',
      'aria-label': `${label || LABEL[kind]}. Drag, or use the arrow keys to move it.`,
      transform: `translate(${X(get())} ${Y(get())})`,
    });
    if (icon) {
      el('circle', { r: 22 * s, class: 'dz-hit' }, g);
      el('circle', { r: 16 * s, class: 'dz-pin' }, g);
      el('path', { d: ICONS[icon], transform: `scale(${1.5 * s})`, class: 'dz-pin-icon' }, g);
    } else {
      el('circle', { r: 22 * s, class: 'dz-hit' }, g);
      el('circle', { r: 9 * s, class: 'dz-dot' }, g);
    }
    let dragging = false;
    let start = null;
    g.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      remember();
      start = [...get()];
      dragging = true;
      g.setPointerCapture(e.pointerId);
      g.classList.add('is-drag');
    });
    g.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      set(uvOf(e));
      g.setAttribute('transform', `translate(${X(get())} ${Y(get())})`);
      drawLines();
    });
    const up = (e) => {
      if (!dragging) return;
      dragging = false;
      g.classList.remove('is-drag');
      e.stopPropagation();
      const p = get();
      const moved = p[0] !== start[0] || p[1] !== start[1];
      // a tap (no move) on the first corner of an open outline closes it
      const closes = !moved && (kind === 'yard' || kind === 'septic') && idx === 0 && task === kind && !closed[kind] && (marks[kind] || []).length >= 3;
      if (closes) closed[kind] = true;
      if (!moved && !closes) { history.pop(); return; } // nothing changed: no undo step, no downstream reset
      changed();
    };
    g.addEventListener('pointerup', up);
    g.addEventListener('pointercancel', up);
    g.addEventListener('keydown', (e) => {
      const d = { ArrowLeft: [-0.01, 0], ArrowRight: [0.01, 0], ArrowUp: [0, -0.01], ArrowDown: [0, 0.01] }[e.key];
      if (!d) return;
      e.preventDefault();
      remember();
      const p = get();
      set([clamp01(p[0] + d[0]), clamp01(p[1] + d[1])]);
      changed();
      svg.querySelector(`[data-key="${kind}-${idx}"]`)?.focus();
    });
    g.dataset.key = `${kind}-${idx}`;
    return g;
  }

  let lineLayer = null;
  function drawLines() {
    if (lineLayer) lineLayer.remove();
    lineLayer = document.createElementNS(NS, 'g');
    lineLayer.setAttribute('class', 'dz-lines');
    svg.insertBefore(lineLayer, svg.firstChild);
    const s = k();
    for (const line of overlay) {
      if (line.length < 2) continue;
      el('polyline', { points: line.map((p) => `${X(p)},${Y(p)}`).join(' '), class: 'dz-contour', 'stroke-width': 2 }, lineLayer);
    }
    for (const kind of ['yard', 'septic']) {
      const pts = marks[kind] || [];
      if (pts.length < 2) continue;
      const tag = closed[kind] ? 'polygon' : 'polyline';
      el(tag, { points: pts.map((p) => `${X(p)},${Y(p)}`).join(' '), class: `dz-poly dz-poly-${kind}`, 'stroke-width': 2.5 }, lineLayer);
    }
    if (marks.scale && marks.scale.a && marks.scale.b) {
      const { a, b } = marks.scale;
      el('line', { x1: X(a), y1: Y(a), x2: X(b), y2: Y(b), class: 'dz-scale', 'stroke-width': 3.5, 'stroke-dasharray': `${9 * s} ${6 * s}` }, lineLayer);
      const t = el('text', { x: (X(a) + X(b)) / 2, y: (Y(a) + Y(b)) / 2 - 22 * s, class: 'dz-scale-label', 'font-size': 18 * s }, lineLayer);
      t.textContent = `${(marks.scale.meters || 1).toFixed(1)} m`;
    }
    if (marks.wall && marks.wall.length >= 2) {
      el('polyline', { points: marks.wall.map((p) => `${X(p)},${Y(p)}`).join(' '), class: 'dz-wall-line', 'stroke-width': 1.5, 'stroke-dasharray': `${4 * s} ${6 * s}` }, lineLayer);
    }
  }

  function draw() {
    const focusedKey = document.activeElement?.dataset?.key;
    svg.textContent = '';
    lineLayer = null;
    drawLines();
    const show = (kind) => task === kind || task === 'all' || task === null;
    for (const kind of ['yard', 'septic']) {
      if (!show(kind) && task !== 'view') continue;
      (marks[kind] || []).forEach((p, i) => handle(kind, () => marks[kind][i], (v) => { marks[kind][i] = v; }, { idx: i, label: `${LABEL[kind]} ${i + 1}`, cls: i === 0 && !closed[kind] ? 'is-first' : '' }));
    }
    if (marks.scale && marks.scale.a) handle('scale', () => marks.scale.a, (v) => { marks.scale.a = v; }, { idx: 0, label: 'Scale line start' });
    if (marks.scale && marks.scale.b) handle('scale', () => marks.scale.b, (v) => { marks.scale.b = v; }, { idx: 1, label: 'Scale line end' });
    (marks.wall || []).forEach((p, i) => handle('wall', () => marks.wall[i], (v) => { marks.wall[i] = v; }, { idx: i, label: `House wall tap ${i + 1}`, icon: 'wall' }));
    if (marks.outlet) handle('outlet', () => marks.outlet, (v) => { marks.outlet = v; }, { icon: 'outlet' });
    if (marks.downspout) handle('downspout', () => marks.downspout, (v) => { marks.downspout = v; }, { icon: 'downspout' });
    svg.classList.toggle('is-placing', !!task && task !== 'view');
    if (crossOn && task && task !== 'view') {
      const s = k();
      const c = el('g', { class: 'dz-cross', transform: `translate(${X(cross)} ${Y(cross)})`, 'aria-hidden': 'true' });
      el('circle', { r: 14 * s, class: 'dz-cross-ring' }, c);
      el('path', { d: `M${-24 * s} 0H${-6 * s}M${6 * s} 0H${24 * s}M0 ${-24 * s}V${-6 * s}M0 ${6 * s}V${24 * s}`, class: 'dz-cross-line' }, c);
    }
    if (focusedKey) svg.querySelector(`[data-key="${focusedKey}"]`)?.focus();
  }

  // ---- keyboard placement: with the photo focused, arrows move a crosshair and Enter places ----
  let cross = [0.5, 0.6];
  let crossOn = false;
  svg.setAttribute('tabindex', '0');
  svg.setAttribute('aria-label', 'Your photo. Arrow keys move a crosshair (Shift for bigger steps); Enter places the mark.');
  svg.addEventListener('focus', (e) => { if (e.target === svg) { crossOn = true; draw(); } });
  svg.addEventListener('blur', (e) => { if (e.target === svg) { crossOn = false; draw(); } });
  svg.addEventListener('keydown', (e) => {
    if (e.target !== svg || !task || task === 'view') return;
    const st = e.shiftKey ? 0.05 : 0.01;
    const d = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] }[e.key];
    if (d) {
      e.preventDefault();
      cross = [clamp01(cross[0] + d[0]), clamp01(cross[1] + d[1])];
      draw();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      place([...cross]);
      svg.focus();
    }
  });

  // ---- tap on the photo places the active task's mark ----
  let down = null;
  svg.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  svg.addEventListener('pointerup', (e) => {
    if (!down || !task || task === 'view') return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8;
    down = null;
    if (moved) return;
    place(uvOf(e));
  });
  svg.addEventListener('dblclick', (e) => {
    if ((task === 'yard' || task === 'septic') && (marks[task] || []).length >= 3) {
      e.preventDefault();
      closed[task] = true;
      changed();
    }
  });

  function place(uv) {
    remember();
    if (task === 'scale') {
      const s = marks.scale || (marks.scale = { a: null, b: null, meters: 1 });
      if (!s.a || (s.a && s.b)) { s.a = uv; s.b = null; } else s.b = uv;
    } else if (task === 'downspout' || task === 'outlet') {
      marks[task] = uv;
    } else if (task === 'wall') {
      marks.wall = marks.wall || [];
      if (marks.wall.length >= 3) marks.wall.shift();
      marks.wall.push(uv);
    } else if (task === 'yard' || task === 'septic') {
      if (closed[task]) { history.pop(); return; }
      marks[task] = marks[task] || [];
      marks[task].push(uv);
    }
    changed();
  }

  return {
    el: wrap,
    /** Which mark a tap places: 'scale' | 'downspout' | 'wall' | 'outlet' | 'yard' | 'septic' | 'view' | null (all handles). */
    setTask(t) { task = t; draw(); },
    isClosed(kind) { return !!closed[kind]; },
    close(kind) { if ((marks[kind] || []).length >= 3) { remember(); closed[kind] = true; changed(); } },
    canUndo() { return history.length > 0; },
    undo() {
      const s = history.pop();
      if (!s) return;
      const o = JSON.parse(s);
      for (const key of Object.keys(marks)) delete marks[key];
      Object.assign(marks, o.marks);
      closed = o.closed;
      changed();
    },
    /** Contour polylines in image coordinates, drawn under the marks. */
    setOverlay(lines) { overlay = lines || []; draw(); },
    redraw: draw,
    layout,
    destroy() { ro.disconnect(); wrap.remove(); },
  };
}
