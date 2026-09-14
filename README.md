# SVG

Chuyển PNG/JPG/JPEG thành các đường SVG ngay trong trình duyệt. Không đăng nhập, không API chuyển đổi, không tải ảnh người dùng lên máy chủ. Giao diện dựa trên phương án ảnh 3 đã chọn.

## Chạy cục bộ

Node.js 24 và pnpm 10.2 (Python 3 để phục vụ bản export cục bộ):

```bash
pnpm install
pnpm dev
```

Bản production là website tĩnh:

```bash
pnpm build
python3 -m http.server 4173 --bind 127.0.0.1 --directory out
```

Mở http://127.0.0.1:4173. `pnpm start` chạy máy chủ file tĩnh như lệnh trên; không dùng `next start` cho static export. Font được tải ở thời điểm build rồi phục vụ từ cùng origin; người dùng không gọi Google Fonts.

## Khả năng và giới hạn

- Chọn tệp hoặc thả một ảnh; kiểm tra MIME, chữ ký, kích thước mã hóa và giải mã trước khi tạo canvas lớn.
- Chất lượng Nhanh / Cân bằng / Tối đa, màu / đen trắng, số màu và ngưỡng đen trắng.
- Worker riêng, thông báo từng giai đoạn, hủy bằng `terminate()`, chặn kết quả đã lỗi thời.
- So sánh gốc/SVG, zoom và cuộn đồng bộ, nền trắng/đen/ô lưới; mobile dùng tab.
- SVG chứa đường vector, `viewBox`, kích thước và thông tin dung lượng/số đường/màu/thời gian. Trường hợp alpha khớp mô hình được phép có một gradient native theo profile giới hạn; không nhúng ảnh gốc.
- Giới hạn: 10 MiB, 4 triệu pixel, 4096 px mỗi chiều; tối đa 64 màu. Worker 30 giây, SVG 5 MiB / 12.000 đường / 120.000 đoạn. Đây là giới hạn ứng dụng, không bảo đảm đủ RAM trên mọi thiết bị.
- Không hỗ trợ APNG, khôi phục SVG gốc, chỉnh node thủ công hoặc xử lý hàng loạt. Không phục hồi cấu trúc layer, gradient hay shadow ban đầu từ ảnh raster.
- Ảnh chụp, gradient nhiều màu, texture và alpha phức tạp vẫn là xấp xỉ. Một số gradient alpha đơn màu khớp được mô hình native; đây không phải hỗ trợ mọi gradient. Viền rất mảnh, góc nhọn và chi tiết dưới một pixel có thể thay đổi. Cần kiểm tra hình thật; preset Tối đa không bảo đảm đẹp hơn ở mọi ảnh.
- Worker đã hoàn tất được giữ lại để xử lý ảnh tiếp theo mà không tải lại engine; đóng trang sẽ giải phóng worker. Hủy tác vụ đang chạy hoặc lỗi worker sẽ cần nạp lại engine ở lần chạy tiếp theo.
- Không có service worker: mở lại/làm mới trang khi offline chưa được hỗ trợ. Không lưu ảnh vào localStorage, IndexedDB hay tài khoản.

## Engine và giấy phép

Chuyển đổi chạy trong Web Worker, qua `src/lib/svg/convert-raster.ts`. Việc chọn engine phụ thuộc dữ liệu ảnh:

