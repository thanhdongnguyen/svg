declare module "imagetracerjs" {
  type RGBA = { r: number; g: number; b: number; a: number };
  type TraceData = {
    width: number; height: number; palette: RGBA[];
    layers: Array<Array<{ segments: Array<Record<string, number | string>>; isholepath: boolean }>>;
  };
  type TraceOptions = {
    ltres: number; qtres: number; pathomit: number; colorsampling: number;
    numberofcolors: number; colorquantcycles: number; mincolorratio: number;
    layering: number; strokewidth: number; linefilter: boolean;
    viewbox: boolean; desc: boolean; roundcoords: number; rightangleenhance: boolean;
    pal?: RGBA[]; blurradius?: number; blurdelta?: number;
  };
  const tracer: {
    imagedataToTracedata(image: { width: number; height: number; data: Uint8ClampedArray }, options: TraceOptions): TraceData;
    getsvgstring(data: TraceData, options: TraceOptions): string;
  };
  export default tracer;
  export type { TraceOptions, TraceData, RGBA };
}
