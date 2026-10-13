/**
 * Storm playback: 24 s of storm on the yard, a scrubber, play/pause and the
 * clock line ("2:00 pm, 12 mm/h").
 *
 * WHY its own module: the before run and the before/after compare play the
 * same way and must stay in sync, so one clock drives every water layer. The
 * sim sends a frame every 15 minutes; the depth in between is blended per
 * animation frame so the water moves smoothly instead of stepping.
 */

import { clockLabel, rainRateAt } from './model.js';

export function createPlayback(host, { spanS, mm, stepS, durationMs = 24000, reducedMotion = false, onTime }) {
  const el = document.createElement('div');
  el.className = 'dz-play';
  el.innerHTML = `
    <button type="button" class="dz-play-btn" aria-label="Pause"><svg viewBox="0 0 20 20" aria-hidden="true"><path class="i-pause" d="M5 3h3.5v14H5zM11.5 3H15v14h-3.5z"/><path class="i-play" d="M6 3.5v13l11-6.5z"/></svg></button>
    <input class="dz-scrub" type="range" min="0" max="1000" step="1" value="0" aria-label="Storm time">
    <p class="dz-clock" aria-live="off"></p>`;
  host.appendChild(el);
  const btn = el.querySelector('.dz-play-btn');
  const scrub = el.querySelector('.dz-scrub');
  const clock = el.querySelector('.dz-clock');
  let p = 0;
  let playing = !reducedMotion;
  let last = 0;
  let raf = 0;

  function show() {
    const t = p * spanS;
    const rate = rainRateAt(mm, stepS, t);
    clock.textContent = `${clockLabel(t)}, ${rate >= 0.05 ? `${rate < 10 ? rate.toFixed(1) : Math.round(rate)} mm/h` : 'dry'}`;
    scrub.value = String(Math.round(p * 1000));
    scrub.setAttribute('aria-valuetext', clock.textContent);
    btn.classList.toggle('is-playing', playing);
    btn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    onTime(t, rate);
  }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (!playing) { last = 0; return; }
    if (last) p = Math.min(1, p + (now - last) / durationMs);
    last = now;
    if (p >= 1) playing = false;
    show();
  }

  btn.addEventListener('click', () => {
    if (!playing && p >= 1) p = 0;
    playing = !playing;
    last = 0;
    show();
  });
  scrub.addEventListener('input', () => {
    p = Number(scrub.value) / 1000;
    playing = false;
    show();
  });

  if (reducedMotion) p = 1; // reduced motion: show the end state, play on request
  show();
  raf = requestAnimationFrame(loop);

  return {
    el,
    get playing() { return playing; },
    get progress() { return p; },
    seek(x) { p = Math.min(1, Math.max(0, x)); show(); },
    play() { if (p >= 1) p = 0; playing = true; last = 0; },
    pause() { playing = false; show(); },
    destroy() { cancelAnimationFrame(raf); el.remove(); },
  };
}
