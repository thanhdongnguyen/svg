export type Quality = "fast" | "balanced" | "maximum";
export type ColorMode = "color" | "monochrome";
export type PipelineStage = "decoding" | "tracing" | "optimizing" | "checking";
export type ConversionSettings = {
  quality: Quality;
  mode: ColorMode;
  colors: number;
  threshold: number;
};
export type ImageMetadata = {
  width: number;
  height: number;
  format: "png" | "jpeg";
  warnings: string[];
};
export type VectorMetrics = {
  width: number;
  height: number;
  pathCount: number;
  colorCount: number;
  segmentCount: number;
  bytes: number;
  durationMs: number;
};
export type FidelityMetrics = { alphaMAE: number; compositeRMSE: number };
export type ConversionResult = {
  svg: string;
  metrics: VectorMetrics;
  warnings: string[];
  fidelity?: FidelityMetrics;
};
export type WorkerRequest = { id: number; file: File; settings: ConversionSettings };
export type WorkerResponse =
  | { type: "stage"; id: number; stage: PipelineStage }
  | { type: "result"; id: number; result: ConversionResult }
  | { type: "error"; id: number; message: string };
