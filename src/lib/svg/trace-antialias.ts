import { LIMITS, validateDimensions } from '../image/validation';
import { vectorize_rgba } from './vendor/vtracer.mjs';
import type { ConversionResult, ConversionSettings, Quality } from '../../types/conversion';

type Raster = { width: number; height: number; data: Uint8ClampedArray };
type Color = [number, number, number];
type Coverage = { palette: Color[]; first: Uint8Array; second: Uint8Array; mix: Float32Array };
const INTERNAL_PIXELS = 4_194_304;
const NO_COLOR = 255;

/** Keeps the temporary RGBA tracing buffer at or below 16 MiB. */
export function antialiasScale(width: number, height: number, quality: Quality): number {
  return Math.min(quality === 'fast' ? 2 : quality === 'balanced' ? 4 : 8, Math.floor(Math.sqrt(INTERNAL_PIXELS / (width * height))));
}

function colorError(data: Uint8ClampedArray, offset: number, color: Color): number {
  return Math.max(...color.map((v, c) => Math.abs(v - data[offset + c])));
}

function analyzeCoverage(image: Raster, colorLimit: number): Coverage | undefined {
  const { width, height, data } = image, pixels = width * height;
  let opaque = 0, soft = 0, transparent = 0, flat = 0;
  const histogram = new Map<number, { color: Color; count: number }>();
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4, alpha = data[i + 3];
    if (!alpha) { transparent++; continue; }
    if (alpha < 255) { soft++; continue; }
    opaque++;
    const color: Color = [data[i], data[i + 1], data[i + 2]];
    let uniform = x > 0 && y > 0 && x < width - 1 && y < height - 1;
    if (uniform) for (const offset of [i - 4, i + 4, i - width * 4, i + width * 4]) {
      if (data[offset + 3] !== 255 || colorError(data, offset, color) > 1) { uniform = false; break; }
    }
    if (!uniform) continue;
    flat++;
    const key = (color[0] * 256 + color[1]) * 256 + color[2];
    const bin = histogram.get(key);
    if (bin) bin.count++;
    else histogram.set(key, { color, count: 1 });
    // Photos and continuously varying fills do not belong to this strategy.
    if (histogram.size > 64) return undefined;
  }
  if (!transparent || soft < 4 || !opaque || flat < Math.max(16, opaque * 0.65)) return undefined;
  const palette: Color[] = [];
  for (const bin of [...histogram.values()].sort((a, b) => b.count - a.count)) {
    if (palette.some(c => c.every((v, j) => Math.abs(v - bin.color[j]) <= 1))) continue;
    palette.push(bin.color);
    if (palette.length > Math.min(8, colorLimit)) return undefined;
  }
  if (!palette.length) return undefined;
  const pure = new Uint8Array(pixels).fill(NO_COLOR);
  for (let p = 0; p < pixels; p++) {
    if (data[p * 4 + 3] !== 255) continue;
    const index = palette.findIndex(c => colorError(data, p * 4, c) <= 1.5);
    if (index !== -1) pure[p] = index;
  }
  function nearby(x: number, y: number, radius: number, test: (p: number) => boolean): boolean {
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < width && yy < height && test(yy * width + xx)) return true;
    }
    return false;
  }
  const first = new Uint8Array(pixels), second = new Uint8Array(pixels), mix = new Float32Array(pixels);
  let taperPixels = 0;
  const taperLimit = Math.max(2, Math.floor(soft * 0.005));
  // Cache RGB fits; a flat illustration has a small set of antialias mixtures.
  const fits = new Map<number, { a: number; b: number; t: number; error: number }>();
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = y * width + x, offset = p * 4, alpha = data[offset + 3];
    if (!alpha) continue;
    if (alpha < 255) {
      if (!nearby(x, y, 2, n => data[n * 4 + 3] === 0)) return undefined;
      if (!nearby(x, y, 2, n => pure[n] !== NO_COLOR)) {
        // A few taper-tip pixels can extend just past the last opaque pixel.
        // This exception cannot admit a broad translucent fill or a shadow.
        const nearSolid = nearby(x, y, 4, n => pure[n] !== NO_COLOR)
          || (alpha <= 64 && nearby(x, y, 6, n => pure[n] !== NO_COLOR));
        if (++taperPixels > taperLimit || !nearSolid) return undefined;
      }
    }
    if (pure[p] !== NO_COLOR) { first[p] = second[p] = pure[p]; continue; }
    const key = ((data[offset] * 256 + data[offset + 1]) * 256 + data[offset + 2]) * 256 + alpha;
    let fit = fits.get(key);
    if (!fit) {
      fit = { a: 0, b: 0, t: 0, error: Infinity };
      for (let a = 0; a < palette.length; a++) {
        const solidError = colorError(data, offset, palette[a]);
        if (solidError < fit.error) fit = { a, b: a, t: 0, error: solidError };
      }
      // Prefer a single paint whenever its composited error is already below
      // the noise bound. Low-alpha unpremultiplication must not invent a
      // second ink which has no actual nearby painted region.
      if (fit.error * alpha / 255 > 1.5) for (let a = 0; a < palette.length; a++) {
        for (let b = a + 1; b < palette.length; b++) {
          const direction = palette[b].map((v, c) => v - palette[a][c]);
          const denominator = direction.reduce((sum, v) => sum + v * v, 0);
          const t = Math.max(0, Math.min(1, direction.reduce((sum, v, c) => sum + v * (data[offset + c] - palette[a][c]), 0) / denominator));
          const error = Math.max(...direction.map((v, c) => Math.abs(palette[a][c] + t * v - data[offset + c])));
          if (error < fit.error) fit = { a, b, t, error };
        }
      }
      fits.set(key, fit);
    }
    if (fit.error * alpha / 255 > 1.5) return undefined;
    if (fit.a !== fit.b && fit.t > 0.02 && fit.t < 0.98) {
      // Color mixtures must lie at actual nearby paint boundaries, not inside
      // a gradient which happens to interpolate the same two palette colors.
      if (!nearby(x, y, 2, n => pure[n] === fit!.a) || !nearby(x, y, 2, n => pure[n] === fit!.b)) return undefined;
    }
    first[p] = fit.a; second[p] = fit.b; mix[p] = fit.t;
  }
  return { palette, first, second, mix };
}

