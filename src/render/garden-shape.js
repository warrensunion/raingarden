/**
 * The rain-garden basin shape, in GLSL and in JS — the same function twice.
 *
 * WHY: the ground and the water are displaced on the GPU (a bowl with a soft
 * berm, so the garden reads as a real dug basin), but plant sprites, contour
 * lines, marks and picking are placed on the CPU. If the two disagreed, plants
 * would float or sink. Keeping both versions side by side in one small file
 * is the cheapest way to keep them identical.
 *
 * Garden g = { cx, cy, lenM, widM, rot, depthM, bermM }: an ellipse centred at
 * (cx, cy) metres, full axis lengths lenM × widM, rotated rot radians from +x.
 */

/** Uniform values for a garden (or "no garden"). */
export function gardenUniforms(g) {
  if (!g) return { a: [0, 0, 1, 1], b: [1, 0, 0, 0], on: 0 };
  const hl = Math.max(0.05, g.lenM / 2);
  const hw = Math.max(0.05, g.widM / 2);
  return {
    a: [g.cx, g.cy, hl, hw],
    b: [Math.cos(g.rot || 0), Math.sin(g.rot || 0), g.depthM || 0, g.bermM || 0],
    on: 1,
  };
}

/** Shared GLSL: needs uniforms uGardenA (cx, cy, halfLen, halfWid), uGardenB (cos, sin, depth, berm), uGardenOn. */
export const GARDEN_GLSL = /* glsl */ `
uniform vec4 uGardenA;
uniform vec4 uGardenB;
uniform float uGardenOn;

// metres outside the rim (negative = inside), approximately
float gardenRim(vec2 p) {
  vec2 d = p - uGardenA.xy;
  vec2 l = vec2(d.x * uGardenB.x + d.y * uGardenB.y, -d.x * uGardenB.y + d.y * uGardenB.x);
  float r = length(l / uGardenA.zw);
  return (r - 1.0) * min(uGardenA.z, uGardenA.w);
}

float gardenOffset(vec2 p) {
  if (uGardenOn < 0.5) return 0.0;
  float m = gardenRim(p);
  float side = min(0.6, 0.5 * min(uGardenA.z, uGardenA.w));
  float bowl = -uGardenB.z * smoothstep(0.0, side, -m);
  float bx = (m - 0.22) / 0.16;
  float berm = uGardenB.w * exp(-bx * bx);
  return bowl + berm;
}
`;

/** JS twin of gardenRim/gardenOffset. u = gardenUniforms(g). */
export function gardenOffset(u, x, y) {
  if (!u.on) return 0;
  const [cx, cy, hl, hw] = u.a;
  const [c, s, depth, berm] = u.b;
  const dx = x - cx;
  const dy = y - cy;
  const lx = (dx * c + dy * s) / hl;
  const ly = (-dx * s + dy * c) / hw;
  const m = (Math.hypot(lx, ly) - 1) * Math.min(hl, hw);
  const side = Math.min(0.6, 0.5 * Math.min(hl, hw));
  const t = Math.min(1, Math.max(0, -m / side));
  const bowl = -depth * t * t * (3 - 2 * t);
  const bx = (m - 0.22) / 0.16;
  return bowl + berm * Math.exp(-bx * bx);
}

/**
 * Bilinear terrain height at ground metres (x, y), plus the garden offset.
 * Vertex (ix, iy) of the grid sits at (ix*cell, iy*cell).
 */
export function groundHeight(terrain, z0, u, x, y) {
  const { nx, ny, cell, z } = terrain;
  const fx = Math.min(nx - 1, Math.max(0, x / cell));
  const fy = Math.min(ny - 1, Math.max(0, y / cell));
  const x0 = Math.min(nx - 2, Math.floor(fx));
  const y0 = Math.min(ny - 2, Math.floor(fy));
  const tx = fx - x0;
  const ty = fy - y0;
  const i = y0 * nx + x0;
  const h = (z[i] * (1 - tx) + z[i + 1] * tx) * (1 - ty) + (z[i + nx] * (1 - tx) + z[i + nx + 1] * tx) * ty;
  return h - z0 + gardenOffset(u, x, y);
}

/** Metres outside the rim (negative = inside); JS twin of the GLSL gardenRim. */
export function gardenRim(u, x, y) {
  if (!u.on) return Infinity;
  const [cx, cy, hl, hw] = u.a;
  const [c, s] = u.b;
  const dx = x - cx;
  const dy = y - cy;
  const lx = (dx * c + dy * s) / hl;
  const ly = (-dx * s + dy * c) / hw;
  return (Math.hypot(lx, ly) - 1) * Math.min(hl, hw);
}
