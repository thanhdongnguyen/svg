import type { RGBA } from "imagetracerjs";

type OpacityClass = 0 | 1 | 2;
type Sample = { r: number; g: number; b: number; a: number; count: number; opacity: OpacityClass };
type Bin = Sample & { index: number };

export type QuantizedImage = {
  data: Uint8ClampedArray;
  palette: RGBA[];
  exactPalette: boolean;
};

const opacityClass = (a: number): OpacityClass => a === 0 ? 0 : a === 255 ? 2 : 1;

// Centered premultiplied RGB gives a Euclidean metric proportional to the
// squared compositing error on black AND white. Hidden RGB never affects it.
function distance(x: Sample, y: Sample): number {
  return (x.r - y.r) ** 2 + (x.g - y.g) ** 2 + (x.b - y.b) ** 2 + 0.75 * (x.a - y.a) ** 2;
}

function binKey(data: Uint8ClampedArray, offset: number, shift: number): number {
  const a = data[offset + 3];
  if (!a) return -1;
  const scale = a / 255;
  const r = Math.floor(((data[offset] - 127.5) * scale + 128) / 2 ** shift);
  const g = Math.floor(((data[offset + 1] - 127.5) * scale + 128) / 2 ** shift);
  const b = Math.floor(((data[offset + 2] - 127.5) * scale + 128) / 2 ** shift);
  // The final bit prevents opaque pixels sharing a bin with soft alpha.
  return (((r * 32 + g) * 32 + b) * 32 + (a >> 3)) * 2 + (a === 255 ? 1 : 0);
}

function histogram(data: Uint8ClampedArray): { bins: Map<number, Bin>; shift: number } {
  // Bound clustering independently of pixel count. A normal opaque image has
  // at most 32^3 bins. Unusually varied RGBA input receives coarser RGB bins.
  for (let shift = 3; ; shift++) {
    const bins = new Map<number, Bin>();
    let overflow = false;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3], key = binKey(data, i, shift), scale = a / 255;
      let bin = bins.get(key);
      if (!bin) {
        bin = { r: 0, g: 0, b: 0, a: 0, count: 0, opacity: opacityClass(a), index: 0 };
        bins.set(key, bin);
        if (bins.size > 65_536) { overflow = true; break; }
      }
      bin.r += (data[i] - 127.5) * scale;
      bin.g += (data[i + 1] - 127.5) * scale;
      bin.b += (data[i + 2] - 127.5) * scale;
      bin.a += a;
      bin.count++;
    }
    if (overflow) continue;
    for (const bin of bins.values()) {
      bin.r /= bin.count; bin.g /= bin.count; bin.b /= bin.count; bin.a /= bin.count;
    }
    return { bins, shift };
  }
}

function nearest(sample: Sample, palette: Sample[]): number {
  let best = -1, error = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const candidate = palette[i];
    // Never introduce opacity into transparent pixels or erase opaque pixels.
    if (sample.opacity === 0 ? candidate.opacity !== 0 : sample.opacity === 2 ? candidate.opacity !== 2 : candidate.opacity === 0) continue;
    const d = distance(sample, candidate);
    if (d < error) { error = d; best = i; }
  }
  return best;
}

/** Quantize visible appearance, rather than straight RGBA channel noise.
 * Returns new pixels. Call the tracer with this palette and one quantization
 * cycle, with blur disabled, so it cannot re-cluster using straight RGBA.
 */
export function quantizeImage(data: Uint8ClampedArray, limit: number): QuantizedImage {
  if (data.length === 0 || data.length % 4 || !Number.isInteger(limit) || limit < 2 || limit > 64) {
    throw new Error("Buffer ảnh hoặc giới hạn màu không hợp lệ.");
  }
  const exact = new Map<number, RGBA>();
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3], r = a ? data[i] : 0, g = a ? data[i + 1] : 0, b = a ? data[i + 2] : 0;
    const key = ((r * 256 + g) * 256 + b) * 256 + a;
    exact.set(key, { r, g, b, a });
    if (exact.size > limit) break;
  }
  if (exact.size <= limit) {
    const result = data.slice();
    for (let i = 0; i < result.length; i += 4) if (!result[i + 3]) result[i] = result[i + 1] = result[i + 2] = 0;
    return { data: result, palette: [...exact.values()], exactPalette: true };
  }

  const { bins, shift } = histogram(data);
  const samples = [...bins.values()].sort((a, b) => b.count - a.count);
  const palette: Sample[] = [];
  // Seed represented endpoint classes first. Two-color mode must retain fully
  // transparent and fully opaque pixels even if soft edges also occur.
  for (const opacity of [0, 2, 1] as const) {
    const sample = samples.find(s => s.opacity === opacity);
    if (sample && palette.length < limit) palette.push({ ...sample });
  }
  const errors = new Float64Array(samples.length).fill(Infinity);
  for (const seed of palette) {
    for (let i = 0; i < samples.length; i++) errors[i] = Math.min(errors[i], distance(samples[i], seed));
  }
  while (palette.length < limit) {
    let best = -1, score = 0;
    for (let i = 0; i < samples.length; i++) {
      if (samples[i].opacity === 0 || errors[i] < 16) continue;
      const candidate = errors[i] * Math.sqrt(samples[i].count);
      if (candidate > score) { best = i; score = candidate; }
    }
    if (best === -1) break;
    const seed = { ...samples[best] };
    palette.push(seed);
    for (let i = 0; i < samples.length; i++) errors[i] = Math.min(errors[i], distance(samples[i], seed));
  }

  for (let iteration = 0; iteration < 5; iteration++) {
    const sums = palette.map(p => ({ ...p, r: 0, g: 0, b: 0, a: 0, count: 0 }));
    for (const sample of samples) {
      const index = nearest(sample, palette);
      sample.index = index;
      const sum = sums[index];
      sum.r += sample.r * sample.count; sum.g += sample.g * sample.count;
      sum.b += sample.b * sample.count; sum.a += sample.a * sample.count; sum.count += sample.count;
    }
    if (iteration === 4) break;
    for (let i = 0; i < palette.length; i++) {
      const sum = sums[i];
      if (!sum.count) continue;
      const center = palette[i];
      center.r = sum.r / sum.count; center.g = sum.g / sum.count; center.b = sum.b / sum.count;
      center.a = center.opacity === 2 ? 255 : center.opacity === 0 ? 0 : sum.a / sum.count;
    }
  }
  const colors = palette.map(p => {
    const a = p.opacity === 0 ? 0 : p.opacity === 2 ? 255 : Math.max(1, Math.min(254, Math.round(p.a)));
    // Recover straight RGB only at serialization. Use the unrounded mean alpha
    // here so centroid colors do not shift when opacity rounds to an integer.
    const channel = (v: number) => a ? Math.max(0, Math.min(255, Math.round(127.5 + v * 255 / p.a))) : 0;
    return { r: channel(p.r), g: channel(p.g), b: channel(p.b), a };
  });
  const result = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const color = colors[bins.get(binKey(data, i, shift))!.index];
    result[i] = color.r; result[i + 1] = color.g; result[i + 2] = color.b; result[i + 3] = color.a;
  }
  return { data: result, palette: colors, exactPalette: false };
}
