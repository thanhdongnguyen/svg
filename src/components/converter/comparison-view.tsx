"use client";
/* Native img keeps raster and blob SVG previews local, without an image proxy. */
/* eslint-disable @next/next/no-img-element */
import { useRef, useState } from "react";
import { Image as ImageIcon, Minus, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export function ComparisonView({ source, result, busy, stage, demo, dimensions }: { source: string; result?: string; busy: boolean; stage: string; demo: boolean; dimensions?: string }) {
  const [zoom, setZoom] = useState(1);
  const [background, setBackground] = useState("checker");
  const [mobilePane, setMobilePane] = useState("source");
  const left = useRef<HTMLDivElement>(null), right = useRef<HTMLDivElement>(null);
  const sync = (from: HTMLDivElement, to: HTMLDivElement | null) => {
    if (to && (Math.abs(to.scrollTop - from.scrollTop) > 1 || Math.abs(to.scrollLeft - from.scrollLeft) > 1)) { to.scrollTop = from.scrollTop; to.scrollLeft = from.scrollLeft; }
  };
  return <>
    <div className="flex min-h-13 flex-wrap items-center justify-between gap-3 border-b px-5 py-3 text-sm sm:px-7">
      <span className="font-medium">{demo ? "Ảnh mẫu minh họa" : "So sánh ảnh"}<span className="ml-3 hidden font-normal text-muted-foreground sm:inline">{dimensions}</span></span>
      {!demo && <div className="flex flex-wrap items-center gap-3"><ToggleGroup aria-label="Nền xem trước" value={[background]} onValueChange={v => { if (v[0]) setBackground(v[0]); }} size="sm" spacing={0} variant="outline"><ToggleGroupItem value="checker" aria-label="Nền trong suốt">Ô lưới</ToggleGroupItem><ToggleGroupItem value="white" aria-label="Nền trắng">Trắng</ToggleGroupItem><ToggleGroupItem value="black" aria-label="Nền đen">Đen</ToggleGroupItem></ToggleGroup><div className="flex items-center gap-1" role="group" aria-label="Zoom đồng bộ"><Button variant="ghost" size="icon-sm" aria-label="Thu nhỏ" disabled={zoom <= 1} onClick={() => setZoom(v => v - .5)}><Minus /></Button><output className="w-12 text-center font-mono text-xs" aria-label="Mức zoom">{Math.round(zoom * 100)}%</output><Button variant="ghost" size="icon-sm" aria-label="Phóng to" disabled={zoom >= 4} onClick={() => setZoom(v => v + .5)}><Plus /></Button><Button variant="ghost" size="icon-sm" aria-label="Vừa khung" disabled={zoom === 1} onClick={() => setZoom(1)}><RotateCcw /></Button></div></div>}
    </div>
    <Tabs className="border-b px-5 py-3 md:hidden" value={mobilePane} onValueChange={setMobilePane}><TabsList className="w-full"><TabsTrigger value="source" className="flex-1" aria-controls="source-pane">Ảnh gốc</TabsTrigger><TabsTrigger value="result" className="flex-1" aria-controls="result-pane">SVG</TabsTrigger></TabsList></Tabs>
    <div className={cn("grid md:grid-cols-2", demo ? "demo-comparison" : "active-comparison")}>
      {([{ side: "source", label: "Ảnh gốc", url: source, ref: left, peer: right }, { side: "result", label: "SVG", url: result, ref: right, peer: left }] as const).map(pane => <section key={pane.side} id={`${pane.side}-pane`} aria-label={pane.label} className={cn("relative min-w-0 md:block", pane.side === "source" && "md:border-r", mobilePane !== pane.side && "hidden")}>
        <p className="absolute left-5 top-4 z-10 rounded-md bg-background/95 px-2 py-1 text-sm text-foreground sm:left-7">{pane.label}{pane.side === "result" && demo && <span className="ml-2 text-xs text-muted-foreground">Vector thực</span>}</p>
        <div ref={pane.ref} tabIndex={!demo && zoom > 1 ? 0 : undefined} aria-label={`Vùng xem ${pane.label}`} onScroll={e => sync(e.currentTarget, pane.peer.current)} className={cn("preview-scroll h-full overflow-auto focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2", !demo && `preview-${background}`)}>
          {pane.url ? <div className="flex min-h-full items-center justify-center" style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}><img src={pane.url} alt={pane.side === "source" ? "Ảnh raster gốc" : "Kết quả SVG vector"} draggable={false} className={cn("block size-full object-contain", demo ? "scale-110 px-0 py-3" : "p-12")} /></div> : <Empty className="h-full min-h-80 px-8 pt-16"><EmptyHeader><EmptyMedia variant="icon">{busy ? <Spinner /> : <ImageIcon />}</EmptyMedia><EmptyTitle>{busy ? stage : "SVG sẽ xuất hiện ở đây"}</EmptyTitle><EmptyDescription>{busy ? "Đang xử lý trên thiết bị của bạn." : "Chọn chất lượng rồi nhấn Chuyển sang SVG."}</EmptyDescription></EmptyHeader></Empty>}
        </div>
      </section>)}
    </div>
  </>;
}
