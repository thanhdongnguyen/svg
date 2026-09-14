# AGENTS.md

## Project Overview

SVG is a web application that converts raster images (`PNG`, `JPG`, and `JPEG`) into clean, editable SVG files with the highest practical visual fidelity.

The product should make conversion simple for non-technical users while still producing output suitable for designers and developers. The primary workflow is:

1. Select or drag an image into the application.
2. Validate and preview the source image.
3. Configure conversion quality when needed.
4. Convert the raster image into vector paths.
5. Compare the original and converted result.
6. Download an optimized SVG file.

Never describe raster-to-vector conversion as mathematically lossless. “High quality” means preserving the visible silhouette, colors, transparency, edges, and important details while keeping the SVG editable and reasonably sized.

## Technology

- Next.js with the App Router
- React and TypeScript
- Tailwind CSS v4
- ShadCN UI with the preset defined in `components.json`
- pnpm for package management

Use the existing package manager and project configuration. Do not introduce another package manager or a second styling system.

## Recommended Project Structure

```text
src/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css               # Global tokens and Tailwind theme
├── components/
│   ├── converter/
│   │   ├── upload-dropzone.tsx
│   │   ├── image-preview.tsx
│   │   ├── conversion-settings.tsx
│   │   ├── comparison-view.tsx
│   │   ├── conversion-progress.tsx
│   │   └── download-result.tsx
│   └── ui/                        # ShadCN-generated components
├── hooks/
│   └── use-image-converter.ts
├── lib/
│   ├── image/
│   │   ├── validation.ts
│   │   ├── metadata.ts
│   │   └── preprocessing.ts
│   ├── svg/
│   │   ├── vectorize.ts
│   │   ├── optimize.ts
│   │   ├── serialize.ts
│   │   └── metrics.ts
│   └── utils.ts
├── types/
│   └── conversion.ts
└── workers/
    └── vectorize.worker.ts        # CPU-heavy browser conversion work

tests/
├── fixtures/                      # Small licensed or generated test images
├── unit/
└── e2e/
```

Create directories only when they are needed. Avoid empty placeholder modules.

## Architecture Guidelines

- Keep the conversion engine separate from React components. Code under `lib/image` and `lib/svg` must not depend on UI state.
- All conversion runs locally in a Web Worker. The site is a Next.js static export (`output: "export"`), with no login or image upload service.
- Do not add conversion API routes or server fallbacks. Browser-only processing is an explicit product constraint.
- Treat conversion as a staged pipeline: validate, decode, preprocess, trace, simplify, optimize, serialize, and measure.
- Make pipeline stages independently testable and use typed inputs and outputs.
- Revoke temporary object URLs and release image or canvas resources after use.
- Keep uploaded files ephemeral. Do not persist or transmit user images unless the product explicitly adds and clearly communicates that feature.

## Conversion Quality Requirements

- Accept only supported image formats and verify both the MIME type and decoded image data.
- Preserve the original aspect ratio and SVG `viewBox`.
- Preserve transparency for PNG input.
- Support both monochrome tracing and multi-color tracing. Do not apply a monochrome algorithm to color artwork without an explicit user choice.
- Favor smooth Bézier curves, closed contours, and stable path winding.
- Remove tiny isolated artifacts without erasing meaningful details.
- Avoid excessive anchor points. Simplification must be relative to image dimensions and the selected quality level.
- Merge adjacent regions when they have equivalent colors and topology.
- Optimize SVG markup without changing the visible result.
- Do not embed the original raster image inside the SVG as a substitute for vectorization.
- Sanitize generated SVG before preview or download. Never render untrusted source SVG markup.
- Record useful output metrics such as path count, color count, dimensions, processing time, and file size.

Provide sensible quality presets:

- `Fast`: fewer colors and stronger path simplification.
- `Balanced`: the default for most images.
- `Maximum`: more color/detail preservation with a larger SVG and longer processing time.

## UI and UX Guidelines

- The main conversion workflow must be usable without signing in.
- Keep the primary page focused on upload, preview, conversion, comparison, and download.
- Clearly display accepted formats and file-size limits before upload.
- Show determinate progress when the conversion engine exposes stages; otherwise show an honest indeterminate state.
- Allow users to cancel long conversions.
- Preserve keyboard access and visible focus states for every interactive control.
- Use ShadCN components before creating custom equivalents.
- Use semantic design tokens such as `bg-background`, `text-foreground`, and `text-muted-foreground` instead of hard-coded theme colors.
- Use `gap-*` for layout spacing and `size-*` when width and height are equal.
- Keep advanced conversion settings collapsed by default.
- Comparison views must label the raster source and SVG result clearly and support useful zooming on both sides.
- Never show a successful state until a valid, downloadable SVG has been produced.

