"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { decodeBitmap, validateFile } from "@/lib/image/validation";
import { sanitizeSvg } from "@/lib/svg/sanitize";
import { measureFidelity } from "@/lib/svg/metrics";
import { ConversionCancelled, WorkerClient } from "@/lib/svg/worker-client";
import type { ConversionResult, ConversionSettings, ImageMetadata, PipelineStage } from "@/types/conversion";

export type SelectedImage = { file: File; url: string; metadata: ImageMetadata };
export type ConverterState = {
  status: "idle" | "validating" | "selected" | "converting" | "ready" | "cancelled" | "failed";
  source: SelectedImage | null;
  result: (ConversionResult & { url: string }) | null;
  stage: PipelineStage;
  error: string | null;
};
const initial: ConverterState = { status: "idle", source: null, result: null, stage: "decoding", error: null };

export function useImageConverter() {
  const [state, setState] = useState<ConverterState>(initial);
  const sourceRef = useRef<SelectedImage | null>(null);
  const resultUrl = useRef<string | null>(null);
  const revision = useRef(0);
  const client = useRef<WorkerClient | null>(null);
  const mounted = useRef(true);
  const clearResult = useCallback(() => {
    if (resultUrl.current) URL.revokeObjectURL(resultUrl.current);
    resultUrl.current = null;
  }, []);
  useEffect(() => {
    mounted.current = true;
    client.current = new WorkerClient(() => new Worker(new URL("../workers/vectorize.worker.ts", import.meta.url), { type: "module" }));
    return () => {
      mounted.current = false;
      // This counter invalidates asynchronous work, not a DOM node reference.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      revision.current++;
      client.current?.cancel();
      client.current?.dispose();
      if (sourceRef.current) URL.revokeObjectURL(sourceRef.current.url);
      clearResult();
    };
  }, [clearResult]);

  const choose = useCallback(async (file: File) => {
    const current = ++revision.current;
    client.current?.cancel(); clearResult();
    if (sourceRef.current) URL.revokeObjectURL(sourceRef.current.url);
    sourceRef.current = null;
    setState({ ...initial, status: "validating" });
    try {
      const metadata = await validateFile(file);
      const bitmap = await decodeBitmap(file, metadata);
      metadata.width = bitmap.width; metadata.height = bitmap.height; bitmap.close();
      if (!mounted.current || current !== revision.current) return;
      const source = { file, metadata, url: URL.createObjectURL(file) };
      sourceRef.current = source;
      setState({ ...initial, source, status: "selected" });
    } catch (error) {
      if (mounted.current && current === revision.current)
        setState({ ...initial, status: "failed", error: error instanceof Error ? error.message : "Không đọc được ảnh." });
    }
  }, [clearResult]);

  const convert = useCallback(async (settings: ConversionSettings) => {
    const source = sourceRef.current;
    if (!source || !client.current) return;
    const current = ++revision.current;
    const started = performance.now();
    clearResult();
    setState(s => ({ ...s, status: "converting", result: null, error: null, stage: "decoding" }));
    const active = () => mounted.current && current === revision.current;
    try {
      const result = await client.current.run(source.file, settings, stage => {
        if (active()) setState(s => ({ ...s, stage }));
      });
      if (!active()) return;
      setState(s => ({ ...s, stage: "checking" }));
      result.svg = sanitizeSvg(result.svg, result.metrics.width, result.metrics.height);
      result.metrics.bytes = new TextEncoder().encode(result.svg).length;
      result.metrics.pathCount = new DOMParser().parseFromString(result.svg, "image/svg+xml").querySelectorAll("path").length;
      result.fidelity = await measureFidelity(source.file, result.svg, result.metrics.width, result.metrics.height);
      if (!active()) return;
      if (result.fidelity.compositeRMSE > 20 && settings.mode === "color")
        result.warnings.push("Bản xem trước có khác biệt đáng kể. Hãy kiểm tra chi tiết hoặc tăng chất lượng trước khi tải.");
      result.warnings = [...new Set([...source.metadata.warnings, ...result.warnings])];
      result.metrics.durationMs = performance.now() - started;
      const url = URL.createObjectURL(new Blob([result.svg], { type: "image/svg+xml;charset=utf-8" }));
      resultUrl.current = url;
      setState(s => ({ ...s, status: "ready", result: { ...result, url }, error: null }));
    } catch (error) {
      if (!active()) return;
      setState(s => ({ ...s, status: error instanceof ConversionCancelled ? "cancelled" : "failed", result: null,
        error: error instanceof ConversionCancelled ? null : error instanceof Error ? error.message : "Chuyển đổi thất bại." }));
    }
  }, [clearResult]);

  const cancel = useCallback(() => {
    revision.current++; client.current?.cancel(); clearResult();
    setState(s => ({ ...s, status: s.source ? "cancelled" : "idle", result: null, error: null }));
  }, [clearResult]);
  const reset = useCallback(() => {
    revision.current++; client.current?.cancel(); clearResult();
    if (sourceRef.current) URL.revokeObjectURL(sourceRef.current.url);
    sourceRef.current = null; setState(initial);
  }, [clearResult]);
  const invalidate = useCallback(() => {
    revision.current++; client.current?.cancel(); clearResult();
    setState(s => ({ ...s, status: s.source ? "selected" : "idle", result: null, error: null }));
  }, [clearResult]);
  return { state, choose, convert, cancel, reset, invalidate };
}
