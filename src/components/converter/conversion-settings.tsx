"use client";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { PRESETS } from "@/lib/svg/settings";
import type { ConversionSettings, Quality, ColorMode } from "@/types/conversion";

const qualities = { fast: "Nhanh", balanced: "Cân bằng", maximum: "Tối đa" };
const modes = { color: "Giữ màu", monochrome: "Đen trắng" };
export function Settings({ value, onChange, disabled }: { value: ConversionSettings; onChange: (value: ConversionSettings) => void; disabled: boolean }) {
  return <Collapsible className="border-t p-5 sm:px-7">
    <FieldGroup className="flex-row flex-wrap items-end gap-5">
      <Field className="w-auto min-w-36 flex-1 sm:flex-none">
        <FieldLabel htmlFor="quality">Chất lượng</FieldLabel>
        <Select items={qualities} value={value.quality} disabled={disabled} onValueChange={q => { if (q) onChange({ ...value, quality: q as Quality, colors: PRESETS[q as Quality].colors }); }}>
          <SelectTrigger id="quality" className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent alignItemWithTrigger={false}><SelectGroup>{Object.entries(qualities).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>
      </Field>
      <Field className="w-auto min-w-36 flex-1 sm:flex-none">
        <FieldLabel htmlFor="color-mode">Màu sắc</FieldLabel>
        <Select items={modes} value={value.mode} disabled={disabled} onValueChange={mode => { if (mode) onChange({ ...value, mode: mode as ColorMode }); }}>
          <SelectTrigger id="color-mode" className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent alignItemWithTrigger={false}><SelectGroup>{Object.entries(modes).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>
      </Field>
      <CollapsibleTrigger render={<Button variant="ghost" disabled={disabled} className="group" />}><SlidersHorizontal data-icon="inline-start" />Tinh chỉnh<ChevronDown data-icon="inline-end" className="transition-transform group-data-panel-open:rotate-180" /></CollapsibleTrigger>
      <p className="w-full text-sm text-muted-foreground sm:ml-auto sm:w-auto sm:max-w-80">{value.quality === "fast" ? "Ít màu, đường nét đơn giản hơn." : value.quality === "maximum" ? "Giữ thêm chi tiết. SVG lớn hơn, xử lý lâu hơn." : "Cân bằng chi tiết và kích thước SVG."}</p>
    </FieldGroup>
    <CollapsibleContent><FieldGroup className="mt-7 max-w-xl gap-6">
      {value.mode === "color" ? <Field><FieldLabel id="colors-label">Số màu tối đa <span className="ml-auto font-mono">{value.colors}</span></FieldLabel><Slider aria-labelledby="colors-label" min={2} max={64} step={1} value={[value.colors]} disabled={disabled} onValueChange={v => onChange({ ...value, colors: Array.isArray(v) ? v[0] : v })} /><FieldDescription>Nhiều màu hơn có thể giữ thêm sắc độ, đồng thời tạo nhiều mảng vector hơn.</FieldDescription></Field> : <Field><FieldLabel id="threshold-label">Ngưỡng đen trắng <span className="ml-auto font-mono">{value.threshold}</span></FieldLabel><Slider aria-labelledby="threshold-label" min={0} max={255} step={1} value={[value.threshold]} disabled={disabled} onValueChange={v => onChange({ ...value, threshold: Array.isArray(v) ? v[0] : v })} /><FieldDescription>Tăng ngưỡng để giữ nhiều vùng tối hơn. Độ trong suốt vẫn được xử lý.</FieldDescription></Field>}
    </FieldGroup></CollapsibleContent>
  </Collapsible>;
}
