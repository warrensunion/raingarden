/**
 * The water shader — the hero of the designer.
 *
 * WHY it is built this way:
 * - One mesh on the terrain grid; the vertex shader lifts each vertex to
 *   terrain + depth, read from a float DataTexture that setWater re-uploads.
 *   No geometry is rebuilt per frame, so a 128² storm animates for the cost of
 *   one 64 KB texture upload.
 * - Dry vertices are pushed 3 cm *below* the ground. The triangles between a
 *   wet and a dry vertex then cut through the terrain exactly at the
 *   waterline, giving a smooth shoreline with no z-fighting, and fully dry
 *   triangles are hidden by the depth test (and discarded below 0.5 mm).
 * - The normal comes from the water *surface* gradient (terrain + depth), so a
 *   pond is flat and mirror-like while a stream tilts with the slope.
 * - Refraction samples a half-resolution render target of the ground pass,
 *   offset by the view-space normal; depth tints toward teal then slate.
 * - Rain ripples are procedural: a jittered grid of rings at two scales, each
 *   cell re-seeding its drop every cycle, density driven by rain intensity.
 * - Overflow streams: Manning-style speed (h^⅔·√S) lights up bright streaks
 *   that run downhill; shallow edges get broken paper-coloured foam.
 */

import { COMMON_GLSL } from './glsl-common.js';
import { GARDEN_GLSL } from './garden-shape.js';

const vertex = /* glsl */ `
${COMMON_GLSL}
${GARDEN_GLSL}
attribute vec2 aGround;
attribute vec2 aGrid;
varying vec2 vGround;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vThick;
varying float vFlow;
varying vec2 vFlowDir;

const float WET = 0.0005;

// water surface height at a grid node, or 'fallback' where the node is dry
float surfOr(ivec2 g, float fallback) {
  float d = depthAt(g);
  if (d < WET) return fallback;
  return terrainAt(g) + gardenOffset(vec2(gclamp(g)) * uGrid.z) + d;
}

void main() {
  ivec2 g = ivec2(aGrid + 0.5);
  float ground = position.y + gardenOffset(aGround);
  float d = depthAt(g);
  float surf;
  if (d >= WET) {
    surf = ground + d;
  } else {
    // dry node: extend the neighbouring water surface flat (so a pond's edge is
    // its true contour where the plane meets the ground), but never above this
    // node's ground; with no wet neighbour, tuck it 3 cm under the ground.
    float top = -1e9;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        if (i == 0 && j == 0) continue;
        top = max(top, surfOr(g + ivec2(i, j), -1e9));
      }
    }
    surf = top > -1e8 ? min(top, ground - 0.002) : ground - 0.03;
  }
  float thick = surf - ground;
  vec3 pos = vec3(position.x, surf, position.z);

  // surface gradient; dry neighbours count as level with this node (flat pond edges)
  float dx = (surfOr(g + ivec2(1, 0), surf) - surfOr(g - ivec2(1, 0), surf)) / (2.0 * uGrid.z);
  float dy = (surfOr(g + ivec2(0, 1), surf) - surfOr(g - ivec2(0, 1), surf)) / (2.0 * uGrid.z);
  vNormal = normalize(vec3(-dx, 1.0, dy));
  float slope = length(vec2(dx, dy));
  // display speed (m/s), Manning with a smooth-surface n so sheet flow reads
  vFlow = pow(max(d, 0.0), 0.6667) * sqrt(min(slope, 0.5)) / 0.03;
  vFlowDir = slope > 1e-5 ? -vec2(dx, dy) / slope : vec2(0.0, 1.0);
  vThick = thick;
  vGround = aGround;
  vec4 world = modelMatrix * vec4(pos, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const fragment = /* glsl */ `
${COMMON_GLSL}
uniform sampler2D uGroundRT;
uniform vec2 uScreen;       // drawing-buffer size in px
uniform float uRain;        // 0..1 ripple density
uniform float uMotion;      // 1 normal, ~0.2 reduced motion
uniform vec2 uSize;
uniform vec3 uBg;
uniform vec3 uLight;
uniform vec3 uTeal;
uniform vec3 uSlate;
uniform vec3 uSkyLow;
uniform vec3 uSkyHigh;
uniform vec3 uPaper;
uniform vec3 uMarigold;
varying vec2 vGround;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vThick;
varying float vFlow;
varying vec2 vFlowDir;

// expanding rain rings at one scale: xy = slope (d height / d metre), z = crest brightness.
// Wavelength ≈ 0.35·cellM; fades out when a pixel covers too much of it (no sparkle).
vec3 ringLayer(vec2 p, float cellM, float t, float density, float seed, float pix) {
  float aa = 1.0 - smoothstep(0.06, 0.14, pix / cellM);
  if (aa <= 0.0) return vec3(0.0);
  vec2 q = p / cellM;
  vec2 id = floor(q);
  vec2 grad = vec2(0.0);
  float crest = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 cid = id + vec2(float(i), float(j));
      vec3 h = hash33(vec3(cid, seed));
      float ph = t * (0.8 + 0.5 * h.z) + h.x;
      float cyc = floor(ph);
      float f = fract(ph);
      vec3 h2 = hash33(vec3(cid + cyc * 7.31, seed + cyc));
      if (h2.z > density) continue;
      vec2 c = cid + 0.2 + 0.6 * h2.xy;
      vec2 dv = q - c;
      float dist = length(dv);
      float r = f * 0.9;
      float x = (dist - r) * 18.0;
      float env = (1.0 - f) * (1.0 - f) * exp(-x * x * 0.3);
      grad += dv / max(dist, 1e-3) * cos(x) * env;
      crest += max(sin(x + 1.2), 0.0) * env;
    }
  }
  return vec3(grad * 0.11, crest) * aa;
}

