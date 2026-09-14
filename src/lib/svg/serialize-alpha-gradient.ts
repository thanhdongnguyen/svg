import type { AlphaGradientFit } from './fit-alpha-gradient';
import type { ConversionResult } from '../../types/conversion';

/** The fitter derives geometry from pixels; this emits only our bounded SVG profile. */
export function serializeAlphaGradient(fit: AlphaGradientFit, width: number, height: number, durationMs: number): ConversionResult {
  const number = (value: number) => String(Math.round(value * 1_000_000) / 1_000_000);
  const paint = `rgb(${fit.color.join(',')})`;
  const startOpacity = fit.kind === 'radial' ? number(fit.maxAlpha) : '0';
  const endOpacity = fit.kind === 'radial' ? '0' : number(fit.maxAlpha);
  const stops = `<stop offset="0" stop-color="${paint}" stop-opacity="${startOpacity}"/><stop offset="1" stop-color="${paint}" stop-opacity="${endOpacity}"/>`;
  const gradient = fit.kind === 'radial'
    ? `<radialGradient id="alpha-gradient" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1" gradientTransform="matrix(${fit.transform.map(number).join(' ')})">${stops}</radialGradient>`
    : `<linearGradient id="alpha-gradient" gradientUnits="userSpaceOnUse" x1="${number(fit.x1)}" y1="${number(fit.y1)}" x2="${number(fit.x2)}" y2="${number(fit.y2)}">${stops}</linearGradient>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs>${gradient}</defs><path fill="url(#alpha-gradient)" d="M0 0H${width}V${height}H0Z"/></svg>`;
  return {
    svg,
    warnings: ['Chuyển sắc và độ trong suốt được khớp bằng gradient SVG. Hãy so sánh trên nền sáng và tối.'],
    metrics: { width, height, pathCount: 1, segmentCount: 5, colorCount: 1, bytes: new TextEncoder().encode(svg).length, durationMs },
  };
}
