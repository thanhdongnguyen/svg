# Thí nghiệm browser phục vụ nghiên cứu

Đây là các phép thử chẩn đoán nhỏ, không phải bộ benchmark sản phẩm. Không có ảnh người dùng, dependency sản phẩm mới hoặc binary bên thứ ba được đưa vào repository.

## Phạm vi đã chạy

- Chrome 152 trên macOS, UA và cấu hình ghi trong JSON; đây là một môi trường, chưa kiểm tra Safari/Firefox/mobile.
- Hai Dedicated Worker, VTracer qua adapter WASM của RasterTrace và ImageTracerJS 1.2.6.
- Tải xong module và WASM từ localhost, dùng Playwright `context.setOffline(true)`, sau đó mới tạo và encode sáu fixture mới thành PNG/JPEG, decode trong worker, trace và render lại SVG.
- Sáu fixture 256 × 256: mảng màu phẳng, JPEG của mảng màu, nét mảnh/lỗ, gradient tuyến tính, alpha đồng nhất và alpha radial.
- Chạy lại VTracer ở `stacked` sau lần `cutout` để kiểm tra độ nhạy cấu hình. Đây không phải phép tìm preset tối ưu. ImageTracerJS chạy cùng cấu hình trong hai lần.
- Ảnh hỏng bị browser decoder từ chối; không diễn giải đây là kiểm thử lỗi nội bộ của WASM.

## Tái lập

1. Đọc URL và SHA-256 trong [engine-artifact-sizes.json](/Users/dongnt/Desktop/github/svg/docs/research/engine-artifact-sizes.json). Tải các artifact `rastertrace_wasm`, `rastertrace_glue`, `imagetracer_source` vào thư mục tạm; không thực thi nội dung trước khi kiểm tra hash.
2. Đặt tên tương ứng `rastertrace_wasm_bg.wasm`, `rastertrace_wasm.js`, `imagetracer.js`; sao chép [browser-probe.html](/Users/dongnt/Desktop/github/svg/docs/research/experiments/browser-probe.html) thành `index.html` cùng thư mục. URL nhánh có thể đã đổi; nếu hash không khớp, phải ghi snapshot mới thay vì gọi đó là tái lập bản cũ.
3. Chạy server tĩnh localhost trỏ đúng thư mục tạm, mở trang, bấm **Load local engines**. Chỉ sau khi cả hai worker báo sẵn sàng mới bật Offline trong browser/automation.
4. Bấm **Run fixtures**. Bảng hiển thị ảnh nguồn và SVG; JSON nằm tại `window.probeResults` và phần kết quả trên trang. Muốn thử `stacked`, tải lại khi online với query `?hierarchy=stacked`, rồi thực hiện lại bước offline.
5. Lưu JSON và ghi phiên bản browser. Đóng trang/server sau khi xong. Thí nghiệm không có service worker; chưa kiểm thử mở lại website khi offline hoặc vòng đời ứng dụng thật.

## Cách đọc số liệu

Alpha MAE tính trên toàn ảnh trong miền 0–1. RMSE màu tính trên RGB đã composite nền trắng/đen trong miền 0–255; phép thử không tuyến tính hóa ánh sáng và chỉ dùng chúng để chẩn đoán. Pixel equality được so byte RGBA ở kích thước gốc; không phải bằng chứng khôi phục đường/layer gốc hoặc chất lượng mọi mức zoom.

Hai engine có ngân sách/tham số khác nhau. Không dùng bảng này để xếp hạng công bằng, dự báo mobile hoặc đưa ra tốc độ sản phẩm. `traceMsSingleObservation` chỉ là một quan sát thời gian lời gọi trace, không có warmup/lặp thống kê và không bao gồm tải engine, decode, optimize hoặc render. Các giá trị này được lưu để truy vết nhưng không dùng làm SLO.

Kết quả:

- [Cutout và baseline ImageTracerJS](/Users/dongnt/Desktop/github/svg/docs/research/experiments/browser-probe-results.json).
- [Stacked và baseline ImageTracerJS](/Users/dongnt/Desktop/github/svg/docs/research/experiments/browser-probe-stacked-results.json).
- [Phản ví dụ hai SVG khác nguồn nhưng cùng raster](/Users/dongnt/Desktop/github/svg/docs/research/evidence/original-svg-collision.html), [kết quả](/Users/dongnt/Desktop/github/svg/docs/research/evidence/original-svg-collision-result.json).

VTracer trong cấu hình thử có lỗi lớn trên gradient xám tuyến tính; chuyển `cutout` sang `stacked` vẫn còn lỗi. Chưa xác định nguyên nhân ở core, tham số hay adapter; không được tổng quát hóa thành mọi phiên bản/mọi cấu hình đều cho lỗi đó. Các lỗi alpha được hỗ trợ thêm bởi audit serializer, nhưng vẫn chỉ mô tả chính xác artifact đã đo.
