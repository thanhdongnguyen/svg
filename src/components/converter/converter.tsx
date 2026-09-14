"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowDownToLine, ArrowRight, Check, ImagePlus, Info, Moon, Sun, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { ComparisonView } from "./comparison-view";
import { Settings } from "./conversion-settings";
import { useImageConverter } from "@/hooks/use-image-converter";
import { DEFAULT_SETTINGS } from "@/lib/svg/settings";
import type { ConversionSettings } from "@/types/conversion";

const stages = { decoding: "Đang đọc ảnh…", tracing: "Đang tạo đường vector…", optimizing: "Đang tối ưu SVG…", checking: "Đang kiểm tra kết quả…" };
const bytes = (n: number) => n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${(n / 1024).toFixed(1)} KB`;
export function Converter() {
  const { state, choose, convert, cancel, reset, invalidate } = useImageConverter();
  const [settings, setSettings] = useState<ConversionSettings>(DEFAULT_SETTINGS);
  const [dark, setDark] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [loadingSample, setLoadingSample] = useState(false);
  const dragDepth = useRef(0), input = useRef<HTMLInputElement>(null);
  const sampleRequest = useRef(0);
  const busy = state.status === "converting";
  const validating = state.status === "validating" || loadingSample;
  const demo = !state.source;
  const pick = (files: FileList | File[]) => {
    sampleRequest.current++; setLoadingSample(false); setLocalError(null);
    if (files.length !== 1) { setLocalError("Hãy chọn từng ảnh một để so sánh và tải kết quả."); return; }
    void choose(files[0]);
  };
  const sample = async () => {
    const request = ++sampleRequest.current;
    setLoadingSample(true); setLocalError(null);
    try {
      const response = await fetch("/samples/koi-source.png");
      if (!response.ok) throw new Error("Không tải được ảnh mẫu. Hãy chọn ảnh từ thiết bị.");
      const blob = await response.blob();
      if (request === sampleRequest.current) await choose(new File([blob], "koi.png", { type: "image/png" }));
    } catch { if (request === sampleRequest.current) setLocalError("Không tải được ảnh mẫu. Hãy chọn ảnh từ thiết bị."); }
    finally { if (request === sampleRequest.current) setLoadingSample(false); }
  };
  const changeSettings = (value: ConversionSettings) => { setSettings(value); invalidate(); };
  const error = localError || state.error;
  const metrics = state.result?.metrics;
  const warnings = state.result?.warnings ?? state.source?.metadata.warnings ?? [];
  return <div className={`${dark ? "dark " : ""}min-h-dvh bg-background text-foreground`} onDragEnter={e => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); dragDepth.current++; setDragging(true); } }} onDragOver={e => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); }} onDragLeave={e => { e.preventDefault(); if (--dragDepth.current <= 0) { dragDepth.current = 0; setDragging(false); } }} onDrop={e => { e.preventDefault(); dragDepth.current = 0; setDragging(false); if (e.dataTransfer.files.length) pick(e.dataTransfer.files); }}>
    <a href="#converter" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-background focus:p-4 focus:underline">Đến công cụ chuyển đổi</a>
    <header className="border-b"><div className="page-width flex h-16 items-center justify-between gap-5">
      <Link href="/" className="font-heading text-2xl font-semibold tracking-tight outline-offset-4 focus-visible:outline-2 focus-visible:outline-ring" aria-label="SVG — Trang chủ">SVG<span className="text-primary">.</span></Link>
      <nav className="flex items-center gap-3" aria-label="Điều hướng chính">
        <Dialog><DialogTrigger render={<Button variant="ghost" />}>Hướng dẫn</DialogTrigger><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>Từ ảnh đến vector</DialogTitle><DialogDescription>Không cần tài khoản. Ảnh được xử lý ngay trong trình duyệt.</DialogDescription></DialogHeader><ol className="flex list-decimal flex-col gap-3 pl-5 text-sm leading-6"><li>Chọn một ảnh PNG, JPG hoặc JPEG. Tối đa 10 MiB, 4 triệu pixel và 4.096 px mỗi chiều.</li><li>Chọn Cân bằng để bắt đầu. Tối đa giữ thêm chi tiết; Nhanh tạo ít mảng hơn.</li><li>Nhấn Chuyển sang SVG. Bạn có thể hủy khi đang xử lý.</li><li>Phóng to để so sánh, kiểm tra trên nền trắng và đen, rồi tải SVG.</li></ol><div className="border-t pt-4 text-sm leading-6"><p className="font-medium">Ảnh nào phù hợp?</p><p className="mt-1 text-muted-foreground">Logo, biểu tượng và hình có mảng màu rõ thường cho kết quả tốt hơn. Ảnh chụp, gradient, bóng và alpha mềm được xấp xỉ thành các mảng màu; có thể xuất hiện vệt màu hoặc mất chi tiết. SVG tạo ra không phải bản khôi phục của SVG gốc.</p></div><p className="text-sm leading-6 text-muted-foreground">Ảnh của bạn không được tải lên máy chủ hay lưu lại sau khi đóng trang. Trang và bộ xử lý cần được tải về trước khi dùng; làm mới trang khi mất mạng chưa được hỗ trợ.</p></DialogContent></Dialog>
        <Button variant="ghost" size="icon" aria-label={dark ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"} onClick={() => setDark(v => !v)}>{dark ? <Sun /> : <Moon />}</Button>
      </nav>
    </div></header>
    <main id="converter" className="page-width pb-8" tabIndex={-1}>
      <section className="hero flex flex-col justify-between gap-8 py-10 sm:py-12 lg:py-8 lg:flex-row lg:items-center lg:gap-12" aria-labelledby="main-title">
        <div><h1 id="main-title" className="font-heading text-[clamp(2.5rem,4.45vw,4rem)] leading-[1.08] font-bold tracking-[-0.045em]">Ảnh của bạn.<br />Dưới dạng vector.</h1><p className="mt-5 text-base leading-7 text-muted-foreground sm:text-xl">Chuyển PNG, JPG thành SVG ngay trên thiết bị.<br />Không cần tài khoản.</p></div>
        <div className="flex flex-col gap-3 lg:w-80 lg:pt-8">
          <Button size="lg" className="h-14 w-full gap-3 text-base" onClick={() => input.current?.click()} disabled={validating}>{validating ? <Spinner data-icon="inline-start" /> : <ImagePlus data-icon="inline-start" />}{validating ? "Đang đọc ảnh…" : state.source ? "Chọn ảnh khác" : "Chọn ảnh"}</Button>
          <p className="text-center text-sm text-muted-foreground">hoặc kéo ảnh vào trang</p>
          <p id="file-limits" className="text-center text-xs leading-5 text-muted-foreground">PNG, JPG, JPEG · Tối đa 10 MiB<br />4 triệu pixel · 4.096 px mỗi chiều</p>
          <input ref={input} type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" className="hidden" aria-label="Chọn tệp ảnh" aria-describedby="file-limits" onChange={e => { if (e.target.files?.length) pick(e.target.files); e.target.value = ""; }} />
        </div>
      </section>
      {error && <Alert variant="destructive" className="mb-5" role="alert"><Info /><AlertTitle>Chưa thể xử lý ảnh</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      <section className="overflow-hidden rounded-xl border bg-card" aria-label="Công cụ chuyển ảnh sang SVG">
        {state.source && <div className="flex items-center justify-between gap-3 border-b px-5 py-3 sm:px-7"><p className="min-w-0 truncate text-sm font-medium" title={state.source.file.name}>{state.source.file.name}<span className="ml-3 font-normal text-muted-foreground">{bytes(state.source.file.size)}</span></p><Button variant="ghost" size="icon-sm" aria-label="Xóa ảnh và bắt đầu lại" onClick={() => { sampleRequest.current++; setLocalError(null); reset(); }}><X /></Button></div>}
        <ComparisonView key={state.source?.url ?? "demo"} source={state.source?.url ?? "/samples/koi-source.png"} result={state.result?.url ?? (demo ? "/samples/koi-result.svg" : undefined)} busy={busy} stage={stages[state.stage]} demo={demo} dimensions={state.source ? `${state.source.metadata.width} × ${state.source.metadata.height} px` : undefined} />
        {state.source && <><Settings value={settings} onChange={changeSettings} disabled={busy} />
          <div className="flex flex-col justify-between gap-4 border-t px-5 py-5 sm:flex-row sm:items-center sm:px-7">
            <div className="text-sm leading-6" role="status" aria-live="polite" aria-atomic="true">
              {busy ? <p className="flex items-center gap-2"><Spinner />{stages[state.stage]}</p> : state.result && metrics ? <><p className="flex items-center gap-2 font-medium"><Check className="size-4 text-primary" />SVG đã sẵn sàng</p><p className="text-muted-foreground">{bytes(metrics.bytes)} · {metrics.pathCount.toLocaleString("vi-VN")} đường · {metrics.colorCount} màu · {(metrics.durationMs / 1000).toFixed(1)} giây</p></> : <p className="text-muted-foreground">{state.status === "cancelled" ? "Đã hủy. Bạn có thể chỉnh lại rồi thử tiếp." : "Ảnh đã sẵn sàng. Chọn chất lượng để bắt đầu."}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2">{busy ? <Button variant="outline" onClick={cancel}><X data-icon="inline-start" />Hủy chuyển đổi</Button> : state.result ? <><Button variant="ghost" onClick={() => void convert(settings)}>Chuyển lại</Button><Button size="lg" render={<a href={state.result.url} download={`${state.source.file.name.replace(/\.[^.]+$/, "") || "image"}.svg`} />}><ArrowDownToLine data-icon="inline-start" />Tải SVG</Button></> : <Button size="lg" onClick={() => void convert(settings)}>Chuyển sang SVG<ArrowRight data-icon="inline-end" /></Button>}</div>
          </div>
          {warnings.length > 0 && <div className="border-t px-5 py-4 sm:px-7"><Alert><Info /><AlertTitle>Lưu ý về ảnh này</AlertTitle><AlertDescription><ul className="flex list-disc flex-col gap-1 pl-4">{warnings.map(w => <li key={w}>{w}</li>)}</ul></AlertDescription></Alert></div>}
        </>}
      </section>
      {demo ? <div className="flex flex-col justify-between gap-4 py-5 text-sm sm:flex-row sm:items-center"><p className="leading-6 text-muted-foreground">Bắt đầu với logo hoặc hình có mảng màu rõ.<br className="sm:hidden" /> <span className="hidden sm:inline"> </span>Xem trước, so sánh rồi tải SVG.</p><Button variant="link" className="w-fit px-0" disabled={validating} onClick={() => void sample()}>Thử ảnh mẫu<ArrowRight data-icon="inline-end" /></Button></div> : <p className="py-5 text-center text-xs text-muted-foreground">Zoom và nền chỉ thay đổi cách xem, không thay đổi SVG tải về.</p>}
      <footer className="pt-2 text-center text-xs leading-5 text-muted-foreground">Gradient, bóng và ảnh chụp có thể khác bản gốc. Hãy kiểm tra trước khi tải.</footer>
    </main>
    {dragging && <div className="pointer-events-none fixed inset-3 z-50 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary bg-background/95"><div className="flex flex-col items-center gap-4"><ImagePlus className="size-12 text-primary" /><p className="text-2xl font-semibold">Thả ảnh vào đây</p><p className="text-muted-foreground">Một ảnh PNG hoặc JPG</p></div></div>}
  </div>;
}
