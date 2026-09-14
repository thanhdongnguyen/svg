import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { inspectHeader, validateDimensions, validateFile, LIMITS } from '../../src/lib/image/validation';
import { vectorize } from '../../src/lib/svg/vectorize';
import { DEFAULT_SETTINGS } from '../../src/lib/svg/settings';
import { optimizeSvg } from '../../src/lib/svg/optimize';
import { comparePixels } from '../../src/lib/svg/metrics';
const fixture=(name:string)=>readFileSync(`tests/fixtures/${name}`);
function trace(name:string, settings=DEFAULT_SETTINGS) { const p=PNG.sync.read(fixture(name));return vectorize({width:p.width,height:p.height,data:new Uint8ClampedArray(p.data)},settings); }
describe('encoded file validation before decoding',()=>{
 it.each(['logo-alpha.png','portrait.png','landscape.png','tiny.png','large-solid.png'])('reads dimensions from %s',name=>{const p=PNG.sync.read(fixture(name));expect(inspectHeader(fixture(name),'image/png')).toMatchObject({width:p.width,height:p.height,format:'png'});});
 it.each(['landscape.jpg','landscape.jpeg','rotated-exif.jpg'])('accepts JPEG SOF in %s',name=>expect(inspectHeader(fixture(name),'image/jpeg')).toMatchObject({width:160,height:32,format:'jpeg'}));
 it.each(['corrupt.png','oversized-header.png','empty.png'])('rejects %s',name=>expect(()=>inspectHeader(fixture(name),'image/png')).toThrow());
 it('rejects a MIME/signature mismatch',()=>expect(()=>inspectHeader(fixture('logo-alpha.png'),'image/jpeg')).toThrow(/khớp/));
 it.each([[0,20],[-1,20],[4097,1],[2001,2000],[Infinity,1],[1.5,2]])('rejects dimensions %s x %s',(w,h)=>expect(()=>validateDimensions(w,h)).toThrow());
 it('allows 4MP boundary',()=>expect(()=>validateDimensions(2000,2000)).not.toThrow());
 it('rejects an overflowing PNG chunk',()=>{const b=fixture('logo-alpha.png');b.writeUInt32BE(0xffffffff,33);expect(()=>inspectHeader(b,'image/png')).toThrow(/hỏng/);});
 it('rejects APNG',()=>{const b=fixture('logo-alpha.png');b.write('acTL',37);expect(()=>inspectHeader(b,'image/png')).toThrow(/động/);});
 it('warns before reducing 16-bit depth',()=>{const b=fixture('logo-alpha.png');b[24]=16;expect(inspectHeader(b,'image/png').warnings.join()).toContain('16-bit');});
 it('checks size before reading a file buffer',async()=>{let read=false;const file={type:'image/png',size:LIMITS.fileBytes+1,arrayBuffer:()=>{read=true;return Promise.resolve(new ArrayBuffer(0));}} as File;await expect(validateFile(file)).rejects.toThrow(/10/);expect(read).toBe(false);});
 it('rejects unsupported MIME',async()=>await expect(validateFile(new File(['x'],'x.gif',{type:'image/gif'}))).rejects.toThrow(/PNG/));
 it('rejects an empty file',async()=>await expect(validateFile(new File([],'x.png',{type:'image/png'}))).rejects.toThrow(/rỗng/));
 it('rejects truncated JPEG metadata',()=>expect(()=>inspectHeader(fixture('landscape.jpg').subarray(0,22),'image/jpeg')).toThrow());
});
describe('real tracing and SVG optimization',()=>{
 it.each(['logo-alpha.png','portrait.png','landscape.png','tiny.png','transparent.png'])('traces %s with stable viewBox and no embedded raster',name=>{const p=PNG.sync.read(fixture(name));const r=trace(name);expect(r.svg).toContain(`viewBox="0 0 ${p.width} ${p.height}"`);expect(r.svg).not.toMatch(/<image|data:|NaN|Infinity/);expect(optimizeSvg(r.svg)).toContain('<svg');});
 it('retains transparent holes without a white background',()=>{const r=trace('logo-alpha.png');expect(r.metrics.pathCount).toBe(1);expect(r.svg).toContain('rgb(16,112,196)');expect(r.svg).not.toContain('rgb(255,255,255)');expect(r.svg.match(/M /g)?.length).toBeGreaterThan(1);});
 it('represents a transparent image as a valid empty SVG',()=>{const r=trace('transparent.png');expect(r.metrics.pathCount).toBe(0);expect(r.warnings.join()).toContain('hoàn toàn trong suốt');});
 it('preserves a fitted alpha ramp as a native vector gradient',()=>{const r=trace('soft-alpha.png');expect(r.svg).toContain('<radialGradient');expect(r.svg).toContain('stop-opacity="0"');expect(r.svg).toContain('stop-opacity="1"');expect(r.metrics.pathCount).toBe(1);expect(r.warnings.join()).toContain('gradient SVG');});
 it('is deterministic for quantized artwork',()=>{expect(trace('gradient.png').svg).toBe(trace('gradient.png').svg);});
 it('uses grayscale only after explicit monochrome choice',()=>{const r=trace('portrait.png',{...DEFAULT_SETTINGS,mode:'monochrome'});expect(r.svg).not.toMatch(/rgb\(30,160,80\)/);expect(r.svg).toMatch(/rgb\((0,0,0|255,255,255)\)/);});
 it('rejects malformed buffers and settings',()=>{expect(()=>vectorize({width:1,height:1,data:new Uint8ClampedArray(3)},DEFAULT_SETTINGS)).toThrow(/Buffer/);expect(()=>trace('tiny.png',{...DEFAULT_SETTINGS,colors:999})).toThrow(/Thiết lập/);});
 it('optimizes metadata without changing geometry or opacity',()=>{const s='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><!--hello--><path fill="rgb(20,30,40)" opacity="0.123456" d="M 0 0 L 10 10 Z"/></svg>';const r=optimizeSvg(s);expect(r).not.toContain('hello');expect(r).toContain('0.123456');expect(r).toContain('M 0 0 L 10 10 Z');});
});
describe('fidelity diagnostics',()=>{
 it('ignores invisible RGB differences',()=>expect(comparePixels(new Uint8ClampedArray([255,0,255,0]),new Uint8ClampedArray([0,0,0,0]))).toEqual({alphaMAE:0,compositeRMSE:0}));
 it('detects white-flattened transparency',()=>{const m=comparePixels(new Uint8ClampedArray([255,255,255,0]),new Uint8ClampedArray([255,255,255,255]));expect(m.alphaMAE).toBe(1);expect(m.compositeRMSE).toBeGreaterThan(100);});
 it('rejects buffers of different lengths',()=>expect(()=>comparePixels(new Uint8ClampedArray(4),new Uint8ClampedArray(8))).toThrow());
});

describe('one-pixel geometry regression',()=>{
 it('keeps a 1×1 pixel as a nonzero rectangular path',()=>{const r=trace('tiny.png');expect(r.svg).toContain('M0 0H1V1H0Z');expect(r.metrics.pathCount).toBe(1);});
 it.each([[1,2],[2,1]])('preserves adjacent colors in %s×%s',(width,height)=>{const r=vectorize({width,height,data:new Uint8ClampedArray([255,0,0,255,0,80,200,128])},DEFAULT_SETTINGS);expect(r.metrics.pathCount).toBe(2);expect(r.svg).toContain('0.5019607843137255');expect(r.svg).not.toContain(' L ');});
});
