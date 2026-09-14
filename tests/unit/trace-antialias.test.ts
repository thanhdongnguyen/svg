// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { init } from '../../src/lib/svg/vendor/vtracer.mjs';
import * as engine from '../../src/lib/svg/vendor/vtracer.mjs';
import { antialiasScale, traceAntialiasedArtwork } from '../../src/lib/svg/trace-antialias';
import { DEFAULT_SETTINGS } from '../../src/lib/svg/settings';
import { sanitizeSvg } from '../../src/lib/svg/sanitize';
import { LIMITS } from '../../src/lib/image/validation';

function ring() {
  const width = 64, height = 64, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const radius = Math.hypot(x + 0.5 - 32, y + 0.5 - 32);
    const alpha = Math.round(255 * Math.min(1, Math.max(0, 26.5 - radius), Math.max(0, radius - 13.5)));
    const rgb = [23, 107, 186].map(c => alpha ? Math.round(Math.round(c * alpha / 255) * 255 / alpha) : 0);
    data.set([...rgb, alpha], (y * width + x) * 4);
  }
  return { width, height, data };
}

function multiInkRing() {
  const width = 128, height = 128, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const radius = Math.hypot(x + 0.5 - 64, y + 0.5 - 64);
    const alpha = Math.round(255 * Math.max(0, Math.min(1, 50.5 - radius, radius - 8.5)));
    const diamond = (Math.abs(x + 0.5 - 64) + Math.abs(y + 0.5 - 64)) / Math.SQRT2;
    const mix = Math.max(0, Math.min(1, 22.5 - diamond));
    const rgb = [23, 107, 186].map((v, c) => Math.round(v + ([220, 60, 45][c] - v) * mix));
    data.set([...rgb, alpha], (y * width + x) * 4);
  }
  return { width, height, data };
}
let initialized: Promise<unknown>;
beforeAll(() => { initialized = init(readFileSync('public/engines/vtracer-1.0.0-alpha.4.wasm')); return initialized; });

