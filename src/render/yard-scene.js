/**
 * The yard renderer (WebGL2, three.js): the user's yard as a displaced
 * terrain wearing their photo, with simulated water, the planted rain garden,
 * marks, contours, camera moves between designer steps and a before/after
 * split.
 *
 * WHY the structure:
 * - three is imported dynamically *here*, so the intro bundle never pays for
 *   it (Global Constraints: lazy three).
 * - Ground and water share one grid geometry (nx×ny vertices) and read the
 *   terrain and water depth from float textures; setWater is a texture upload,
 *   never a geometry rebuild.
 * - The ground (and contours) live on layer 1 too, which is rendered into one
 *   half-resolution render target; the water samples it for refraction. That
 *   pass is skipped when nothing under the water changed.
 * - Before/after is two scissored passes over the same scene, toggling only
 *   uniforms (garden on/off, which depth texture) and plant visibility.
 * - The renderer is not colour-managed for our own shaders: palette tokens and
 *   the photo are used as display-space colours, which is what a painted
 *   storybook look wants. three's built-in materials (sprites, marks) keep
 *   their default sRGB handling and land on the same colours.
 */

import { PALETTE, rgb } from './palette.js';
import { gardenUniforms, groundHeight, gardenOffset, gardenRim } from './garden-shape.js';
import { gridFrame, marchPick } from './grid-coords.js';
import { createGroundMaterial, MAX_PLANT_SHADOWS } from './ground-material.js';
import { createWaterMaterial, rippleDensity } from './water-material.js';
import { createCameraRig } from './camera-rig.js';
import { buildContours, buildMarks } from './overlays.js';
import { createPlantLayer } from './plants.js';
import { displayDepth, levelPond } from './depth-display.js';

const GROUND_LAYER = 1;

function isCoarse() {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}

function pixelRatioCap() {
  const coarse = isCoarse();
  const small = Math.min(screen.width, screen.height) < 820;
  return Math.min(window.devicePixelRatio || 1, coarse && small ? 1.5 : 2);
}

