import type { FidelityMetrics } from "../../types/conversion";

export function comparePixels(a: Uint8ClampedArray, b: Uint8ClampedArray): FidelityMetrics {
  if (a.length !== b.length || a.length % 4 || !a.length) throw new Error("Không thể so sánh hai buffer ảnh.");
  let alpha = 0, color = 0;
  for (let i = 0; i < a.length; i += 4) {
    const aa = a[i + 3] / 255, ba = b[i + 3] / 255;
    alpha += Math.abs(aa - ba);
    for (let c = 0; c < 3; c++) {
      const black = a[i + c] * aa - b[i + c] * ba;
      const white = black + 255 * (ba - aa);
      color += black * black + white * white;
    }
  }
  return { alphaMAE: alpha / (a.length / 4), compositeRMSE: Math.sqrt(color / (a.length / 4 * 6)) };
}

// A bounded diagnostic, never presented as a percentage of accuracy.
export async function measureFidelity(file: File, svg: string, width: number, height: number): Promise<FidelityMetrics> {
  const scale = Math.min(1, 256 / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
  const urls: string[] = [];
  const images: HTMLImageElement[] = [];
  const pixels = async (blob: Blob) => {
    const url = URL.createObjectURL(blob); urls.push(url);
    const image = new Image(); images.push(image); image.src = url;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try { await Promise.race([image.decode(), new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("Không kiểm tra được ảnh trong 5 giây. Hãy thử ảnh nhỏ hơn.")), 5000); })]); }
    finally { clearTimeout(timeout); }
    const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
    const context = canvas.getContext("2d", { willReadFrequently: true, colorSpace: "srgb" });
    if (!context) throw new Error("Không đo được bản xem trước.");
    context.drawImage(image, 0, 0, w, h);
    const data = context.getImageData(0, 0, w, h).data;
    canvas.width = canvas.height = 1; image.src = "";
    return data;
  };
  try { return comparePixels(await pixels(file), await pixels(new Blob([svg], { type: "image/svg+xml" }))); }
  finally { images.forEach(image => { image.src = ""; }); urls.forEach(url => URL.revokeObjectURL(url)); }
}
