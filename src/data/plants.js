// Native rain-garden plants for two regions.
//
// Data rules (see docs/research/*.md and SOURCES.md):
//  - Every plant appears in a published rain-garden plant list for its region:
//      PNW: WSU Rain Garden Handbook for Western Washington (2013), Appendix A.
//      ON:  Credit Valley Conservation "Native Plants for Rain-ready Landscapes" (2024).
//  - zone: wet = bottom (tolerates temporary inundation); middle = side slope
//    (alternating wet/dry); edge = berm or rim (drier).
//      PNW: derived from WSU zone codes (1 = wettest, 2 = side slopes, 3 = perimeter or berm).
//        Plants WSU lists for zone 1 are 'wet'. Plants WSU lists for zones 2-3 are 'middle'
//        or 'edge' by moisture need: 'edge' when WSU lists zone 3 only, or when King County
//        GoNative rates the plant for dry soil. The WSU code is quoted in each note.
//      ON:  CVC Low/Middle/High maps to wet/middle/edge. Where CVC lists two zones
//        (e.g. "Middle, Low"), we chose one, and the note says which.
//  - height_m / spread_m: mature size as printed by the guide, converted to metres
//    (in x 0.0254, ft x 0.3048, cm / 100). Where the guide gives a single number
//    ("to 48 in"), min = max.
//  - spacing_m:
//      ON: TRCA/CVC LID Guide Appendix B (2010) on-centre spacing. Where it gives a
//        range we use the lower value.
//      PNW: WSU 2013 says to "space ... according to their expected mature size". We use
//        the lower mature spread. For herbaceous plants (rush, sedge, grass, perennial,
//        fern) we cap it at 0.6 m, per TRCA STEP bioretention guidance ("0.5 m on center,
//        and no more than 0.6 m on center").
//      Plants with no published spacing use the lower mature spread (noted).
//  - sun:
//      PNW: King County Native Plant Guide "Exposure req." field.
//      ON:  Lady Bird Johnson Wildflower Center "Light Requirement" and TRCA/CVC App. B exposure.
//  - bloom:
//      PNW: WSU Appendix A "Time of bloom", verbatim (months, or a season word).
//      ON:  Prairie Moon Nursery 2024 (Minnesota timing; Ontario may differ by 1-2 weeks).
//      null means no showy flower (ferns), or that we report foliage colour instead.

export const REGIONS = {
  pnw: {
    id: 'pnw',
    name: 'Pacific Northwest / Metro Vancouver',
    scs_type: 'IA',
    plant_sources: ['wsu2013', 'kcgonative'],
  },
  on: {
    id: 'on',
    name: 'Southern Ontario',
    scs_type: 'II',
    plant_sources: ['cvc2024', 'lidappb2010'],
  },
};

export const SOURCES = {
  wsu2013: {
    title: 'Rain Garden Handbook for Western Washington (Appendix A: Selected Plants for Rain Gardens in Western Washington)',
    publisher: 'Washington State University Extension / Washington State Department of Ecology (Pub. 13-10-027)',
    year: 2013,
    url: 'https://apps.ecology.wa.gov/publications/documents/1310027.pdf',
  },
  kcgonative: {
    title: 'King County Native Plant Guide (GoNative)',
    publisher: 'King County, Washington',
    year: null,
    url: 'https://green2.kingcounty.gov/gonative/',
  },
  step_bioretention: {
    title: 'Bioretention (LID Planning and Design Guide wiki), Plants section',
    publisher: 'Toronto and Region Conservation Authority, Sustainable Technologies Evaluation Program',
    year: null,
    url: 'https://wiki.sustainabletechnologies.ca/wiki/Bioretention',
  },
  cvc2024: {
    title: 'Native Plants for Rain-ready Landscapes (plant list)',
    publisher: 'Credit Valley Conservation',
    year: 2024,
    url: 'https://files.cvc.ca/cvc/uploads/2022/03/com_uo_rain-ready-plant-list_20240125_a.pdf',
  },
  lidappb2010: {
    title: 'Low Impact Development Stormwater Management Planning and Design Guide, Appendix B: Landscape Design Guide for Low Impact Development (v1.0)',
    publisher: 'Toronto and Region Conservation Authority & Credit Valley Conservation',
    year: 2010,
    url: 'https://files.cvc.ca/cvc/uploads/2010/01/cvc-lid-swm-guide-appendix-b_na.pdf',
  },
  step_plantlists: {
    title: 'Plant lists (Perennials, Graminoids, Shrubs)',
    publisher: 'Toronto and Region Conservation Authority, Sustainable Technologies Evaluation Program',
    year: null,
    url: 'https://wiki.sustainabletechnologies.ca/wiki/Plant_lists',
  },
  prairiemoon2024: {
    title: 'Prairie Moon Nursery Price List (May 2024)',
    publisher: 'Prairie Moon Nursery',
    year: 2024,
    url: 'https://www.prairiemoon.com/PDF/Prairie-Moon-May-2024-Pricing.pdf',
  },
  lbjwc: {
    title: 'Native Plant Information Network (plant database)',
    publisher: 'Lady Bird Johnson Wildflower Center, University of Texas at Austin',
    year: null,
    url: 'https://www.wildflower.org/plants/',
  },
};

