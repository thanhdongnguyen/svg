// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { sanitizeSvg } from '../../src/lib/svg/sanitize';

const stops = '<stop offset="0" stop-color="rgb(30,80,200)" stop-opacity="0.72"/><stop offset="1" stop-color="rgb(30,80,200)" stop-opacity="0"/>';
const radial = `<radialGradient id="alpha-gradient" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1" gradientTransform="matrix(27 0 -4 19 43.2 33.7)">${stops}</radialGradient>`;
const linear = `<linearGradient id="alpha-gradient" gradientUnits="userSpaceOnUse" x1="-3.25" y1="20" x2="80.125" y2="50">${stops}</linearGradient>`;
const path = '<path fill="url(#alpha-gradient)" d="M0 0H97V71H0Z"/>';
const svg = (gradient: string, paint = path) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 97 71"><defs>${gradient}</defs>${paint}</svg>`;
const sanitize = (text: string) => sanitizeSvg(text, 97, 71);

describe('owned native SVG gradient sanitization', () => {
  it.each([radial, linear])('retains a fully validated local gradient through DOMPurify', gradient => {
    const output = sanitize(svg(gradient));
    const document = new DOMParser().parseFromString(output, 'image/svg+xml');
    expect(document.querySelectorAll('defs').length).toBe(1);
    expect(document.querySelectorAll('stop').length).toBe(2);
    expect(document.querySelector('path')?.getAttribute('fill')).toBe('url(#alpha-gradient)');
    expect(document.querySelector('stop')?.getAttribute('stop-color')).toBe('rgb(30,80,200)');
    expect(document.documentElement.getAttribute('width')).toBe('97');
    expect(output).toContain('gradientUnits="userSpaceOnUse"');
    if (gradient === radial) expect(output).toContain('gradientTransform="matrix(27 0 -4 19 43.2 33.7)"');
  });

  it.each([
    svg(radial).replace('id="alpha-gradient"', 'id="other"'),
    svg(radial).replace('url(#alpha-gradient)', 'url(#other)'),
    svg(radial).replace('url(#alpha-gradient)', 'url(https://evil.test/a)'),
    svg(radial).replace('url(#alpha-gradient)', 'url(data:image/svg+xml,a)'),
    svg(radial).replace('url(#alpha-gradient)', 'url(\'#alpha-gradient\')'),
    svg(radial).replace('fill="url(#alpha-gradient)"', 'stroke="url(#alpha-gradient)"'),
    svg(radial).replace('gradientUnits="userSpaceOnUse"', 'gradientUnits="objectBoundingBox"'),
    svg(radial).replace('cx="0"', 'cx="0.5"'),
    svg(radial).replace('r="1"', 'r="0"'),
    svg(radial).replace('matrix(27 0 -4 19 43.2 33.7)', 'matrix(1 2 2 4 0 0)'),
    svg(radial).replace('matrix(27 0 -4 19 43.2 33.7)', 'matrix(NaN 0 0 1 0 0)'),
    svg(radial).replace('matrix(27 0 -4 19 43.2 33.7)', 'matrix(1e999 0 0 1 0 0)'),
    svg(radial).replace('matrix(27 0 -4 19 43.2 33.7)', 'matrix(4000 0 0 1 0 0)'),
    svg(radial).replace('matrix(27 0 -4 19 43.2 33.7)', 'translate(1 2)'),
    svg(linear).replace('x1="-3.25"', 'x1="10000"'),
    svg(linear).replace('x1="-3.25"', 'x1=""'),
    svg(linear).replace('x1="-3.25"', 'x1="0x10"'),
    svg(linear).replace('x1="-3.25" y1="20"', 'x1="80.125" y1="50"'),
    svg(radial).replace('offset="1"', 'offset="0.5"'),
    svg(radial).replace('stop-opacity="0.72"', 'stop-opacity="1.01"'),
    svg(radial).replace('stop-color="rgb(30,80,200)"', 'stop-color="rgb(999,0,0)"'),
    svg(radial).replace('stop-color="rgb(30,80,200)"', 'stop-color="url(#alpha-gradient)"'),
    svg(radial).replace('<stop offset="0"', '<stop onload="alert(1)" offset="0"'),
    svg(radial).replace('id="alpha-gradient"', 'id="alpha-gradient" href="https://evil.test/a"'),
    svg(radial).replace('id="alpha-gradient"', 'id="alpha-gradient" style="display:none"'),
    svg(radial + radial),
    svg(radial).replace('</defs>', '</defs><defs></defs>'),
    svg(`<defs>${radial}</defs>`),
    svg(radial.replace('</radialGradient>', '<stop offset="1" stop-color="rgb(0,0,0)" stop-opacity="0"/></radialGradient>')),
    svg(radial.replace('<stop offset="0" stop-color="rgb(30,80,200)" stop-opacity="0.72"/>', '')),
    svg(radial, `<g>${path}</g>`),
    svg(radial, `${path}<mask/>`),
    svg(radial, `${path}<filter/>`),
    svg(radial, `${path}<stop offset="0" stop-color="rgb(0,0,0)" stop-opacity="1"/>`),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 97 71">${path}</svg>`,
  ])('rejects unsupported or unsafe gradient profiles %#', bad => expect(() => sanitize(bad)).toThrow());

  it('retains the existing path-only profile without enabling other local URLs', () => {
    const safe = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 97 71"><path d="M0 0H10V10Z" fill="rgb(30,80,200)" opacity="0.4"/></svg>';
    expect(sanitize(safe)).toContain('opacity="0.4"');
    expect(() => sanitize(safe.replace('fill="rgb(30,80,200)"', 'fill="url(#alpha-gradient)"'))).toThrow();
  });
});
