import { describe, expect, it } from 'vitest';
import { quantizeImage } from '../../src/lib/image/quantize';
import { comparePixels } from '../../src/lib/svg/metrics';

function pixels(colors: number[][]): Uint8ClampedArray { return new Uint8ClampedArray(colors.flat()); }

describe('appearance-aware color quantization', () => {
  it('preserves a small exact palette and normalizes invisible RGB without mutating source', () => {
    const source = pixels([[255, 20, 0, 0], [16, 112, 196, 255], [100, 20, 200, 127]]);
    const before = source.slice(), result = quantizeImage(source, 4);
    expect(result.exactPalette).toBe(true);
    expect(result.data).toEqual(pixels([[0, 0, 0, 0], [16, 112, 196, 255], [100, 20, 200, 127]]));
    expect(source).toEqual(before);
  });

  it('keeps transparent and opaque endpoints even with only two palette entries', () => {
    const source = pixels([[255, 0, 255, 0], ...Array.from({ length: 255 }, (_, a) => [30, 80, 200, a + 1])]);
    const result = quantizeImage(source, 2);
    expect(result.data[3]).toBe(0);
    expect(result.data.at(-1)).toBe(255);
    expect(result.palette.length).toBeLessThanOrEqual(2);
  });

  it('ignores arbitrary colors of fully transparent pixels during quantization', () => {
    const source = pixels(Array.from({ length: 256 }, (_, a) => [30, 80, 200, a]));
    const changed = source.slice(); changed.set([255, 10, 9, 0], 0);
    expect(quantizeImage(changed, 16)).toEqual(quantizeImage(source, 16));
  });

  it('is deterministic and retains sparse high-contrast artwork', () => {
    const source = pixels([...Array.from({ length: 4096 }, (_, i) => [245 + i % 10, 245 + i % 10, 245 + i % 10, 255]), [220, 20, 30, 255]]);
    const result = quantizeImage(source, 4);
    expect(result).toEqual(quantizeImage(source, 4));
    expect(result.data.slice(-4)).toEqual(pixels([[220, 20, 30, 255]]));
  });

  it('bounds black/white compositing error for browser-style unpremultiplication noise', () => {
    const source = pixels(Array.from({ length: 256 }, (_, a) => [30, 80, 200].map(c => a ? Math.round(Math.round(c * a / 255) * 255 / a) : 0).concat(a)));
    const result = quantizeImage(source, 32);
    expect(result.palette.length).toBeLessThanOrEqual(32);
    expect(comparePixels(source, result.data).compositeRMSE).toBeLessThan(2.5);
    expect(result.data[3]).toBe(0);
    expect(result.data.at(-1)).toBe(255);
  });

  it('does not turn opaque multicolor artwork translucent', () => {
    const source = pixels(Array.from({ length: 1024 }, (_, i) => [i % 256, (i * 11) % 256, (i * 29) % 256, 255]));
    const result = quantizeImage(source, 16);
    for (let i = 3; i < result.data.length; i += 4) expect(result.data[i]).toBe(255);
  });

  it('rejects invalid buffers and palette budgets', () => {
    expect(() => quantizeImage(new Uint8ClampedArray(3), 4)).toThrow();
    expect(() => quantizeImage(new Uint8ClampedArray(), 4)).toThrow();
    expect(() => quantizeImage(pixels([[0, 0, 0, 255]]), 1)).toThrow();
    expect(() => quantizeImage(pixels([[0, 0, 0, 255]]), 65)).toThrow();
  });
});
