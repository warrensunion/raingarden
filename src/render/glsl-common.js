/**
 * Small GLSL helpers shared by the ground and water shaders.
 *
 * WHY: both materials need the same grid lookups (terrain + depth come in as
 * float textures read with texelFetch, so there is no filtering cost or
 * float-filtering extension needed) and the same cheap sin-free hash/noise, so
 * grain on the ground and on the water lines up and looks hand-made rather
 * than tiled.
 */

export const COMMON_GLSL = /* glsl */ `
uniform sampler2D uTerrain;  // R32F, metres relative to the yard's mean height
uniform sampler2D uDepth;    // R32F, water depth in metres per cell
uniform vec4 uGrid;          // nx, ny, cell (m), unused
uniform float uTime;

ivec2 gclamp(ivec2 g) { return clamp(g, ivec2(0), ivec2(int(uGrid.x) - 1, int(uGrid.y) - 1)); }
float terrainAt(ivec2 g) { return texelFetch(uTerrain, gclamp(g), 0).r; }
float depthAt(ivec2 g) { return texelFetch(uDepth, gclamp(g), 0).r; }

// Dave Hoskins' hash without sine (stable on mobile GPUs)
vec3 hash33(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s;
}
// fade to the background at the yard's edges, so the yard reads as a painted vignette, not a slab
float edgeFade(vec2 ground, vec2 size) {
  vec2 g = ground / size;
  vec2 e = min(g, 1.0 - g);
  float w = 0.035 + 0.02 * vnoise(ground * 0.9);
  return smoothstep(0.0, w, e.x) * smoothstep(0.0, w, e.y);
}
`;