## TypeScript and React Conventions

- Keep TypeScript strict and avoid `any`. Use `unknown` with explicit narrowing for external data.
- Prefer Server Components by default. Add `"use client"` only to interactive boundaries that require browser APIs, state, effects, or event handlers.
- Use small, focused components. Keep conversion orchestration in a dedicated hook or state machine rather than in the page component.
- Use named types for conversion settings, pipeline stages, results, warnings, and errors.
- Do not store large image buffers in global React state when a local reference or worker transfer is sufficient.
- Make user-visible errors actionable and keep technical error details available for development diagnostics.
- Use the import aliases defined in `components.json` and `tsconfig.json`.

## ShadCN Conventions

- For every UI change, follow the established design system exactly and use the installed `shadcn` skill to discover, install, and compose from the full shadcn/ui component catalog; do not create a custom UI component or a custom replacement for an existing shadcn/ui component without explicit user approval.
- Use `pnpm dlx shadcn@latest` for all ShadCN CLI operations.
- Check installed components before adding new ones.
- Read the current component documentation before implementing a ShadCN component.
- Keep generated primitives in `src/components/ui` and product-specific compositions in `src/components/converter`.
- Do not overwrite locally modified UI components without reviewing the diff.
- Follow the Base UI APIs selected by the current preset; do not assume Radix-specific props.

## Testing and Quality Gates

Every material change should pass the relevant checks:

```bash
pnpm run test
pnpm run lint
pnpm run typecheck
pnpm run build
```

- Every feature must be tested end-to-end with Codex's `@Browser` (`browser@openai-bundled`), including visual inspection of the rendered UI; do not use Agent Browser as a substitute, and do not consider a feature complete based only on source review, lint, build, or non-visual automated tests.

Add targeted tests for the conversion engine. At minimum, cover:

- Invalid file types and corrupt images
- PNG transparency
- JPG/JPEG decoding
- Small, large, portrait, landscape, and square images
- Monochrome logos and multi-color illustrations
- Cancellation and worker errors
- Valid, sanitized SVG output
- Stable `viewBox`, dimensions, and aspect ratio

Use visual regression fixtures for quality-sensitive changes. Compare rendered SVG output against the source at multiple zoom levels and track both visual similarity and SVG complexity. A smaller file is not an improvement if it introduces visible degradation.

## Performance and Safety

- Define explicit limits for file size, pixel count, dimensions, color count, and processing time.
- Reject decompression bombs and images that would exceed safe memory limits before allocating large canvases.
- Move expensive processing off the main thread.
- Prefer transferable `ArrayBuffer` or `ImageBitmap` data when communicating with workers.
- Avoid logging image contents, data URLs, or other user-provided binary data.
- Clean up all temporary files and browser resources after success, cancellation, or failure.

## Agent Working Rules

- Inspect the existing implementation before changing architecture or adding dependencies.
- Preserve user changes and avoid unrelated refactors.
- Prefer mature, actively maintained vectorization and SVG optimization libraries over implementing complex tracing algorithms from scratch.
- Before adding a conversion dependency, verify browser/server compatibility, license, bundle impact, maintenance status, and output quality.
- Keep the default workflow functional after every change.
- Do not commit generated build output, uploaded images, temporary previews, or private test assets.
- Update this document when the architecture, supported formats, conversion engine, or required quality gates change.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Current Conversion Implementation

