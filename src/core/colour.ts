/** CSS colours as numbers, for the sky drawn in the calendar and in Fly mode. */

/** "#rgb", "#rrggbb", "rgb(r, g, b)" or "rgba(r, g, b, a)" → [r, g, b] (0–255) and alpha (0–1). */
export function parseColour(c: string): { rgb: [number, number, number]; alpha: number } {
  const s = c.trim();
  const fn = /^rgba?\(([^)]+)\)$/i.exec(s);
  if (fn) {
    const [r = 0, g = 0, b = 0, a = 1] = fn[1]!.split(',').map((x) => Number(x.trim()));
    return { rgb: [r, g, b], alpha: a };
  }
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (hex) {
    const h = hex[1]!.length === 3 ? [...hex[1]!].map((x) => x + x).join('') : hex[1]!;
    return { rgb: [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)], alpha: 1 };
  }
  throw new Error(`Not a colour: ${c}`);
}

/** Mix two colours (0–255 each): t = 0 gives a, 1 gives b. */
export function mixRgb(a: readonly number[], b: readonly number[], t: number): [number, number, number] {
  return [0, 1, 2].map((i) => a[i]! + (b[i]! - a[i]!) * t) as [number, number, number];
}
