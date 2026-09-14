// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { convertRaster, initializeVtracer, inspectTracePaths, usesOpaqueEngine } from '../../src/lib/svg/convert-raster';
import { DEFAULT_SETTINGS } from '../../src/lib/svg/settings';
import { sanitizeSvg } from '../../src/lib/svg/sanitize';
import { optimizeSvg } from '../../src/lib/svg/optimize';
import { LIMITS } from '../../src/lib/image/validation';
import type { ConversionResult, ConversionSettings } from '../../src/types/conversion';

type Raster = { width: number; height: number; data: Uint8ClampedArray };

function fixture(name: string): Raster {
  const decoded = PNG.sync.read(readFileSync(`tests/fixtures/${name}`));
  return { width: decoded.width, height: decoded.height, data: new Uint8ClampedArray(decoded.data) };
}

function solid(width: number, height: number, rgba: number[]): Raster {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) data.set(rgba, offset);
  return { width, height, data };
}

const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unit test must not access the network'));

beforeAll(async () => {
  // Exercise the shipped binary and adapter, rather than mocking the tracing API.
  await initializeVtracer(readFileSync('public/engines/vtracer-1.0.0-alpha.4.wasm'));
});

afterAll(() => {
  expect(fetchSpy).not.toHaveBeenCalled();
  fetchSpy.mockRestore();
});

