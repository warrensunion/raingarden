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
import { createGroundMaterial, MAX_PLANT_SHADOWS } from './ground-material.js';
import { createWaterMaterial, rippleDensity } from './water-material.js';
import { createCameraRig } from './camera-rig.js';
import { buildContours, buildMarks } from './overlays.js';
import { createPlantLayer } from './plants.js';
import { displayDepth, levelPond } from './depth-display.js';

const GROUND_LAYER = 1;

function pixelRatioCap() {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
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

export async function createYardScene(canvas, { terrain, photo = null, toImage = null, reducedMotion = false } = {}) {
  const THREE = await import('three');
  const { nx, ny, cell, z } = terrain;
  if (!(nx >= 2 && ny >= 2 && z && z.length >= nx * ny)) throw new Error('bad terrain');

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: pixelRatioCap() < 2,
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

  // ---- grid geometry shared by ground and water ----
  const W = (nx - 1) * cell;
  const D = (ny - 1) * cell;
  let z0 = 0;
  for (let i = 0; i < nx * ny; i++) z0 += z[i];
  z0 /= nx * ny;
  const toWorld = (x, y, h) => [x - W / 2, h, D / 2 - y];

  const n = nx * ny;
  const pos = new Float32Array(n * 3);
  const ground = new Float32Array(n * 2);
  const grid = new Float32Array(n * 2);
  const uv = new Float32Array(n * 2);
  const zf = new Float32Array(n);
  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      const i = iy * nx + ix;
      const x = ix * cell;
      const y = iy * cell;
      zf[i] = z[i] - z0;
      pos[i * 3] = x - W / 2;
      pos[i * 3 + 1] = zf[i];
      pos[i * 3 + 2] = D / 2 - y;
      ground[i * 2] = x;
      ground[i * 2 + 1] = y;
      grid[i * 2] = ix;
      grid[i * 2 + 1] = iy;
      const t = toImage ? toImage([x, y]) : [x / W, 1 - y / D];
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
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aGround', new THREE.BufferAttribute(ground, 2));
  geo.setAttribute('aGrid', new THREE.BufferAttribute(grid, 2));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.computeBoundingSphere();

  // ---- float textures ----
  const floatTex = (data) => {
    const t = new THREE.DataTexture(data, nx, ny, THREE.RedFormat, THREE.FloatType);
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
  let lastDepth = null;               // last raw depth, re-levelled when the garden moves
  let zDisp = zf;                     // ground heights including the dug garden
  let gardenIdx = new Int32Array(0);  // cells inside the garden rim

  // ---- ground pass target (half resolution) ----
  const rt = new THREE.WebGLRenderTarget(2, 2, { depthBuffer: true, stencilBuffer: false });
  rt.texture.minFilter = THREE.LinearFilter;
  rt.texture.magFilter = THREE.LinearFilter;
  rt.texture.generateMipmaps = false;

  // ---- textures for the ground ----
  const lawnTex = new THREE.CanvasTexture(proceduralLawn());
  lawnTex.wrapS = lawnTex.wrapT = THREE.RepeatWrapping;
  lawnTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  let photoTex = null;
  if (photo) {
    photoTex = new THREE.Texture(photo);
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
  const groundMat = createGroundMaterial(THREE, shared, { photo: photoTex, lawn: lawnTex });
  const waterMat = createWaterMaterial(THREE, shared, { groundTexture: rt.texture, reducedMotion });

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
  let destroyed = false;
  const lawnLoad = new THREE.TextureLoader();
  lawnLoad.load('/art/tex-lawn.webp', (t) => {
    if (destroyed) { t.dispose(); return; }
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
  scene.add(plantLayer.group);

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
  if (ro) ro.observe(canvas);

  // fail fast (so index.js can fall back) if a shader does not compile here
  renderer.compile(scene, camera);
  renderer.setRenderTarget(rt);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  if (shaderError) {
    renderer.dispose();
    renderer.forceContextLoss();
    throw new Error('shader compile failed: ' + String(shaderError).slice(0, 200));
  }

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

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  /** Raw sim depth -> garden levelled -> softened banks -> texture. */
  function uploadNow() {
    leveled.set(lastDepth.length > n ? lastDepth.subarray(0, n) : lastDepth);
    if (gardenIdx.length) levelPond(leveled, gardenIdx, zDisp);
    displayDepth(leveled, zDisp, depthNow.image.data, scratch, nx, ny);
    depthNow.needsUpdate = true;
  }

  const api = {
    kind: 'webgl',
    canvas,
    setWater(depth, { rainMmH = 0 } = {}) {
      if (depth) {
        lastDepth = depth;
        uploadNow();
      }
      waterMat.uniforms.uRain.value = rippleDensity(rainMmH);
      groundVersion++;
    },
    setGarden(g, plants = [], { season: s = 1 } = {}) {
      garden = g || null;
      gardenU = gardenUniforms(garden);
      if (garden) {
        zDisp = new Float32Array(n);
        const inside = [];
        for (let i = 0; i < n; i++) {
          const x = (i % nx) * cell;
          const y = Math.floor(i / nx) * cell;
          zDisp[i] = zf[i] + gardenOffset(gardenU, x, y);
          if (gardenRim(gardenU, x, y) < 0) inside.push(i);
        }
        gardenIdx = Int32Array.from(inside);
      } else {
        zDisp = zf;
        gardenIdx = new Int32Array(0);
      }
      if (lastDepth) uploadNow();
      shared.uGardenA.value.fromArray(gardenU.a);
      shared.uGardenB.value.fromArray(gardenU.b);
      shared.uGardenOn.value = gardenU.on;
      plantsData = garden ? plants || [] : [];
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
    setSplit(x01, otherDepth) {
      if (otherDepth) {
        displayDepth(otherDepth, zf, depthBefore.image.data, scratch, nx, ny);
        depthBefore.needsUpdate = true;
        haveBefore = true;
      }
      split = x01 === null || x01 === undefined ? null : Math.min(1, Math.max(0, x01));
      groundVersion++;
    },
    pick(clientX, clientY) {
      const r = canvas.getBoundingClientRect();
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      camera.layers.set(0);
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObject(groundMesh, false)[0];
      if (!hit) return null;
      const x = hit.point.x + W / 2;
      const y = D / 2 - hit.point.z;
      return [Math.min(W, Math.max(0, x)), Math.min(D, Math.max(0, y))];
    },
    fps() {
      if (!fcount) return 0;
      let s = 0;
      for (let i = 0; i < fcount; i++) s += frames[i];
      return 1000 / (s / fcount);
    },
    resize,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      renderer.setAnimationLoop(null);
      if (ro) ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      disposeObj(contourObj);
      disposeObj(marksObj);
      plantLayer.dispose();
      geo.dispose();
      groundMat.dispose();
      waterMat.dispose();
      for (const t of [terrainTex, depthNow, depthBefore, lawnTex, photoTex, groundMat.uniforms.uLawn.value]) if (t) t.dispose();
      rt.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
  return api;
}