- **Ảnh opaque nhiều màu:** VTracer **1.0.0-alpha.4** chạy bằng WASM. Kết hợp contour `stacked` bên dưới và `cutout` bên trên để giảm khe giữa mảng màu; màu đầu ra được ánh xạ về bảng màu đã chọn. Khi kiểm tra màu phát hiện mất màu đáng kể, trace lại dữ liệu đã lượng tử hóa với thao tác gộp màu bị tắt. Phép kiểm tra này không chứng minh độ đúng của hình học.
- **Artwork trong suốt, ít màu phẳng và viền khử răng cưa mỏng:** nhánh riêng suy ra coverage của từng màu, nội suy rồi trace mask bằng VTracer BW. Nhận tối đa 8 màu, phải có vùng opaque, vùng trong suốt và viền đủ hẹp; kiểm tra từng pixel để loại gradient rộng, mảng alpha phân số và chi tiết màu không giải thích được. Khi có nhiều màu, thêm underpaint bằng màu có sẵn trong vùng alpha=255 đã co vào một pixel theo lân cận 3×3 để giảm khe trong suốt giữa mảng; không phủ viền alpha mềm. Mức lấy mẫu nội bộ tối đa 2× / 4× / 8× cho Nhanh / Cân bằng / Tối đa, nhưng không vượt 4.194.304 pixel (16 MiB cho buffer RGBA). Nếu không đủ ngân sách để lấy mẫu ít nhất 2×, dùng nhánh khác. Nền trắng tạm chỉ là dữ liệu cho tracer BW; SVG xuất ra giữ nền trong suốt.
- **Alpha mềm gần như một màu:** thử khớp gradient tuyến tính hoặc radial ellipse có thể xoay/lệch tâm. Mô hình radial hiện là alpha giảm tuyến tính theo khoảng cách ellipse, không phải mọi profile bóng. Chỉ dùng gradient native khi kiểm tra toàn bộ pixel đạt ngưỡng trung bình và cực đại: alpha MAE ≤ 0,75/255, sai lệch alpha tối đa ≤ 1,5/255, composite RMSE ≤ 0,8 và sai lệch kênh composite tối đa ≤ 2 trên thang 0–255. Đây là sai số khớp mô hình trước render, không phải cam kết sai số của mọi trình duyệt.
- **Alpha đơn màu không khớp mô hình native:** khi đủ điều kiện, trace các mask alpha tích lũy bằng ImageTracer để tránh contour dải alpha quá mỏng. Tối đa 12 / 24 / 32 lớp theo preset và ngân sách màu; kết quả vẫn có thể phân dải hoặc khác màu do compositing.
- **Các trường hợp còn lại:** ImageTracerJS **1.2.6** là baseline JS cũ. Bảng màu nhỏ chính xác giữ RGBA gốc; dữ liệu cần lượng tử hóa dùng khoảng cách theo màu premultiplied/composite trên nền trắng và đen, giữ các endpoint alpha 0/255. Không chạy lại clustering RGBA thẳng hay blur sau bước này. Contour ngoài và lỗ được serialize cùng precision. Ảnh một chiều và đồng màu dùng các hình chữ nhật vector để tránh contour có diện tích bằng không.

VTracer có giấy phép **MIT OR Apache-2.0**; dự án kèm notice MIT tại `src/lib/svg/vendor/VTRACER-LICENSE-MIT`. Bản binding được đổi sang ESM và nhận byte WASM trực tiếp; file WASM giữ nguyên. Nguồn gói, integrity và hash nằm trong `src/lib/svg/vendor/provenance.json`. Đây là bản **alpha** được pin, không phải bảo đảm ổn định hay chất lượng cho mọi ảnh. ImageTracerJS dùng **Unlicense**, không được mô tả là engine tracing tiên tiến đang được bảo trì tích cực.

WASM được tải lười từ file tĩnh cùng origin `/engines/vtracer-1.0.0-alpha.4.wasm` (668.378 byte), không từ CDN hay API chuyển đổi. Request này chỉ tải mã engine; ảnh ở trong worker và không được gửi đi. Vì vậy “không API” không có nghĩa là lần mở trang đầu tiên không cần tải tài nguyên website.

