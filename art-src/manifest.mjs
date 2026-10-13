/**
 * Every generated image: name (-> art-src/gen/<name>.png), group, size, the
 * subject prompt, and whether it is a cut-out. STYLE goes on top of every
 * prompt (the one art direction); CUTOUT on every cut-out.
 * Plants are appended from src/data/plants.js so the list never drifts.
 */
// plants.js is written by the plant research; until it exists there are no plant items.
const PLANTS = await import('../src/data/plants.js').then((m) => m.PLANTS).catch(() => []);

export const STYLE = `STYLE — "Wet light": a hand-painted gouache-and-watercolour storybook illustration with a fine risograph grain; soft painted edges, flat-ish layered shapes, NO black outlines, no text, no logos, no watermark. Gentle three-quarter elevated view. Overcast Pacific Northwest light from the upper left, cool blue shadows, small warm highlights. Strict palette: storm slate #26313C, slate #3E4A59, rain blue-grey #7D8FA3, wet asphalt #2B2F36, moss #5F7A4A, fern #9DB873, clay ochre #B9824F, rain teal #49A3A0, paper #ECE6DA, and a single warm accent marigold #E8B04A used sparingly. Matte, calm, quietly hopeful. Original artwork.`;

export const CUTOUT = `OUTPUT: a transparent-background PNG (real alpha channel, no checkerboard, no backdrop, no ground shadow box), exactly one subject, centred, nothing else in frame, a generous empty margin all round, at the largest size available.`;

const W = '1536x1024', T = '1024x1536', S = '1024x1024';

const comp = (name, p) => ({ name: `comp-${name}`, group: 'comps', size: W, prompt: `A design comp: a full website screen mockup, landscape, for one section of an award-winning scroll-story website called "Raingarden" (designs rain gardens of native plants from a photo of your yard). Here the STYLE's "no text" rule is relaxed for the UI only: headline type is a warm old-style serif in paper colour, UI type a clean legible sans; one marigold action colour. ${p} Cinematic, layered depth, lots of negative space.` });

