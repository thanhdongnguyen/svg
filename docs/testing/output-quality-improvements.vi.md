# Kiểm chứng chất lượng SVG sau cải tiến — 14/09/2026

**Trạng thái:** đã chạy lại corpus Browser sau bản sửa khe trong suốt giữa các mảng màu; 159 kiểm thử, lint, typecheck và production build đạt. Đây không phải xác nhận mọi tính năng hoặc mọi loại ảnh đã đạt chất lượng yêu cầu.

Đã kiểm tra **hình SVG thực sự được render**, bên cạnh kiểm thử chức năng. Kết quả cải thiện rõ ở illustration koi, viền cong có alpha và một số gradient alpha một màu. Tuy nhiên ảnh chụp vẫn bị posterization, gradient nhiều màu vẫn thành các mảng, và có ca alpha bị tăng sai số. Không có bằng chứng cho “độ chính xác tuyệt đối”, phục hồi SVG gốc hay SVG nhỏ cho ảnh bất kỳ.

Báo cáo [kiểm chứng triển khai ban đầu](implementation-verification.vi.md) được giữ nguyên như một mốc lịch sử. Các số đo dưới đây thuộc harness chạy worker và giải mã thực trong Browser; không thay số đo cũ bằng kết quả mới mà không ghi rõ phương pháp.

## Phương pháp và phạm vi bằng chứng

Nguồn số liệu là [browser-corpus.json](quality/browser-corpus.json): **17 ảnh × 3 preset = 51 cặp so sánh**, mỗi cặp chạy baseline và candidate. Cả 51 lượt candidate xuất được SVG hợp lệ; baseline có hai ca Maximum vượt giới hạn path, được giữ dưới dạng lỗi thay vì gán điểm sai số. Preset Fast/Balanced/Maximum lần lượt dùng 12/32/64 màu. Tập gồm ảnh koi của sản phẩm, một ảnh chụp, PNG tổng hợp và artwork sinh từ SVG có hình học tham chiếu. Đây là tập chẩn đoán, chưa phải corpus độc lập đại diện cho ảnh người dùng. Hash các artifact được ghi tại [artifact-hashes.json](quality/artifact-hashes.json).

- **Source:** cùng một tệp PNG/JPEG gửi vào cả hai worker. Với artwork tổng hợp, Browser render SVG nguồn ra PNG/JPEG trước khi chuyển đổi. Engine chỉ nhận tệp raster; không đọc SVG tham chiếu.
- **Baseline:** bundle worker được chụp trước thay đổi engine và giữ riêng. Đây là phiên bản cũ của ứng dụng, không phải một đánh giá chung về tất cả cấu hình có thể có của ImageTracerJS.
- **Candidate:** bundle từ worker ứng dụng sau cải tiến. Worker kiểm tra tệp, giải mã bằng `createImageBitmap`, vẽ vào `OffscreenCanvas` sRGB, lấy RGBA, chạy `convertRaster()` và SVGO. Harness tiếp tục chạy `sanitizeSvg()` trước khi render SVG đo sai số; cả baseline và candidate đi qua cùng sanitizer của harness.
- **Kết quả:** SVG được Browser decode rồi rasterize bằng Canvas tại đúng kích thước đo. Byte là dung lượng SVG sau optimize và sanitize. Số path/segment là metric engine; cấu hình SVGO hiện tại không giản lược hình học. Không nhúng raster để tạo kết quả giống ảnh nguồn.

Đo ở 1×/2×/4×; ảnh rộng hơn 1000 px, gồm koi 1254×1254, đo 1×/2×. Ở **1×**, tham chiếu luôn là raster đã decode. Ở **2×/4×**, fixture sinh từ SVG dùng SVG tham chiếu render trực tiếp tại kích thước lớn để phát hiện sai hình học. Các PNG có sẵn, koi và ảnh chụp chỉ có raster tham chiếu; sai số zoom lớn của chúng còn chịu ảnh hưởng bởi nội suy raster.

**Loại bỏ số đo JPEG sai tham chiếu:** lượt corpus 48 ca trước đó đã dùng SVG còn trong suốt làm tham chiếu 2×/4× cho `curves-jpeg`, trong khi JPEG đã mất alpha. Toàn bộ số đo JPEG 2×/4× của lượt đó không hợp lệ và không được dùng trong bảng hay kết luận này. Harness đã bỏ SVG tham chiếu cho JPEG và chạy lại; tệp 51 ca được liên kết ở trên dùng đúng raster JPEG đã decode ở cả 1×/2×/4×.

