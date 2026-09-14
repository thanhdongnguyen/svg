export type VTracerOptions = {
  clustering: 'color-cluster' | 'watershed' | 'bw';
  hierarchical: 'stacked' | 'cutout';
  mode?: 'spline' | 'polygon' | 'pixel';
  colorPrecision?: number;
  layerDifference?: number;
  filterSpeckle?: number;
  simplify?: number;
  pathPrecision?: number;
  optimize: 0;
  palette?: string[];
  maxColors?: number;
  watershedDetail?: number;
};
export function init(bytes: BufferSource): Promise<WebAssembly.Exports>;
export function vectorize_rgba(data: Uint8Array, width: number, height: number, options: VTracerOptions): string;