describe('bounded transparent antialias reconstruction', () => {
  it('traces a transparent antialiased ring with an interior hole and original coordinates', async () => {
    const image = ring(), before = image.data.slice();
    const result = await traceAntialiasedArtwork(image, { ...DEFAULT_SETTINGS, quality: 'maximum', colors: 64 }, () => initialized);
    expect(result).toBeDefined();
    const doc = new DOMParser().parseFromString(sanitizeSvg(result!.svg, 64, 64), 'image/svg+xml');
    expect(doc.documentElement.getAttribute('viewBox')).toBe('0 0 64 64');
    expect(doc.querySelectorAll('path').length).toBe(1);
    expect((doc.querySelector('path')?.getAttribute('d')?.match(/M/g) ?? []).length).toBe(2);
    expect(result!.svg).not.toMatch(/<image|data:|transform=|fill="rgb\(255,255,255\)"/);
    const numbers = doc.querySelector('path')!.getAttribute('d')!.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    expect(Math.max(...numbers)).toBeLessThan(64);
    expect(Math.min(...numbers)).toBeGreaterThan(0);
    expect(result!.metrics.segmentCount).toBeLessThan(LIMITS.segments);
    expect(image.data).toEqual(before);
  });

  it('rejects a fractional-alpha fill before initializing WASM', async () => {
    const image = ring();
    for (let i = 3; i < image.data.length; i += 4) image.data[i] = Math.min(image.data[i], 128);
    const initialize = vi.fn(() => initialized);
    expect(await traceAntialiasedArtwork(image, DEFAULT_SETTINGS, initialize)).toBeUndefined();
    expect(initialize).not.toHaveBeenCalled();
  });

  it('rejects broad soft alpha or gradient-like opacity', async () => {
    const image = ring();
    for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
      const alpha = Math.round(255 * Math.max(0, Math.min(1, (30 - Math.hypot(x - 32, y - 32)) / 10)));
      image.data.set([23, 107, 186, alpha], (y * image.width + x) * 4);
    }
    const initialize = vi.fn(() => initialized);
    expect(await traceAntialiasedArtwork(image, DEFAULT_SETTINGS, initialize)).toBeUndefined();
    expect(initialize).not.toHaveBeenCalled();
  });

  it('rejects a small unsupported colored detail instead of merging it away', async () => {
    const image = ring(); image.data.set([240, 30, 20, 255], (32 * 64 + 52) * 4);
    const initialize = vi.fn(() => initialized);
    expect(await traceAntialiasedArtwork(image, DEFAULT_SETTINGS, initialize)).toBeUndefined();
    expect(initialize).not.toHaveBeenCalled();
  });

  it('does not change binary-alpha exact artwork or explicit monochrome mode', async () => {
    const image = ring();
    for (let i = 3; i < image.data.length; i += 4) image.data[i] = image.data[i] >= 128 ? 255 : 0;
    const initialize = vi.fn(() => initialized);
    expect(await traceAntialiasedArtwork(image, DEFAULT_SETTINGS, initialize)).toBeUndefined();
    expect(await traceAntialiasedArtwork(ring(), { ...DEFAULT_SETTINGS, mode: 'monochrome' }, initialize)).toBeUndefined();
    expect(initialize).not.toHaveBeenCalled();
  });

  it('caps temporary raster allocation at 4,194,304 pixels across dimensions and presets', () => {
    for (const [width, height] of [[64, 64], [256, 256], [1024, 1024], [2000, 2000], [4096, 512]]) {
      for (const quality of ['fast', 'balanced', 'maximum'] as const) {
        const scale = antialiasScale(width, height, quality);
        expect(scale).toBeLessThanOrEqual(8);
        expect(width * height * scale * scale).toBeLessThanOrEqual(4_194_304);
      }
    }
  });

  it('does not invent transparency at an opaque cropped canvas corner', async () => {
    const original = ring(), width = 48, height = 48, data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const start = ((y + 16) * 64 + x + 16) * 4;
      data.set(original.data.slice(start, start + 4), (y * width + x) * 4);
    }
    expect(data[3]).toBe(255);
    const realTrace = engine.vectorize_rgba;
    const spy = vi.spyOn(engine, 'vectorize_rgba').mockImplementation((rgba, w, h, options) => {
      expect([...rgba.slice(0, 4)]).toEqual([0, 0, 0, 255]);
      return realTrace(rgba, w, h, options);
    });
    try { expect(await traceAntialiasedArtwork({ width, height, data }, DEFAULT_SETTINGS, () => initialized)).toBeDefined(); }
    finally { spy.mockRestore(); }
  });

  it('fails closed if the BW engine unexpectedly emits a white background', async () => {
    const spy = vi.spyOn(engine, 'vectorize_rgba').mockReturnValue('<svg><path fill="#ffffff" d="M0 0H512V512H0Z"/></svg>');
    try { await expect(traceAntialiasedArtwork(ring(), DEFAULT_SETTINGS, () => initialized)).rejects.toThrow(/nền|màu/); }
    finally { spy.mockRestore(); }
  });

  it('underpaints multi-ink interiors without painting source holes or fractional-alpha fringes', async () => {
    const image = multiInkRing(), realTrace = engine.vectorize_rgba;
    let calls = 0, underpaintBlack = 0, unsafeBlack = 0;
    const spy = vi.spyOn(engine, 'vectorize_rgba').mockImplementation((rgba, width, height, options) => {
      if (calls++ === 0) {
        const scale = width / image.width;
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
          if (rgba[(y * width + x) * 4] !== 0) continue;
          underpaintBlack++;
          const source = (Math.floor(y / scale) * image.width + Math.floor(x / scale)) * 4;
          if (image.data[source + 3] !== 255) unsafeBlack++;
        }
      }
      return realTrace(rgba, width, height, options);
    });
    try {
      const result = await traceAntialiasedArtwork(image, { ...DEFAULT_SETTINGS, quality: 'maximum', colors: 64 }, () => initialized);
      expect(result).toBeDefined();
      expect(calls).toBe(3);
      expect(underpaintBlack).toBeGreaterThan(0);
      expect(unsafeBlack).toBe(0);
      const doc = new DOMParser().parseFromString(sanitizeSvg(result!.svg, 128, 128), 'image/svg+xml');
      const paths = [...doc.querySelectorAll('path')];
      expect(paths).toHaveLength(3);
      expect((paths[0].getAttribute('d')?.match(/M/g) ?? []).length).toBe(2);
      expect(new Set(paths.map(path => path.getAttribute('fill'))).size).toBe(2);
      expect(result!.metrics.colorCount).toBe(2);
      expect(result!.metrics.bytes).toBeLessThanOrEqual(LIMITS.svgBytes);
    } finally { spy.mockRestore(); }
  });

  it('counts the interior underpaint toward the cumulative path budget', async () => {
    const paths = '<path fill="#000000" d="M0 0H1V1Z"/>'.repeat(Math.floor(LIMITS.paths / 3) + 1);
    const spy = vi.spyOn(engine, 'vectorize_rgba').mockReturnValue(`<svg>${paths}</svg>`);
    try {
      await expect(traceAntialiasedArtwork(multiInkRing(), DEFAULT_SETTINGS, () => initialized)).rejects.toThrow(/nhiều đường/);
      expect(spy).toHaveBeenCalledTimes(3);
    } finally { spy.mockRestore(); }
  });

  it('rejects engine output exceeding the path segment budget', async () => {
    const geometry = 'M0 0' + 'L1 1'.repeat(LIMITS.segments) + 'Z';
    const spy = vi.spyOn(engine, 'vectorize_rgba').mockReturnValue(`<svg><path fill="#000000" d="${geometry}"/></svg>`);
    try { await expect(traceAntialiasedArtwork(ring(), DEFAULT_SETTINGS, () => initialized)).rejects.toThrow(/nhiều đường/); }
    finally { spy.mockRestore(); }
  });

  it('rejects invalid dimensions and buffers before initializing', async () => {
    const initialize = vi.fn(() => initialized);
    await expect(traceAntialiasedArtwork({ width: 4097, height: 1, data: new Uint8ClampedArray() }, DEFAULT_SETTINGS, initialize)).rejects.toThrow();
    await expect(traceAntialiasedArtwork({ width: 4, height: 4, data: new Uint8ClampedArray(4) }, DEFAULT_SETTINGS, initialize)).rejects.toThrow(/Buffer/);
    expect(initialize).not.toHaveBeenCalled();
  });
});
