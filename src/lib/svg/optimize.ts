import { optimize } from "svgo/browser";

// No path rounding, color changes, merging or default preset: these plugins only
// remove nonvisual metadata. Geometry/opacity survive unchanged.
export function optimizeSvg(svg: string): string {
  return optimize(svg, { multipass: false, plugins: ["removeComments", "removeMetadata", "removeXMLProcInst", "cleanupAttrs", { name: "removeAttrs", params: { attrs: "svg:desc" } }] }).data;
}
