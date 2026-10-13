/**
 * Palette for the yard renderer.
 *
 * WHY: shaders and Canvas2D need numeric colours, but the only allowed colours
 * are the design tokens in src/styles/tokens.css (spec §3). This file mirrors
 * those tokens 1:1 so the renderer never invents a colour; derived shades are
 * mixes of tokens done in the shaders, not new hexes.
 */

export const PALETTE = {
  slate900: '#26313C',
  slate700: '#3E4A59',
  rain: '#7D8FA3',
  asphalt: '#2B2F36',
  moss: '#5F7A4A',
  fern: '#9DB873',
  clay: '#B9824F',
  teal: '#49A3A0',
  paper: '#ECE6DA',
  marigold: '#E8B04A',
};

/** '#RRGGBB' -> [r, g, b] in 0..1 (display space; the renderer is not colour-managed). */
export function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
