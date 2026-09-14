// @vitest-environment jsdom
import { it, expect } from 'vitest';
import { sanitizeSvg } from '../../src/lib/svg/sanitize';
const svg=(inner:string)=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${inner}</svg>`;
it('keeps safe vector geometry and adds explicit dimensions',()=>{const r=sanitizeSvg(svg('<path d="M0 0L10 0L10 10Z" fill="rgb(1,2,3)" opacity="0.5"/>'),10,10);expect(r).toContain('opacity="0.5"');expect(r).toContain('width="10"');});
it.each(['<script>alert(1)</script>','<image href="https://evil.test/a"/>','<path d="M0 0" onload="alert(1)"/>','<path d="M0 0" fill="url(https://evil.test/a)"/>','<foreignObject/>','<svg viewBox="0 0 10 10"/>','<path d="M0 0"><path d="M1 1"/></path>','<path d="MNaN 0"/>','<path d="M1e999 0"/>','<path opacity="2"/>','<path fill="red"/>'])('rejects unsafe or unexpected engine output %s',bad=>expect(()=>sanitizeSvg(svg(bad),10,10)).toThrow());
it('rejects mismatched coordinates',()=>expect(()=>sanitizeSvg(svg(''),20,10)).toThrow(/tọa độ/));
it('rejects doctypes and malformed XML',()=>{expect(()=>sanitizeSvg('<!DOCTYPE svg>'+svg(''),10,10)).toThrow();expect(()=>sanitizeSvg('<svg>',10,10)).toThrow();});