Ảnh chụp màn hình tại [quality/screenshots](quality/screenshots/) cho thấy ba cột **Source / baseline / candidate**. Cột Source trong gallery vẫn là raster phóng lớn, kể cả khi phép đo 2×/4× dùng SVG ground truth riêng. Không suy luận từ độ mờ của cột Source rằng SVG candidate đã phục hồi đúng đường vector gốc.

### Cách đọc metric

`compositeRMSE` đo sai số RGB sau composite lên **cả nền đen và nền trắng**, thang 0–255; thấp hơn là tốt hơn trong cùng điều kiện đo. Với `N` pixel, công thức là căn bậc hai của tổng bình phương sai số 3 kênh trên 2 nền chia cho `6N`. `alphaMAE` đo sai số alpha tuyệt đối trung bình, thang 0–1.

Các số này **không phải phần trăm chính xác**, không đo trực tiếp tính đẹp, tính chỉnh sửa dễ hay mức quan trọng của một chi tiết. Ảnh có nền lớn có thể che sai số ở vùng hình nhỏ. Vì thế phải đọc cùng ảnh render, số path, dung lượng và các ca giảm chất lượng. Các ngưỡng nội bộ của fitter cũng không thay thế phép đo Browser sau xuất SVG.

## Kết quả tiêu biểu ở kích thước gốc

Mũi tên biểu thị **baseline → candidate**. Byte ghi theo đơn vị byte, không phải KB/KiB. Các hàng AA đã bao gồm underpaint nội vùng và lần chạy Browser cuối.

| Ảnh / preset | Composite RMSE 1× | Path | Byte SVG | Diễn giải |
|---|---:|---:|---:|---|
| Koi / Balanced | 26,3349 → 8,6534 | 7.618 → 3.548 | 1.716.737 → 1.361.419 | Viền và các mảng xanh ít vụn hơn; vẫn là xấp xỉ |
| Koi / Maximum | Baseline vượt giới hạn → 8,5816 | — → 3.809 | — → 1.600.017 | Xuất được dưới giới hạn hiện tại; không quy lỗi baseline thành điểm RMSE |
| Soft alpha / Maximum | 7,7445 → 0,4581 | 2.017 → 1 | 316.461 → 489 | Native radial alpha fit loại vệt vòng vỡ trên fixture này |
| Alpha tuyến tính / Maximum | 4,7068 → 0,4470 | 2.056 → 1 | 395.741 → 453 | Native linear alpha fit được kiểm tra trên toàn bộ pixel |
| Alpha ellipse / Maximum | 3,0973 → 0,2664 | 2.983 → 1 | 494.773 → 496 | Fit ellipse lệch tâm và biến đổi affine |
| Curves / Balanced | 9,2736 → 3,5138 | 664 → 5 | 99.047 → 36.134 | Viền cong ít mảnh thừa; thêm underpaint ở nội vùng opaque |
| Curves / Maximum | 7,8727 → 2,7258 | 664 → 5 | 102.803 → 62.596 | Viền rõ hơn ở 4×; chưa đồng nghĩa khôi phục đúng curve gốc |
| Interior seam / Maximum | 12,3201 → 1,9273 | 327 → 3 | 48.319 → 10.247 | Giảm khe trắng quanh vùng màu tiếp xúc |
| Thin details / Maximum | 9,3634 → 2,0840 | 328 → 506 | 50.089 → 55.318 | Giữ dữ liệu ở 1× tốt hơn nhưng tăng độ phức tạp |
| Touching colors / Balanced | 9,6687 → 1,0020 | 310 → 353 | 42.097 → 32.538 | Ảnh nguồn opaque giữ alpha opaque, ít khe giữa mảng |
| Curves JPEG / Maximum | 26,3997 → 6,6213 | 5.654 → 278 | 820.937 → 87.385 | Giảm mảnh vụn JPEG; không suy rộng sang phục hồi nét gốc |
| Ảnh chụp / Balanced | 33,9958 → 14,2524 | 4.921 → 4.664 | 1.018.481 → 1.705.776 | Ít nhiễu mảnh hơn, vẫn thành các mảng màu và tệp lớn hơn |
| Gradient RGB hai chiều / Maximum | 9,3173 → 7,7857 | 65 → 128 | 15.058 → 38.829 | Sai số giảm nhưng vẫn lượng tử hóa thành màu phẳng |

