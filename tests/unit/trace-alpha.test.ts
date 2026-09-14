import { describe, expect, it } from 'vitest';
import { fitAlphaColor, traceAlphaImage } from '../../src/lib/svg/trace-alpha';
import { DEFAULT_SETTINGS } from '../../src/lib/svg/settings';

function softMask(roundtrip = false) {
  const width = 96, height = 64, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const alpha = Math.round(255 * Math.max(0, 1 - Math.hypot((x - 48) / 40, (y - 32) / 27)));
    const color = [30, 80, 200].map(c => roundtrip && alpha ? Math.round(Math.round(c * alpha / 255) * 255 / alpha) : c);
    data.set([...color, alpha], (y * width + x) * 4);
  }
  return { width, height, data };
}

describe('single-color cumulative alpha tracing', () => {
  it('accepts browser unpremultiplication noise with a measured fit', () => {
    const fit = fitAlphaColor(softMask(true));
    expect(fit?.color).toEqual([30, 80, 200]);
    expect(fit!.maxChannelError).toBeLessThanOrEqual(1.5);
    expect(fit!.compositeRMSE).toBeLessThan(0.6);
  });

  it('rejects a small visible patch of a different hue', () => {
    const image = softMask(); image.data.set([220, 40, 10, 220], (32 * 96 + 48) * 4);
    expect(fitAlphaColor(image)).toBeUndefined();
    expect(traceAlphaImage(image, DEFAULT_SETTINGS)).toBeUndefined();
  });

  it('leaves uniform alpha, opaque-only and exact flat artwork on the general path', () => {
    for (const alpha of [0, 127, 255]) {
      const image = softMask();
      for (let i = 3; i < image.data.length; i += 4) image.data[i] = alpha;
      expect(traceAlphaImage(image, DEFAULT_SETTINGS)).toBeUndefined();
    }
  });

  it('uses a compact stack of closed non-raster paths with stable dimensions', () => {
    const image = softMask(true), original = image.data.slice();
    const result = traceAlphaImage(image, { ...DEFAULT_SETTINGS, quality: 'maximum', colors: 64 })!;
    expect(result.svg).toContain('viewBox="0 0 96 64"');
    expect(result.svg).toContain('width="96" height="64"');
    expect(result.svg).not.toMatch(/<image|data:|NaN|Infinity/);
    expect(result.metrics.pathCount).toBeLessThanOrEqual(40);
    expect(result.metrics.pathCount).toBeGreaterThan(16);
    expect(result.metrics.segmentCount).toBeLessThan(3000);
    expect(image.data).toEqual(original);
  });

  it('composes monotone alpha steps, without painting a translucent base rectangle', () => {
    const result = traceAlphaImage(softMask(), DEFAULT_SETTINGS)!;
    const opacities = [...result.svg.matchAll(/opacity="([^"]+)"/g)].map(m => Number(m[1]));
    let alpha = 0;
    opacities.forEach((opacity, i) => {
      const next = alpha + opacity * (1 - alpha);
      expect(next).toBeGreaterThan(alpha);
      expect(next).toBeCloseTo((i + 1) / 24, 10);
      alpha = next;
    });
    expect(result.svg).not.toContain('H96V64H0Z');
  });

  it('does not override an explicit monochrome choice', () => {
    expect(traceAlphaImage(softMask(), { ...DEFAULT_SETTINGS, mode: 'monochrome' })).toBeUndefined();
  });
});
