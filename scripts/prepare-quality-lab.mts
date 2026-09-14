import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdir, copyFile, readFile, writeFile, access } from 'node:fs/promises';

// tsx already pins esbuild in the project lockfile; resolve its own dependency.
const require = createRequire(import.meta.resolve('tsx'));
const { build } = require('esbuild') as { build(options: {
  entryPoints: string[]; bundle: boolean; format: string; platform: string; outfile: string;
}): Promise<void> };
const root = process.cwd();
const args = process.argv.slice(2);
const option = (name: string) => { const index = args.indexOf(name); return index === -1 ? undefined : args[index + 1]; };
const directory = resolve(option('--directory') ?? '/tmp/svg-quality-lab');
await mkdir(resolve(directory, 'engines'), { recursive: true });
for (const [entry, output] of [['src/workers/vectorize.worker.ts', 'candidate.js'], ['src/lib/svg/sanitize.ts', 'sanitize.js']]) {
  await build({ entryPoints: [resolve(root, entry)], bundle: true, format: 'esm', platform: 'browser', outfile: resolve(directory, output) });
}
let baselineExists = false;
try { await access(resolve(directory, 'baseline.js')); baselineExists = true; } catch { /* First run establishes a snapshot. */ }
if (!baselineExists || args.includes('--snapshot')) {
  await copyFile(resolve(directory, 'candidate.js'), resolve(directory, 'baseline.js'));
  console.log('Baseline snapshot saved from the current worker. Keep it unchanged when comparing later edits.');
}
for (const name of ['interior-seam', 'soft-alpha', 'gradient', 'logo-alpha', 'portrait', 'landscape']) {
  await copyFile(resolve(root, `tests/fixtures/${name}.png`), resolve(directory, `${name}.png`));
}
await copyFile(resolve(root, 'public/samples/koi-source.png'), resolve(directory, 'koi.png'));
await copyFile(resolve(root, 'public/engines/vtracer-1.0.0-alpha.4.wasm'), resolve(directory, 'engines/vtracer-1.0.0-alpha.4.wasm'));
const extra = option('--seam');
if (extra) await copyFile(resolve(extra), resolve(directory, 'interior-seam.png'));
const photo = option('--photo');
if (photo) await copyFile(resolve(photo), resolve(directory, 'astronaut.png'));
let html = await readFile(resolve(root, 'tests/quality/quality-lab.html'), 'utf8');
html = html.replace('<script type="module">', `<script>window.qualityLabPhoto=${Boolean(photo)};</script><script type="module">`);
await writeFile(resolve(directory, 'index.html'), html);
console.log(`Quality lab prepared at ${directory}. Serve this directory on localhost and open it in Codex Browser.`);