Logo alpha đơn giản, ảnh dọc 32×160 và ảnh ngang 160×32 giữ nguyên kết quả của baseline ở cả ba preset: RMSE 1× bằng 0; logo 1 path/289 byte, hai ảnh mảng màu 2 path/366 byte. Đây là kết quả đúng trên những fixture đơn giản đó, không phải bảo đảm pixel-exact cho logo bất kỳ. Logo ở 2×/4× dùng raster nội suy làm tham chiếu nên không thể so trực tiếp với fixture có vector ground truth.

### Đối chiếu ở zoom lớn

| Ảnh / preset | RMSE 1×, cũ → mới | RMSE zoom lớn, cũ → mới | Tham chiếu ở zoom lớn |
|---|---:|---:|---|
| Koi / Balanced | 26,3349 → 8,6534 | 2×: 27,0927 → 9,8404 | Raster nội suy |
| Soft alpha / Maximum | 7,7445 → 0,4581 | 4×: 10,6910 → 0,5942 | Raster nội suy |
| Alpha tuyến tính / Maximum | 4,7068 → 0,4470 | 4×: 6,8585 → 0,0825 | SVG ground truth |
| Alpha ellipse / Maximum | 3,0973 → 0,2664 | 4×: 4,4044 → 0,0446 | SVG ground truth |
| Curves / Maximum | 7,8727 → 2,7258 | 4×: 11,6752 → 4,5837 | SVG ground truth |
| Interior seam / Maximum | 12,3201 → 1,9273 | 4×: 13,1564 → 7,5485 | Raster nội suy |
| Curves JPEG / Maximum | 26,3997 → 6,6213 | 4×: 29,0231 → 8,1100 | Raster JPEG nội suy, tham chiếu đã sửa |
| Thin details / Maximum | 9,3634 → 2,0840 | 4×: 13,5088 → 8,8488 | SVG ground truth |
| Touching colors / Balanced | 9,6687 → 1,0020 | 4×: 11,6894 → 2,7405 | SVG ground truth |
| Ảnh chụp / Balanced | 33,9958 → 14,2524 | 4×: 37,3937 → 14,8164 | Raster nội suy |

Ở fixture thin-details, RMSE mới tăng từ 2,0840 tại 1× lên 8,8488 khi so với SVG nguồn ở 4×. Điều này cho thấy khớp raster đầu vào tốt không tương đương khôi phục hình học vector ban đầu. Với native gradient, sai số 1× lớn hơn 4× có thể xuất hiện vì tham chiếu 1× đã qua vòng SVG → PNG → Canvas, còn 4× dùng trực tiếp SVG nguồn.

## Quan sát trực tiếp từ ảnh render

**Alpha mềm, Maximum, nền đen, 4×:** baseline có nhiều vệt và khe vòng quanh tâm. Candidate trong ảnh kiểm chứng đã trở lại dải chuyển mượt, không còn các vệt vỡ đó. Đây là fixture một màu phù hợp mô hình native radial; không phải minh chứng cho mọi shadow hoặc gradient.

![Alpha mềm: Source, baseline và candidate ở 4× trên nền đen](/Users/dongnt/Desktop/github/svg/docs/testing/quality/screenshots/soft-alpha-maximum-4x-black.png)

**Koi, Balanced:** baseline tạo viền trắng vụn và bề mặt rách quanh lá, vây và mảng xanh. Candidate giữ các mảng liền và gần silhouette nguồn hơn ở ảnh Fit; phép đo 2× cũng giảm sai số. Những đường vảy, râu và đầu nhọn vẫn cần xem khi dùng artwork lớn.

![Koi: Source, baseline và candidate với preset Balanced](/Users/dongnt/Desktop/github/svg/docs/testing/quality/screenshots/koi-balanced-fit.png)

**Ảnh chụp, Balanced:** candidate ít mảnh nhiễu hơn baseline, nhưng vùng mặt, tóc, nền và áo đã biến thành các mảng màu phẳng. Không thể gọi đây là ảnh chụp giữ nguyên chất lượng. PNG nguồn của ca này là 791.555 byte; SVG mới 1.705.776 byte, lớn hơn cả PNG nguồn lẫn SVG baseline.

![Ảnh chụp: Source, baseline và candidate với preset Balanced](/Users/dongnt/Desktop/github/svg/docs/testing/quality/screenshots/photo-balanced-fit.png)

