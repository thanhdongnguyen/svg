import { describe, expect, it } from 'vitest';
import { fitAlphaGradient } from '../../src/lib/svg/fit-alpha-gradient';

type Raster = { width: number; height: number; data: Uint8ClampedArray };
function raster(width: number, height: number, opacity: (x: number, y: number) => number, roundtrip = false): Raster {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const alpha = Math.round(255 * Math.max(0, Math.min(1, opacity(x + 0.5, y + 0.5))));
    const rgb = [30, 80, 200].map(c => roundtrip && alpha ? Math.round(Math.round(c * alpha / 255) * 255 / alpha) : c);
    data.set([...rgb, alpha], (y * width + x) * 4);
  }
  return { width, height, data };
}
function radial(cx = 43.2, cy = 33.7, amplitude = 0.72, angle = 0.43): Raster {
  return raster(97, 71, (x, y) => {
    const dx = x - cx, dy = y - cy, u = dx * Math.cos(angle) + dy * Math.sin(angle), v = -dx * Math.sin(angle) + dy * Math.cos(angle);
    return amplitude * (1 - Math.hypot(u / 27, v / 19));
  }, true);
}

describe('strict native alpha gradient fitting', () => {
  it('recovers displaced, rotated elliptical gradients with unknown peak opacity', () => {
    const fit = fitAlphaGradient(radial());
    expect(fit?.kind).toBe('radial');
    if (fit?.kind !== 'radial') return;
    expect(fit.transform[4]).toBeCloseTo(43.2, 1);
    expect(fit.transform[5]).toBeCloseTo(33.7, 1);
    expect(fit.maxAlpha).toBeCloseTo(0.72, 2);
    expect(fit.error.maxAlphaError).toBeLessThan(1.5 / 255);
    expect(fit.error.compositeRMSE).toBeLessThan(0.8);
  });

  it('fits a partially cropped radial gradient without assuming its center is inside the image', () => {
    const fit = fitAlphaGradient(radial(-4, 30, 0.93, -0.2));
    expect(fit?.kind).toBe('radial');
    if (fit?.kind !== 'radial') return;
    expect(fit.transform[4]).toBeCloseTo(-4, 0);
    expect(fit.transform[5]).toBeCloseTo(30, 0);
    expect(fit.maxAlpha).toBeCloseTo(0.93, 1);
  });

  it('fits an angled linear ramp including transparent and fractional opaque plateaus', () => {
    const image = raster(97, 71, (x, y) => Math.min(0.8, (x + 0.4 * y - 20) / 70), true);
    const fit = fitAlphaGradient(image);
    expect(fit?.kind).toBe('linear');
    expect(fit?.maxAlpha).toBeCloseTo(0.8, 2);
    expect(fit!.error.maxCompositeError).toBeLessThan(2);
  });

  it('rejects even a single unmodeled alpha detail through full-pixel validation', () => {
    const image = radial();
    image.data[(32 * image.width + 42) * 4 + 3] = 10;
    expect(fitAlphaGradient(image)).toBeUndefined();
  });

  it('rejects even a single visible color detail', () => {
    const image = radial();
    image.data.set([220, 20, 20, 180], (32 * image.width + 42) * 4);
    expect(fitAlphaGradient(image)).toBeUndefined();
  });

  it('tolerates bounded double-roundtrip color error while keeping the full-pixel fit gate', () => {
    const image = raster(97, 71, (x, y) => Math.min(0.8, (x + 0.4 * y - 20) / 70), true);
    const offset = (50 * image.width + 90) * 4;
    image.data[offset] = 32; // 1.6 visible channel levels at opacity 0.8.
    expect(fitAlphaGradient(image)?.kind).toBe('linear');
    image.data[offset] = 35;
    expect(fitAlphaGradient(image)).toBeUndefined();
  });

  it('rejects smooth profiles outside the supported linear/conical family', () => {
    const image = raster(97, 71, (x, y) => Math.exp(-((x - 43) ** 2 / 500 + (y - 31) ** 2 / 300)));
    expect(fitAlphaGradient(image)).toBeUndefined();
  });

  it('leaves exact flat alpha and opaque artwork unchanged', () => {
    expect(fitAlphaGradient(raster(32, 32, () => 0.5))).toBeUndefined();
    expect(fitAlphaGradient(raster(32, 32, () => 1))).toBeUndefined();
  });

  it('does not mutate input and returns deterministic IR', () => {
    const image = radial(), before = image.data.slice();
    expect(fitAlphaGradient(image)).toEqual(fitAlphaGradient(image));
    expect(image.data).toEqual(before);
  });
});
