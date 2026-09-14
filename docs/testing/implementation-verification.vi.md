# Kiểm chứng triển khai SVG — 14/09/2026

> Mốc kiểm chứng ban đầu, được giữ làm lịch sử. Xem [báo cáo cải tiến chất lượng SVG](output-quality-improvements.vi.md) để biết kết quả đo Browser, thay đổi engine và giới hạn chất lượng sau đó.

## Kết luận và ranh giới

Website đã có luồng chuyển đổi thật trên trình duyệt, theo phương án thiết kế ảnh 3, không đăng nhập và không API chuyển đổi. Bản production là Next.js static export. Các kiểm tra dưới đây chứng minh các ca cụ thể trên máy phát triển, không chứng minh chất lượng cho mọi ảnh hay mọi thiết bị.

**68 kiểm thử tự động đạt; lint, typecheck và production build đạt.** Đã kiểm tra tương tác và hình render bằng Codex @Browser trên bản production phục vụ tại `http://127.0.0.1:4173`. Không dùng Agent Browser.

**Chưa đủ bằng chứng để tuyên bố mọi feature đã được E2E hoàn toàn:** native drag-and-drop từ Finder chưa xác minh được vì bridge Browser/Computer Use không thực thi được thao tác drag; báo “Click target is no longer available”. Có 3 kiểm thử DOM cho một tệp, nhiều tệp và kéo văn bản; đây không thay thế native E2E. Cũng chưa kiểm thử Safari/Firefox, điện thoại thật, áp lực RAM, hoặc toàn bộ ảnh chụp/gradient thực tế.

## Các ca chạy thật trong Browser

| Ca | Kết quả quan sát |
|---|---|
| Màn hình đầu | Header, hero, chọn ảnh và cặp PNG/SVG mẫu có dữ liệu thật. Không login. |
| Ảnh mẫu koi | Chuyển thành SVG, số liệu thật, có cảnh báo xấp xỉ. Khoảng 3 giây ở các lượt đo trên máy này; không phải SLA. |
| PNG logo 128×128 có lỗ alpha | Kết quả 1 path; lỗ trong suốt còn nguyên. Tệp tải về 289 byte, `viewBox="0 0 128 128"`, không có `<image>`. |
| Alpha mềm 128×128, Tối đa | Chuyển được, có cảnh báo alpha và lượng hóa màu; thấy vệt mảng khi phóng lớn trên nền đen. Không coi là khôi phục alpha chính xác. |
| JPEG có EXIF orientation 6 | Header 160×32; preview và kết quả 32×160, đúng hướng xoay. |
| `.jpeg` thường | Preview/kết quả 160×32; tệp tải về có 2 path, 366 byte, không nhúng raster. |
| Ảnh 1×1 | Sau sửa lỗi zero-area, chuyển thành hình chữ nhật vector có diện tích; render fixture trùng ở 1× và 2×. |
| 2000×2000, 4 MP, ba màu | Chuyển thành 3 path, khoảng 3 giây ở lượt kiểm tra; không vượt giới hạn. |
| PNG hỏng, rỗng, GIF, >10 MiB, header >4096 px | Tất cả báo lỗi phù hợp; không có link tải. Chi tiết trong `e2e-errors.json`. |
| JPEG có header đúng nhưng dữ liệu scan hỏng | Lỗi giải mã được hiển thị; cho phép chọn ảnh mới. |
| Preset Nhanh/Cân bằng/Tối đa | Chọn được; số màu mặc định đổi theo preset; khối thiết lập bị khóa khi đang chạy. |
| Đen trắng và ngưỡng | Đổi được bằng Select/slider bàn phím; output chỉ còn grayscale. |
| Thay số màu bằng phím mũi tên | Giá trị 32→33, kết quả cũ và link tải bị gỡ trước lần chuyển mới. |
| Hủy | Dừng ngay khi đang trace; không hiện kết quả cũ; có thể chọn ảnh khác/chuyển tiếp. |
| Zoom và nền | 100→150→100%; đổi ô lưới/trắng/đen; hai pane cuộn đồng bộ, DOM ghi nhận cùng scrollTop 23,5. |
| Tải xuống | Nút tải thực sự tạo `.svg` trong Downloads; đã parse XML và kiểm tra số path/viewBox/không có ảnh nhúng. Event download của bridge có một lần timeout dù file đã tải, nên dùng kiểm tra file thực để kết luận. |
| Mobile 390×844 | Không tràn ngang; chọn PNG→chuyển→tab SVG→kết quả/tải hoạt động; đã xem light/dark. Đây là viewport desktop mô phỏng, không phải điện thoại thật. |
| Hướng dẫn, focus | Hộp thoại mở được, Escape đóng được; focus bàn phím của slider và nút hiển thị. |
| Lỗi worker khi máy chủ tắt | Lỗi nạp worker được xử lý, không báo thành công giả. |
| Chuyển ảnh tiếp theo khi máy chủ tắt | Sau sửa vòng đời worker, đã dừng server 4173, chọn một PNG mới và chuyển thành công bằng worker đang sống. Bằng chứng `offline-check.txt`. |

## Đo render bằng Browser

Trang kiểm chứng được tạo bởi `scripts/prepare-browser-qa.mts`; chạy engine thật, tối ưu, sanitize, thêm kích thước rồi render bằng browser. So sánh màu sau composite trên **cả nền trắng và nền đen**, đồng thời đo alpha riêng. SVG không nhúng ảnh gốc. Số liệu nguyên bản: `rendered-fixtures.json`.