**Curves, Maximum, 4×:** ảnh chụp sau bản seam fix cho thấy candidate giảm mảnh thừa và các đoạn gãy lớn của baseline. Vẫn thấy dao động nhỏ ở viền; đây là đường suy ra từ raster có antialias.

![Viền cong ở 4× sau bản sửa seam nội vùng](/Users/dongnt/Desktop/github/svg/docs/testing/quality/screenshots/curves-maximum-4x.png)

**Interior seam, Maximum, 4×:** baseline có đường trắng giữa hình thoi đỏ và mảng tròn xanh; candidate trong screenshot đã loại khe trắng đó và làm silhouette ngoài liền hơn. Underpaint chỉ nằm trong vùng opaque đã co biên, không phủ nền trắng lên toàn canvas. Fixture vẫn chỉ có raster tham chiếu ở zoom lớn; không dùng RMSE 4× của nó làm bằng chứng khôi phục hình học gốc.

![Mảng màu tiếp xúc ở 4×: Source, baseline và candidate](/Users/dongnt/Desktop/github/svg/docs/testing/quality/screenshots/interior-seam-maximum-4x.png)

## Các ca giảm chất lượng và giới hạn còn lại

Không loại các ca này khỏi đánh giá vì candidate có ít path hoặc alphaMAE thấp hơn.

| Ca | Sai số baseline → candidate | Hệ quả |
|---|---|---|
| Alpha chồng lớp / Fast | RMSE 1×: 2,3293 → 2,6701; 4×: 3,2607 → 3,7543 | Sai số màu sau composite tăng dù alphaMAE 1× giảm 0,002605 → 0,001552 |
| Alpha chồng lớp / Maximum | RMSE 1×: 3,2068 → 3,2526; 4×: 3,7993 → 3,8364 | Tăng nhẹ; không thể tuyên bố preset này được cải thiện trên mọi ảnh alpha |
| Bóng Gaussian / Maximum | RMSE 1×: 4,8421 → 4,8706; 2×: 6,2652 → 6,2722 | Tăng nhẹ ở 1×/2×; 4× giảm 7,0187 → 6,7737, nên kết luận phụ thuộc thước đo và zoom |
| Radial gradient nhiều màu / Balanced | RMSE 1× giảm 11,8692 → 10,4495 nhưng alphaMAE tăng 0,026152 → 0,027514 | Sai số RGB trung bình giảm không bảo đảm alpha tốt hơn |
| Ảnh chụp / Fast | RMSE 1× giảm 29,9910 → 18,3861 nhưng tỉ lệ pixel có sai số kênh >24 tăng 0,2396 → 0,2811 | Metric RMSE và mức phân bố sai số không luôn cùng chiều |

**Gradient nhiều màu chưa được dựng lại thành native gradient tổng quát.** Fixture `radial-gradient` là một vòng tròn với nhiều màu, khác hẳn fixture `soft-alpha` một màu. Candidate Fast/Balanced/Maximum có RMSE 1× lần lượt 7,7576 / 10,4495 / 11,1660; nhiều màu hơn ở ca này còn tăng sai số. Maximum có 706 path/182.294 byte. Các dải màu, topology giữa mảng và alpha tại viền vẫn là xấp xỉ.

**Ảnh chụp chưa đạt photorealistic.** Maximum của ảnh chụp trước đây vượt giới hạn path; candidate xuất được 5.297 path/2.024.685 byte với RMSE 1× 13,5689. Việc xuất thành công trong budget không có nghĩa màu sắc, texture hoặc khuôn mặt được giữ chính xác, và không bảo đảm SVG nhỏ hơn JPG/PNG.

**Tệp nhỏ hơn không phải tiêu chí duy nhất.** Koi Fast giảm RMSE 22,8295 → 9,3424 nhưng tăng từ 400.782 lên 845.821 byte. Thin-details Fast tăng từ 51 lên 506 path. Curves Fast có thêm underpaint, tăng từ 3.579 lên 27.999 byte dù số path giảm 18 → 5. Gradient RGB Maximum tăng dung lượng hơn gấp đôi. Chi phí hình học và độ giống cần được chọn cùng nhau.

**Cumulative alpha vẫn có thể lộ dải.** Nhiều mặt nạ alpha chồng nhau tránh những vòng mảnh dễ vỡ, nhưng số mức hữu hạn và phép composite 8-bit của renderer tạo sai số riêng. Native fit chỉ giải quyết ảnh thuộc mô hình đã xác minh; không tự động giải quyết bóng phức tạp, nhiều lớp bán trong suốt hay texture.