function extractPaths(svg: string, color: Color, scale: number): { paths: string[]; segments: number } {
  if (new TextEncoder().encode(svg).length > LIMITS.svgBytes) throw new Error('SVG vượt giới hạn 5 MiB. Hãy thử Cân bằng.');
  const paths: string[] = [];
  let segments = 0;
  for (const match of svg.matchAll(/<path\b[^>]*\/>/g)) {
    const fill = match[0].match(/\bfill="([^"]*)"/)?.[1];
    if (!fill || !/^#000000$/i.test(fill)) throw new Error('Engine tạo nền hoặc màu ngoài mask vector.');
    const d = match[0].match(/\bd="([^"]*)"/)?.[1];
    // This core emits line/cubic coordinates. Arc flags cannot be rescaled as
    // plain coordinates, so unexpected arc output is rejected explicitly.
    if (!d || !/^[MmLlHhVvCcSsQqTtZz0-9eE+.,\s-]+$/.test(d) || !/[Zz]\s*$/.test(d)) throw new Error('Engine tạo đường vector không hợp lệ.');
    const normalized = d.replace(/[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g, value => {
      const number = Number(value) / scale;
      if (!Number.isFinite(number)) throw new Error('Tọa độ SVG không hợp lệ.');
      return String(Math.round(number * 1000) / 1000);
    });
    segments += (normalized.match(/[MmLlHhVvCcSsQqTtZz]/g) ?? []).length;
    paths.push(`<path fill="rgb(${color.join(',')})" d="${normalized}"/>`);
  }
  return { paths, segments };
}

/** Reconstruct subpixel coverage for eligible flat, opaque paint with a thin
 * antialiased transparent fringe. Fractional-alpha fills take another path. */
