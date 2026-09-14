import ImageTracer, { type TraceOptions } from "imagetracerjs";
import { LIMITS, validateDimensions } from "../image/validation";
import { serializeTrace } from "./serialize";
import type { ConversionResult, ConversionSettings } from "../../types/conversion";

type Raster = { width: number; height: number; data: Uint8ClampedArray };
export type AlphaColorFit = { color: [number, number, number]; compositeRMSE: number; maxChannelError: number };
export type AlphaTraceResult = ConversionResult & { colorFit: AlphaColorFit };

/** Only accept an essentially single-color image with a substantial soft mask.
 * Every visible pixel is checked: a small colored detail cannot hide in a low
 * average error or a large transparent background.
 */
export function fitAlphaColor(image: Raster): AlphaColorFit | undefined {
  const { data } = image;
  let visible = 0, soft = 0, weight = 0;
  const sum = [0, 0, 0], alphas = new Set<number>();
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (!alpha) continue;
    visible++;
    if (alpha < 255) { soft++; alphas.add(alpha); }
    const w = (alpha / 255) ** 2;
    weight += w;
    for (let j = 0; j < 3; j++) sum[j] += data[i + j] * w;
  }
  if (soft < 16 || soft < visible * 0.05 || alphas.size < 8 || !weight) return undefined;
  const color = sum.map(c => Math.round(c / weight)) as [number, number, number];
  let squared = 0, maximum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3] / 255;
    for (let j = 0; j < 3; j++) {
      const error = Math.abs(data[i + j] - color[j]) * alpha;
      maximum = Math.max(maximum, error);
      squared += error ** 2;
    }
  }
  const compositeRMSE = Math.sqrt(squared / (visible * 3));
  // Canvas unpremultiplication can perturb straight RGB greatly near alpha=0.
  // A rendered SVG -> PNG -> canvas roundtrip can reach two visible channel
  // levels (observed on the fractional-opacity linear fixture). Real changes
  // above this strict compositing bound stay on the multicolor tracing path.
  if (maximum > 2 || compositeRMSE > 0.6) return undefined;
  return { color, compositeRMSE, maxChannelError: maximum };
}

/** Cumulative filled masks avoid the fragile one-pixel rings produced by
 * tracing mutually exclusive alpha bands. This is a general single-color
 * mask strategy; it does not assume a circle, radial fade, or parametric shape.
 */
export function traceAlphaImage(image: Raster, settings: ConversionSettings): AlphaTraceResult | undefined {
  const { width, height, data } = image;
  validateDimensions(width, height);
  if (data.length !== width * height * 4) throw new Error("Buffer ảnh không hợp lệ.");
  if (width === 1 || height === 1 || settings.mode !== "color") return undefined;
  const started = performance.now();
  const colorFit = fitAlphaColor(image);
  if (!colorFit) return undefined;
  // Very long stacks accumulate 8-bit blending error. Use enough levels to
  // remove visible banding, while capping the number of overlapping paints.
  const levelCount = Math.min(settings.colors, settings.quality === "fast" ? 12 : settings.quality === "balanced" ? 24 : 32);
  const tolerance = (settings.quality === "fast" ? 0.8 : settings.quality === "balanced" ? 0.45 : 0.25) * Math.max(1, Math.max(width, height) / 1024) ** 2;
  const mask = new Uint8ClampedArray(data.length);
  const [r, g, b] = colorFit.color;
  const parts: string[] = [];
  let paths = 0, segments = 0, levels = 0;
  for (let step = 1; step <= levelCount; step++) {
    if (performance.now() - started > LIMITS.timeoutMs) throw new Error("Chuyển đổi quá thời gian. Hãy thử Nhanh hoặc ảnh nhỏ hơn.");
    const threshold = Math.max(1, Math.round(255 * (step - 0.5) / levelCount));
    for (let i = 0; i < data.length; i += 4) {
      const visible = data[i + 3] >= threshold;
      mask[i] = visible ? r : 0; mask[i + 1] = visible ? g : 0; mask[i + 2] = visible ? b : 0; mask[i + 3] = visible ? 255 : 0;
    }
    const options: TraceOptions = {
      ltres: tolerance, qtres: tolerance, pathomit: 0, colorsampling: 0,
      numberofcolors: 2, colorquantcycles: 1, mincolorratio: 0, layering: 0,
      strokewidth: 0, linefilter: false, viewbox: true, desc: false,
      roundcoords: -1, rightangleenhance: false, blurradius: 0,
      pal: [{ r: 0, g: 0, b: 0, a: 0 }, { r, g, b, a: 255 }],
    };
    const traced = ImageTracer.imagedataToTracedata({ width, height, data: mask }, options);
    traced.layers[0] = [];
    // A_n = A_(n-1) + opacity_n * (1 - A_(n-1)). Equal target
    // alpha steps give opacity_n = 1 / (levelCount - n + 1).
    traced.palette[1].a = 255 / (levelCount - step + 1);
    let visibleLayer = false;
    for (const path of traced.layers[1]) {
      if (!path.isholepath) { paths++; visibleLayer = true; }
      segments += path.segments.length;
    }
    if (paths > LIMITS.paths || segments > LIMITS.segments) throw new Error("Ảnh tạo quá nhiều đường vector. Hãy thử Nhanh hoặc ảnh nhỏ hơn.");
    if (!visibleLayer) continue;
    levels++;
    const svg = serializeTrace(traced, options);
    parts.push(svg.slice(svg.indexOf(">") + 1, svg.lastIndexOf("</svg>")));
  }
  if (!paths) return undefined;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${parts.join("")}</svg>`;
  const bytes = new TextEncoder().encode(svg).length;
  if (bytes > LIMITS.svgBytes) throw new Error("SVG vượt giới hạn 5 MiB. Hãy thử Nhanh hoặc ảnh nhỏ hơn.");
  return {
    svg, colorFit,
    warnings: ["Alpha mềm được xấp xỉ bằng các lớp vector chồng nhau. Hãy so sánh trên nền sáng và tối."],
    metrics: { width, height, pathCount: paths, segmentCount: segments, colorCount: levels, bytes, durationMs: performance.now() - started },
  };
}
