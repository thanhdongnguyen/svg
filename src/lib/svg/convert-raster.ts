import { vectorize, validateSettings } from './vectorize';
import { quantizeImage } from '../image/quantize';
import { traceAntialiasedArtwork } from './trace-antialias';
import { LIMITS, validateDimensions } from '../image/validation';
import { init, vectorize_rgba, type VTracerOptions } from './vendor/vtracer.mjs';
import type { ConversionSettings, ConversionResult } from '../../types/conversion';

type Raster = { width: number; height: number; data: Uint8ClampedArray };
let ready: Promise<unknown> | undefined;

/** Explicit bytes are used by reproducible Node tests; production fetches only a local static asset. */
export function initializeVtracer(bytes?: Uint8Array): Promise<unknown> {
  if (!ready) {
    ready = (async () => {
      if (bytes) return init(bytes as Uint8Array<ArrayBuffer>);
      const response = await fetch('/engines/vtracer-1.0.0-alpha.4.wasm');
      if (!response.ok) throw new Error('Không tải được bộ xử lý vector. Hãy tải lại trang rồi thử lại.');
      return init(await response.arrayBuffer());
    })().catch(error => {
      ready = undefined;
      throw new Error('Không khởi tạo được bộ xử lý vector. Hãy tải lại trang rồi thử lại.', { cause: error });
    });
  }
  return ready;
}

export function usesOpaqueEngine(image: Raster, settings: ConversionSettings): boolean {
  if (image.width === 1 || image.height === 1 || settings.mode !== 'color') return false;
  const colors = new Set<number>();
  for (let i = 0; i < image.data.length; i += 4) {
    if (image.data[i + 3] !== 255) return false;
    if (colors.size < 5) colors.add((image.data[i] * 256 + image.data[i + 1]) * 256 + image.data[i + 2]);
  }
  // Keep exact, small flat palettes on the pixel-exact baseline.
  return colors.size > 4;
}

export function inspectTracePaths(svg: string): string[] {
  if (new TextEncoder().encode(svg).length > LIMITS.svgBytes) throw new Error('SVG vượt giới hạn 5 MiB. Hãy thử Cân bằng hoặc ít màu hơn.');
  const paths = svg.match(/<path\b[^>]*\/>/g) ?? [];
  if (!paths.length) throw new Error('Không tìm được đường vector hợp lệ cho ảnh.');
  if (paths.length > LIMITS.paths || countSegments(paths) > LIMITS.segments) throw new Error('Ảnh tạo quá nhiều đường vector. Hãy thử Cân bằng hoặc ít màu hơn.');
  return paths;
}