describe('actual WASM conversion contract', () => {
  it.each([
    { quality: 'fast', colors: 12 },
    { quality: 'balanced', colors: 32 },
    { quality: 'maximum', colors: 64 },
  ] satisfies Partial<ConversionSettings>[])('produces safe vector geometry within the $quality color budget', async preset => {
    const image = fixture('gradient.png');
    const settings = { ...DEFAULT_SETTINGS, ...preset };
    expect(usesOpaqueEngine(image, settings)).toBe(true);
    const result = await convertRaster(image, settings);
    const clean = sanitizeSvg(optimizeSvg(result.svg), image.width, image.height);
    const doc = new DOMParser().parseFromString(clean, 'image/svg+xml');
    const root = doc.documentElement;
    const paths = [...doc.querySelectorAll('path')];
    const fills = new Set(paths.map(path => path.getAttribute('fill')?.toLowerCase()));

    expect(root.getAttribute('viewBox')).toBe(`0 0 ${image.width} ${image.height}`);
    expect(root.getAttribute('width')).toBe(String(image.width));
    expect(root.getAttribute('height')).toBe(String(image.height));
    expect(doc.querySelector('parsererror, image, feImage, foreignObject, script')).toBeNull();
    expect(clean).not.toMatch(/data:|https?:\/\/(?!www\.w3\.org\/2000\/svg)|NaN|Infinity/);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.length).toBeLessThanOrEqual(LIMITS.paths);
    expect(fills.size).toBeLessThanOrEqual(settings.colors);
    expect(result.metrics.colorCount).toBe(fills.size);
    expect(result.metrics.pathCount).toBe(paths.length);
    expect(result.metrics.bytes).toBe(new TextEncoder().encode(result.svg).length);
    expect(result.metrics.segmentCount).toBeLessThanOrEqual(LIMITS.segments);
    expect(result.metrics.bytes).toBeLessThanOrEqual(LIMITS.svgBytes);
  });

  it('reads only the supplied typed-array view and does not mutate opaque input', async () => {
    const image = fixture('gradient.png');
    const original = image.data.slice();
    const backing = new Uint8ClampedArray(image.data.length + 64).fill(173);
    const view = backing.subarray(32, backing.length - 32);
    view.set(image.data);

    const direct = await convertRaster(image, DEFAULT_SETTINGS);
    const offset = await convertRaster({ ...image, data: view }, DEFAULT_SETTINGS);
    expect(offset.svg).toBe(direct.svg);
    expect(image.data).toEqual(original);
    expect([...backing.subarray(0, 32)]).toEqual(Array(32).fill(173));
    expect([...backing.subarray(backing.length - 32)]).toEqual(Array(32).fill(173));
  });

  it('retains the six exact paint colors of small flat-color details', async () => {
    const image = solid(32, 16, [255, 255, 255, 255]);
    const colors = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 160, 0], [200, 0, 200]];
    colors.forEach((color, index) => {
      for (let y = 4; y < 7; y++) {
        for (let x = 2 + index * 6; x < 5 + index * 6; x++) image.data.set([...color, 255], (y * image.width + x) * 4);
      }
    });
    const result = await convertRaster(image, { ...DEFAULT_SETTINGS, quality: 'maximum', colors: 64 });
    const doc = new DOMParser().parseFromString(result.svg, 'image/svg+xml');
    const fills = new Set([...doc.querySelectorAll('path')].map(path => path.getAttribute('fill')?.toLowerCase()));
    for (const color of colors) {
      const hex = '#' + color.map(channel => channel.toString(16).padStart(2, '0')).join('');
      expect(fills.has(hex)).toBe(true);
    }
    expect(result.metrics.colorCount).toBe(6);
  });

  it('does not collapse a grayscale ramp into one or two flat colors', async () => {
    const image = solid(160, 48, [0, 0, 0, 255]);
    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        const gray = Math.round(x / (image.width - 1) * 255);
        image.data.set([gray, gray, gray, 255], (y * image.width + x) * 4);
      }
    }
    const result = await convertRaster(image, DEFAULT_SETTINGS);
    const doc = new DOMParser().parseFromString(result.svg, 'image/svg+xml');
    const fills = new Set([...doc.querySelectorAll('path')].map(path => path.getAttribute('fill')!.toLowerCase()));
    // This catches the core's color-cluster ramp-collapse regression. Detailed
    // rendered edge/banding comparisons remain part of the Browser corpus.
    expect(fills.size).toBeGreaterThanOrEqual(16);
    const grayValues = [...fills].map(fill => {
      const rgb = fill.startsWith('#')
        ? [1, 3, 5].map(offset => parseInt(fill.slice(offset, offset + 2), 16))
        : (fill.match(/\d+/g) ?? []).map(Number);
      expect(rgb[0]).toBe(rgb[1]);
      expect(rgb[1]).toBe(rgb[2]);
      return rgb[0];
    });
    expect(Math.min(...grayValues)).toBeLessThanOrEqual(16);
    expect(Math.max(...grayValues)).toBeGreaterThanOrEqual(239);
  });

  it('either converts noisy input within every output budget or reports an explicit budget error', async () => {
    const image = solid(160, 160, [0, 0, 0, 255]);
    let state = 12345;
    for (let offset = 0; offset < image.data.length; offset += 4) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      image.data.set([state & 255, (state >>> 8) & 255, (state >>> 16) & 255, 255], offset);
    }
    let result: ConversionResult | undefined;
    let failure: unknown;
    try {
      result = await convertRaster(image, { ...DEFAULT_SETTINGS, quality: 'maximum', colors: 64 });
    } catch (error) {
      failure = error;
    }
    if (failure !== undefined) {
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toMatch(/nhiều đường|phức tạp|giới hạn/);
      return;
    }
    if (!result) throw new Error('Conversion returned neither a result nor an error');
    // Assert numbers rather than the large result object, so a failed guard
    // cannot dump hundreds of kilobytes of SVG into the test report.
    expect(result.metrics.pathCount).toBeLessThanOrEqual(LIMITS.paths);
    expect(result.metrics.segmentCount).toBeLessThanOrEqual(LIMITS.segments);
    expect(result.metrics.colorCount).toBeLessThanOrEqual(64);
    expect(new TextEncoder().encode(result.svg).length).toBeLessThanOrEqual(LIMITS.svgBytes);
    expect((result.svg.match(/<path\b/g) ?? []).length).toBe(result.metrics.pathCount);
    sanitizeSvg(optimizeSvg(result.svg), image.width, image.height);
  }, 15_000);
});