## Thay đổi kỹ thuật đã kiểm tra trong source

| Vấn đề | Thay đổi | Ranh giới |
|---|---|---|
| Lỗ và contour không cùng độ chính xác tọa độ | Serializer dùng cùng precision cho contour ngoài và lỗ | Không suy ra hình học thật ngoài độ phân giải raster |
| RGB nhiễu khi alpha thấp làm bùng số vùng | Lượng tử hóa xác định theo khoảng cách premultiplied/composite; giữ alpha 0/255 và bảng RGBA nhỏ chính xác | Vẫn lượng tử hóa khi số màu vượt budget; không chạy blur để che chi tiết |
| Artwork opaque nhiều màu bị vụn/khe | VTracer WASM kết hợp stacked underpaint và cutout; map về palette; kiểm tra thiếu màu để thử lại cấu hình phù hợp | Kiểm tra phân bố màu không chứng minh các màu nằm đúng vị trí |
| Alpha một màu liên tục | Thử fit native linear hoặc radial ellipse, kiểm tra mọi pixel; không phù hợp thì dùng nhánh khác | Chỉ những mô hình hẹp vượt kiểm tra mới được chấp nhận |
| Alpha một màu không khớp native model | Trace mặt nạ tích lũy với tối đa 12/24/32 mức theo preset và budget màu | Không loại hết banding hoặc sai số composite |
| Artwork phẳng trong suốt có viền AA | Suy ra tối đa 8 màu, kiểm tra màu từng pixel và viền alpha hẹp, nội suy coverage rồi trace mask BW; tối đa 2×/4×/8×, 4.194.304 pixel nội bộ | Từ chối vùng bán trong suốt rộng, gradient/shadow và chi tiết màu không khớp; dưới 2× chuyển sang nhánh khác |
| Khe alpha giữa mảng màu của nhánh AA | Thêm underpaint chỉ ở vùng alpha=255 co vào một pixel theo lân cận 3×3, dùng màu có sẵn; tái sử dụng buffer | Chỉ áp dụng khi có nhiều màu; tính cả underpaint vào giới hạn path/segment/byte; không phải phục hồi lớp gốc |
| Xuất native gradient an toàn | SVG profile cho một gradient nội bộ `alpha-gradient`, hai stop và path tham chiếu đúng ID; kiểm tra trước/sau DOMPurify | Không mở quyền cho `href`, URL ngoài, `<image>`, filter, mask hay SVG tùy ý |

Native fit kiểm tra alphaMAE ≤0,75/255, sai số alpha lớn nhất ≤1,5/255, compositeRMSE ≤0,8 và sai số kênh composite lớn nhất ≤2 trên dữ liệu raster. Đây là **độ khớp mô hình trước khi Browser render SVG**, không phải cam kết kết quả xuất luôn dưới các ngưỡng đó. Fit không nhận tên fixture, tọa độ dựng sẵn hay SVG gốc.

VTracer được pin ở `@visioncortex/vtracer` 1.0.0-alpha.4, license MIT OR Apache-2.0; ImageTracerJS 1.2.6 (Unlicense) còn dùng cho các nhánh phù hợp và fallback. VTracer vẫn là bản alpha, ImageTracerJS là engine cũ. SVGO 4.1.0 chỉ bỏ metadata/thuộc tính không ảnh hưởng hình học theo cấu hình hiện tại; DOMPurify 3.4.15 đi cùng allowlist kiểm tra cấu trúc. Provenance và license VTracer nằm trong [thư mục vendor](../../src/lib/svg/vendor/README.md).

WASM 668.378 byte được fetch như tài sản tĩnh cùng origin tại `/engines/vtracer-1.0.0-alpha.4.wasm`; RGBA không gửi lên server. Fetch mã xử lý cục bộ không phải gọi API chuyển đổi. Mạng vẫn cần để tải website và engine khi chưa có sẵn; không suy rộng kiểm tra worker đã nạp thành cam kết cold-start offline.

## Kiểm thử và trạng thái chốt

Trạng thái source cuối của đợt này đã đạt **159 kiểm thử tự động, lint, typecheck và production build**. Corpus Browser được chạy lại sau bản sửa AA, cho 51/51 candidate thành công. Đây là kiểm chứng các ca cụ thể; không phải xác nhận mọi feature đã E2E hoàn tất hoặc đạt chất lượng trên mọi ảnh.