- `src/lib/svg/convert-raster.ts` dispatches the browser-worker pipeline. Opaque color images with more than four distinct RGB colors use pinned VTracer 1.0.0-alpha.4 WASM (`MIT OR Apache-2.0`; the MIT notice is included). The adapter and provenance live in `src/lib/svg/vendor/`; preserve the upstream notice and artifact hashes when updating them. This is an alpha release, not a blanket stability or fidelity guarantee.
- VTracer is initialized lazily from the same-origin static file `/engines/vtracer-1.0.0-alpha.4.wasm` (668,378 bytes). It is an engine download, never an image-conversion API or image upload. No CDN, conversion route, or server fallback is involved. A retained worker can reuse initialized WASM; a new worker may need to fetch the asset again.
- Opaque tracing combines stacked underpainting with cutout paths and maps all final solid paints to the selected deterministic palette. A color-coverage sanity check retries quantized input with color merging disabled when needed; this check does not establish spatial fidelity. Uniform, one-dimensional, monochrome and small exact-palette cases retain their specialized/baseline paths.
- Eligible transparent flat-color artwork uses `trace-antialias.ts`: at most eight inferred paints, strict per-pixel color fits, opaque/transparent regions and a narrow antialias fringe. Most soft pixels must be within two pixels of both transparent and pure opaque regions; a bounded taper-tip exception allows a few farther pixels. Broad soft alpha, unsupported color detail and insufficient flat-color support are rejected. Multi-paint images add an existing-palette underpaint inside a one-pixel 3x3 erosion of the fully opaque source region, preventing interior seams while preserving the outer soft fringe and real holes. That trace reuses the buffer and counts toward aggregate path/segment/byte limits. Coverage is supersampled by at most 2x/4x/8x for Fast/Balanced/Maximum, capped at 4,194,304 internal pixels (16 MiB for the temporary RGBA buffer). Below 2x it defers to another strategy. Export only the verified black BW contours, recolored and divided into original coordinates; never export the temporary white tracing background.
- Non-exact single-color soft-alpha input first tries `fit-alpha-gradient.ts`: a linear alpha ramp or conical radial alpha profile with an affine ellipse transform. It checks every source pixel before accepting native SVG: alpha MAE <= 0.75/255, maximum alpha error <= 1.5/255, black/white composite RMSE <= 0.8, maximum composite channel error <= 2 (0-255 scale). These are model-fit limits, not guarantees about the browser-rendered output. Unsupported profiles or unmodeled detail must fall through rather than be presented as recovered gradients.
- A qualifying single-color soft mask that fails native fitting can use cumulative ImageTracer alpha masks (up to 12/24/32 levels, also bounded by the selected color budget). Other transparency/color cases fall back to pinned ImageTracerJS 1.2.6 (Unlicense), an older JS baseline. Its palette quantizer measures centered premultiplied/composited color, preserves alpha endpoints and does not re-cluster straight RGBA or blur afterward. Exact small palettes retain original RGBA. Outer contours and holes use the same coordinate precision; one-dimensional and uniform images use rectangular runs to avoid zero-area contours.
- SVGO 4.1.0 (MIT) removes nonvisual metadata only. DOMPurify 3.4.15 (Apache-2.0 OR MPL-2.0) and an explicit allowlist validate structure/attributes before and after cleaning. Besides SVG/path output, permit only one owned `alpha-gradient` inside one `defs`, either a validated linear/radial gradient with exactly two stops, and its exact local path-fill reference. External URLs, hrefs, images, filters, masks and arbitrary groups remain forbidden.
- Current limits: input 10 MiB, 4,000,000 pixels, 4096 px/side; up to 64 colors; worker deadline 30 s; output 5 MiB, 12,000 paths, 120,000 path segments. Preview decode has a 5 s per-image deadline. Supersampling's buffer cap does not include all JS/WASM allocations. These are application limits, not a guarantee against device memory pressure.
- Photos, textured/multicolor gradients, overlapping fractional-alpha paints and fine details remain approximations. Cumulative alpha can still band; reconstructed antialias edges can move or round very sharp tips. Maximum is not guaranteed to outperform every other preset. Do not claim mathematically lossless conversion, original SVG recovery, or universal high fidelity from passing functional tests.
- `scripts/generate-fixtures.mts` creates reproducible synthetic inputs. For actual worker/browser quality comparisons, run `node --import tsx scripts/prepare-quality-lab.mts --directory /tmp/svg-quality-lab-review --snapshot` before engine edits; rerun without `--snapshot` after edits to preserve the worker baseline. Serve that directory with `python3 -m http.server 4175 --bind 127.0.0.1 --directory /tmp/svg-quality-lab-review`, open it in Codex @Browser, run the corpus and inspect white/black backgrounds at multiple zooms. Optional `--photo` accepts a local licensed PNG. A new snapshot is the current worker, not historical evidence. The older `prepare-browser-qa.mts` page tests the JS path directly and does not replace the worker lab. Keep generated fixtures, lab bundles/results and `out/` untracked; record inspected evidence and limitations in the testing report.