void main() {
  if (vThick < 0.0005) discard;
  float t = uTime * uMotion;
  vec3 n = normalize(vNormal);

  // ambient wind shiver so still water is never dead
  vec2 wp = vGround * 2.2 + vec2(t * 0.15, -t * 0.11);
  vec2 g = vec2(vnoise(wp + vec2(0.07, 0.0)) - vnoise(wp - vec2(0.07, 0.0)),
                vnoise(wp + vec2(0.0, 0.07)) - vnoise(wp - vec2(0.0, 0.07))) * 0.18;

  // rain rings, two scales
  float pix = length(fwidth(vGround));
  float crest = 0.0;
  if (uRain > 0.001) {
    vec3 r1 = ringLayer(vGround, 0.9, t, uRain, 3.0, pix);
    vec3 r2 = 0.8 * ringLayer(vGround + 11.3, 0.45, t * 1.15, uRain * 0.85, 9.0, pix);
    g += r1.xy + r2.xy;
    crest = min(1.0, r1.z + r2.z);
  }

  // overflow streaks running downhill
  float flow = smoothstep(0.04, 0.35, vFlow);
  float streak = 0.0;
  if (flow > 0.0) {
    vec2 dir = normalize(vFlowDir);
    vec2 perp = vec2(-dir.y, dir.x);
    float a = dot(vGround, dir);
    float b = dot(vGround, perp);
    float saa = 1.0 - smoothstep(0.02, 0.06, pix);
    float s = vnoise(vec2(a * 1.1 - t * (1.0 + vFlow * 2.5), b * 4.5));
    s = mix(s, vnoise(vec2(a * 2.3 - t * (1.6 + vFlow * 4.0), b * 8.0)), 0.35 * saa);
    streak = smoothstep(0.55, 0.85, s) * flow * mix(0.5, 1.0, saa);
    g += perp * (s - 0.5) * 0.2 * flow;
  }
  // world: X = x, Z = -y
  n = normalize(n + vec3(-g.x, 0.0, g.y));

  vec3 V = normalize(cameraPosition - vWorld);
  float cosv = clamp(dot(n, V), 0.0, 1.0);
  float fres = 0.025 + 0.975 * pow(1.0 - cosv, 5.0);

  // refraction of the ground pass
  vec2 uv = gl_FragCoord.xy / uScreen;
  vec3 nv = (viewMatrix * vec4(n, 0.0)).xyz;
  uv += nv.xy * 0.045 * clamp(vThick * 6.0, 0.25, 1.0);
  vec3 refr = texture2D(uGroundRT, clamp(uv, 0.001, 0.999)).rgb;

  // absorption: clear at the edge, teal, then slate in the deep
  // thin sheets still get a teal veil so overflow streams read as water
  float k = max(1.0 - exp(-vThick * 7.0), 0.4 * smoothstep(0.0005, 0.008, vThick));
  vec3 body = mix(uTeal, uSlate, smoothstep(0.05, 0.6, vThick));
  vec3 col = mix(refr * mix(vec3(1.0), uTeal * 1.5, 0.35), body, k * 0.85);

  // soft overcast sky + a small warm highlight from the upper left
  vec3 R = reflect(-V, n);
  vec3 sky = mix(uSkyLow, uSkyHigh, smoothstep(-0.1, 0.7, R.y));
  float spec = pow(max(dot(R, uLight), 0.0), 40.0);
  col = mix(col, sky, fres * 0.85);
  col += mix(uPaper, uMarigold, 0.3) * spec * 0.3;

  col = mix(col, mix(uPaper, uTeal, 0.35), streak * 0.35);
  col = mix(col, mix(uPaper, uSkyLow, 0.5), crest * 0.3);

  // broken foam where the water is shallow
  float shore = 1.0 - smoothstep(0.001, 0.009, vThick);
  float fn = fbm(vGround * 5.0 + vec2(t * 0.08, t * 0.05));
  float foam = shore * smoothstep(0.55, 0.75, fn + shore * 0.2) * (1.0 - flow * 0.6);
  col = mix(col, uPaper, foam * 0.5);

  float alpha = smoothstep(0.0005, 0.004, vThick);
  float e = edgeFade(vGround, uSize);
  col = mix(uBg, col, e);
  gl_FragColor = vec4(col, alpha * e);
}
`;

/** Build the water ShaderMaterial. `shared` = uniforms shared with the ground. */
export function createWaterMaterial(THREE, shared, extra) {
  const uniforms = {
    ...shared,
    uGroundRT: { value: extra.groundTexture },
    uScreen: { value: new THREE.Vector2(1, 1) },
    uRain: { value: 0 },
    uMotion: { value: extra.reducedMotion ? 0.2 : 1 },
  };
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false, // plants stand in the water rather than being cut at the waterline
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  });
}

/** Rain intensity (mm/h) -> ripple density 0..1. Drizzle shows a few rings, a downpour fills the surface. */
export function rippleDensity(rainMmH) {
  if (!(rainMmH > 0)) return 0;
  return Math.min(1, 0.08 + rainMmH / 30);
}
