/**
 * Boot: styles, the scroll engine, the story, then the preloader's reveal.
 *
 * Why this order: the story builds (and starts decoding scene 1) while the
 * preloader counts the same bytes, so the reveal uncovers a finished frame.
 * The designer (and with it three.js and the depth model) is a dynamic
 * import that only runs when someone asks for it.
 */
import './styles/tokens.css';
import './styles/base.css';
import './styles/story.css';
import { startScroll, settleScroll } from './core/scroll.js';
import { lazy } from './core/lazy.js';
import { startStory } from './story/story.js';
import { runPreloader } from './story/preloader.js';
import { sceneImages } from './story/scenes.js';

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
if (!location.hash) window.scrollTo(0, 0);

const loadDesigner = lazy(() => import('./designer/designer.js'));
const designerRoot = document.getElementById('designer-mount');
let designer = null;

async function openDesign(mode) {
  document.getElementById('designer').scrollIntoView({ behavior: 'smooth', block: 'start' });
  const { openDesigner } = await loadDesigner();
  designer?.destroy?.();
  designer = openDesigner(designerRoot, { mode });
  document.getElementById('designer').classList.add('is-open');
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-design]');
  if (!a || a.closest('#story')) return;
  e.preventDefault();
  openDesign(a.dataset.design);
});

startScroll();
const story = startStory(document.getElementById('story'), { onDesign: openDesign });

const scene1 = document.querySelector('.story-scene');
runPreloader({
  images: [...sceneImages(0), '/art/tex-raindrop.webp'],
  onBlobs: (blobs) => story.adopt(blobs),
  decode: () => Promise.all([...scene1.querySelectorAll('.story-layers img')].map((img) => img.decode().catch(() => {}))),
  fonts: ['20px "Young Serif"', '16px "Atkinson Hyperlegible Next"'],
  onReveal: () => { settleScroll(); story.enter(); },
});