export const PLANTS = [
  // ---------------------------------------------------------------- PNW / wet
  {
    id: 'slough-sedge', region: 'pnw', common: 'Slough sedge', latin: 'Carex obnupta',
    zone: 'wet', form: 'sedge', height_m: [0.3, 0.91], spread_m: [1.22, 1.22], spacing_m: 0.6,
    sun: ['full', 'part'], bloom: 'Apr–May', color: 'glossy green; dark spikes',
    notes: 'WSU zones 1–2, evergreen. Excellent soil binder that can spread rapidly. WSU gives width as "to 48 in., spreading".',
    sources: ['wsu2013', 'kcgonative', 'step_bioretention'],
  },
  {
    id: 'dagger-leaf-rush', region: 'pnw', common: 'Dagger-leaf rush', latin: 'Juncus ensifolius',
    zone: 'wet', form: 'rush', height_m: [0.15, 0.38], spread_m: [0.15, 0.23], spacing_m: 0.15,
    sun: ['full', 'part', 'shade'], bloom: 'summer', color: 'dark brown pom-pom flowers',
    notes: 'WSU zone 1. Iris-like flattened stems with yellow-orange fall colour.',
    sources: ['wsu2013', 'kcgonative'],
  },
  {
    id: 'taper-tipped-rush', region: 'pnw', common: 'Taper-tipped rush', latin: 'Juncus acuminatus',
    zone: 'wet', form: 'rush', height_m: [0.15, 0.46], spread_m: [0.3, 0.61], spacing_m: 0.3,
    sun: ['full', 'part'], bloom: 'spring–summer', color: 'purple to reddish-brown flowers',
    notes: 'WSU zone 1. A delicate rush with open flower clusters. Sun: WSU uses it in its "sunny area" sample plans (pp. 52, 54); LBJWC rates it "Part Shade". It is not in King County GoNative.',
    sources: ['wsu2013', 'lbjwc'],
  },
  {
    id: 'small-fruited-bulrush', region: 'pnw', common: 'Small-fruited bulrush', latin: 'Scirpus microcarpus',
    zone: 'wet', form: 'sedge', height_m: [0.61, 0.91], spread_m: [0.3, 0.61], spacing_m: 0.3,
    sun: ['full', 'part'], bloom: 'Jun–Aug', color: 'green; round seed clusters',
    notes: 'WSU zone 1. Good soil binder that spreads aggressively. Its seed heads persist over winter.',
    sources: ['wsu2013', 'kcgonative'],
  },
  {
    id: 'lady-fern', region: 'pnw', common: 'Lady fern', latin: 'Athyrium filix-femina',
    zone: 'wet', form: 'fern', height_m: [0.91, 1.52], spread_m: [0.46, 0.61], spacing_m: 0.46,
    sun: ['full', 'part', 'shade'], bloom: null, color: 'fine bright-green fronds',
    notes: 'WSU zones 1–3, deciduous. Tolerates shallow flooding and takes sun in wet soil, but prefers shade.',
    sources: ['wsu2013', 'kcgonative'],
  },
  {
    id: 'red-twig-dogwood', region: 'pnw', common: 'Red-twig dogwood', latin: 'Cornus sericea',
    zone: 'wet', form: 'shrub', height_m: [2.13, 2.74], spread_m: [3.66, 3.66], spacing_m: 3.66,
    sun: ['full', 'part', 'shade'], bloom: 'May–Jun', color: 'white flowers; red winter stems',
    notes: 'WSU zones 1–3. Adaptable to many soils. Its red stems give winter colour. Width is printed as 12 ft (spreading).',
    sources: ['wsu2013', 'kcgonative'],
  },
  {
    id: 'douglas-spirea', region: 'pnw', common: 'Douglas spirea (hardhack)', latin: 'Spiraea douglasii',
    zone: 'wet', form: 'shrub', height_m: [1.22, 2.13], spread_m: [1.83, 3.05], spacing_m: 1.83,
    sun: ['full', 'part'], bloom: 'Jun–Aug', color: 'rosy-pink flower spikes',
    notes: 'WSU zones 1–2. Great for butterflies, but can spread and crowd out other plants in constantly wet soil.',
    sources: ['wsu2013', 'kcgonative'],
  },
  {
    id: 'black-twinberry', region: 'pnw', common: 'Black twinberry', latin: 'Lonicera involucrata',
    zone: 'wet', form: 'shrub', height_m: [1.83, 2.74], spread_m: [2.44, 3.05], spacing_m: 2.44,
    sun: ['full', 'part', 'shade'], bloom: 'Jun', color: 'yellow flowers; red bracts',
    notes: 'WSU zones 1–3. Attracts hummingbirds. Needs room, and may need pruning to stay tidy.',
    sources: ['wsu2013', 'kcgonative'],
  },
  {
    id: 'pacific-crabapple', region: 'pnw', common: 'Pacific crabapple', latin: 'Malus fusca',
    zone: 'wet', form: 'tree', height_m: [3.05, 9.14], spread_m: [3.05, 9.14], spacing_m: 3.05,
    sun: ['full', 'part'], bloom: 'Apr–May', color: 'white to pink blossoms',
    notes: 'WSU zones 1–3. A native small tree for larger rain gardens. Its fruit attracts wildlife.',
    sources: ['wsu2013', 'kcgonative'],
  },
  // ------------------------------------------------------------- PNW / middle
  {
    id: 'deer-fern', region: 'pnw', common: 'Deer fern', latin: 'Blechnum spicant',
    zone: 'middle', form: 'fern', height_m: [0.3, 0.91], spread_m: [0.61, 0.61], spacing_m: 0.6,
    sun: ['part', 'shade'], bloom: null, color: 'glossy dark-green fronds',
    notes: 'WSU zones 1–3, evergreen. Tolerates shallow flooding, but keep it out of sun.',
    sources: ['wsu2013', 'kcgonative', 'step_bioretention'],
  },
  {
    id: 'western-columbine', region: 'pnw', common: 'Western columbine', latin: 'Aquilegia formosa',
    zone: 'middle', form: 'perennial', height_m: [0.3, 0.91], spread_m: [0.3, 0.91], spacing_m: 0.3,
    sun: ['full', 'part'], bloom: 'spring', color: 'red and yellow',
    notes: 'WSU zones 2–3. Attracts hummingbirds, re-seeds itself, and tolerates seasonal flooding.',
    sources: ['wsu2013', 'kcgonative'],
  },
  {
    id: 'common-camas', region: 'pnw', common: 'Common camas', latin: 'Camassia quamash',
    zone: 'middle', form: 'perennial', height_m: [0.46, 0.46], spread_m: [0.3, 0.3], spacing_m: 0.3,
    sun: ['full', 'part'], bloom: 'May–Jun', color: 'deep blue',
    notes: 'WSU zones 2–3. A bulb that is showiest planted in groups. It is wet in spring and dormant by summer.',
    sources: ['wsu2013', 'kcgonative'],
  },
  {
    id: 'douglas-aster', region: 'pnw', common: 'Douglas aster', latin: 'Symphyotrichum subspicatum',
    zone: 'middle', form: 'perennial', height_m: [0.15, 0.91], spread_m: [0.91, 0.91], spacing_m: 0.6,
    sun: ['full', 'part'], bloom: 'Jun–Sep', color: 'blue-purple, yellow centre',
    notes: 'WSU zones 1–3. A late-season bloomer that spreads. It prefers full sun but tolerates some shade.',
    sources: ['wsu2013', 'kcgonative', 'step_bioretention'],
  },
  {
    id: 'common-snowberry', region: 'pnw', common: 'Common snowberry', latin: 'Symphoricarpos albus',
    zone: 'middle', form: 'shrub', height_m: [0.61, 1.83], spread_m: [1.83, 1.83], spacing_m: 1.83,
    sun: ['full', 'part', 'shade'], bloom: 'Apr–Jun', color: 'pink flowers; white berries',
    notes: 'WSU zones 2–3. Thicket-forming and good for pollinators. Its white berries last into winter.',
    sources: ['wsu2013', 'kcgonative'],
  },
  {
    id: 'pacific-ninebark', region: 'pnw', common: 'Pacific ninebark', latin: 'Physocarpus capitatus',
    zone: 'middle', form: 'shrub', height_m: [2.44, 3.96], spread_m: [1.83, 4.57], spacing_m: 1.83,
    sun: ['full', 'part', 'shade'], bloom: 'May–Jun', color: 'white flowers; peeling bark',
    notes: 'WSU zones 1–3. Best in part shade. We placed it on the side slope because it is large.',
    sources: ['wsu2013', 'kcgonative'],
  },
  {
    id: 'western-sword-fern', region: 'pnw', common: 'Western sword fern', latin: 'Polystichum munitum',
    zone: 'middle', form: 'fern', height_m: [0.91, 1.22], spread_m: [0.91, 1.52], spacing_m: 0.6,
    sun: ['part', 'shade'], bloom: null, color: 'evergreen dark-green fronds',
    notes: 'WSU zones 2–3, evergreen. A stately native fern that prefers some shade.',
    sources: ['wsu2013', 'kcgonative', 'step_bioretention'],
  },
  // --------------------------------------------------------------- PNW / edge
  {
    id: 'kinnikinnick', region: 'pnw', common: 'Kinnikinnick (bearberry)', latin: 'Arctostaphylos uva-ursi',
    zone: 'edge', form: 'shrub', height_m: [0.15, 0.3], spread_m: [0.61, 0.91], spacing_m: 0.61,
    sun: ['full', 'part'], bloom: 'Mar–Jun', color: 'white-pink bells; red berries',
    notes: 'WSU zones 2–3, evergreen. A low groundcover for the berm that is easy care once established.',
    sources: ['wsu2013', 'kcgonative'],
  },
  {
    id: 'tall-oregon-grape', region: 'pnw', common: 'Tall Oregon grape', latin: 'Mahonia aquifolium',
    zone: 'edge', form: 'shrub', height_m: [1.83, 3.05], spread_m: [1.52, 1.52], spacing_m: 1.52,
    sun: ['full', 'part', 'shade'], bloom: 'Mar–Apr', color: 'yellow flowers; blue-black berries',
    notes: 'WSU zones 2–3, evergreen. Glossy holly-like leaves, and it attracts hummingbirds.',
    sources: ['wsu2013', 'kcgonative'],
  },
  {
    id: 'evergreen-huckleberry', region: 'pnw', common: 'Evergreen huckleberry', latin: 'Vaccinium ovatum',
    zone: 'edge', form: 'shrub', height_m: [1.22, 3.05], spread_m: [1.83, 1.83], spacing_m: 1.83,
    sun: ['part', 'shade'], bloom: 'Mar–Jun', color: 'pinkish-white flowers',
    notes: 'WSU zone 3 only, evergreen. Suits partly or very shady rims.',
    sources: ['wsu2013', 'kcgonative'],
  },
  {
    id: 'oceanspray', region: 'pnw', common: 'Oceanspray', latin: 'Holodiscus discolor',
    zone: 'edge', form: 'shrub', height_m: [2.44, 4.57], spread_m: [1.83, 4.57], spacing_m: 1.83,
    sun: ['full', 'part', 'shade'], bloom: 'Jun–Jul', color: 'creamy-white plumes',
    notes: 'WSU zone 3 only. A good soil binder, and great for native butterflies and birds.',
    sources: ['wsu2013', 'kcgonative'],
  },
  {
    id: 'red-flowering-currant', region: 'pnw', common: 'Red-flowering currant', latin: 'Ribes sanguineum',
    zone: 'edge', form: 'shrub', height_m: [1.83, 3.66], spread_m: [1.22, 3.05], spacing_m: 1.22,
    sun: ['full', 'part'], bloom: 'Mar–May', color: 'rosy-red',
    notes: 'WSU zones 2–3. Its early flowers feed hummingbirds. Thornless.',
    sources: ['wsu2013', 'kcgonative'],
  },
  {
    id: 'western-serviceberry', region: 'pnw', common: 'Western serviceberry (saskatoon)', latin: 'Amelanchier alnifolia',
    zone: 'edge', form: 'shrub', height_m: [2.44, 6.1], spread_m: [1.52, 3.05], spacing_m: 1.52,
    sun: ['full', 'part', 'shade'], bloom: 'Apr–May', color: 'white flowers; purple berries',
    notes: 'WSU zones 2–3. A large shrub or small tree whose berries attract native birds.',
    sources: ['wsu2013', 'kcgonative'],
  },

  // ---------------------------------------------------------------- ON / wet
  {
    id: 'blue-flag-iris', region: 'on', common: 'Blue flag iris', latin: 'Iris versicolor',
    zone: 'wet', form: 'perennial', height_m: [0.6, 1.0], spread_m: [0.6, 0.75], spacing_m: 0.3,
    sun: ['full', 'part'], bloom: 'May–Jul', color: 'blue-violet',
    notes: 'CVC Low zone. Spreads slowly. Buy it by Latin name, because it is often confused with invasive yellow flag iris.',
    sources: ['cvc2024', 'lidappb2010', 'prairiemoon2024', 'lbjwc'],
  },
  {
    id: 'swamp-milkweed', region: 'on', common: 'Swamp milkweed', latin: 'Asclepias incarnata',
    zone: 'wet', form: 'perennial', height_m: [0.6, 1.2], spread_m: [0.3, 0.6], spacing_m: 0.3,
    sun: ['full', 'part'], bloom: 'Jun–Aug', color: 'pink',
    notes: 'CVC Low zone. A monarch butterfly host plant.',
    sources: ['cvc2024', 'lidappb2010', 'prairiemoon2024', 'lbjwc'],
  },
  {
    id: 'spotted-joe-pye-weed', region: 'on', common: 'Spotted Joe-Pye weed', latin: 'Eutrochium maculatum',
    zone: 'wet', form: 'perennial', height_m: [1.2, 1.8], spread_m: [0.45, 0.6], spacing_m: 0.3,
    sun: ['full', 'part'], bloom: 'Jul–Sep', color: 'pink-mauve',
    notes: 'CVC Low zone. A tall nectar plant for the back of the garden (App. B lists it as Eupatorium maculatum).',
    sources: ['cvc2024', 'lidappb2010', 'prairiemoon2024', 'lbjwc'],
  },
  {
    id: 'soft-rush', region: 'on', common: 'Soft rush', latin: 'Juncus effusus',
    zone: 'wet', form: 'rush', height_m: [0.45, 1.2], spread_m: [0.3, 0.6], spacing_m: 0.3,
    sun: ['full'], bloom: null, color: 'green stems; brown seed clusters',
    notes: 'CVC Middle/Low; placed in wet (App. B zone L). CVC lists ssp. solutus (lamp rush). Clumping, and salt tolerant per TRCA STEP.',
    sources: ['cvc2024', 'lidappb2010', 'step_plantlists', 'lbjwc'],
  },
  {
    id: 'bristly-sedge', region: 'on', common: 'Bristly (bottlebrush) sedge', latin: 'Carex comosa',
    zone: 'wet', form: 'sedge', height_m: [0.6, 1.0], spread_m: [0.5, 0.6], spacing_m: 0.5,
    sun: ['full', 'part'], bloom: null, color: 'green; bottlebrush seed heads',
    notes: 'CVC Middle/Low; placed in wet (STEP moisture "wet"). Clump-forming. No published spacing, so spacing = lower spread.',
    sources: ['cvc2024', 'step_plantlists', 'prairiemoon2024', 'lbjwc'],
  },
  {
    id: 'monkeyflower', region: 'on', common: 'Square-stemmed monkeyflower', latin: 'Mimulus ringens',
    zone: 'wet', form: 'perennial', height_m: [0.3, 0.9], spread_m: [0.25, 0.3], spacing_m: 0.25,
    sun: ['full', 'part'], bloom: 'Jun–Sep', color: 'lavender',
    notes: 'CVC Low zone. Spreads by underground roots. No published spacing, so spacing = lower spread.',
    sources: ['cvc2024', 'step_plantlists', 'prairiemoon2024', 'lbjwc'],
  },
  // ------------------------------------------------------------- ON / middle
  {
    id: 'cardinal-flower', region: 'on', common: 'Cardinal flower', latin: 'Lobelia cardinalis',
    zone: 'middle', form: 'perennial', height_m: [0.6, 1.2], spread_m: [0.2, 0.3], spacing_m: 0.2,
    sun: ['full', 'part'], bloom: 'Jul–Sep', color: 'scarlet red',
    notes: 'CVC Middle/Low. A hummingbird magnet that is short-lived but self-seeds. CVC marks it rare in the watershed. No published spacing, so spacing = lower spread.',
    sources: ['cvc2024', 'step_plantlists', 'prairiemoon2024', 'lbjwc'],
  },
  {
    id: 'great-blue-lobelia', region: 'on', common: 'Great blue lobelia', latin: 'Lobelia siphilitica',
    zone: 'middle', form: 'perennial', height_m: [0.6, 0.9], spread_m: [0.3, 0.45], spacing_m: 0.3,
    sun: ['full', 'part'], bloom: 'Jul–Oct', color: 'blue',
    notes: 'CVC Middle/Low. Self-sows easily.',
    sources: ['cvc2024', 'lidappb2010', 'prairiemoon2024', 'lbjwc'],
  },
  {
    id: 'white-turtlehead', region: 'on', common: 'White turtlehead', latin: 'Chelone glabra',
    zone: 'middle', form: 'perennial', height_m: [0.6, 0.9], spread_m: [0.45, 0.6], spacing_m: 0.3,
    sun: ['full', 'part'], bloom: 'Jul–Sep', color: 'white to cream',
    notes: 'CVC Middle/Low. Its flowers are shaped like a turtle head. App. B says it "cannot tolerate drought".',
    sources: ['cvc2024', 'lidappb2010', 'prairiemoon2024', 'lbjwc'],
  },
  {
    id: 'fox-sedge', region: 'on', common: 'Fox sedge', latin: 'Carex vulpinoidea',
    zone: 'middle', form: 'sedge', height_m: [0.3, 0.9], spread_m: [0.15, 0.6], spacing_m: 0.3,
    sun: ['full'], bloom: null, color: 'green; brown-yellow seed heads',
    notes: 'CVC Middle/Low. A clump-forming sedge that tolerates compaction and pollution.',
    sources: ['cvc2024', 'lidappb2010', 'step_plantlists', 'lbjwc'],
  },
  {
    id: 'sensitive-fern', region: 'on', common: 'Sensitive fern', latin: 'Onoclea sensibilis',
    zone: 'middle', form: 'fern', height_m: [0.3, 0.6], spread_m: [0.6, 0.9], spacing_m: 0.3,
    sun: ['part', 'shade'], bloom: null, color: 'light-green fronds',
    notes: 'CVC Middle/Low. Takes full sun if the soil stays moist. Sensitive to frost.',
    sources: ['cvc2024', 'lidappb2010', 'lbjwc'],
  },
  {
    id: 'red-osier-dogwood', region: 'on', common: 'Red-osier dogwood', latin: 'Cornus sericea',
    zone: 'middle', form: 'shrub', height_m: [1.5, 2.5], spread_m: [1.5, 2.5], spacing_m: 1.0,
    sun: ['full', 'part'], bloom: 'May–Jun', color: 'white flowers; red winter twigs',
    notes: 'CVC Middle/Low. Tolerates short flooding but is sensitive to road salt.',
    sources: ['cvc2024', 'lidappb2010', 'lbjwc'],
  },
  {
    id: 'new-england-aster', region: 'on', common: 'New England aster', latin: 'Symphyotrichum novae-angliae',
    zone: 'middle', form: 'perennial', height_m: [1.0, 1.5], spread_m: [0.45, 0.6], spacing_m: 0.3,
    sun: ['full', 'part'], bloom: 'Aug–Oct', color: 'purple',
    notes: 'CVC Middle zone. A late-season pollinator plant that helps stabilize slopes.',
    sources: ['cvc2024', 'lidappb2010', 'prairiemoon2024', 'lbjwc'],
  },
  // --------------------------------------------------------------- ON / edge
  {
    id: 'black-eyed-susan', region: 'on', common: 'Black-eyed Susan', latin: 'Rudbeckia hirta',
    zone: 'edge', form: 'perennial', height_m: [0.3, 0.9], spread_m: [0.3, 0.45], spacing_m: 0.3,
    sun: ['full'], bloom: 'Jun–Oct', color: 'yellow, dark centre',
    notes: 'CVC High/Middle. Short-lived but self-seeds readily.',
    sources: ['cvc2024', 'lidappb2010', 'prairiemoon2024', 'lbjwc'],
  },
  {
    id: 'wild-bergamot', region: 'on', common: 'Wild bergamot', latin: 'Monarda fistulosa',
    zone: 'edge', form: 'perennial', height_m: [0.6, 1.2], spread_m: [0.6, 0.9], spacing_m: 0.3,
    sun: ['full', 'part'], bloom: 'Jul–Sep', color: 'lavender',
    notes: 'CVC High/Middle. Its leaves are aromatic, and deadheading extends the bloom.',
    sources: ['cvc2024', 'lidappb2010', 'prairiemoon2024', 'lbjwc'],
  },
  {
    id: 'butterfly-milkweed', region: 'on', common: 'Butterfly milkweed', latin: 'Asclepias tuberosa',
    zone: 'edge', form: 'perennial', height_m: [0.3, 0.75], spread_m: [0.3, 0.6], spacing_m: 0.5,
    sun: ['full'], bloom: 'Jun–Aug', color: 'orange',
    notes: 'CVC High/Middle. Does not tolerate wet soil, so keep it on the berm. A monarch host plant that CVC marks rare in the watershed.',
    sources: ['cvc2024', 'lidappb2010', 'prairiemoon2024', 'lbjwc'],
  },
  {
    id: 'little-bluestem', region: 'on', common: 'Little bluestem', latin: 'Schizachyrium scoparium',
    zone: 'edge', form: 'grass', height_m: [0.6, 0.9], spread_m: [0.45, 0.6], spacing_m: 0.6,
    sun: ['full'], bloom: null, color: 'blue-green; copper-red in fall',
    notes: 'CVC High zone. Best on poor, dry soil, and its stems stand through winter. CVC marks it rare in the watershed.',
    sources: ['cvc2024', 'lidappb2010', 'step_plantlists', 'lbjwc'],
  },
  {
    id: 'pennsylvania-sedge', region: 'on', common: 'Pennsylvania sedge', latin: 'Carex pensylvanica',
    zone: 'edge', form: 'sedge', height_m: [0.15, 0.3], spread_m: [0.3, 0.35], spacing_m: 0.3,
    sun: ['full', 'part', 'shade'], bloom: null, color: 'fine bright green',
    notes: 'CVC High zone. A low, mounding groundcover that does well under trees.',
    sources: ['cvc2024', 'lidappb2010', 'step_plantlists', 'lbjwc'],
  },
  {
    id: 'foxglove-beardtongue', region: 'on', common: 'Foxglove beardtongue', latin: 'Penstemon digitalis',
    zone: 'edge', form: 'perennial', height_m: [0.6, 1.2], spread_m: [0.3, 0.45], spacing_m: 0.3,
    sun: ['full', 'part'], bloom: 'Jun–Jul', color: 'white',
    notes: 'CVC High/Middle. Short-lived but spreads by seed and rhizomes. CVC marks it rare in the watershed.',
    sources: ['cvc2024', 'lidappb2010', 'prairiemoon2024', 'lbjwc'],
  },
  {
    id: 'smooth-serviceberry', region: 'on', common: 'Smooth serviceberry', latin: 'Amelanchier laevis',
    zone: 'edge', form: 'tree', height_m: [4.0, 6.0], spread_m: [4.0, 6.0], spacing_m: 2.5,
    sun: ['full', 'part', 'shade'], bloom: 'Apr–May', color: 'white flowers',
    notes: 'CVC High/Middle. Grows as a small tree or multi-stemmed shrub. App. B gives its size as 5–8 m by 4–6 m.',
    sources: ['cvc2024', 'lidappb2010', 'step_plantlists', 'lbjwc'],
  },
];
