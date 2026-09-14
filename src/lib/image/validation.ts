import type { ImageMetadata } from "../../types/conversion";

export const LIMITS = {
  fileBytes: 10 * 1024 * 1024,
  pixels: 4_000_000,
  dimension: 4096,
  timeoutMs: 30_000,
  svgBytes: 5 * 1024 * 1024,
  paths: 12_000,
  segments: 120_000,
} as const;

export function validateDimensions(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
    throw new Error("Kích thước ảnh không hợp lệ. Hãy xuất lại ảnh PNG hoặc JPG.");
  if (width > LIMITS.dimension || height > LIMITS.dimension || width * height > LIMITS.pixels)
    throw new Error("Ảnh quá lớn. Hãy giảm xuống tối đa 4 megapixel và 4096 px mỗi cạnh.");
}

// Inspect encoded dimensions before any decoder/canvas can allocate pixel storage.
export function inspectHeader(data: Uint8Array, mime: string): ImageMetadata {
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const warnings: string[] = [];
  const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (data.length >= 33 && pngSignature.every((n, i) => data[i] === n)) {
    if (mime !== "image/png") throw new Error("Nội dung ảnh không khớp định dạng PNG đã khai báo.");
    if (v.getUint32(8) !== 13 || String.fromCharCode(...data.slice(12, 16)) !== "IHDR")
      throw new Error("Header PNG bị hỏng. Hãy chọn một ảnh khác.");
    const width = v.getUint32(16), height = v.getUint32(20);
    validateDimensions(width, height);
    if (data[24] === 16) warnings.push("PNG 16-bit được chuẩn hóa về 8-bit sRGB trước khi chuyển.");
    let offset = 8;
    while (offset + 12 <= data.length) {
      const length = v.getUint32(offset);
      if (length > data.length - offset - 12) throw new Error("Tệp PNG bị cắt hoặc bị hỏng.");
      const kind = String.fromCharCode(...data.slice(offset + 4, offset + 8));
      if (kind === "acTL") throw new Error("Chưa hỗ trợ PNG động. Hãy xuất một khung hình PNG tĩnh.");
      if (kind === "iCCP") warnings.push("Ảnh có profile màu riêng; bản SVG sử dụng màu sRGB.");
      offset += length + 12;
      if (kind === "IEND") break;
    }
    return { width, height, format: "png", warnings };
  }
  if (data.length > 4 && data[0] === 255 && data[1] === 216) {
    if (mime !== "image/jpeg") throw new Error("Nội dung ảnh không khớp định dạng JPEG đã khai báo.");
    let offset = 2;
    while (offset + 3 < data.length) {
      if (data[offset++] !== 255) break;
      while (data[offset] === 255) offset++;
      const marker = data[offset++];
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      if (offset + 2 > data.length) break;
      const length = v.getUint16(offset);
      if (length < 2 || offset + length > data.length) break;
      if ((marker >= 192 && marker <= 195) || (marker >= 197 && marker <= 207 && ![196, 200, 204].includes(marker))) {
        if (![192, 193, 194].includes(marker) || length < 8 || data[offset + 2] !== 8)
          throw new Error("Biến thể JPEG này chưa được hỗ trợ. Hãy xuất JPG 8-bit thông thường.");
        const height = v.getUint16(offset + 3), width = v.getUint16(offset + 5);
        validateDimensions(width, height);
        if (data[offset + 7] === 4) warnings.push("JPEG CMYK được chuyển sang sRGB; màu có thể thay đổi.");
        return { width, height, format: "jpeg", warnings };
      }
      offset += length;
    }
    throw new Error("Không đọc được kích thước JPEG. Tệp có thể đã bị hỏng.");
  }
  throw new Error("Tệp không phải ảnh PNG hoặc JPG hợp lệ. Đổi tên đuôi tệp không chuyển được định dạng.");
}

export async function validateFile(file: File): Promise<ImageMetadata> {
  if (!["image/png", "image/jpeg"].includes(file.type))
    throw new Error("Chỉ hỗ trợ PNG, JPG và JPEG. Hãy chọn đúng định dạng ảnh.");
  if (file.size === 0) throw new Error("Tệp đang rỗng. Hãy chọn một ảnh khác.");
  if (file.size > LIMITS.fileBytes) throw new Error("Tệp vượt quá 10 MiB. Hãy giảm dung lượng rồi thử lại.");
  return inspectHeader(new Uint8Array(await file.arrayBuffer()), file.type);
}

export async function decodeBitmap(file: File, metadata: ImageMetadata): Promise<ImageBitmap> {
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { throw new Error("Không giải mã được ảnh. Tệp có thể bị hỏng; hãy xuất lại PNG hoặc JPG."); }
  try {
    validateDimensions(bitmap.width, bitmap.height);
    const exact = bitmap.width === metadata.width && bitmap.height === metadata.height;
    const rotated = metadata.format === "jpeg" && bitmap.width === metadata.height && bitmap.height === metadata.width;
    if (!exact && !rotated) throw new Error("Kích thước ảnh giải mã không khớp header.");
    return bitmap;
  } catch (error) { bitmap.close(); throw error; }
}