function countSegments(paths: string[]): number {
  return paths.reduce((n, path) => n + ((path.match(/d="([^"]*)"/)?.[1] ?? '').match(/[MmLlHhVvCcSsQqTtAaZz]/g)?.length ?? 0), 0);
}

function palettePaint(paths: string[], palette: Array<{ r: number; g: number; b: number }>): string[] {
  const mapped = new Map<string, string>();
  return paths.map(path => path.replace(/fill="(#[0-9A-Fa-f]{6})"/g, (_, hex: string) => {
    const key = hex.toLowerCase();
    let fill = mapped.get(key);
    if (!fill) {
      const rgb = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
      let best = palette[0], error = Infinity;
      for (const color of palette) {
        const d = (color.r - rgb[0]) ** 2 + (color.g - rgb[1]) ** 2 + (color.b - rgb[2]) ** 2;
        if (d < error) { error = d; best = color; }
      }
      fill = '#' + [best.r, best.g, best.b].map(c => c.toString(16).padStart(2, '0')).join('');
      mapped.set(key, fill);
    }
    return `fill="${fill}"`;
  }));
}

function colorCoverageError(data: Uint8ClampedArray, paths: string[]): number {
  const used = [...new Set(paths.flatMap(path => [...path.matchAll(/fill="#([0-9a-f]{6})"/g)].map(m => m[1])))];
  const colors = used.map(hex => [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16)));
  const histogram = new Map<number, number>();
  for (let i = 0; i < data.length; i += 4) {
    const key = (data[i] * 256 + data[i + 1]) * 256 + data[i + 2];
    histogram.set(key, (histogram.get(key) ?? 0) + 1);
  }
  let sum = 0;
  for (const [key, count] of histogram) {
    const rgb = [key >> 16, (key >> 8) & 255, key & 255];
    let error = Infinity;
    for (const c of colors) error = Math.min(error, (rgb[0] - c[0]) ** 2 + (rgb[1] - c[1]) ** 2 + (rgb[2] - c[2]) ** 2);
    sum += error * count;
  }
  return Math.sqrt(sum / (data.length / 4 * 3));
}

/** Browser worker pipeline; transparent artwork never enters an opaque-only engine. */
export async function convertRaster(image: Raster, settings: ConversionSettings): Promise<ConversionResult> {
  validateSettings(settings); validateDimensions(image.width, image.height);
  if (image.data.length !== image.width * image.height * 4) throw new Error('Buffer ảnh không hợp lệ.');
  if (!usesOpaqueEngine(image, settings)) {
    const antialiased = await traceAntialiasedArtwork(image, settings, initializeVtracer);
    return antialiased ?? vectorize(image, settings);
  }
  const started = performance.now();
  await initializeVtracer();
  const { width, height, data } = image;
  const quantized = quantizeImage(data, settings.colors);
  const palette = quantized.palette.map(c => '#' + [c.r, c.g, c.b].map(v => v.toString(16).padStart(2, '0')).join(''));
  const options: VTracerOptions = {
    clustering: 'color-cluster', hierarchical: 'stacked', mode: 'spline',
    colorPrecision: 6, layerDifference: 16,
    filterSpeckle: quantized.exactPalette ? 0 : settings.quality === 'fast' ? 4 : 2,
    simplify: settings.quality === 'fast' ? 0.5 : settings.quality === 'balanced' ? 0.25 : 0.1,
    pathPrecision: 3, optimize: 0, palette,
  };
  const trace = (pixels: Uint8ClampedArray, options: VTracerOptions) => {
    const rgba = new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength);
    return palettePaint([
      ...inspectTracePaths(vectorize_rgba(rgba, width, height, options)),
      ...inspectTracePaths(vectorize_rgba(rgba, width, height, { ...options, hierarchical: 'cutout' })),
    ], quantized.palette);
  };
  // Cutout shares boundary geometry; a matching vector stack underneath keeps
  // antialias seams opaque and locally colored instead of showing a white gap.
  // Upstream can introduce averaged ancestor colors even with a fixed palette.
  // Explicitly map final solid fills back to the requested palette budget.
  let paths = trace(data, options);
  // Hierarchical clustering can merge a continuous color ramp into one region.
  // Reject missing source colors before accepting that output. Quantized input
  // with zero layer merging keeps such ramps separated. This is a color sanity
  // check, not a claim of spatial or perceptual fidelity.
  if (colorCoverageError(quantized.data, paths) > 6) {
    paths = trace(quantized.data, { ...options, colorPrecision: 8, layerDifference: 0, palette: undefined });
  }
  const segmentCount = countSegments(paths);
  if (paths.length > LIMITS.paths || segmentCount > LIMITS.segments) throw new Error('Ảnh tạo quá nhiều đường vector. Hãy thử Cân bằng hoặc ít màu hơn.');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${paths.join('')}</svg>`;
  const bytes = new TextEncoder().encode(svg).length;
  if (bytes > LIMITS.svgBytes) throw new Error('SVG vượt giới hạn 5 MiB. Hãy thử Cân bằng hoặc ít màu hơn.');
  const colorCount = new Set(paths.flatMap(p => [...p.matchAll(/fill="([^"]+)"/g)].map(m => m[1]))).size;
  return {
    svg, warnings: quantized.exactPalette ? [] : ['Màu và chi tiết được xấp xỉ bằng đường vector. Hãy kiểm tra gradient, texture và chi tiết nhỏ trước khi tải.'],
    metrics: { width, height, pathCount: paths.length, segmentCount, colorCount, bytes, durationMs: performance.now() - started },
  };
}