SVGO **4.1.0**, MIT: chỉ bỏ metadata/whitespace, không dùng preset làm tròn hình học. DOMPurify **3.4.15**, Apache-2.0 OR MPL-2.0, kết hợp allowlist trước và sau sanitize. Ngoài `svg`/`path`, chỉ chấp nhận một `defs` chứa một `linearGradient` hoặc `radialGradient` do ứng dụng tạo, hai `stop`, tọa độ hữu hạn và paint nội bộ `url(#alpha-gradient)`. Không cho external URL, `href`, raster, filter, mask hay nhóm tùy ý. Có cảnh báo khi cần xấp xỉ và khi phép đo preview phát hiện khác biệt đáng kể.

Ảnh koi được tạo cho dự án, không lấy screenshot UI làm ảnh mẫu. `public/samples/koi-result.svg` là kết quả tracing thật; hash, settings và số liệu nằm trong `docs/testing/sample-provenance.json`. Nội dung/prompt nguồn nằm trong `docs/design/koi-source.prompt.txt`.

## Kiểm thử

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

`pnpm test` tạo fixture tổng hợp rồi chạy Vitest. File fixture lớn được bỏ qua bởi Git. `pnpm test:fixtures` tạo lại SVG mẫu koi bằng pipeline hiện tại và cập nhật provenance.

Để lập baseline trước khi sửa engine và kiểm tra bằng worker thực trong Codex @Browser:

```bash
node --import tsx scripts/generate-fixtures.mts --fixtures-only
node --import tsx scripts/prepare-quality-lab.mts --directory /tmp/svg-quality-lab-review --snapshot
python3 -m http.server 4175 --bind 127.0.0.1 --directory /tmp/svg-quality-lab-review
```

Mở [quality lab cục bộ](http://127.0.0.1:4175) bằng Codex @Browser. **Compare selected** đối chiếu ảnh chọn; **Run corpus** chạy các preset. Xem cả nền trắng/đen và mức zoom 1×/2×/4×. Ở 1×, tham chiếu là raster đã decode; với fixture sinh từ SVG, mức zoom lớn hơn dùng SVG ground truth để thấy sai hình học. Ảnh rộng hơn 1000 px được đo 1×/2×. Ảnh chụp chỉ có raster tham chiếu, không có vector ground truth.

Sau khi sửa engine, tạo lại candidate bằng cùng thư mục, bỏ `--snapshot` để giữ worker baseline:

```bash
node --import tsx scripts/prepare-quality-lab.mts --directory /tmp/svg-quality-lab-review
```

`--snapshot` ghi đè baseline bằng worker hiện tại; baseline mới tạo không thể đại diện cho phiên bản trước đó. Reload trang sau khi tạo lại bundle. Có thể thêm `--photo "/path/to/licensed-photo.png"` để chép một ảnh PNG chụp có quyền sử dụng vào bộ kiểm tra tạm; cờ này không tải ảnh từ mạng. Giữ các bundle, ảnh và kết quả lab ngoài Git.

Trang chẩn đoán nhỏ `scripts/prepare-browser-qa.mts` vẫn có thể chạy với `python3 -m http.server 4174 --bind 127.0.0.1 --directory tests/.browser-qa` sau khi sinh trang. Trang này gọi `vectorize()` trực tiếp trên RGBA decode bằng Node; không thay thế quality lab chạy pipeline worker và decode thực trong trình duyệt.

Phép đo composite trên nền trắng/đen, alpha, số path và dung lượng chỉ là chẩn đoán; không quy đổi thành “phần trăm chính xác”. Phải xem ảnh render thực. Fixture hoặc unit test đạt không chứng minh mọi ảnh đều chuyển tốt.

Báo cáo cải thiện chất lượng, số liệu và ảnh đối chiếu: [docs/testing/output-quality-improvements.vi.md](docs/testing/output-quality-improvements.vi.md).

Báo cáo kết quả và phần chưa kiểm chứng: [docs/testing/implementation-verification.vi.md](docs/testing/implementation-verification.vi.md). Đối chiếu thiết kế: [design-qa.md](design-qa.md). Nghiên cứu nền: [docs/research/browser-vectorization-rd-synthesis.vi.md](docs/research/browser-vectorization-rd-synthesis.vi.md).
