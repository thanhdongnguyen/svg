import {mkdirSync,readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {PNG} from 'pngjs';
import {convertRaster,initializeVtracer} from '../src/lib/svg/convert-raster';
import {DEFAULT_SETTINGS} from '../src/lib/svg/settings';
import {optimizeSvg} from '../src/lib/svg/optimize';
const { JSDOM } = await import('jsdom');
const { window } = new JSDOM();
Object.assign(globalThis, { window, DOMParser: window.DOMParser, XMLSerializer: window.XMLSerializer });
const { sanitizeSvg } = await import('../src/lib/svg/sanitize');
const dir='tests/.browser-qa';mkdirSync(dir,{recursive:true});
const names=['logo-alpha','soft-alpha','transparent','tiny','portrait','landscape','gradient'];
const metrics=[];
await initializeVtracer(new Uint8Array(readFileSync('public/engines/vtracer-1.0.0-alpha.4.wasm')));
for(const name of names){const b=readFileSync(`tests/fixtures/${name}.png`),p=PNG.sync.read(b);const r=await convertRaster({width:p.width,height:p.height,data:new Uint8ClampedArray(p.data)},DEFAULT_SETTINGS);copyFileSync(`tests/fixtures/${name}.png`,`${dir}/${name}.png`);writeFileSync(`${dir}/${name}.svg`,sanitizeSvg(optimizeSvg(r.svg),p.width,p.height));metrics.push({name,...r.metrics});}
writeFileSync(`${dir}/index.html`, `<!doctype html><meta charset="utf-8"><title>SVG rendered regression fixtures</title><style>body{font:16px system-ui;margin:24px}table{border-collapse:collapse}td,th{padding:12px;border:1px solid #ccc;text-align:left}img{width:180px;height:180px;object-fit:contain;background:repeating-conic-gradient(#eee 0% 25%,#fff 0% 50%) 0/16px 16px}pre{white-space:pre-wrap}</style><h1>Rendered SVG regression fixtures</h1><p>Raster vs SVG at native resolution and 2×, compared on black and white.</p><button id="run">Run visual checks</button><pre id="results">Not run</pre><table><thead><tr><th>Fixture</th><th>PNG source</th><th>SVG result</th></tr></thead><tbody>${names.map(n=>`<tr><th>${n}</th><td><img src="${n}.png" alt="${n} original"></td><td><img src="${n}.svg" alt="${n} vector"></td></tr>`).join('')}</tbody></table><script>
const names=${JSON.stringify(names)}; const metrics=${JSON.stringify(metrics)};
async function pixels(url,scale){const image=new Image();image.src=url;await image.decode();const c=document.createElement('canvas');c.width=image.naturalWidth*scale;c.height=image.naturalHeight*scale;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,c.width,c.height);return ctx.getImageData(0,0,c.width,c.height).data;}
function diff(a,b){let alpha=0,sum=0;for(let i=0;i<a.length;i+=4){const x=a[i+3]/255,y=b[i+3]/255;alpha+=Math.abs(x-y);for(let j=0;j<3;j++){const black=a[i+j]*x-b[i+j]*y,white=black+255*(y-x);sum+=black*black+white*white;}}return{alphaMAE:alpha/(a.length/4),compositeRMSE:Math.sqrt(sum/(a.length/4*6))};}
document.getElementById('run').onclick=async()=>{const results=[];for(const name of names){const scales=[];for(const scale of [1,2]){const d=diff(await pixels(name+'.png',scale),await pixels(name+'.svg',scale));scales.push({scale,...d});}results.push({name,paths:metrics.find(m=>m.name===name).pathCount,bytes:metrics.find(m=>m.name===name).bytes,scales});}document.getElementById('results').textContent=JSON.stringify(results,null,2);};
</script>`);
