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
│   ├── api/
│   │   └── convert/
│   │       └── route.ts          # Optional server-side conversion endpoint
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
- Prefer local browser processing for privacy and fast iteration. Use a Web Worker for CPU-heavy conversion so the interface remains responsive.
- Add a server-side conversion route only when the chosen vectorization engine cannot run reliably in the browser or needs native dependencies.
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

- Use `pnpm dlx shadcn@latest` for all ShadCN CLI operations.
- Check installed components before adding new ones.
- Read the current component documentation before implementing a ShadCN component.
- Keep generated primitives in `src/components/ui` and product-specific compositions in `src/components/converter`.
- Do not overwrite locally modified UI components without reviewing the diff.
- Follow the Base UI APIs selected by the current preset; do not assume Radix-specific props.

## Testing and Quality Gates

Every material change should pass the relevant checks:

```bash
pnpm run lint
pnpm run build
```

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
