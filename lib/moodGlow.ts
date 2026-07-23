// Mood-reactive background: blend the selected mood tags' hues into one
// ambient color. Hue is circular, so the blend is a circular mean (atan2 of
// summed sin/cos) — a linear average of 350° and 10° would give 180°
// (cyan) instead of 0° (red).

export interface Glow {
  h: number;
  s: number;
}

export function blendGlows(glows: Glow[]): Glow | null {
  if (glows.length === 0) return null;
  let x = 0;
  let y = 0;
  let s = 0;
  for (const g of glows) {
    const rad = (g.h * Math.PI) / 180;
    x += Math.cos(rad);
    y += Math.sin(rad);
    s += g.s;
  }
  const h = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  return { h, s: s / glows.length };
}

/**
 * Re-express `next` in the ±180° window around `prev` (may leave 0–360).
 * CSS transitions animate the hue numerically, so 350 → 10 must be written
 * as 350 → 370 to sweep through red instead of the long way through cyan.
 */
export function unwrapHue(prev: number, next: number): number {
  const base = ((next - prev) % 360 + 540) % 360 - 180; // shortest signed delta
  return prev + base;
}
