import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import { createHash } from 'node:crypto';
import { convertRaster, initializeVtracer } from '../src/lib/svg/convert-raster';
import { DEFAULT_SETTINGS } from '../src/lib/svg/settings';
import { optimizeSvg } from '../src/lib/svg/optimize';
const dir = 'tests/fixtures'; mkdirSync(dir, {recursive:true});
function fixture(name:string,w:number,h:number,pixel:(x:number,y:number)=>number[]) {
 const png=new PNG({width:w,height:h});
 for(let y=0;y<h;y++) for(let x=0;x<w;x++) png.data.set(pixel(x,y),(y*w+x)*4);
 writeFileSync(`${dir}/${name}.png`,PNG.sync.write(png));return png;
}
fixture('logo-alpha',128,128,(x,y)=>x>20&&x<108&&y>20&&y<108 ? x>48&&x<80&&y>48&&y<80?[0,0,0,0]:[16,112,196,255]:[0,0,0,0]);
fixture('soft-alpha',128,128,(x,y)=>[30,80,200,Math.round(255*Math.max(0,1-Math.hypot(x-64,y-64)/60))]);
fixture('transparent',16,16,()=>[99,2,190,0]);
fixture('tiny',1,1,()=>[20,150,60,255]);
fixture('portrait',32,160,(x,y)=>y<80?[30,160,80,255]:[200,50,60,255]);
const jpg=fixture('landscape',160,32,(x)=>x<80?[30,160,80,255]:[200,50,60,255]);
writeFileSync(`${dir}/landscape.jpg`,jpeg.encode(jpg,95).data);
writeFileSync(`${dir}/landscape.jpeg`,jpeg.encode(jpg,95).data);
fixture('gradient',160,100,(x,y)=>[Math.round(x/159*255),Math.round(y/99*255),140,255]);
// Analytic regression source: two opaque paints meet along an antialiased
// diamond inside a circle with a transparent fringe. No external asset used.
fixture('interior-seam',128,128,(x,y)=>{
 const radius=Math.hypot(x+0.5-64,y+0.5-64);
 const alpha=Math.round(255*Math.max(0,Math.min(1,50.5-radius)));
 const diamond=(Math.abs(x+0.5-64)+Math.abs(y+0.5-64))/Math.SQRT2;
 const mix=Math.max(0,Math.min(1,22.5-diamond));
 const rgb=[23,107,186].map((v,c)=>Math.round(v+([220,60,45][c]-v)*mix));
 return [...rgb,alpha];
});
fixture('large-solid',2000,2000,(x,y)=>x<1000?[20,150,90,255]:y<1000?[220,60,70,255]:[20,110,210,255]);
const bad=readFileSync(`${dir}/logo-alpha.png`);bad.writeUInt32BE(5000,16);writeFileSync(`${dir}/oversized-header.png`,bad);
writeFileSync(`${dir}/corrupt.png`,Buffer.from('not a png'));
writeFileSync(`${dir}/empty.png`,Buffer.alloc(0));
writeFileSync(`${dir}/unsupported.gif`,Buffer.from('GIF89a'));
writeFileSync(`${dir}/too-many-bytes.png`,Buffer.alloc(10*1024*1024+1));
const jpegFull=jpeg.encode(jpg,95).data; const sos=jpegFull.indexOf(Buffer.from([255,218])); writeFileSync(`${dir}/decode-corrupt.jpg`,jpegFull.subarray(0,sos+10));
// EXIF orientation 6: 160x32 becomes 32x160 after browser decoding.
const app1=Buffer.from('ffe1002245786966000049492a0008000000010012010300010000000600000000000000','hex');
const jpgBytes=jpeg.encode(jpg,95).data;writeFileSync(`${dir}/rotated-exif.jpg`,Buffer.concat([jpgBytes.subarray(0,2),app1,jpgBytes.subarray(2)]));
if (!process.argv.includes('--fixtures-only')) {
const source=readFileSync('public/samples/koi-source.png');const decoded=PNG.sync.read(source);
await initializeVtracer(new Uint8Array(readFileSync('public/engines/vtracer-1.0.0-alpha.4.wasm')));
const output=await convertRaster({width:decoded.width,height:decoded.height,data:new Uint8ClampedArray(decoded.data)},DEFAULT_SETTINGS);
const svg=optimizeSvg(output.svg);writeFileSync('public/samples/koi-result.svg',svg);
writeFileSync('docs/testing/sample-provenance.json',JSON.stringify({engine:'VTracer 1.0.0-alpha.4, fixed palette, stacked underpaint + cutout',settings:DEFAULT_SETTINGS,sourceSHA256:createHash('sha256').update(source).digest('hex'),svgSHA256:createHash('sha256').update(svg).digest('hex'),metrics:output.metrics,warnings:output.warnings},null,2)+'\n');
console.log({sampleBytes:Buffer.byteLength(svg),metrics:output.metrics});

}