export const ITEMS = [
  // ---- design comps (image-to-code: one large image per section) ----
  comp('preloader', 'The preloader: a deep storm-slate screen, a single painted raindrop forming at the centre above a small round pool, a thin paper-coloured progress arc around the pool, the small wordmark "Raingarden" beneath.'),
  comp('roof', 'Scene 1: overcast dusk sky, fine diagonal rain; lower right the pitched roof of a small West Coast house with gutter and downspout; misty conifers and far rooftops behind; a soft-focus dripping gutter in the foreground; one larger glowing raindrop near centre-left. Left: headline "A storm lands on your roof." and a small line "Scroll to follow one raindrop". Wordmark top left, marigold pill "Design yours" top right.'),
  comp('driveway', 'Scene 2: a steep wet asphalt driveway running diagonally down the frame, a thin rushing stream of rainwater racing down it toward the street, a lawn edge and a parked bicycle, houses and trees in mist behind; headline "It doesn\'t soak in." with a counter in small type "2,400 L from one roof in one storm".'),
  comp('drain', 'Scene 3: close to the ground at a street curb, a cast-iron storm drain grate swallowing a stream of water with an oily rainbow sheen, wet leaves and a crushed cup; headline "It all goes somewhere."'),
  comp('creek', 'Scene 4: an urban creek seen in cross-section half above and half below the waterline, murky brown-green water, eroded bare banks, a culvert pipe pouring in, a lone small fish struggling; headline "Somewhere is a creek."'),
  comp('garden', 'Scene 5: a rain garden in a front yard in cut-away cross-section: a shallow planted basin with sedges, rushes and flowering native perennials, a downspout pipe feeding it, below the surface clear soil layers (mulch, amended soil, gravel) with roots reaching down and water soaking in; headline "Or your yard drinks it."'),
  comp('stream', 'Scene 6: a healthy clear stream with ferns and alders, a fish swimming upstream, soft light breaking through clouds; headline "Design yours." with a big marigold button "Point your phone at your yard" and a quieter link "Try a demo yard".'),
  comp('designer-capture', 'The designer tool on a phone-sized centred panel over a dark storm-slate scene: a photo of a back yard with thin teal contour lines drawn over it, a small chip "Stays on your phone", three marker pins (downspout, house wall, where water leaves), and a bottom sheet with a step title "Mark something 1 m long" and a marigold "Next" button; the rest of the screen shows the yard in 3D receding softly.'),
  comp('designer-compare', 'The designer tool: a 3D yard terrain seen from above at an angle, split by a vertical swipe divider: left "Before" with water pooling and streaming off the yard in teal, right "After" with a planted rain garden basin capturing it; a row of three big numbers in the sans: "1,840 L captured", "120 L leaves the yard", "18 h standing water"; a marigold "Get my plan" button.'),
  comp('how', 'The "How it works" section: five illustrated vignettes laid along a gentle stream line: a phone reading depth, raindrops on a terrain grid, water soaking into soil layers, many little garden outlines being tried, a finished garden; each with a short heading and two lines of plain text in the sans; generous whitespace on storm slate.'),
  comp('plan', 'A printable one-page rain garden plan on paper colour (portrait inside the landscape frame): a top-down drawing of the garden with dimensions, planted zones in fern, moss and teal rings with small plant symbols, a plant list table with quantities, a soil mix diagram, numbered build steps, and a boxed safety note "Call before you dig".'),

  // ---- scene layers (parallax; sky/back opaque, the rest cut-outs) ----
  { name: 'roof-sky', group: 'scenes', size: W, prompt: 'A wide empty overcast dusk sky, layered soft rain clouds in storm slate and rain blue-grey, a faint warm glow low on the horizon; no ground, no buildings, no rain streaks. Full-bleed background plate.' },
  { name: 'roof-far', group: 'scenes', size: W, cutout: true, prompt: 'A wide horizontal band of misty far scenery: tall Pacific Northwest conifers and a few distant pitched rooftops, pale blue-grey and low contrast as if seen through rain; flat bottom edge.' },
  { name: 'roof-house', group: 'scenes', size: W, cutout: true, prompt: 'The upper part of a small West Coast wooden house: a pitched shingle roof slick with rain, a metal gutter along its eave, and a downspout running down the corner; warm light in one small attic window. Seen from slightly below and to the side.' },
  { name: 'roof-gutter', group: 'scenes', size: W, cutout: true, prompt: 'Very close foreground: the end of a metal roof gutter overflowing, water spilling over its lip in a glassy sheet and drops; seen from very close, large in frame.' },
  { name: 'drive-back', group: 'scenes', size: W, prompt: 'A wide rainy suburban street scene for a background plate: houses with lit windows, wet front lawns, conifers in mist, a grey sky; no driveway in the centre foreground (keep the lower half fairly simple and dark).' },
  { name: 'drive-asphalt', group: 'scenes', size: W, cutout: true, prompt: 'A steep wet asphalt driveway seen at an angle, running diagonally from upper left to lower right, glossy with rain, a thin rushing stream of rainwater racing down its middle toward the bottom; the lawn edges along both sides.' },
  { name: 'drive-bike', group: 'scenes', size: S, cutout: true, prompt: 'A child\'s bicycle leaning on its kickstand, wet with rain, painted in moss and marigold.' },
  { name: 'drive-curb', group: 'scenes', size: W, cutout: true, prompt: 'Close foreground: a concrete curb edge and gutter with a fast stream of rainwater flowing along it, a few fallen leaves riding the flow; horizontal composition.' },
  { name: 'drain-back', group: 'scenes', size: W, prompt: 'A wide background plate low at street level: wet dark asphalt road receding, reflections of street lamps and lit windows smeared on the wet road, rain, misty trees.' },
  { name: 'drain-grate', group: 'scenes', size: W, cutout: true, prompt: 'A cast-iron storm drain grate set into a concrete curb and gutter, water pouring into it with an oily rainbow sheen on the surface, seen from a low three-quarter angle.' },
  { name: 'drain-litter', group: 'scenes', size: S, cutout: true, prompt: 'A small cluster of wet street debris: a crushed paper coffee cup, two soggy maple leaves and a cigarette butt, lying together.' },
  { name: 'drain-leaves', group: 'scenes', size: W, cutout: true, prompt: 'Very close foreground: a loose scatter of large wet fallen leaves (maple and alder) along a horizontal band, out of focus feeling.' },
  { name: 'creek-back', group: 'scenes', size: W, prompt: 'A wide background plate: an urban creek in a cut-away view, the upper half the banks and a concrete culvert under a road with houses behind, the lower half murky brown-green water with silt clouds, low light.' },
  { name: 'creek-bank', group: 'scenes', size: W, cutout: true, prompt: 'An eroded creek bank in cross-section: bare undercut soil, exposed tree roots, a slumped clump of grass, wide horizontal composition.' },
  { name: 'creek-fish', group: 'scenes', size: S, cutout: true, prompt: 'A small juvenile coho salmon swimming, side view, slightly dull and tired-looking colours.' },
  { name: 'creek-reeds', group: 'scenes', size: W, cutout: true, prompt: 'Close foreground: a few tall reeds and a broken branch poking out of water, horizontal band, dark and soft.' },
  { name: 'garden-back', group: 'scenes', size: W, prompt: 'A wide background plate: a quiet front yard after rain, a small house with a downspout on the left, a lawn, a cedar hedge and misty trees behind, clouds starting to break with soft light.' },
  { name: 'garden-basin', group: 'scenes', size: W, cutout: true, prompt: 'A rain garden in a front yard, shown in cut-away cross-section: a shallow planted basin with sedges, rushes and flowering native perennials (pink, purple, marigold blooms) above, and below the surface the soil profile — a brown mulch layer, a thick amended soil layer, and a gravel layer — with roots reaching down and blue water soaking into the soil; a downspout pipe feeding the basin from the left.' },
  { name: 'garden-front', group: 'scenes', size: W, cutout: true, prompt: 'Close foreground: a soft band of native rain-garden plants (sedge tufts, a fern, a few flowering stems) along the bottom, horizontal composition.' },
  { name: 'stream-back', group: 'scenes', size: W, prompt: 'A wide background plate: a healthy clear forest stream with clean pebbles visible under the water, sword ferns, red alders and cedars, light breaking through clouds in soft beams.' },
  { name: 'stream-fish', group: 'scenes', size: S, cutout: true, prompt: 'A healthy adult coho salmon swimming strongly, side view, bright silver and soft red tones.' },
  { name: 'stream-ferns', group: 'scenes', size: W, cutout: true, prompt: 'Close foreground: sword fern fronds and moss-covered stones along a horizontal band.' },


  // ---- v2 scene plates (full-bleed, subject right, calm left third for the headline) and edge-to-edge bands ----
  ...[
    ['roof', 'the pitched shingle roof of a small West Coast wooden house in the right half, rain sheeting off it, a metal gutter and a downspout at its corner, misty conifers and far rooftops and a grey inlet behind, overcast dusk sky with a faint warm glow; the left third is calmer misty sky and distant hills'],
    ['drive', 'a steep wet asphalt driveway running from a garage at upper right diagonally down to the street at lower left, a thin rushing stream of rainwater racing down it, lawns on both sides, a parked bicycle, houses and conifers in mist behind'],
    ['drain', 'very low at street level beside a concrete curb: a cast-iron storm drain grate swallowing a fast stream of water with an oily rainbow sheen, wet leaves, a crushed cup, the wet road receding into misty lamplight'],
    ['creek', 'an urban creek in cut-away view, half above and half below the waterline: eroded bare banks with exposed roots, a concrete culvert pouring murky water in, houses behind, brown-green silty water below with a lone tired small fish'],
    ['garden', 'a front-yard rain garden shown in cut-away cross-section: a shallow planted basin of sedges, rushes and flowering native perennials fed by a downspout, below the surface mulch, amended soil and gravel layers with roots reaching down and water soaking in; clouds breaking with soft light'],
    ['stream', 'a healthy clear forest stream over clean pebbles with sword ferns, red alders and cedars, a salmon swimming upstream, soft light beams breaking through the clouds'],
  ].map(([k, p]) => ({ name: `plate-${k}`, group: 'plates', size: '2560x1440', prompt: `A full-bleed background painting for a wide website scene, 16:9, nothing cut off awkwardly, no text: ${p}. Leave the left third visually quiet (soft sky, mist or shadow) so a headline can sit there.` })),
  ...[
    ['roof', 'dripping wet dark foliage of a vine maple and cedar sprigs with raindrops'],
    ['drive', 'a concrete curb and gutter with a fast stream of rainwater and a few fallen leaves'],
    ['drain', 'a loose scatter of large wet fallen maple and alder leaves and pebbles'],
    ['creek', 'reeds, a broken branch and dark wet stones at the water edge'],
    ['garden', 'native rain-garden plants: sedge tufts, a sword fern, flowering stems in marigold and violet'],
    ['stream', 'sword fern fronds and moss-covered stones'],
  ].map(([k, p]) => ({ name: `band-${k}`, group: 'bands', size: '2560x1440', cutout: true, prompt: `A foreground parallax layer for a wide website scene: a horizontal band of ${p}, running across the FULL WIDTH of the image and continuing off both the left and right edges (cut straight by the frame edges), sitting along the bottom edge, taking up the lower quarter of the frame; everything above it fully transparent.` })),

  // ---- soil, textures, UI, preloader ----
  { name: 'soil-section', group: 'soil', size: T, cutout: true, prompt: 'A clean educational cross-section slice of a rain garden soil profile, a tall rectangular block: from top, a thin layer of shredded bark mulch, a thick layer of amended soil (sandy loam mixed with dark compost), a layer of washed round gravel, then native subsoil; a few plant roots growing down through it and water drops percolating down. Edges cut straight like a cake slice.' },
  { name: 'tex-raindrop', group: 'tex', size: S, cutout: true, prompt: 'A single falling raindrop, slightly elongated, glassy, catching a small marigold highlight; nothing else.' },
  { name: 'tex-puddle', group: 'tex', size: W, cutout: true, prompt: 'A single shallow rain puddle seen from a low angle, irregular organic outline, reflecting a grey sky, with two concentric ripple rings.' },
  { name: 'tex-splash', group: 'tex', size: S, cutout: true, prompt: 'A small crown splash of a raindrop hitting water, translucent blue-grey.' },
  { name: 'tex-paper', group: 'tex', size: S, prompt: 'A seamless tileable texture of matte watercolour paper with very fine risograph grain, uniform storm slate colour #26313C, no features, perfectly even.' },
  { name: 'tex-paper-light', group: 'tex', size: S, prompt: 'A seamless tileable texture of matte watercolour paper with fine grain, uniform paper colour #ECE6DA, perfectly even, no features.' },
  { name: 'tex-mulch', group: 'tex', size: S, prompt: 'A seamless tileable top-down texture of shredded cedar bark mulch, even lighting, no shadows from outside.' },
  { name: 'tex-lawn', group: 'tex', size: S, prompt: 'A seamless tileable top-down texture of a slightly patchy suburban lawn, even lighting.' },
  { name: 'pre-drop', group: 'pre', size: S, cutout: true, prompt: 'A single large round raindrop seen just as it detaches, glassy with a soft marigold highlight and cool refractions, for a preloader.' },
  { name: 'pre-pool', group: 'pre', size: W, cutout: true, prompt: 'A small round still pool of water seen from a low three-quarter angle, an ellipse with soft mossy stone edges, a faint reflection of a grey sky.' },
  { name: 'ui-phone', group: 'ui', size: T, cutout: true, prompt: 'A hand holding a smartphone up, pointing its camera at something ahead, seen from behind the hand; simple, friendly.' },
  { name: 'demo-yard', group: 'demo', size: W, prompt: 'EXCEPTION to the style: this one is a realistic smartphone PHOTO, not an illustration. A suburban Metro Vancouver back yard photographed from the back porch steps at standing height, overcast daylight: a lawn sloping gently away and to the right, the house wall with a downspout visible at the left edge, a cedar fence at the back, a low spot near the back right corner, a few shrubs along the fence. Natural colours, sharp, wide-angle phone lens.' },

  // ---- plant cut-outs, one per plant ----
  ...PLANTS.map((pl) => ({
    name: `plant-${pl.id}`, group: 'plants', size: T, cutout: true,
    prompt: `A botanically accurate illustrated cut-out of one mature ${pl.common} (${pl.latin}) plant${pl.form === 'tree' ? ', a young tree' : ''}, whole plant from the base, seen from the side at eye level, ${pl.bloom ? `in bloom (${pl.color})` : `foliage ${pl.color}`}; ${pl.notes}`,
  })),
];