export async function traceAntialiasedArtwork(image: Raster, settings: ConversionSettings, initialize: () => Promise<unknown>): Promise<ConversionResult | undefined> {
  const { width, height, data } = image;
  validateDimensions(width, height);
  if (data.length !== width * height * 4) throw new Error('Buffer ảnh không hợp lệ.');
  if (settings.mode !== 'color' || width < 3 || height < 3) return undefined;
  const scale = antialiasScale(width, height, settings.quality);
  // At native sampling this strategy can displace boundaries more than the
  // existing transparent tracer. Only use measured supersampled candidates.
  if (scale < 2) return undefined;
  const started = performance.now(), coverage = analyzeCoverage(image, settings.colors);
  if (!coverage) return undefined;
  await initialize();
  const internalWidth = width * scale, internalHeight = height * scale;
  const rgba = new Uint8Array(internalWidth * internalHeight * 4), mask = new Float32Array(width * height);
  const paths: string[] = [];
  let segments = 0;
  // Independently antialiased color contours otherwise expose transparency at
  // shared interior edges. Underpaint only a one-pixel erosion of the source's
  // fully opaque area: painting the full silhouette would double its soft edge.
  // The same erosion follows real holes, and does not add a new palette color.
  for (let color = coverage.palette.length > 1 ? -1 : 0; color < coverage.palette.length; color++) {
    if (performance.now() - started > LIMITS.timeoutMs) throw new Error('Chuyển đổi quá thời gian. Hãy thử ảnh nhỏ hơn.');
    if (color === -1) {
      let hasInterior = false;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        let interior = data[(y * width + x) * 4 + 3] === 255;
        for (let yy = Math.max(0, y - 1); interior && yy <= Math.min(height - 1, y + 1); yy++) {
          for (let xx = Math.max(0, x - 1); xx <= Math.min(width - 1, x + 1); xx++) {
            if (data[(yy * width + xx) * 4 + 3] !== 255) { interior = false; break; }
          }
        }
        mask[y * width + x] = interior ? 255 : 0;
        hasInterior ||= interior;
      }
      if (!hasInterior) continue;
    } else {
      for (let p = 0; p < mask.length; p++) {
        const t = coverage.mix[p];
        const fraction = (coverage.first[p] === color ? 1 - t : 0) + (coverage.second[p] === color ? t : 0);
        mask[p] = fraction * data[p * 4 + 3];
      }
    }
    // Extend edge coverage to the crop boundary; zero padding would invent
    // transparency at opaque corners of an artwork cropped by its canvas.
    const sample = (x: number, y: number) => mask[Math.max(0, Math.min(height - 1, y)) * width + Math.max(0, Math.min(width - 1, x))];
    for (let y = 0; y < internalHeight; y++) {
      const sy = (y + 0.5) / scale - 0.5, y0 = Math.floor(sy), fy = sy - y0;
      for (let x = 0; x < internalWidth; x++) {
        const sx = (x + 0.5) / scale - 0.5, x0 = Math.floor(sx), fx = sx - x0;
        const value = (sample(x0, y0) * (1 - fx) + sample(x0 + 1, y0) * fx) * (1 - fy)
          + (sample(x0, y0 + 1) * (1 - fx) + sample(x0 + 1, y0 + 1) * fx) * fy;
        const shade = value >= 127.5 ? 0 : 255, offset = (y * internalWidth + x) * 4;
        rgba[offset] = rgba[offset + 1] = rgba[offset + 2] = shade; rgba[offset + 3] = 255;
      }
    }
    // White is only the BW tracer's temporary background. Only its black
    // foreground contours are exported; the output canvas remains transparent.
    const raw = vectorize_rgba(rgba, internalWidth, internalHeight, {
      clustering: 'bw', hierarchical: 'stacked', mode: 'spline', filterSpeckle: 0,
      simplify: (settings.quality === 'fast' ? 0.3 : settings.quality === 'balanced' ? 0.2 : 0.1) * scale,
      pathPrecision: 3, optimize: 0,
    });
    const layer = extractPaths(raw, coverage.palette[Math.max(0, color)], scale);
    if (!layer.paths.length) return undefined;
    paths.push(...layer.paths); segments += layer.segments;
    if (paths.length > LIMITS.paths || segments > LIMITS.segments) throw new Error('Ảnh tạo quá nhiều đường vector. Hãy thử Cân bằng hoặc ảnh nhỏ hơn.');
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${paths.join('')}</svg>`;
  const bytes = new TextEncoder().encode(svg).length;
  if (bytes > LIMITS.svgBytes) throw new Error('SVG vượt giới hạn 5 MiB. Hãy thử Cân bằng.');
  return {
    svg, warnings: ['Viền khử răng cưa được khôi phục thành đường vector. Chi tiết dưới một pixel có thể khác ảnh gốc.'],
    metrics: { width, height, pathCount: paths.length, segmentCount: segments, colorCount: coverage.palette.length, bytes, durationMs: performance.now() - started },
  };
}