| Fixture | RMSE 1× (0–255) | Alpha MAE 1× (0–1) | RMSE 2× | Số path trước tối ưu |
|---|---:|---:|---:|---:|
| Logo alpha đơn giản | 0 | 0 | 6,285 | 1 |
| Alpha mềm tổng hợp | 6,107 | 0,01750 | 6,900 | 31 |
| Hoàn toàn trong suốt | 0 | 0 | 0 | 0 |
| Một pixel đồng màu | 0 | 0 | 0 | 1 |
| Mảng màu dọc | 0 | 0 | 2,322 | 2 |
| Mảng màu ngang | 0 | 0 | 2,322 | 2 |
| Gradient hai chiều | 12,719 | 0 | 13,413 | 33 |

RMSE tại 2× cũng phản ánh sự khác nhau giữa nội suy raster và rasterization của vector. Không quy đổi các giá trị này thành “% chính xác”. Fixture alpha mềm được lượng hóa từ dữ liệu gốc trong Node; bitmap giải mã trong Browser có thể thêm sai khác do premultiplication/sRGB, như đã quan sát ở ca alpha Tối đa. Đây là tập chẩn đoán nhỏ, không phải benchmark đại diện.

Trong lúc xây harness từng có lượt dùng SVG chưa thêm kích thước explicit, làm naturalWidth khác PNG; lượt đó bị loại. Bảng cuối chỉ dùng cặp kích thước đã xác minh khớp nhau.

## Lỗi đã phát hiện và sửa

1. Bảng màu lấy mẫu theo vị trí bỏ sót phân bố màu của artwork thưa, sinh hàng chục nghìn mảng nhiễu. Dùng histogram RGBA và seed theo khoảng cách có trọng số; giữ tính xác định. Không tăng giới hạn để che lỗi.
2. Metadata `desc` của ImageTracer bị allowlist chặn. SVGO bỏ đúng thuộc tính metadata này; bộ kiểm tra không nới quyền cho script/image/external URL.
3. 1 pixel thành đường không diện tích. Xử lý ảnh một chiều/đồng màu bằng các đoạn hình chữ nhật vector; thêm kiểm thử hồi quy và đo render thật.
4. Khe alpha giữa các đường của ảnh opaque. Thêm lớp nền vector bằng màu chủ đạo, chỉ khi nguồn hoàn toàn opaque và đã lượng hóa; không flatten PNG có alpha.
5. Tạo worker mới sau mọi lần chạy làm nạp lại script. Giữ worker sau thành công, gỡ callback/timer và giải phóng bitmap/canvas; terminate khi hủy tác vụ đang chạy, lỗi hoặc unmount. Kiểm tra lại với server đã dừng đạt.
6. Build export bị TypeScript đọc lại `.ts` asset dưới `out/`. Bổ sung `out` vào exclude của typecheck, không bỏ kiểm tra source.
7. Hero/artwork nhỏ hoặc lệch nhịp so với ảnh 3. Đã đối chiếu ảnh chung, sửa và capture lại; xem `design-qa.md`.

## Mạng, bộ nhớ và offline

Không có API route, request body chứa ảnh, SDK AI hay analytics. Source chỉ fetch ảnh mẫu tĩnh; Next tải HTML/JS/CSS/font và các chunk worker cùng origin. Log máy chủ tĩnh của phiên kiểm tra có các GET/HEAD tài sản; tệp người dùng được truyền bằng structured clone `File` tới Worker, không qua HTTP. Không có dịch vụ chuyển đổi ở phía server.

Worker được giữ sau thành công. Hủy tác vụ đang chạy hoặc worker lỗi khiến worker bị terminate, vì vậy lần sau có thể cần mạng để nạp mã lại. Chưa có service worker hay cam kết cold-start/reload offline. Ca máy chủ tắt chứng minh chuyển đổi của worker đã nạp, không chứng minh mọi tình huống offline.

Giới hạn ứng dụng được ghi trong `AGENTS.md`. Header được đọc trước giải mã; giới hạn không tương đương sandbox chống mọi decompression bomb hoặc bảo đảm không OOM. Chưa stress trên thiết bị ít RAM. Đo fidelity trên main thread ở cạnh dài tối đa 256 px là cảnh báo phụ, không là chứng nhận chất lượng.

Tổng mọi JS chunk của bản export khoảng 1,47 MB raw / 453 KB gzip theo phép nén cục bộ; đây bao gồm cả chunk worker/lazy, không phải toàn bộ được tải lúc vào trang. JSON từng asset trong `build-assets.json`. Website tĩnh nên được phục vụ với gzip/Brotli; máy chủ Python dùng cho QA không bật nén tự động.

## Tái hiện và phần cần kiểm tiếp

Chạy `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm start`. Với native E2E tiếp tục dùng Codex @Browser theo AGENTS. Mở thử các fixture được tạo trong `tests/fixtures`, rồi kiểm tra các trạng thái trong bảng trên.

Trước public launch, bổ sung native Finder drop, Safari/Firefox, iOS/Android thật, stress memory/cancellation liên tục, và benchmark logo/illustration/photo có giấy phép ở nhiều kích thước. Hiện chưa có tuyên bố phục hồi SVG gốc hoặc chuyển ảnh bất kỳ thành SVG nhỏ và giống tuyệt đối.
