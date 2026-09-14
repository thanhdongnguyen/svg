import type { RGBA } from "imagetracerjs";

// Spatial sampling can miss sparse artwork on a large white background. Seed the
// engine from the complete color distribution instead. Five-bit bins bound the
// histogram; weighted distance prevents near-white noise consuming the palette.
export function distributionPalette(data: Uint8ClampedArray, limit: number): RGBA[] {
  const bins = new Map<number, { count: number; r: number; g: number; b: number; a: number }>();
  for (let i = 0; i < data.length; i += 4) {
    const key = (data[i] >> 3) * 32768 + (data[i + 1] >> 3) * 1024 + (data[i + 2] >> 3) * 32 + (data[i + 3] >> 3);
    let bin = bins.get(key);
    if (!bin) { bin = { count: 0, r: 0, g: 0, b: 0, a: 0 }; bins.set(key, bin); }
    bin.count++; bin.r += data[i]; bin.g += data[i + 1]; bin.b += data[i + 2]; bin.a += data[i + 3];
  }
  const colors = [...bins.values()].map(c => ({ count: c.count, color: { r: Math.round(c.r / c.count), g: Math.round(c.g / c.count), b: Math.round(c.b / c.count), a: Math.round(c.a / c.count) }, distance: Infinity })).sort((a, b) => b.count - a.count);
  const selected: RGBA[] = [];
  let next = colors.find(c => c.color.a === 0) ?? colors[0];
  while (next && selected.length < limit) {
    const seed = next.color;
    selected.push(seed);
    let score = -1;
    let candidate: typeof next | undefined;
    for (const c of colors) {
      const distance = (c.color.r - seed.r) ** 2 + (c.color.g - seed.g) ** 2 + (c.color.b - seed.b) ** 2 + 2 * (c.color.a - seed.a) ** 2;
      c.distance = Math.min(c.distance, distance);
      const value = c.distance * Math.sqrt(c.count);
      if (c.distance >= 36 && value > score) { score = value; candidate = c; }
    }
    if (!candidate) break;
    next = candidate;
  }
  return selected;
}
