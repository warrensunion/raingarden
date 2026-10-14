/**
 * The story's scene table: layers, depths, the raindrop's path and the copy.
 *
 * Why data: story.js, parallax.js and drop.js are engines that never name a
 * scene, so retuning a scene (or adding one) is an edit here only.
 *
 * Depth `z` is distance from the camera in units of the pivot distance
 * (NOTES "Techniques" #3): back plate 3.0, mist 2.5, subject 1.0 (the pivot,
 * it never slides), mid cut-outs 0.6-0.8, foreground band FORE_Z (0.44, derived
 * in parallax.js from the reference's measured -5 px per 100 px). The far and
 * near plates are one painting split along a traced skyline by
 * scripts/split-plates.mjs, so they share the plate's geometry exactly.
 *
 * Layer kinds:
 *  - plate: full-bleed, object-fit cover, same box as every other plate.
 *  - cut: a cut-out placed by its bottom-left corner in viewport fractions
 *    (x, y) and a width in vw; `phone` overrides any of those.
 *  - band: the scene's foreground band, full width along the bottom.
 *  - mist: a painted-light fog bank (CSS), no image.
 *
 * Drop paths and splash points are in plate percent (x, y), read off the
 * same 5 % grid the split polygons were traced on, and follow the subject
 * layer, so the drop stays on the gutter whatever the viewport.
 */
import storms from '../data/storms-richmond.json';
import { FORE_Z } from './parallax.js';

/** One roof, 150 m², in the 90th-percentile design storm: litres = m² × mm. */
const ROOF_M2 = 150;
const runoffL = Math.round((ROOF_M2 * storms.design.totalMm) / 100) * 100;
const litres = runoffL.toLocaleString('en-CA');

const art = (name) => `${import.meta.env.BASE_URL}art/${name}.webp`;
const split = (scene, part) => `${import.meta.env.BASE_URL}art/story/plate-${scene}-${part}.webp`;

const plates = (scene, alt) => [
  { kind: 'plate', src: split(scene, 'far'), z: 3.0, alt: '' },
  { kind: 'mist', z: 2.5 },
  { kind: 'plate', src: split(scene, 'near'), z: 1.0, alt },
];
const band = (scene) => ({ kind: 'band', src: art(`band-${scene}`), z: FORE_Z, alt: '' });

export const scenes = [
  {
    id: 'roof',
    headline: 'A storm lands on your roof.',
    body: 'Scroll to follow one raindrop.',
    layers: [
      ...plates('roof', 'Rain pours off the gutter of a shingled house above a misty lake.'),
      band('roof'),
    ],
    drop: [[55.5, 58], [55.5, 74], [55.6, 95]],
    splash: [55.6, 95],
    rain: 1.0,
  },
  {
    id: 'drive',
    headline: 'It doesn’t soak in.',
    body: `${litres} litres run off one roof in a single design storm.`,
    layers: [
      ...plates('drive', 'Runoff sheets down a steep asphalt driveway into the street.'),
      { kind: 'cut', src: art('drain-leaves'), z: 0.7, alt: '', x: -0.04, y: 1.04, w: 26, phone: { x: -0.2, w: 60 } },
      band('drive'),
    ],
    drop: [[73, 41], [69, 52], [62, 66], [52, 78], [44, 84]],
    splash: [44, 84],
    rain: 0.8,
  },
  {
    id: 'drain',
    headline: 'It all goes somewhere.',
    body: 'Storm drains carry it, oil and all, straight to the nearest creek.',
    layers: [
      ...plates('drain', 'Oily runoff and litter swirl into a curbside storm drain.'),
      { kind: 'cut', src: art('tex-puddle'), z: 0.7, alt: '', x: 0.02, y: 1.02, w: 30, phone: { x: -0.25, w: 80 } },
      band('drain'),
    ],
    drop: [[30, 48], [42, 52], [52, 56], [60, 60]],
    splash: [60, 60],
    rain: 0.6,
  },
  {
    id: 'creek',
    headline: 'Somewhere is a creek.',
    body: 'Fast, dirty water scours the banks salmon need.',
    layers: [
      ...plates('creek', 'A storm pipe pours brown water into a creek, eroding its bank.'),
      { kind: 'cut', src: art('creek-fish'), z: 0.8, alt: '', x: 0.5, y: 0.74, w: 13, drift: -0.06, phone: { x: 0.3, y: 0.6, w: 34 } },
      { kind: 'cut', src: art('creek-reeds'), z: 0.6, alt: '', x: -0.06, y: 1.05, w: 34, phone: { x: -0.3, w: 80 } },
      band('creek'),
    ],
    drop: [[73, 44], [70, 52], [66, 58], [60, 68]],
    splash: [68, 56],
    rain: 0.4,
  },
  {
    id: 'garden',
    headline: 'Or your yard drinks it.',
    body: 'A shallow bowl of native plants and loose soil soaks a roof’s worth of rain into the ground.',
    layers: [
      ...plates('garden', 'A rain garden in cross-section: a downspout fills a planted bowl that drains through soil and gravel.'),
      { kind: 'section', src: art('soil-section'), z: 0.8, alt: 'Cut-away of the garden soil: mulch over amended soil over gravel.' },
      band('garden'),
    ],
    drop: [[84.5, 31], [83, 44], [81, 57], [79, 70], [78, 84]],
    splash: [81, 58],
    rain: 0.3,
  },
  {
    id: 'stream',
    headline: 'Design yours.',
    body: '',
    cta: true,
    layers: [
      ...plates('stream', 'A clear, healthy stream runs over mossy stones under ferns and alders.'),
      { kind: 'cut', src: art('stream-fish'), z: 0.75, alt: '', x: 0.6, y: 0.94, w: 13, drift: 0.05, phone: { x: 0.5, y: 0.6, w: 34 } },
      { kind: 'cut', src: art('stream-ferns'), z: 0.6, alt: '', x: -0.08, y: 1.1, w: 30, phone: { x: -0.35, w: 75 } },
      band('stream'),
    ],
    drop: [[62, 56], [60, 64], [57, 74], [56, 82]],
    splash: [57, 74],
    rain: 0.0,
  },
];

/** The soil-section cut-out's labels, at their layer's height on the art (0 top, 1 bottom). */
export const soilLabels = [
  { text: 'Mulch 5–8 cm', at: 0.28 },
  { text: 'Amended soil 30 cm', at: 0.45 },
  { text: 'Gravel / native subsoil', at: 0.76 },
];

/** Every image scene i needs, in paint order (preloader and warm-up use it). */
export const sceneImages = (i) => scenes[i].layers.filter((l) => l.src).map((l) => l.src);
