import ImageTracer, { type TraceData, type TraceOptions } from "imagetracerjs";

/** Apply the same coordinate precision to outer contours and holes. */
export function serializeTrace(traced: TraceData, options: TraceOptions): string {
  // ImageTracer 1.2.6's rounded branch omits the precision argument for holes,
  // rounding those contours to integers. Round the geometry uniformly first,
  // then use its unrounded serializer so adjacent contours cannot drift apart.
  for (const layer of traced.layers) {
    for (const path of layer) {
      for (const segment of path.segments) {
        for (const key of ["x1", "y1", "x2", "y2", "x3", "y3"]) {
          const value = segment[key];
          if (typeof value === "number") segment[key] = Math.round(value * 1000) / 1000;
        }
      }
    }
  }
  return ImageTracer.getsvgstring(traced, { ...options, roundcoords: -1 });
}