describe('deterministic intermediate tracing budgets', () => {
  const path = '<path fill="#000000" d="M0 0L1 0L1 1Z"/>';

  it('accepts the exact path-count boundary and rejects one extra path', () => {
    expect(inspectTracePaths(`<svg>${path.repeat(LIMITS.paths)}</svg>`).length).toBe(LIMITS.paths);
    expect(() => inspectTracePaths(`<svg>${path.repeat(LIMITS.paths + 1)}</svg>`)).toThrow(/nhiều đường/);
  });

  it('rejects excessive commands even when there is only one path', () => {
    const geometry = 'M0 0' + 'L1 1'.repeat(LIMITS.segments) + 'Z';
    expect(() => inspectTracePaths(`<svg><path fill="#000000" d="${geometry}"/></svg>`)).toThrow(/nhiều đường/);
  });

  it('rejects oversized markup before processing path geometry', () => {
    const svg = `<svg><!--${'x'.repeat(LIMITS.svgBytes)}-->${path}</svg>`;
    expect(() => inspectTracePaths(svg)).toThrow(/5 MiB/);
  });
});

describe('dispatch preserves transparency and small geometry', () => {
  it('avoids the upstream all-transparent WASM panic and returns a valid empty SVG', async () => {
    const image = fixture('transparent.png');
    expect(usesOpaqueEngine(image, DEFAULT_SETTINGS)).toBe(false);
    const result = await convertRaster(image, DEFAULT_SETTINGS);
    expect(result.metrics.pathCount).toBe(0);
    expect(result.svg).not.toContain('<path');
    expect(sanitizeSvg(optimizeSvg(result.svg), image.width, image.height)).toContain('viewBox="0 0 16 16"');
  });

  it('keeps fractional opacity instead of sending it to the opaque engine', async () => {
    const image = solid(12, 10, [16, 96, 224, 128]);
    expect(usesOpaqueEngine(image, DEFAULT_SETTINGS)).toBe(false);
    const result = await convertRaster(image, DEFAULT_SETTINGS);
    const doc = new DOMParser().parseFromString(result.svg, 'image/svg+xml');
    expect(Number(doc.querySelector('path')?.getAttribute('opacity'))).toBeCloseTo(128 / 255, 6);
  });

  it('retains transparent logo contours without adding an opaque underpainting', async () => {
    const image = fixture('logo-alpha.png');
    expect(usesOpaqueEngine(image, DEFAULT_SETTINGS)).toBe(false);
    const result = await convertRaster(image, DEFAULT_SETTINGS);
    expect(result.metrics.pathCount).toBe(1);
    expect(result.svg).not.toMatch(/#fff|rgb\(255,255,255\)/i);
    expect(sanitizeSvg(optimizeSvg(result.svg), image.width, image.height)).toContain('viewBox="0 0 128 128"');
  });

  it.each([[1, 1], [1, 12], [12, 1], [24, 16]])('preserves a solid %s×%s raster as nonzero vector geometry', async (width, height) => {
    const image = solid(width, height, [20, 150, 60, 255]);
    expect(usesOpaqueEngine(image, DEFAULT_SETTINGS)).toBe(false);
    const result = await convertRaster(image, DEFAULT_SETTINGS);
    expect(result.svg).toContain(`M0 0H${width}V${height}H0Z`);
    expect(result.metrics.pathCount).toBe(1);
  });

  it('respects an explicit monochrome choice for color artwork', async () => {
    const image = fixture('gradient.png');
    const settings: ConversionSettings = { ...DEFAULT_SETTINGS, mode: 'monochrome' };
    expect(usesOpaqueEngine(image, settings)).toBe(false);
    const result = await convertRaster(image, settings);
    const doc = new DOMParser().parseFromString(result.svg, 'image/svg+xml');
    for (const path of doc.querySelectorAll('path')) expect(path.getAttribute('fill')).toMatch(/^rgb\((0,0,0|255,255,255)\)$/);
  });

  it('rejects inconsistent dimensions, buffers and settings before conversion', async () => {
    await expect(convertRaster({ width: 2, height: 2, data: new Uint8ClampedArray(15) }, DEFAULT_SETTINGS)).rejects.toThrow(/Buffer/);
    await expect(convertRaster(solid(2, 2, [0, 0, 0, 255]), { ...DEFAULT_SETTINGS, colors: 65 })).rejects.toThrow(/Thiết lập/);
    await expect(convertRaster({ width: 4097, height: 1, data: new Uint8ClampedArray(0) }, DEFAULT_SETTINGS)).rejects.toThrow(/quá lớn/);
  });
});
