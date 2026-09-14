# R&D: logo và illustration nhiều mảng màu rõ

Ngày đối chiếu: **14/09/2026**. Phạm vi: PNG/JPG/JPEG → SVG gồm vector thật, xử lý trên thiết bị, không API chuyển đổi. Đây là nhánh nghiên cứu độc lập; không thay đổi app hay thêm dependency.

**Kết luận: khả thi với độ trung thực cao trên tập đầu vào có giới hạn, và là nhóm nên triển khai trước. Chưa có căn cứ cam kết mọi logo hoặc mọi illustration phẳng giống tuyệt đối.** Các điểm quyết định chất lượng là hình học biên, topology, nét mảnh, chữ nhỏ, palette và cách diễn giải anti-alias; chọn một engine chưa giải quyết hết chúng.

Ký hiệu bằng chứng trong tài liệu:

- **[Đã đo]**: số liệu từ probe browser trong repository, do agent điều phối chạy.
- **[Nguồn]**: xác minh được trong tài liệu hoặc mã nguồn upstream.
- **[Suy luận]**: hệ quả kỹ thuật của bằng chứng; không phải benchmark.
- **[Đề xuất/chưa kiểm chứng]**: thiết kế hoặc ngưỡng cần thử nghiệm trước khi thành cam kết sản phẩm.

## 1. “Logo/màu phẳng” cần tách thành các lớp đầu vào

| Đầu vào | Quyết định | Điểm chưa bảo đảm |
| --- | --- | --- |
| PNG đủ lớn, vùng màu đục rõ, biên đơn giản | GO cho POC | Vẫn kiểm tra góc, tỷ lệ và màu |
| PNG phẳng nhiều vùng kề nhau, nhiều lỗ, đường nhỏ | GO có gate topology | Có thể dính/mất lỗ hoặc nứt biên khi fit và render |
| Logo đục trên nền trong suốt, biên có anti-alias | GO có gate alpha/biên | Alpha ở biên cần phân biệt với opacity của cả đối tượng |
| Logo có chữ nhỏ, dấu tiếng Việt hoặc nét chỉ 1–2 pixel | Hỗ trợ có điều kiện | Một pixel có thể quyết định dấu/chấm/nét nối; không tự xóa như nhiễu |
| JPEG logo | GO cho bản xấp xỉ ảnh đã giải mã | JPEG thông dụng đã thêm sai lệch nén; bám sát JPEG có thể giữ cả nhiễu |
| PNG cực nhỏ hoặc JPEG mờ/nén mạnh | Không cam kết độ trung thực cao | Tracing không bổ sung được chứng cứ hình học đã mất |
| Logo “đơn giản” nhưng có glow, bóng hoặc phần bán trong suốt | Chuyển sang nhánh alpha/gradient | Số đối tượng ít không làm bài toán alpha đơn giản |

