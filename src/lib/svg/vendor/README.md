# VTracer browser binding

Pinned upstream: `@visioncortex/vtracer@1.0.0-alpha.4` (MIT OR Apache-2.0; MIT text included here).

Sources:
- https://github.com/visioncortex/vtracer/tree/1.0.0-alpha.4
- https://registry.npmjs.org/@visioncortex/vtracer/-/vtracer-1.0.0-alpha.4.tgz

`vtracer.mjs` derives from the package's generated `pkg/vtracer_wasm.js`. The only functional changes replace its two CommonJS exports with ESM exports and replace Node's `fs` initializer with `init(bytes)` using WebAssembly.compile/Instance. An ESLint header identifies the generated binding. No tracing code or WASM bytes are modified.

The byte-identical WASM lives at `public/engines/vtracer-1.0.0-alpha.4.wasm` (668,378 bytes; SHA-256 `63716b70497b7468ef97545b50f5f34b8bbb7acde2d7b00deb4eb40781446d45`). `provenance.json` records npm integrity and the upstream/experimental adapter snapshots. Only the raw RGBA API is used; the included encoded-image decoder is not an input validation fallback.

The application initializes this binding inside a Dedicated Worker and serves the WASM from the same origin as a static asset. There is no conversion endpoint. The release is an alpha: keep the pin and run the rendered quality corpus before any upgrade.
