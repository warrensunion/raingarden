/**
 * The ground shader: the user's photo (or a painterly lawn) draped on the
 * terrain, lit like an overcast Pacific day, with the garden's mulch and berm
 * painted in, darkened where it is wet, and soft contact shadows under plants.
 *
 * WHY a custom shader instead of MeshStandardMaterial: the art direction is
 * gouache, not PBR. We want flat-ish, matte colour with cool shadows and warm
 * light, grain, and an edge that dissolves into the page's slate — and the
 * garden bowl must be displaced by exactly the same function the water uses
 * (garden-shape.js), which is easiest when we own the vertex shader.
 */

import { COMMON_GLSL } from './glsl-common.js';
import { GARDEN_GLSL } from './garden-shape.js';

export const MAX_PLANT_SHADOWS = 48;

const vertex = /* glsl */ `
${COMMON_GLSL}
${GARDEN_GLSL}
attribute vec2 aGround;
attribute vec2 aGrid;
varying vec2 vGround;
varying vec2 vUv;
varying vec3 vNormal;
varying float vWet;
varying float vRim;

float hAt(ivec2 g) {
  vec2 p = (vec2(g) + 0.5) * uGrid.z;  // cell centre
  return terrainAt(g) + gardenOffset(p);
}

void main() {
  ivec2 g = ivec2(aGrid + 0.5);
  float y = position.y + gardenOffset(aGround);
  float dx = (hAt(g + ivec2(1, 0)) - hAt(g - ivec2(1, 0))) / (2.0 * uGrid.z);
  float dy = (hAt(g + ivec2(0, 1)) - hAt(g - ivec2(0, 1))) / (2.0 * uGrid.z);
  // world X = x, world Z = -y
  vNormal = normalize(vec3(-dx, 1.0, dy));
  float w = depthAt(g);
  w = max(w, 0.6 * max(max(depthAt(g + ivec2(1, 0)), depthAt(g - ivec2(1, 0))), max(depthAt(g + ivec2(0, 1)), depthAt(g - ivec2(0, 1)))));
  vWet = smoothstep(0.0003, 0.004, w);
  vRim = uGardenOn > 0.5 ? gardenRim(aGround) : 99.0;
  vGround = aGround;
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position.x, y, position.z, 1.0);
}
`;

const fragment = /* glsl */ `
${COMMON_GLSL}
uniform vec4 uGardenA;
uniform float uGardenOn;
uniform sampler2D uPhoto;
uniform sampler2D uLawn;
uniform float uHasPhoto;
uniform vec2 uSize;
uniform vec3 uBg;
uniform vec3 uLight;
uniform vec3 uMoss;
uniform vec3 uFern;
uniform vec3 uClay;
uniform vec3 uAsphalt;
uniform vec3 uSlate;
uniform vec3 uPaper;
uniform vec3 uMarigold;
uniform vec3 uPlants[${MAX_PLANT_SHADOWS}];
uniform int uPlantCount;
varying vec2 vGround;
varying vec2 vUv;
varying vec3 vNormal;
varying float vWet;
varying float vRim;

void main() {
  vec3 lawn = texture2D(uLawn, vGround / 3.2).rgb;
  vec3 base = lawn;
  if (uHasPhoto > 0.5) {
    vec2 uv = vUv;
    float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
    vec3 photo = texture2D(uPhoto, clamp(uv, 0.001, 0.999)).rgb;
    // soften the photo toward the painted palette so it sits in the illustration
    float lum = dot(photo, vec3(0.299, 0.587, 0.114));
    photo = mix(photo, vec3(lum) * mix(uMoss, uPaper, lum) * 1.6, 0.18);
    base = mix(lawn, photo, inside);
  }

  // the garden: mulch inside the rim, a slightly brighter grassy berm just outside
  if (vRim < 0.6) {
    float n = fbm(vGround * 6.0);
    vec3 mulch = mix(mix(uClay, uAsphalt, 0.55), uClay, smoothstep(0.35, 0.8, n));
    mulch = mix(mulch, uAsphalt, 0.25 * smoothstep(0.5, 0.2, fbm(vGround * 23.0)));
    float edge = 0.04 + 0.05 * vnoise(vGround * 7.0);
    float inMulch = 1.0 - smoothstep(-edge, edge, vRim + 0.04);
    base = mix(base, mulch, inMulch);
    float berm = exp(-pow((vRim - 0.22) / 0.16, 2.0)) * (1.0 - inMulch);
    base = mix(base, mix(base, uFern, 0.45), berm * 0.6);
  }

  // overcast light from the upper left; cool shadows, warm light
  float ndl = dot(normalize(vNormal), uLight);
  float lit = smoothstep(-0.2, 1.0, ndl);
  vec3 shade = mix(mix(uSlate, uMoss, 0.25) * 1.25, mix(uPaper, uMarigold, 0.15) * 1.08, lit);
  vec3 col = base * shade * 1.05;

  // soft contact shadows under plants (garden only)
  if (vRim < 1.2) {
    float occ = 0.0;
    for (int i = 0; i < ${MAX_PLANT_SHADOWS}; i++) {
      if (i >= uPlantCount) break;
      vec3 p = uPlants[i];
      float d = length(vGround - p.xy - vec2(0.12, -0.08) * p.z) / max(p.z, 0.05);
      occ = max(occ, (1.0 - smoothstep(0.2, 1.0, d)) * 0.5);
    }
    col *= 1.0 - occ * 0.55;
  }

  // wet ground goes darker and cooler
  col = mix(col, col * vec3(0.6, 0.66, 0.72), vWet * 0.85);

  // grain (risograph-ish) and the edge dissolving into the page
  float grain = hash12(floor(gl_FragCoord.xy)) - 0.5;
  col += grain * 0.035;
  col = mix(uBg, col, edgeFade(vGround, uSize));
  gl_FragColor = vec4(col, 1.0);
}
`;

/** Build the ShaderMaterial; `shared` holds uniform objects shared with the water. */
export function createGroundMaterial(THREE, shared, extra) {
  const uniforms = {
    ...shared,
    uPhoto: { value: extra.photo },
    uLawn: { value: extra.lawn },
    uHasPhoto: { value: extra.photo ? 1 : 0 },
    uPlants: { value: Array.from({ length: MAX_PLANT_SHADOWS }, () => new THREE.Vector3()) },
    uPlantCount: { value: 0 },
  };
  return new THREE.ShaderMaterial({ uniforms, vertexShader: vertex, fragmentShader: fragment });
}
