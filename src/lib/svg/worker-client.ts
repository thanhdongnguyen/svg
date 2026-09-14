import { LIMITS } from "../image/validation";
import type { ConversionResult, ConversionSettings, PipelineStage, WorkerResponse } from "../../types/conversion";

export class ConversionCancelled extends Error {
  constructor() { super("Đã hủy chuyển đổi."); this.name = "ConversionCancelled"; }
}

export class WorkerClient {
  private worker: Worker | null = null;
  private reject: ((error: Error) => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private id = 0;
  constructor(private factory: () => Worker, private timeout: number = LIMITS.timeoutMs) {}
  warm() { if (!this.worker) this.worker = this.factory(); }
  cancel() {
    const reject = this.reject;
    if (!reject) return;
    this.dispose();
    reject?.(new ConversionCancelled());
  }
  private release() {
    if (this.worker) { this.worker.onmessage = null; this.worker.onerror = null; this.worker.onmessageerror = null; }
    if (this.timer) clearTimeout(this.timer);
    this.timer = null; this.reject = null;
  }
  dispose() { this.release(); this.worker?.terminate(); this.worker = null; }
  run(file: File, settings: ConversionSettings, onStage: (stage: PipelineStage) => void): Promise<ConversionResult> {
    this.cancel();
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.reject = reject;
      const fail = (message: string) => { if (this.reject !== reject) return; this.dispose(); reject(new Error(message)); };
      try {
        this.warm();
        const worker = this.worker!;
        worker.onerror = () => fail("Bộ xử lý ảnh gặp lỗi. Hãy thử lại hoặc chọn ảnh nhỏ hơn.");
        worker.onmessageerror = () => fail("Không đọc được kết quả xử lý. Hãy thử lại.");
        worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
          if (data.id !== id || this.worker !== worker) return;
          if (data.type === "stage") onStage(data.stage);
          else if (data.type === "error") fail(data.message);
          else if (data.type === "result") { this.release(); resolve(data.result); }
        };
        this.timer = setTimeout(() => fail("Ảnh mất quá 30 giây để xử lý. Hãy chọn Nhanh, ít màu hơn hoặc ảnh nhỏ hơn."), this.timeout);
        worker.postMessage({ id, file, settings });
      } catch { fail("Không khởi tạo được bộ xử lý. Hãy tải lại trang trong trình duyệt mới hơn."); }
    });
  }
}