**[Nguồn]** Potrace mô tả rõ bài toán tracing có nhiều đường vector khả dĩ cho cùng bitmap, và việc tìm góc phải cân bằng giữa quá góc cạnh và quá tròn. Tác giả cũng nêu giới hạn khi bitmap font quá nhỏ. Điều này hỗ trợ kết luận về giới hạn nguồn, không chứng minh chất lượng các bản port hiện tại. [Bài báo thuật toán Potrace, 2003](https://potrace.sourceforge.net/potrace.pdf).

**[Nguồn + suy luận]** JPEG DCT thông dụng có mất mát. Với logo JPEG cần phân biệt hai mục tiêu: giống **JPEG đã giải mã**, hoặc giống **logo trước nén**. Mục tiêu thứ hai phải suy đoán nếu không có tài liệu thiết kế/ảnh gốc. Không mở rộng nhận định này thành “mọi biến thể JPEG đều lossy”. [ITU-T T.81, mục 4.2–4.3](https://www.w3.org/Graphics/JPEG/itu-t81.pdf).

## 2. Bằng chứng browser hiện có nói được gì?

**[Đã đo]** Probe dùng Chrome 152 trên macOS, 6 fixture tổng hợp 256 × 256, engine chạy trong worker sau khi tải tài nguyên, `networkOnlineAtRun: false`. Ba fixture liên quan nhất được trích dưới đây. Cấu hình hai engine không cân bằng về ngân sách màu/đường; không dùng bảng để xếp hạng tổng quát.

| Fixture | Engine/chế độ | Path | Byte SVG | Pixel RGBA khác / 65.536 | RMSE nền trắng / đen |
| --- | --- | ---: | ---: | ---: | ---: |
| Ba mảng chữ nhật đục PNG | VTracer cutout | 3 | 673 | 0 | 0 / 0 |
| Ba mảng chữ nhật đục PNG | VTracer stacked | 3 | 671 | 0 | 0 / 0 |
| Ba mảng chữ nhật đục PNG | ImageTracerJS | 3 | 581 | 0 | 0 / 0 |
| Cùng hình, xuất JPEG quality 0,8 bằng canvas | VTracer cutout | 33 | 2.765 | 4 | 0,007 / 0,487 |
| Cùng hình, xuất JPEG quality 0,8 bằng canvas | VTracer stacked | 15 | 3.009 | 36 | 0,186 / 0,186 |
| Cùng hình, xuất JPEG quality 0,8 bằng canvas | ImageTracerJS | 9 | 1.575 | 1.916 | 1,466 / 7,939 |
| Vòng có lỗ + đường 1/2 px + ô nhỏ | VTracer cutout | 278 | 23.936 | 397 | 3,767 / 3,917 |
| Vòng có lỗ + đường 1/2 px + ô nhỏ | VTracer stacked | 50 | 5.066 | 767 | 8,223 / 8,223 |
| Vòng có lỗ + đường 1/2 px + ô nhỏ | ImageTracerJS | 138 | 19.190 | 1.222 | 10,024 / 14,007 |

Bằng chứng và phương pháp: [probe source](/Users/dongnt/Desktop/github/svg/docs/research/experiments/browser-probe.html), [cutout results](/Users/dongnt/Desktop/github/svg/docs/research/experiments/browser-probe-results.json), [stacked results](/Users/dongnt/Desktop/github/svg/docs/research/experiments/browser-probe-stacked-results.json). RMSE ở thang kênh 0–255, tính từ dữ liệu canvas composite, chưa chuyển sang linear light. Số byte chưa tối ưu/gzip. Số path không phải số segment/anchor.

**[Suy luận]** Kết quả 0 pixel khác chỉ chứng minh một trường hợp cụ thể: ba mảng chữ nhật căn theo lưới có thể được biểu diễn rất gọn và render trùng mẫu tại 256 × 256 trong renderer này. Không phải chứng minh “logo lossless”. Với fixture nét/lỗ, tăng số path có thể giảm sai khác nhưng làm SVG phức tạp hơn; một điểm toàn ảnh chưa cho biết nét 1 px có đứt hay lỗ còn đúng hình.

**[Đã đo]** Cả ba nhóm SVG không nhúng raster. VTracer adapter trong probe chưa xuất `viewBox`; vì vậy chưa vượt gate output sản phẩm dù hình có thể render đúng. Đây là thiếu sót cần sửa ở adapter, không phải lý do bác bỏ browser-only.

**Chưa đo:** logo thực có giấy phép sử dụng; 8/32/128 vùng màu; biên xiên và góc nhọn có ground truth; topology theo từng đối tượng; chất lượng tại nhiều mức zoom; các trình duyệt/mobile; thông số engine có ngân sách tương đương. Không có số phần trăm “chính xác logo” từ probe này.

## 3. So sánh engine dành cho nhánh logo

| Lựa chọn | Bằng chứng và độ sẵn sàng | Vai trò đề xuất | Hạn chế cần xử lý |
| --- | --- | --- | --- |
| VTracer 1.0.0-alpha.4 | Rust core, có adapter WASM đã chạy trong probe; package upstream được mô tả cho Node | Ứng viên đa màu chính | Adapter browser riêng, pin artifact; thiếu `viewBox`/soft alpha trong đầu ra đã đo; alpha release |
| ImageTracerJS 1.2.6 | JS trực tiếp nhận ImageData; đã chạy trong probe | Baseline đa màu để đối chiếu | Palette/fitting có thể mất chi tiết; mã hiện có không thay thế được benchmark |
| Potrace / esm-potrace-wasm | Core binary; bản ESM/WASM upstream liệt kê dùng browser | Nhánh monochrome do người dùng chọn | Chưa đo trong probe; cần threshold; không coi posterization nhiều lượt là multicolor topology hoàn chỉnh |
| Img2Num | Core C++ và browser WASM/ESM được dự án cung cấp | Challenger nên thêm vào vòng benchmark | Chưa chạy trong probe này; lợi thế riêng cho logo chưa được chứng minh |

**[Nguồn]** VTracer cung cấp `pixel`, `polygon`, `spline`; nhánh 1.0 dùng biên dùng chung cho cutout. Release ghi thêm sửa lỗi spline ở nét mảnh và đơn giản hóa đường giữ junction/corner. Những cải tiến này làm bản mới đáng thử, nhưng mô tả “seam-free” của upstream không phải chứng nhận mọi rasterizer/fixture. [VTracer releases](https://github.com/visioncortex/vtracer/releases).

**[Nguồn]** Cấu hình đã pin phân biệt rõ `filter_speckle` là chiều dài, ngưỡng diện tích bằng bình phương; `color_precision` là bit/kênh, không phải số màu; `simplify` là tolerance px cho spline. Vì thế không ánh xạ các preset bằng cách sao chép cùng một con số giữa engine. [VTracer alpha.4 config](https://raw.githubusercontent.com/visioncortex/vtracer/1.0.0-alpha.4/crates/vtracer/src/config.rs).

**[Nguồn]** VTracer có palette cố định theo khoảng cách OKLab và lượng tử hóa tự động bằng median cut có trọng số diện tích. **[Đề xuất]** Khi có mã màu thương hiệu xác nhận từ người dùng, dùng palette đó; không tự coi palette suy ra từ JPEG là màu thương hiệu gốc. [VTracer alpha.4 color fitting](https://raw.githubusercontent.com/visioncortex/vtracer/1.0.0-alpha.4/crates/vtracer/src/colorfit.rs).

**[Nguồn]** ImageTracerJS có palette RGBA tùy chọn, `rightangleenhance`, tolerance đường thẳng/quadratic, `pathomit` theo độ dài đường edge-node. Mặc định `strokewidth: 1` và `viewbox: false` cần được đặt lại cho baseline giữ biên. Mã quản lý lỗ và ghi subpath đảo chiều; việc có nhánh code này chưa chứng minh không lỗi với lỗ lồng nhau. [Options](https://raw.githubusercontent.com/jankovicsandras/imagetracerjs/master/options.md), [ImageTracerJS source](https://raw.githubusercontent.com/jankovicsandras/imagetracerjs/master/imagetracer_v1.2.6.js).

**[Nguồn]** Img2Num có pipeline lượng tử hóa, xử lý contour và xuất đường Bézier theo mã nguồn được pin. Phương pháp này là một biến thể đáng so, không chứng minh logo sắc nét hơn VTracer. [Pipeline đã pin](https://github.com/Ryan-Millard/Img2Num/blob/27eda01d7c52b200114f95a666ff134c4bb5fb67/core/src/internal/image_to_svg.cpp), [SVG serializer](https://github.com/Ryan-Millard/Img2Num/blob/27eda01d7c52b200114f95a666ff134c4bb5fb67/core/src/internal/labels_to_svg.cpp). Gói JS 0.4.2 có browser ESM với `.wasm` tách riêng; bản 0.4.0 từng lỗi đường dẫn WASM trong bundler. Cần kiểm tra artifact phát hành thực tế và tự đặt worker. [Thông báo JS 0.4.2 ngày 19/08/2026](https://img2num.dev/blog/img2num_js_0_4_2/).

**[Nguồn]** License cần đối chiếu đúng core lẫn wrapper: VTracer core `MIT OR Apache-2.0`; ImageTracerJS Unlicense; Potrace upstream GPL-2.0-or-later; Img2Num hiện công bố core MIT, nhưng docs/example/config có phần AGPLv3 sau tái cấu trúc. Đây là dữ liệu lựa chọn dependency, chưa phải kết luận pháp lý cho một cách phân phối cụ thể. [VTracer manifest](https://raw.githubusercontent.com/visioncortex/vtracer/1.0.0-alpha.4/crates/vtracer/Cargo.toml), [ImageTracer license](https://raw.githubusercontent.com/jankovicsandras/imagetracerjs/master/LICENSE), [Potrace upstream](https://potrace.sourceforge.net/), [esm-potrace-wasm](https://github.com/tomayac/esm-potrace-wasm), [Img2Num repository](https://github.com/Ryan-Millard/Img2Num).

## 4. Các vấn đề kỹ thuật cần bổ sung vào thiết kế

### 4.1 Alpha ở biên không tự động có nghĩa là vật thể bán trong suốt

**[Suy luận]** Một pixel đỏ alpha 0,5 có thể là vật thể đỏ đục chỉ phủ một phần pixel, hoặc vật thể đỏ bán trong suốt phủ cả pixel. Mẫu đó không đủ để phân biệt hai mô hình. Với logo đục có viền anti-alias, mục tiêu tốt thường là fit một đường hình học mượt rồi để renderer tạo độ phủ; trace mỗi mức alpha thành một lớp không tự động phục hồi biên gốc.

**[Nguồn]** Màu nhìn thấy phụ thuộc màu nguồn, alpha và nền qua phép compositing. Vì vậy so trên nền trắng duy nhất có thể bỏ lọt lỗi viền; cần nền đen và nền màu để kiểm tra. [W3C Compositing and Blending](https://www.w3.org/TR/compositing-1/).

**[Đề xuất/chưa kiểm chứng]** Nhánh logo nên hỗ trợ hai trạng thái nội dung: “vật thể đục/nền trong suốt” và “có opacity nội tại”; nếu chưa phân loại chắc, giữ dữ liệu RGBA, không ép alpha thành 0/255 và không flatten trắng ngầm. Bỏ qua RGB ở pixel alpha=0 khi suy màu; không để màu ẩn ngoài đối tượng tạo palette giả. Việc suy coverage theo biên phải được thử bằng fixture có ground truth, không bật theo mặc định chỉ vì file là PNG.

### 4.2 Topology phải là gate riêng

**[Nguồn]** SVG mặc định dùng `fill-rule: nonzero`; cách lỗ được tô phụ thuộc winding/subpath. `evenodd` là một quy tắc khác. [W3C SVG 2 fill-rule](https://www.w3.org/TR/SVG2/painting.html#FillRuleProperty).

**[Đề xuất/chưa kiểm chứng]** Duy trì biểu đồ kề vùng và vòng biên trước simplify; khóa junction chung. Kiểm tra lỗ lồng nhau, vùng chạm tại một điểm, nét nối mảnh và các thành phần rời như dấu chấm. Sau serialize/sanitize/optimize phải render lại: không đổi `fill-rule` hàng loạt và không gộp những path cùng màu nằm khác thứ tự vẽ chỉ để giảm byte. Với cutout, không fit hai phía của biên chung độc lập. Với stacked, kiểm tra các vùng bị che và thứ tự paint.

### 4.3 Bảo vệ chi tiết khác với “tắt mọi tối ưu”

**[Đề xuất/chưa kiểm chứng]** Đầu tiên chạy cấu hình giữ chi tiết (`speckle/pathomit` thấp hoặc 0), sau đó chỉ loại vùng nhỏ nếu không phải nét/chấm đã đánh dấu quan trọng. Vùng nhỏ có ý nghĩa như dấu tiếng Việt cần được giữ dù toàn ảnh chỉ khác rất ít pixel. Loại nhiễu JPEG là heuristic; phải cho xem kết quả vì nhiễu và chi tiết nhỏ có thể trùng hình thái.

Đặt sai số hình học trong hệ tọa độ nguồn. Tolerance 1 px trên icon 32 px rất khác 1 px trên logo 2.048 px; không dùng một tolerance cố định cho toàn bộ đầu vào. Khi cần giảm độ phân giải vì tài nguyên, công bố kích thước làm việc; không gọi đó là chế độ bảo toàn tối đa.

### 4.4 Path chỉnh sửa được chưa đồng nghĩa giữ đối tượng thiết kế

**[Suy luận]** Tracer có thể tạo đường gần hình tròn nhưng không suy ra chắc đó từng là `<circle>`; có thể trace chữ thành outline nhưng không biết font, kerning hoặc nội dung text gốc. Stroke cũng có thể trở thành outline kép. Không hứa “text vẫn sửa được như chữ” hoặc “các layer gốc được giữ”.

**[Đề xuất/chưa kiểm chứng]** Có thể thêm bước nhận diện line/circle/rectangle với ràng buộc residual và topology, chỉ chấp nhận khi không làm xấu số đo và ảnh zoom. Đây là cải thiện cấu trúc dự đoán, không phải khôi phục nguyên bản. OCR, font matching và chỉnh sửa text nằm ngoài lõi tracing đầu tiên.

## 5. Pipeline cụ thể đề xuất cho logo/màu phẳng

```text
File cục bộ
→ validate/decode và giữ RGBA gốc
→ chuẩn hóa orientation + không gian màu làm việc đã khai báo
→ chọn nhánh đa màu / monochrome theo lựa chọn người dùng
→ palette + phân vùng (nhận biết biên; xử lý nhiễu có kiểm soát)
→ lưu vùng/lỗ/quan hệ kề trước fit
→ trace và fit biên chung; bảo vệ junction, góc, nét mảnh
→ simplify theo budget hình học, giữ checkpoint trước simplify
→ serialize có width/height/viewBox
→ optimize bảo thủ + sanitize
→ render lại trên nhiều nền và đo geometry/topology/complexity
→ so sánh + SVG Blob để download
```

**[Đề xuất/chưa kiểm chứng]** Dùng VTracer WASM một luồng trong worker làm ứng viên đầu; ImageTracerJS là baseline. Với từng fixture, thử cả stacked/cutout và palette/fit budget tương đương, lấy đường Pareto “sai số–complexity–thời gian”. Không mặc định chọn SVG ít byte nhất, và không chọn engine chỉ từ RMSE toàn ảnh. Thêm Potrace vào corpus monochrome sau kiểm tra phân phối; thêm Img2Num làm challenger khi có artifact pin/hash và kiểm thử offline.

Preset `Fast/Balanced/Maximum` ánh xạ sang budget, không hứa mức chính xác. `Maximum` giữ nguồn và chi tiết hơn trong giới hạn tài nguyên; nếu vượt giới hạn thì trả lỗi/cảnh báo và cho người dùng chọn giảm, không âm thầm làm mờ. Engine dùng file JS/WASM tự host và được tải trước; mọi ảnh vẫn ở memory cục bộ.

## 6. Go/no-go tests trước khi quảng bá “logo độ trung thực cao”

Toàn bộ phần này là **[Đề xuất/chưa kiểm chứng]**. Các ngưỡng dưới là điểm xuất phát cho POC, không phải kết quả đã đạt hoặc chuẩn ngành.

### Corpus có ground truth

Tạo SVG gốc do dự án sở hữu, rồi rasterize để làm đầu vào PNG/JPEG. Giữ nguyên SVG gốc chỉ trong test oracle; engine chỉ nhận raster. Bao gồm:

- 2/8/32/128 màu; màu rất gần nhau; mảng lồng nhau; vùng tiếp xúc theo cạnh/điểm; thứ tự vẽ.
- Hình tròn/ellipse, góc 15°/30°/90°, đường cong, đường thẳng xiên, viền cong giáp vùng khác màu.
- Nét và khe 1/2/4/8 px, lỗ nhỏ, nhiều lỗ, lỗ chứa đảo; đường cắt qua junction.
- Glyph outline và chữ có dấu ở nhiều kích thước; bảo đảm dấu/chấm là chi tiết bắt buộc, không đánh giá bằng OCR đơn thuần.
- Nền trong suốt, anti-alias ở biên, các miền alpha hằng riêng, so nền trắng/đen/màu.
- Raster 32/64/256/1.024/2.048 px; portrait/landscape/square; JPEG quality nhiều mức từ cùng nguồn. Giữ riêng bộ ảnh thực có quyền sử dụng để tránh overfit hình tổng hợp.

### Gate và quyết định

| Gate | GO khi | NO-GO khi |
| --- | --- | --- |
| Vector thật và output | XML hợp lệ; không raster/external reference/script; dimensions/viewBox đúng; tải được | Bất kỳ vi phạm nào, kể cả ảnh render đúng |
| Topology chi tiết bắt buộc | Tất cả lỗ, thành phần rời và nét nối đã đánh dấu còn đúng trên corpus bắt buộc | Một lỗi làm đổi ký hiệu/chữ/logo là fail, dù điểm toàn ảnh cao |
| Biên hình học | Trên nhóm nguồn tốt, thử ngưỡng p95 khoảng cách biên ≤0,5 px và max ≤1 px ở hệ nguồn; vùng góc quan trọng xét riêng | Không vượt ngưỡng theo fixture; không gộp các trường hợp lỗi vào trung bình |
| Diện tích/silhouette | Thử IoU ≥0,995 cho đối tượng đủ lớn; đối tượng rất nhỏ dùng gate chi tiết riêng | Chỉ IoU cao nhưng lỗ/nét hỏng vẫn fail |
| Màu | Trên fixture RGB phẳng không anti-alias, màu vùng trong phải khớp sau cùng chính sách decode; chế độ palette bắt buộc nằm trong palette đã xác nhận | Màu thương hiệu tự thay đổi ngoài lựa chọn người dùng |
| Alpha/composite | Với vùng đục, không tự xuất khe trong suốt; với alpha hằng known, đo alpha riêng; không có halo trên các nền | Chỉ giống trên một nền hoặc vô tình flatten |
| Simplify/optimize | So trước–sau trên 1×/4×/16×, giữ topology và trong budget sai số đã chọn | Ít byte hơn nhưng hỏng biên/độ dày/paint order |
| Tính chỉnh sửa | Báo số path, subpath, segment và object; không chứa chuỗi hàng triệu ô pixel trá hình | Chỉ báo “SVG tạo thành công” khi output vượt giới hạn render/edit đã đo |
| Browser/no API | Decode–convert–download chạy khi chặn network sau tải asset; test trên browser/máy mục tiêu, có cancel/retry | Cần upload, tài nguyên engine chưa cache, UI treo hoặc worker chết không phục hồi |

Khoảng cách biên và IoU cần tính ở cùng hệ tọa độ, kèm scale và phương pháp rasterization; không đánh đồng pixel RGB khác nhau vì anti-alias với lỗi hình học chắc chắn. Gate 1× dùng decoded source; gate zoom trên corpus tổng hợp so với **SVG ground truth render trực tiếp ở zoom đó**, không phóng to raster nhỏ làm chân lý hình học. Với logo thật không có ground truth, review zoom chỉ đánh giá đường có hợp lý, không chứng minh phục hồi đúng đường gốc.

Không ấn định “nhỏ hơn X KB cho mọi logo” trước corpus: 128 vùng có topology phức tạp cần budget khác 3 hình chữ nhật. POC phải công bố phân bố byte/segment/memory/thời gian theo lớp nội dung và thiết bị; ngưỡng runtime/mobile chỉ chốt sau đo. Số đo một lần của probe không đủ để chọn SLA.

## 7. Nội dung nên chuyển vào thiết kế kỹ thuật tổng thể

1. **Có thể triển khai:** nhánh logo/màu phẳng, worker WASM, đa màu thật, palette có kiểm soát, biên chung, gate topology, viewBox và so sánh trước tải.
2. **Cần POC trước khi cam kết:** xử lý anti-alias/logo trong suốt, giữ nét 1–2 px, JPEG restoration, nhận dạng hình học cơ bản, tự chọn engine/preset và giới hạn mobile.
3. **Không cam kết:** khôi phục font/layer/stroke/hình học nguyên bản; logo bất kỳ giống tuyệt đối; luôn giảm dung lượng so raster; file nhỏ đồng thời giữ mọi chi tiết.
4. **Bằng chứng hiện tại đủ để tiếp tục nghiên cứu, chưa đủ production gate:** flat_blocks render trùng mẫu; fixture nét/lỗ cho thấy trade-off rõ; thiếu `viewBox` đã biết. Phải mở rộng corpus và đo topology trước khi đổi trạng thái thành “đã chứng minh chất lượng cao”.