/** A painterly procedural lawn, used until /art/tex-lawn.webp loads (or forever if it is missing). */
function proceduralLawn() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = PALETTE.moss;
  g.fillRect(0, 0, 256, 256);
  let s = 1234567;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const cols = [PALETTE.fern, PALETTE.moss, PALETTE.slate700, PALETTE.fern];
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * 256;
    const y = rnd() * 256;
    g.globalAlpha = 0.08 + rnd() * 0.18;
    g.fillStyle = cols[i % cols.length];
    for (const dx of [-256, 0, 256]) {
      for (const dy of [-256, 0, 256]) {
        g.beginPath();
        g.ellipse(x + dx, y + dy, 2 + rnd() * 9, 1 + rnd() * 4, rnd() * Math.PI, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  g.globalAlpha = 1;
  return c;
}

/**
 * Create the WebGL yard view.
 *
 * Carve contract: `terrain` is ALWAYS the UNCARVED base yard. setGarden(g) is
 * the only place the garden is dug (bowl + berm, GPU and CPU twins). Depth
 * arrays from the sim — which runs on the carved terrain from applyGarden —
 * are passed to setWater as-is; levelPond reconciles them by volume. The
 * split's "before" side is this base terrain with no garden.
 *
 * Cells: cell (i, j) is centred at ((i+0.5)·cell, (j+0.5)·cell) m and the yard
 * spans [0, nx·cell] × [0, ny·cell] (grid-coords.js).
 *
 * Attach pointer listeners to api.canvas (the static fallback may swap the canvas).
 *
 * @param {HTMLCanvasElement} canvas
 * @param {{ terrain: {nx:number, ny:number, cell:number, z:Float64Array}, photo?: ImageBitmap|HTMLCanvasElement|null,
 *   toImage?: ((xy:[number,number]) => [number,number])|null, reducedMotion?: boolean }} opts
 */
export async function createYardScene(canvas, { terrain, photo = null, toImage = null, reducedMotion = false } = {}) {
  const THREE = await import('three');
  const { nx, ny, cell, z } = terrain;
  if (!(nx >= 2 && ny >= 2 && z && z.length >= nx * ny)) throw new Error('bad terrain');

  const renderer = new THREE.WebGLRenderer({
    canvas,
    // MSAA off on touch devices: the fill-rate goes to the water instead
    antialias: !isCoarse() && pixelRatioCap() < 2,
    alpha: false,
    powerPreference: 'high-performance',
    stencil: false,
  });
  let shaderError = null;
  renderer.debug.onShaderError = (gl, program, vs, fs) => {
    shaderError = (gl.getShaderInfoLog(vs) || '') + (gl.getShaderInfoLog(fs) || '') || 'link failed';
  };
  renderer.setClearColor(PALETTE.slate900, 1);
  const dpr = pixelRatioCap();
  renderer.setPixelRatio(dpr);

  // everything GPU-side we create is registered here, so destroy() and any
  // init failure (shader error, a throw while building) release the same set
  const owned = [];
  const own = (x) => { if (x) owned.push(x); return x; };
  const onTeardown = [];
  let tornDown = false;
  function teardown() {
    if (tornDown) return;
    tornDown = true;
    renderer.setAnimationLoop(null);
    for (const f of onTeardown.splice(0)) { try { f(); } catch { /* keep going */ } }
    for (const o of owned.splice(0)) { try { o.dispose(); } catch { /* keep going */ } }
    renderer.dispose();
    renderer.forceContextLoss();
  }
  try {

    // ---- grid geometry shared by ground and water (one vertex per cell centre) ----
    const frame = gridFrame(terrain);
    const { W, D, toWorld } = frame;
    let z0 = 0;
    for (let i = 0; i < nx * ny; i++) z0 += z[i];
    z0 /= nx * ny;

    const n = nx * ny;
    const pos = new Float32Array(n * 3);
    const ground = new Float32Array(n * 2);
    const grid = new Float32Array(n * 2);
    const uv = new Float32Array(n * 2);
    const zf = new Float32Array(n);
    for (let iy = 0; iy < ny; iy++) {
      for (let ix = 0; ix < nx; ix++) {
        const i = iy * nx + ix;
        const [x, y] = frame.center(ix, iy);
        zf[i] = z[i] - z0;
        pos[i * 3] = x - W / 2;
        pos[i * 3 + 1] = zf[i];
        pos[i * 3 + 2] = D / 2 - y;
        ground[i * 2] = x;
        ground[i * 2 + 1] = y;
        grid[i * 2] = ix;
        grid[i * 2 + 1] = iy;
        const t = toImage ? toImage([x, y]) : frame.planarUV(x, y);
        uv[i * 2] = Number.isFinite(t[0]) ? t[0] : -1;
        uv[i * 2 + 1] = Number.isFinite(t[1]) ? t[1] : -1;
      }
    }
    const index = new (n > 65535 ? Uint32Array : Uint16Array)((nx - 1) * (ny - 1) * 6);
    let k = 0;
    for (let iy = 0; iy < ny - 1; iy++) {
      for (let ix = 0; ix < nx - 1; ix++) {
        const a = iy * nx + ix;
        const b = a + 1;
        const c = a + nx;
        const d = c + 1;
        index[k++] = a; index[k++] = b; index[k++] = c;
        index[k++] = b; index[k++] = d; index[k++] = c;
      }
    }
    const geo = own(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aGround', new THREE.BufferAttribute(ground, 2));
    geo.setAttribute('aGrid', new THREE.BufferAttribute(grid, 2));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    geo.computeBoundingSphere();

    // ---- float textures ----
    const floatTex = (data) => {
      const t = own(new THREE.DataTexture(data, nx, ny, THREE.RedFormat, THREE.FloatType));
      t.minFilter = t.magFilter = THREE.NearestFilter;
      t.generateMipmaps = false;
      t.needsUpdate = true;
      return t;
    };
    const terrainTex = floatTex(zf);
    const depthNow = floatTex(new Float32Array(n));
    const depthBefore = floatTex(new Float32Array(n));
    let haveBefore = false;
    const scratch = new Float32Array(n);
    const leveled = new Float32Array(n);
    const rawNow = new Float32Array(n);    // our copy: callers may transfer or reuse theirs
    const rawBefore = new Float32Array(n);
    let haveDepth = false;
    let zDisp = zf;                     // ground heights including the dug garden
    let gardenIdx = new Int32Array(0);  // cells inside the garden rim

    // ---- ground pass target (half resolution) ----
    const rt = own(new THREE.WebGLRenderTarget(2, 2, { depthBuffer: true, stencilBuffer: false }));
    rt.texture.minFilter = THREE.LinearFilter;
    rt.texture.magFilter = THREE.LinearFilter;
    rt.texture.generateMipmaps = false;

    // ---- textures for the ground ----
    const lawnTex = own(new THREE.CanvasTexture(proceduralLawn()));
    lawnTex.wrapS = lawnTex.wrapT = THREE.RepeatWrapping;
    lawnTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    let photoTex = null;
    if (photo) {
      photoTex = own(new THREE.Texture(photo));
      photoTex.flipY = false;
      photoTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      photoTex.needsUpdate = true;
    }

    // ---- uniforms shared by ground and water ----
    const v3 = (hex) => new THREE.Vector3(...rgb(hex));
    const mix3 = (a, b, t) => v3(a).lerp(v3(b), t);
    const shared = {
      uTerrain: { value: terrainTex },
      uDepth: { value: depthNow },
      uGrid: { value: new THREE.Vector4(nx, ny, cell, 0) },
      uTime: { value: 0 },
      uGardenA: { value: new THREE.Vector4(0, 0, 1, 1) },
      uGardenB: { value: new THREE.Vector4(1, 0, 0, 0) },
      uGardenOn: { value: 0 },
      uSize: { value: new THREE.Vector2(W, D) },
      uBg: { value: v3(PALETTE.slate900) },
      uLight: { value: new THREE.Vector3(-0.5, 0.8, -0.3).normalize() },
      uMoss: { value: v3(PALETTE.moss) },
      uFern: { value: v3(PALETTE.fern) },
      uClay: { value: v3(PALETTE.clay) },
      uAsphalt: { value: v3(PALETTE.asphalt) },
      uSlate: { value: v3(PALETTE.slate900) },
      uPaper: { value: v3(PALETTE.paper) },
      uMarigold: { value: v3(PALETTE.marigold) },
      uTeal: { value: v3(PALETTE.teal) },
      uSkyLow: { value: mix3(PALETTE.rain, PALETTE.paper, 0.6) },
      uSkyHigh: { value: mix3(PALETTE.rain, PALETTE.slate700, 0.25) },
    };
    const groundMat = own(createGroundMaterial(THREE, shared, { photo: photoTex, lawn: lawnTex }));
    const waterMat = own(createWaterMaterial(THREE, shared, { groundTexture: rt.texture, reducedMotion }));

    const scene = new THREE.Scene();
    const groundMesh = new THREE.Mesh(geo, groundMat);
    groundMesh.frustumCulled = false;
    groundMesh.layers.enable(GROUND_LAYER);
    scene.add(groundMesh);
    const waterMesh = new THREE.Mesh(geo, waterMat);
    waterMesh.frustumCulled = false;
    waterMesh.renderOrder = 2;
    scene.add(waterMesh);

    let groundVersion = 1;
    const lawnLoad = new THREE.TextureLoader();
    lawnLoad.load('/art/tex-lawn.webp', (t) => {
      if (tornDown) { t.dispose(); return; }
      own(t);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = lawnTex.anisotropy;
      groundMat.uniforms.uLawn.value = t;
      lawnTex.dispose();
      groundVersion++;
    }, undefined, () => {});

    // ---- garden, plants, overlays ----
    let gardenU = gardenUniforms(null);
    let garden = null;
    let plantsData = [];
    let season = 1;
    let levels = null;
    let marksData = [];
    let contourObj = null;
    let marksObj = null;
    const h = (x, y) => groundHeight(terrain, z0, gardenU, x, y);
    const plantLayer = createPlantLayer(THREE, { onChange: () => {} });
    onTeardown.push(() => plantLayer.dispose());
    scene.add(plantLayer.group);
    onTeardown.push(() => { disposeObj(contourObj); disposeObj(marksObj); });
    let hMin = Infinity;
    let hMax = -Infinity;
    for (let i = 0; i < n; i++) { hMin = Math.min(hMin, zf[i]); hMax = Math.max(hMax, zf[i]); }

    function disposeObj(o) {
      if (!o) return;
      scene.remove(o);
      o.traverse((c) => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) c.material.dispose();
      });
    }
    function rebuildContours() {
      disposeObj(contourObj);
      contourObj = levels && levels.length ? buildContours(THREE, levels, h, toWorld, [W, D]) : null;
      if (contourObj) {
        contourObj.layers.enable(GROUND_LAYER);
        scene.add(contourObj);
      }
      groundVersion++;
    }
    function rebuildMarks() {
      disposeObj(marksObj);
      marksObj = buildMarks(THREE, marksData, h, toWorld);
      scene.add(marksObj);
    }

    // ---- camera ----
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 200);
    const yardPts = [];
    for (const [fx, fy] of [[0, 0], [0.5, 0], [1, 0], [1, 0.5], [1, 1], [0.5, 1], [0, 1], [0, 0.5]]) {
      const x = fx * W;
      const y = fy * D;
      yardPts.push(new THREE.Vector3(...toWorld(x, y, h(x, y))));
    }
    const subject = (focus) => {
      if (focus === 'garden' && garden) {
        const pts = [];
        const rr = Math.max(garden.lenM, garden.widM) / 2 + 0.8;
        for (let a = 0; a < 8; a++) {
          const x = garden.cx + Math.cos((a / 8) * Math.PI * 2) * rr;
          const y = garden.cy + Math.sin((a / 8) * Math.PI * 2) * rr;
          const gh = h(x, y);
          pts.push(new THREE.Vector3(...toWorld(x, y, gh)), new THREE.Vector3(...toWorld(x, y, gh + 1.0)));
        }
        return { center: new THREE.Vector3(...toWorld(garden.cx, garden.cy, h(garden.cx, garden.cy) + 0.3)), pts };
      }
      return { center: new THREE.Vector3(0, 0, 0), pts: yardPts };
    };
    const rig = createCameraRig(THREE, camera, subject);

    // ---- sizing ----
    const drawSize = new THREE.Vector2();
    let cssW = 1;
    let cssH = 1;
    function resize() {
      cssW = Math.max(1, canvas.clientWidth || canvas.width);
      cssH = Math.max(1, canvas.clientHeight || canvas.height);
      renderer.setSize(cssW, cssH, false);
      renderer.getDrawingBufferSize(drawSize);
      rt.setSize(Math.max(1, Math.round(drawSize.x * 0.5)), Math.max(1, Math.round(drawSize.y * 0.5)));
      waterMat.uniforms.uScreen.value.copy(drawSize);
      camera.aspect = cssW / cssH;
      camera.updateProjectionMatrix();
      rig.refit(performance.now());
      groundVersion++;
    }
    resize();
    rig.to('capture', 0, performance.now());
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => resize()) : null;
    if (ro) { ro.observe(canvas); onTeardown.push(() => ro.disconnect()); }

    // fail fast (so index.js can fall back) if a shader does not compile here
    // compile every program, then draw once: ground layer into the target (never the
    // water, which samples it — that would be a feedback loop), then the full scene on screen
    renderer.compile(scene, camera);
    camera.layers.set(GROUND_LAYER);
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    camera.layers.set(0);
    renderer.render(scene, camera);
    if (shaderError) throw new Error('shader compile failed: ' + String(shaderError).slice(0, 200));

    // ---- split state ----
    let split = null;
    const paperColor = new THREE.Color(PALETTE.paper);
    const slateColor = new THREE.Color(PALETTE.slate900);

    function applySide(before) {
      shared.uDepth.value = before && haveBefore ? depthBefore : depthNow;
      shared.uGardenOn.value = before ? 0 : gardenU.on;
      plantLayer.group.visible = !before;
      groundMat.uniforms.uPlantCount.value = before ? 0 : Math.min(plantsData.length, MAX_PLANT_SHADOWS);
    }

    const lastCam = new THREE.Matrix4();
    const lastProj = new THREE.Matrix4();
    let lastGroundVersion = -1;

    function renderSide(x, w, before, groundDirty) {
      applySide(before);
      if (groundDirty) {
        const rx = Math.round((x / cssW) * rt.width);
        const rw = Math.round(((x + w) / cssW) * rt.width) - rx;
        rt.scissor.set(rx, 0, rw, rt.height);
        rt.scissorTest = true;
        renderer.setRenderTarget(rt);
        camera.layers.set(GROUND_LAYER);
        renderer.render(scene, camera);
        renderer.setRenderTarget(null);
      }
      camera.layers.set(0);
      renderer.setScissor(x, 0, w, cssH);
      renderer.setScissorTest(true);
      renderer.render(scene, camera);
    }

    function render() {
      const groundDirty = split !== null || groundVersion !== lastGroundVersion
        || !lastCam.equals(camera.matrixWorld) || !lastProj.equals(camera.projectionMatrix);
      if (split === null) {
        renderSide(0, cssW, false, groundDirty);
      } else {
        const sx = Math.round(split * cssW);
        if (sx > 0) renderSide(0, sx, true, true);
        if (sx < cssW) renderSide(sx, cssW - sx, false, true);
        renderer.setScissor(sx - 1, 0, 2, cssH);
        renderer.setClearColor(paperColor, 1);
        renderer.clear(true, false, false);
        renderer.setClearColor(slateColor, 1);
      }
      renderer.setScissorTest(false);
      lastCam.copy(camera.matrixWorld);
      lastProj.copy(camera.projectionMatrix);
      lastGroundVersion = groundVersion;
    }

    // ---- loop + fps ----
    const frames = new Float32Array(90);
    let fi = 0;
    let fcount = 0;
    let last = 0;
    renderer.setAnimationLoop((now) => {
      if (last) {
        frames[fi] = now - last;
        fi = (fi + 1) % frames.length;
        fcount = Math.min(frames.length, fcount + 1);
      }
      last = now;
      shared.uTime.value = now / 1000;
      rig.update(now);
      render();
    });
    const onVisibility = () => { last = 0; };
    document.addEventListener('visibilitychange', onVisibility);
    onTeardown.push(() => document.removeEventListener('visibilitychange', onVisibility));

    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();

    /** Copy a caller's depth into our buffer (zero-filling a short one). */
    function copyDepth(src, dst) {
      const m = Math.min(n, src.length);
      for (let i = 0; i < m; i++) dst[i] = src[i];
      if (m < n) dst.fill(0, m);
    }

    /** Raw sim depth -> garden levelled -> softened banks -> texture. */
    function uploadNow() {
      leveled.set(rawNow);
      if (gardenIdx.length) levelPond(leveled, gardenIdx, zDisp);
      displayDepth(leveled, zDisp, depthNow.image.data, scratch, nx, ny);
      depthNow.needsUpdate = true;
    }

    /** Dev-only: the carve contract says terrain is uncarved; warn if it looks dug already. */
    function warnIfCarved(inside, ring) {
      const env = import.meta.env;
      if (!env || !env.DEV || !inside.length || !ring.length || !(garden.depthM > 0)) return;
      let a = 0;
      let b = 0;
      for (const i of inside) a += zf[i];
      for (const i of ring) b += zf[i];
      const drop = b / ring.length - a / inside.length;
      if (drop >= garden.depthM) {
        console.warn(`[raingarden] yard: terrain under the garden is already ${drop.toFixed(2)} m below its surroundings (>= depthM ${garden.depthM}); pass the UNCARVED base terrain, setGarden digs it.`);
      }
    }

    let lastPlants = null;
    let lastGardenKey = null;

    const api = {
      kind: 'webgl',
      /** The canvas actually drawn on. Attach pointer listeners to api.canvas (the fallback may swap it). */
      canvas,
      /** depth: m per cell (index y*nx+x), copied — the caller may transfer or reuse its array. */
      setWater(depth, { rainMmH = 0 } = {}) {
        if (depth) {
          copyDepth(depth, rawNow);
          haveDepth = true;
          uploadNow();
        }
        waterMat.uniforms.uRain.value = rippleDensity(rainMmH);
        groundVersion++;
      },
      /**
       * g: { cx, cy, lenM, widM, rot, depthM, bermM } | null — digs the garden into the base terrain.
       * plants: [{ x, y, r, id, form? }] (form looked up by id when missing). season 0..1 scales them 0.3→1.
       * Same g and plants as last time (shallow-equal) → only the season scale changes, no re-carve.
       */
      setGarden(g, plants = [], { season: s = 1 } = {}) {
        const key = gardenKey(g);
        const list = g ? plants || [] : [];
        if (key === lastGardenKey && samePlants(list, lastPlants)) {
          season = s;
          const k = plantLayer.setSeason(season);
          const arr = groundMat.uniforms.uPlants.value;
          plantsData.slice(0, MAX_PLANT_SHADOWS).forEach((p, i) => arr[i].set(p.x, p.y, p.r * k));
          return;
        }
        lastGardenKey = key;
        lastPlants = list.map((p) => ({ ...p }));
        garden = g ? { ...g } : null;
        gardenU = gardenUniforms(garden);
        if (garden) {
          zDisp = new Float32Array(n);
          const inside = [];
          const ring = [];
          for (let i = 0; i < n; i++) {
            const [x, y] = frame.center(i % nx, Math.floor(i / nx));
            zDisp[i] = zf[i] + gardenOffset(gardenU, x, y);
            const m = gardenRim(gardenU, x, y);
            if (m < 0) inside.push(i);
            else if (m > 0.3 && m < 0.9) ring.push(i);
          }
          gardenIdx = Int32Array.from(inside);
          warnIfCarved(inside, ring);
        } else {
          zDisp = zf;
          gardenIdx = new Int32Array(0);
        }
        if (haveDepth) uploadNow();
        shared.uGardenA.value.fromArray(gardenU.a);
        shared.uGardenB.value.fromArray(gardenU.b);
        shared.uGardenOn.value = gardenU.on;
        plantsData = list;
        season = s;
        const scaleK = plantLayer.set(plantsData, season, h, toWorld);
        const arr = groundMat.uniforms.uPlants.value;
        plantsData.slice(0, MAX_PLANT_SHADOWS).forEach((p, i) => arr[i].set(p.x, p.y, p.r * scaleK));
        groundMat.uniforms.uPlantCount.value = Math.min(plantsData.length, MAX_PLANT_SHADOWS);
        rebuildContours();
        rebuildMarks();
        rig.refit(performance.now());
      },
      setContours(lv) {
        levels = lv || null;
        rebuildContours();
      },
      setMarks(marks) {
        marksData = marks || [];
        rebuildMarks();
      },
      cameraTo(name, ms = 1200) {
        rig.to(name, reducedMotion ? 0 : ms, performance.now());
      },
      /**
       * Before/after: LEFT of the divider = before (otherDepth on the base terrain, no garden),
       * RIGHT = now (current water + garden). x01 null turns the split off. otherDepth is copied.
       */
      setSplit(x01, otherDepth) {
        if (otherDepth) {
          copyDepth(otherDepth, rawBefore);
          displayDepth(rawBefore, zf, depthBefore.image.data, scratch, nx, ny);
          depthBefore.needsUpdate = true;
          haveBefore = true;
        }
        split = x01 === null || x01 === undefined ? null : Math.min(1, Math.max(0, x01));
        groundVersion++;
      },
      /** Ground metres under a pointer (bowl-aware ray march; cheap enough for pointermove), or null. */
      pick(clientX, clientY) {
        const r = canvas.getBoundingClientRect();
        ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
        raycaster.setFromCamera(ndc, camera);
        const { origin: o, direction: d } = raycaster.ray;
        return marchPick(frame, h, [o.x, o.y, o.z], [d.x, d.y, d.z], hMin - gardenU.b[2], hMax + gardenU.b[3]);
      },
      fps() {
        if (!fcount) return 0;
        let s = 0;
        for (let i = 0; i < fcount; i++) s += frames[i];
        return 1000 / (s / fcount);
      },
      resize,
      /** Dispose everything and lose the WebGL context. */
      destroy() {
        teardown();
      },
    };
    return api;
  } catch (e) {
    teardown();
    throw e;
  }
}

/** A stable key for a garden's shape (shallow-equal test). */
function gardenKey(g) {
  if (!g) return 'none';
  return [g.cx, g.cy, g.lenM, g.widM, g.rot || 0, g.depthM || 0, g.bermM || 0].join(',');
}

function samePlants(a, b) {
  if (!b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const p = a[i];
    const q = b[i];
    if (p.x !== q.x || p.y !== q.y || p.r !== q.r || p.id !== q.id || p.form !== q.form) return false;
  }
  return true;
}