Các kiểm thử nhắm vào lượng tử hóa/alpha, từ chối sai mô hình gradient, giữ chi tiết màu, uniform alpha, topology/mask, giới hạn output và SVG sanitizer. Bộ test không thay thế quan sát ảnh render thật. Các cặp so sánh và screenshot trong báo cáo được chạy bằng Codex @Browser; thử nghiệm Node/Sharp dùng trong chẩn đoán không được dùng làm số liệu fidelity cuối ở đây.

Trong website thật, ca native alpha Maximum đã tải SVG 489 byte/1 path, parse được `viewBox="0 0 128 128"`; koi Maximum tải SVG 1.600.017 byte/3.809 path/63 màu, `viewBox="0 0 1254 1254"`. Hai kết quả không nhúng `<image>`. Luồng hủy rồi chuyển lại với engine WASM cũng đã chạy thành công. Đây là bằng chứng bổ sung cho harness, không phải mọi thao tác E2E của sản phẩm.

Nhánh logo AA cũng đã đi qua luồng chọn tệp → chuyển đổi → xem SVG → tải trên bản production: `interior-seam.png`, Maximum, SVG 10.247 byte/3 path/2 màu, `viewBox="0 0 128 128"`, chỉ có `svg` và `path`. Đã xem hai pane desktop trên nền đen ở mức zoom UI 150%; mức này là zoom của khung xem, khác phép đo pixel 1×/2×/4× trong lab. [Ảnh E2E desktop](quality/screenshots/app-aa-desktop.png).

**Worker đã nạp vẫn chạy khi máy chủ tắt:** trên bản production ở cổng QA 4176, đã chuyển logo AA để tải WASM, dừng máy chủ tĩnh của phiên QA, xác nhận cổng không còn listener, rồi chọn một tệp khác `gradient.png`. Worker hiện có tạo thành công SVG 64 path/32 màu/26,2 KiB. [Bằng chứng trạng thái](quality/offline-production.txt), [ảnh render](quality/screenshots/offline-gradient.png). Điều này kiểm chứng xử lý cục bộ sau khi nạp engine; không chứng minh cold-start/reload offline. Ảnh render cũng cho thấy gradient RGB vẫn bị chia mảng rõ, không phải native gradient tổng quát.

Các khoảng trống Safari/Firefox, thiết bị ít RAM, điện thoại thật và native Finder drag-and-drop của báo cáo cũ vẫn chưa được đóng bằng đợt này. Cần corpus holdout có giấy phép, nhiều kích thước và nguồn ảnh thực tế để kiểm tra tính tổng quát; không dùng các fixture đang được tối ưu làm bảo đảm chất lượng cho mọi người dùng.

## Tái hiện kiểm tra

Tạo lab ở thư mục tạm, chụp baseline **trước thay đổi muốn so sánh**:

```bash
node --import tsx scripts/generate-fixtures.mts --fixtures-only
node --import tsx scripts/prepare-quality-lab.mts --directory /tmp/svg-quality-lab-review --snapshot
python3 -m http.server 4175 --bind 127.0.0.1 --directory /tmp/svg-quality-lab-review
```

Sau thay đổi engine, tạo lại candidate mà không ghi đè baseline:

```bash
node --import tsx scripts/prepare-quality-lab.mts --directory /tmp/svg-quality-lab-review
```

Mở `http://127.0.0.1:4175` bằng Codex @Browser, reload, chạy **Run corpus** và **Compare selected**, đổi nền trắng/đen, xem 1×/2×/4×. Lab mặc định có fixture `interior-seam` sinh được; `--seam "/path/to/interior-seam.png"` chỉ thay fixture này. Cờ `--photo "/path/to/licensed-photo.png"` chép thêm một ảnh chụp cục bộ có quyền sử dụng để có 17 ảnh/51 cặp như đợt đo này; không truyền cờ thì corpus không có hàng ảnh chụp. Cần truyền lại cờ ảnh chụp và cờ thay fixture nếu muốn giữ cùng dữ liệu khi tạo lại lab.

`--snapshot` chỉ sao worker hiện tại làm baseline. Chạy lệnh đó hôm nay không tái tạo baseline lịch sử nếu không còn bản bundle/source cũ. Giữ bundle, ảnh riêng và thư mục lab ngoài Git; bảo quản JSON đã xác định nguồn, phương pháp và screenshot dùng trong báo cáo. Không dùng trang `prepare-browser-qa.mts` cũ, vốn nhận RGBA decode bằng Node, để thay bằng chứng worker/browser decode của đợt này.
