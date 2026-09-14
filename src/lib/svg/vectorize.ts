import { PRESETS } from "./settings";
import { serializeTrace } from "./serialize";
import { traceAlphaImage } from "./trace-alpha";
import { fitAlphaGradient } from "./fit-alpha-gradient";
import { serializeAlphaGradient } from "./serialize-alpha-gradient";
import { quantizeImage } from "../image/quantize";
import ImageTracer, { type RGBA, type TraceOptions } from "imagetracerjs";
import { LIMITS, validateDimensions } from "../image/validation";
import type { ConversionSettings, ConversionResult } from "../../types/conversion";

export function validateSettings(s: ConversionSettings): void {
  if (!s || !["fast", "balanced", "maximum"].includes(s.quality) || !["color", "monochrome"].includes(s.mode)
    || !Number.isInteger(s.colors) || s.colors < 2 || s.colors > 64
    || !Number.isInteger(s.threshold) || s.threshold < 0 || s.threshold > 255)
    throw new Error("Thiết lập chuyển đổi không hợp lệ.");
}

export function vectorize(image: { width: number; height: number; data: Uint8ClampedArray }, settings: ConversionSettings): ConversionResult {
  validateSettings(settings);
  const { width, height, data } = image;
  validateDimensions(width, height);
  if (data.length !== width * height * 4) throw new Error("Buffer ảnh không hợp lệ.");
  const started = performance.now();
  const unique = new Map<string, RGBA>();
  let visible = 0, soft = 0, exactPalette = true;
  // Canonicalize invisible RGB; do not flatten opacity onto a background.
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a) visible++;
    if (a > 0 && a < 255) soft++;
    if (!a) data[i] = data[i + 1] = data[i + 2] = 0;
    else if (settings.mode === "monochrome") {
      const c = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2] >= settings.threshold ? 255 : 0;
      data[i] = data[i + 1] = data[i + 2] = c;
    }
    if (exactPalette) {
      const key = `${data[i]},${data[i + 1]},${data[i + 2]},${a}`;
      unique.set(key, { r: data[i], g: data[i + 1], b: data[i + 2], a });
      if (unique.size > settings.colors) { exactPalette = false; unique.clear(); }
    }
  }
  const warnings: string[] = [];
  if (!exactPalette && soft > 0) {
    const gradient = settings.mode === "color" ? fitAlphaGradient(image) : undefined;
    if (gradient) return serializeAlphaGradient(gradient, width, height, performance.now() - started);
    const alphaResult = traceAlphaImage(image, settings);
    if (alphaResult) return alphaResult;
  }
  if (soft > width * height * 0.01) warnings.push("Ảnh có alpha mềm. Độ trong suốt được xấp xỉ theo từng mảng; hãy kiểm tra trên nền sáng và tối.");
  if (!exactPalette) warnings.push("Màu và chi tiết đã được xấp xỉ. Gradient, bóng và texture có thể khác ảnh gốc.");
  const preset = PRESETS[settings.quality];
  const quantized = exactPalette ? undefined : quantizeImage(data, settings.colors);
  const dimensionScale = Math.max(1, Math.max(width, height) / 1024);
  const options: TraceOptions = {
    ltres: preset.tolerance * dimensionScale, qtres: preset.tolerance * dimensionScale,
    pathomit: exactPalette && settings.quality !== "fast" ? 0 : Math.round(preset.omit * dimensionScale),
    colorsampling: 2, numberofcolors: settings.colors, colorquantcycles: 1,
    mincolorratio: 0, layering: 0, strokewidth: 0, linefilter: false,
    viewbox: true, desc: false, roundcoords: 3, rightangleenhance: true,
    blurradius: 0, blurdelta: 16,
    pal: exactPalette ? [...unique.values()] : quantized!.palette,
  };
  let svg: string, paths = 0, segments = 0, colors = 0;
  if (!visible) {
    svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"></svg>`;
    warnings.push("Ảnh hoàn toàn trong suốt. SVG không có hình nhìn thấy.");
  } else if ((exactPalette && unique.size === 1) || width === 1 || height === 1) {
    // ImageTracer can collapse one-pixel regions to a zero-area line. Exact
    // rectangular runs handle one-dimensional inputs without inventing detail.
    const palette = options.pal!;
    const paint = (offset: number) => {
      if (exactPalette) return { r: data[offset], g: data[offset + 1], b: data[offset + 2], a: data[offset + 3] };
      let best = palette[0], distance = Infinity;
      for (const c of palette) {
        const d = Math.abs(c.r - data[offset]) + Math.abs(c.g - data[offset + 1]) + Math.abs(c.b - data[offset + 2]) + 2 * Math.abs(c.a - data[offset + 3]);
        if (d < distance) { distance = d; best = c; }
      }
      return best;
    };
    const parts: string[] = [], used = new Set<string>();
    const length = width === 1 ? height : height === 1 ? width : 1;
    let start = 0;
    while (start < length) {
      const c = paint(start * 4), key = `${c.r},${c.g},${c.b},${c.a}`;
      let end = start + 1;
      while (end < length) { const n = paint(end * 4); if (`${n.r},${n.g},${n.b},${n.a}` !== key) break; end++; }
      if (c.a) {
        const x = width === 1 ? 0 : height === 1 ? start : 0, y = width === 1 ? start : 0;
        const w = width === 1 ? 1 : height === 1 ? end - start : width, h = width === 1 ? end - start : height;
        parts.push(`<path fill="rgb(${c.r},${c.g},${c.b})" opacity="${c.a / 255}" d="M${x} ${y}H${x + w}V${y + h}H${x}Z"/>`);
        used.add(key);
      }
      start = end;
    }
    paths = parts.length; segments = paths * 5; colors = used.size;
    svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${parts.join("")}</svg>`;
  } else {
    const traced = ImageTracer.imagedataToTracedata({ width, height, data: quantized?.data ?? data }, options);
    for (let i = 0; i < traced.layers.length; i++) {
      // Transparent regions contribute no visible pixels and need no paths.
      if (traced.palette[i].a === 0) { traced.layers[i] = []; continue; }
      if (traced.layers[i].length) colors++;
      for (const path of traced.layers[i]) {
        if (!path.isholepath) paths++;
        segments += path.segments.length;
        if (paths > LIMITS.paths || segments > LIMITS.segments)
          throw new Error("Ảnh tạo quá nhiều đường vector. Hãy thử Nhanh, ít màu hơn hoặc ảnh nhỏ hơn.");
      }
    }
    svg = serializeTrace(traced, options);
    if (!paths) throw new Error("Không giữ được mảng hình ở thiết lập này. Hãy chọn Tối đa hoặc thử ảnh lớn hơn.");
  }
  if (!exactPalette && visible === width * height && soft === 0 && paths > 0) {
    // Adjacent antialiased contours can leave hairline transparency. An opaque
    // raster has no transparent pixels: retain that property with its dominant
    // palette color underneath the traced regions. This is a vector path.
    const base = options.pal![0];
    svg = svg.replace(/(<svg[^>]*>)/, `$1<path fill="rgb(${base.r},${base.g},${base.b})" d="M0 0H${width}V${height}H0Z"/>`);
    paths++; segments += 5;
  }
  if (paths > LIMITS.paths || segments > LIMITS.segments) throw new Error("SVG quá phức tạp. Hãy giảm số màu hoặc kích thước ảnh.");
  const bytes = new TextEncoder().encode(svg).length;
  if (bytes > LIMITS.svgBytes) throw new Error("SVG vượt giới hạn 5 MiB. Hãy giảm số màu hoặc kích thước ảnh.");
  return { svg, warnings, metrics: { width, height, pathCount: paths, segmentCount: segments, colorCount: colors, bytes, durationMs: performance.now() - started } };
}
