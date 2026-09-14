/// <reference lib="webworker" />
import { decodeBitmap, validateFile } from "../lib/image/validation";
import { convertRaster } from "../lib/svg/convert-raster";
import { optimizeSvg } from "../lib/svg/optimize";
import type { WorkerRequest, WorkerResponse, PipelineStage } from "../types/conversion";

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;
ctx.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  const { id, file, settings } = data;
  const started = performance.now();
  const post = (response: WorkerResponse) => ctx.postMessage(response);
  const stage = (stage: PipelineStage) => post({ type: "stage", id, stage });
  let bitmap: ImageBitmap | undefined;
  let canvas: OffscreenCanvas | undefined;
  try {
    stage("decoding");
    const metadata = await validateFile(file);
    bitmap = await decodeBitmap(file, metadata);
    canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d", { willReadFrequently: true, colorSpace: "srgb" });
    if (!context) throw new Error("Trình duyệt không hỗ trợ đọc pixel trong worker.");
    context.drawImage(bitmap, 0, 0); bitmap.close(); bitmap = undefined;
    const data = context.getImageData(0, 0, canvas.width, canvas.height);
    stage("tracing");
    const result = await convertRaster(data, settings);
    stage("optimizing");
    result.svg = optimizeSvg(result.svg);
    result.warnings = [...metadata.warnings, ...result.warnings];
    result.metrics.durationMs = performance.now() - started;
    post({ type: "result", id, result });
  } catch (error) {
    post({ type: "error", id, message: error instanceof Error ? error.message : "Không thể chuyển ảnh. Hãy thử ảnh nhỏ hơn." });
  } finally {
    bitmap?.close();
    if (canvas) { canvas.width = 1; canvas.height = 1; }
  }
};
