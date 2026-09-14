# R&D: illustration có gradient, bóng và alpha mềm trong SVG chạy trên trình duyệt

**Khả thi có điều kiện đối với gradient và hiệu ứng thuộc mô hình đơn giản; chưa đủ bằng chứng để cam kết tự động giữ rất sát mọi illustration phức tạp.** SVG có thể biểu diễn gradient, opacity, mask và bóng blur mà không nhúng PNG/JPG. Khoảng trống lớn nằm ở thuật toán suy ra các thành phần đó từ raster, không nằm ở khả năng hiển thị cơ bản của SVG. Chưa có engine browser được kiểm chứng trong báo cáo này đáp ứng đồng thời tự động phân vùng, gradient phức tạp, alpha mềm, biên sạch và dung lượng hợp lý.

Nguồn được đối chiếu ngày 14/09/2026. Phân tích dựa trên tiêu chuẩn, bài báo, mã nguồn công khai và một phép thử browser nhỏ do nhóm thực hiện, mô tả riêng ở §3.5. Đây chưa phải benchmark sản phẩm. “Đã xác minh” dưới đây có thể là xác minh nội dung source, không đồng nghĩa đã chạy implementation.

## 1. Tách yêu cầu thành các bài toán khác nhau

| Trường hợp | Kết luận | Giới hạn cần ghi rõ |
| --- | --- | --- |
| Vùng kín có màu phẳng hoặc gradient tuyến tính/xuyên tâm | Khả thi về biểu diễn; có thuật toán và kết quả nghiên cứu | Tự động tìm đúng biên, kiểu gradient, stop và màu vẫn có sai số |
| PNG có alpha mềm, màu bên trong đơn giản | Khả thi về biểu diễn; thuật toán giữ alpha cần phát triển và đo | PNG cung cấp alpha ảnh cuối, không cung cấp alpha từng layer ban đầu |
| Bóng Gaussian của một hình đơn giản | Khả thi nếu nhận diện được hình, offset, màu, opacity và độ blur | Bóng thực tế không nhất thiết Gaussian; có thể bị cắt, biến dạng hoặc chồng nhiều bóng |
| Illustration có nhiều lớp bán trong suốt giao nhau | Có nghiên cứu layer decomposition; chưa chứng minh browser production | Phân lớp là bài toán nghịch đảo không duy nhất; mô hình sai vẫn có thể giống trên một nền |
| Mesh shading, airbrush, glow nhiều tâm, texture alpha | Có thể xấp xỉ bằng nhiều primitive | Chưa có cơ sở bảo đảm vừa rất sát vừa ít path/stop/filter |
| JPEG đã flatten trên một nền → phục hồi alpha gốc chính xác | Không thể bảo đảm với dữ liệu đó | Màu foreground và alpha đã bị trộn, chưa kể nén ảnh |

“Khả thi về biểu diễn” chỉ nghĩa tồn tại một SVG phù hợp cho một lớp ảnh. Điều này không chứng minh một thuật toán sẽ tìm được nó, tìm đúng layer gốc, hoặc chạy trong budget của điện thoại.

## 2. SVG thực sự hỗ trợ những gì?

SVG chuẩn có `linearGradient`, `radialGradient`, nhiều stop và `stop-opacity`; do đó alpha không bắt buộc phải lượng tử thành các vùng đục. Cần khai báo rõ `gradientUnits`/transform và chính sách màu. Lưu ý `stop-color="transparent"` trong mô hình SVG được định nghĩa là đen trong suốt; một fade giữ nguyên sắc màu nên dùng cùng `stop-color` và giảm `stop-opacity`, rồi kiểm tra lại renderer. [S1]

Mask có thể được tạo bằng shape/path và gradient nội bộ, không dùng raster; đây là phương án khi trường alpha và trường màu cần tham số độc lập. Phải phân biệt mask alpha với mask luminance và kiểm tra vùng mask, hệ tọa độ. MDN ghi nhận `<mask>` và `<feGaussianBlur>` được hỗ trợ rộng; tuy nhiên đó là bằng chứng API render, không phải bằng chứng engine vectorization hoặc importer của mọi phần mềm thiết kế. [S2][S3]

`feGaussianBlur`/`feOffset`/`feFlood`/`feComposite` có thể mô tả bóng bằng tham số SVG. Filter region có clipping cứng, nên vùng blur phải được mở rộng có kiểm soát. Filter SVG thường xử lý buffer ảnh lúc render; một SVG dùng filter trên path **không nhúng raster đầu vào**, nhưng cũng không phải tài liệu chỉ gồm các đường outline dùng ngay cho máy cắt. Phải công bố profile xuất hỗ trợ filter và đo chi phí render riêng. [S4]

Thống nhất ba profile kỹ thuật với báo cáo tổng hợp, không tự động hạ chất lượng giữa các profile:

- **Vector cơ bản:** shape, path, solid fill, opacity và clipPath nội bộ.
- **Vector gradient:** bổ sung linear/radial gradient và stop-opacity.
- **Vector hiệu ứng:** bổ sung mask vector và một tập filter/blend nhỏ, chỉ tham chiếu ID nội bộ; dùng cho bóng/glow sau khi có kiểm chứng.

Cả ba profile đều cấm `<image>`, `<feImage>` chứa raster, URL ngoài, script, event handler và `foreignObject`. Không dùng “mesh gradient” với PNG được rasterize rồi clip để lách điều kiện.

## 3. Đối chiếu nghiên cứu và implementation

| Hướng | Bằng chứng thật | Alpha mềm của PNG | Browser và khả năng tiếp nhận |
| --- | --- | --- | --- |
| Gradient Reconstruction, Eurographics 2025 | Paper + supplementary; tự phân vùng, solid/linear/radial nhiều stop | Công thức paper là RGB; không phải bằng chứng bảo toàn RGBA | Chưa xác định được bản browser hoặc repo engine từ các trang tác giả đã kiểm tra |
| Linear Gradient Layer Decomposition, SIGGRAPH 2023 | Paper + source C++/Python; xuất linearGradient với stop-opacity | Có phân lớp bán trong suốt, nhưng chưa kiểm chứng end-to-end PNG alpha | Reference Windows, Visual Studio, OpenCV, NLopt, autodiff, Python, Potrace executable; cần port và rà soát license |
| SGLIVE, ECCV 2024 | Paper + Apache-2.0 repo; radial gradient + optimization | Reference flatten PNG trên trắng trước khi tối ưu | Python/PyTorch/DiffVG; chưa là dependency browser |
| Photo2ClipArt, SIGGRAPH Asia 2017 | Paper, SVG kết quả và executable Windows | Nghiên cứu layer gradient bán trong suốt | Bằng chứng mô hình và kết quả chọn lọc; không có chứng minh browser trong nguồn đã kiểm tra |
| VTracer/ImageTracerJS | Baseline từ báo cáo đầu | Không được suy ra chất lượng alpha từ một thuộc tính opacity | Dùng đối chứng màu phẳng/alpha, không coi là lời giải gradient tổng quát |

### Gradient Reconstruction 2025: đúng hướng cho gradient màu, chưa giải quyết toàn bộ alpha

Paper §3.3 dùng trường màu ba kênh RGB, fit solid/linear/radial và chọn theo sai số; vùng không fit tốt quay về các mảng màu phẳng. §5 thừa nhận có shading phức tạp mà bộ primitive này không mô tả tốt với geometry hợp lý, và chưa giải quyết layer decomposition. Vì vậy kết quả không được diễn giải thành phục hồi alpha mềm hoặc layer gốc. [S5]

Supplementary mô tả biên dùng chung trước khi fit Bézier; đây là điểm đáng học để tránh hình học có khe hở. Table 1 có SSIM từ **0,6750 đến 0,9772** trên các mẫu được báo cáo. Những số này là kết quả tác giả, không phải phép đo dự án, không phải phần trăm chính xác và không phải tốc độ browser. [S6]

### Layer Decomposition 2023: có source thật nhưng đầu vào phân vùng vẫn là điều kiện

Phương pháp nhận raster **đã có segmentation**, rồi suy ra các layer linear gradient đục/bán trong suốt. Vì vậy nhãn “automatic” trong bước decomposition không có nghĩa giải quyết hoàn toàn việc tự phân vùng ảnh bất kỳ. [S7]

README công bố môi trường Windows/Visual Studio cùng các dependency native. Script xuất SVG tính màu và alpha hai endpoint, viết `linearGradient`/`stop-opacity`, và gọi `potrace.exe` để trace mask. Đây là bằng chứng đầu ra có gradient/alpha vector thật; không phải một WASM package sẵn dùng. Root repository được đọc không có file license dự án hiển thị; quyền tái phân phối cần làm rõ trước khi lấy code vào sản phẩm. Potrace và dependency bắc cầu cũng phải được rà soát riêng. [S8][S9]

### SGLIVE 2024: gradient radial có triển vọng, nhưng reference không giữ RGBA end-to-end

SGLIVE sử dụng segmentation để khởi tạo và tối ưu path gradient; implementation dùng radial gradient hai stop. Paper chỉ rõ path khởi tạo đơn giản khó hội tụ về contour phức tạp và có thể phải thêm shape để che vùng thừa. Đây là ví dụ cho thấy thêm gradient không tự giải quyết topology. [S10]

Mã nguồn `SGLIVE/main.py` đọc RGBA rồi tính `RGB × alpha + (1 − alpha)`, tức composite trên trắng. Vòng tối ưu so RGB đã composite; alpha đầu vào chỉ còn tham gia một số quyết định background. Vì vậy kể cả SVG có opacity, **pipeline reference chưa bảo toàn trường alpha mềm của PNG như một mục tiêu độc lập**. [S11]

Repo công bố Apache-2.0, yêu cầu PyTorch/torchvision và một fork DiffVG để lưu radial gradient. Việc chạy không cần model pretrained không làm PyTorch/native code tự trở thành browser-compatible. Port optimizer/rendering sang JS/WASM/WebGPU là công việc triển khai chưa được chứng minh ở đây. [S12]

### Photo2ClipArt 2017: bằng chứng lịch sử, không phải bảo đảm ảnh bất kỳ

Công trình biểu diễn clipart bằng các layer linear gradient, kể cả layer bán trong suốt, và tối ưu đồng thời độ giống với độ đơn giản. Trang tác giả cung cấp SVG kết quả và executable Windows; mục tiêu bao gồm abstraction từ studio photographs. Không nên dùng các ví dụ đó để kết luận mọi illustration có glow, shading và alpha phức tạp đều được giữ nguyên. [S13]

### 3.5. Phép thử browser nhỏ: alpha đồng nhất và alpha biến thiên khác nhau rõ rệt

Nhóm chạy sáu fixture tự tạo 256 × 256 bằng Chrome 152 ở trạng thái network offline. VTracer được gọi trực tiếp qua WASM adapter của RasterTrace, không chạy bước `binarizeAlpha` của ứng dụng đó. ImageTracerJS là đối chứng. Hai cấu hình có ngân sách khác nhau, chưa tune; không dùng phép thử để xếp hạng tốc độ hoặc chất lượng chung. Dữ liệu và giới hạn đầy đủ nằm trong [kết quả JSON](/Users/dongnt/Desktop/github/svg/docs/research/experiments/browser-probe-results.json).

| Fixture | Engine | Alpha MAE toàn ảnh, miền 0–1 | Path | Byte SVG | Native gradient |
| --- | --- | ---: | ---: | ---: | ---: |
| Vùng đỏ alpha 128/255 đồng nhất | VTracer | 0,28015 | 1 | 300 | 0 |
| Vùng đỏ alpha 128/255 đồng nhất | ImageTracerJS | 0 | 2 | 445 | 0 |
| Radial soft alpha | VTracer | 0,39701 | 3.422 | 331.064 | 0 |
| Radial soft alpha | ImageTracerJS | 0,01523 | 1.638 | 271.602 | 0 |

Ở fixture alpha đồng nhất, pixel trung tâm của VTracer đổi alpha từ 128 thành 255; ImageTracerJS tái hiện fixture đó đúng RGBA ở kích thước gốc. Ở alpha radial, cả hai xuất nhiều mảng màu/opacity thay cho radialGradient; ImageTracerJS giữ alpha gần hơn trong cấu hình thử nhưng có sai số và file lớn. Phép thử xác nhận cần tách “giữ được opacity đồng nhất” khỏi “tái dựng tốt alpha mềm”; chưa chứng minh cách sửa engine hoặc chất lượng trên ảnh thật.

## 4. Vì sao alpha phải là mục tiêu riêng?

Theo compositing source-over trên nền đục, trong không gian màu dùng cho phép tính:

`C_hiển_thị = α × C_foreground + (1 − α) × C_nền`

Đây là dạng rút gọn từ công thức W3C. Nếu chỉ biết một ảnh đã flatten thì có nhiều cặp foreground/alpha cho cùng kết quả. [S14]

**Phản ví dụ số học, không phải benchmark:** màu đen `C=0`, `α=0,75` đặt trên nền trắng `B=1` cho giá trị `0,25`. Màu xám `C=0,25`, `α=1` cũng cho `0,25`. Nhưng đặt trên nền đen, kết quả lần lượt là `0` và `0,25`. Một phép đo chỉ trên nền trắng không phát hiện được lỗi này.

PNG RGBA còn alpha ảnh cuối giúp loại bỏ sự nhập nhằng nói trên ở cấp pixel, nhưng chưa xác định các layer đã chồng để tạo ra pixel đó. Chữ, silhouette và lỗ phải được fit cùng alpha ở biên; dùng binary threshold làm mất coverage, còn fit màu từ ảnh đã flatten dễ tạo viền trắng/tối. Các nhận định này là suy luận kỹ thuật từ công thức compositing và pipeline đã đọc.

Đề xuất loss gồm sai số premultiplied RGB và alpha riêng, cộng kiểm tra composite trên nhiều nền. Với pixel alpha bằng 0, không chấm RGB ẩn như một sai số nhìn thấy. Không tự chuyển JPEG thành PNG có nền trong suốt như thể đã phục hồi alpha gốc.

## 5. Pipeline R&D đề xuất

Đây là thiết kế để kiểm nghiệm, chưa là engine đã xây hoặc kết quả đã đạt. Toàn bộ dữ liệu ở browser worker; asset JS/WASM tự host, không upload ảnh.

1. **Decode có quy ước màu/alpha rõ ràng.** Giữ RGBA ảnh nguồn, orientation và aspect ratio. Tách buffer màu đã chuẩn hóa khỏi alpha; không flatten trong preprocess. Giới hạn bộ nhớ trước khi cấp phát.
2. **Ước lượng cấu trúc ở nhiều độ phân giải.** Dùng thay đổi màu và alpha để phân biệt biên thật với vùng biến thiên mượt. Không lượng tử màu toàn ảnh trước khi tìm gradient, vì gradient sẽ bị cắt thành nhiều dải ngay từ đầu.
3. **Tạo các giả thuyết paint.** Với từng vùng, thử solid, linear/radial nhiều stop; chọn theo sai số render cộng chi phí số stop/path. Với vùng alpha phức tạp hơn màu, thử paint cộng mask vector độc lập. Dùng hình học biên chung để giảm seam.
4. **Nhận diện hiệu ứng trong phạm vi hẹp.** Chỉ thử Gaussian shadow khi alpha và hình học cho thấy phù hợp; fit offset, sigma, màu, opacity. Với glow không fit tốt, thêm primitive hoặc báo xấp xỉ; không âm thầm thay bằng ảnh nhúng.
5. **Fit và refine bằng renderer phù hợp đầu ra.** Tối ưu biên và paint trên các ROI còn sai; phạt self-intersection, mất lỗ, quá nhiều anchor/stop và diện tích filter. Cho timeout/cancel, trả kết quả hợp lệ cuối cùng kèm cảnh báo nếu chưa đạt chất lượng.
6. **Serialize và xác nhận lại.** Khóa `viewBox`, coordinate units, color interpolation, paint order, mask type và filter bounds. Render lại SVG sau sanitize/optimize, vì rounding và tối ưu markup có thể làm sai màu/biên.

Không nên bắt đầu bằng việc port toàn bộ một hệ Python/PyTorch. Nhánh dễ kiểm soát hơn là primitive fitting CPU/WASM có số tham số ít, bắt đầu ở vùng đã biết biên; chỉ thêm differentiable rendering nếu phần còn lại thực sự cần nó và benchmark cho thấy lợi ích.

## 6. Các thí nghiệm go/no-go

| Thí nghiệm | Thiết kế | Điều kiện quyết định |
| --- | --- | --- |
| A. Biểu diễn và renderer | Tự tạo SVG chuẩn: linear 2/multi-stop, radial lệch tâm/ellipse, fade một màu, mask alpha, Gaussian shadow; rasterize thành PNG rồi giữ SVG gốc làm ground truth | SVG xuất lại không raster; đúng trên Chrome/Firefox/Safari, scale 1×/2×/4×/8× và import vào editor mục tiêu. Nếu primitive render không đạt thì thu hẹp profile |
| B. Fit khi biết mask | Cấp mask đúng từ fixture để loại trừ lỗi segmentation, chỉ cho phép thuật toán thấy raster bên trong vùng | Phân biệt giới hạn fitting với segmentation; gradient đơn giản phải thắng baseline màu phẳng về số path/byte tại cùng sai số. Nếu không, chưa tích hợp bước này |
| C. Alpha trên nhiều nền | PNG alpha ramp, cạnh antialias, shadow đen/trắng/màu, nhiều lớp giao nhau; composite trên trắng, đen, xám, xanh và checkerboard | Chấm alpha riêng và ROI ở biên. Đề xuất cho fixture đơn giản: alpha MAE ≤ 1/255 và p99 ≤ 2/255; đây là ngưỡng thử nghiệm, chưa phải kết quả đạt |
| D. Tự động end-to-end | Corpus holdout có gradient nhiều vùng, JPEG artifact, đuôi glow, contour có lỗ/nét mảnh; khóa tham số trước khi đánh giá | Không mất chi tiết quan trọng. Chỉ công bố hỗ trợ nhóm ảnh đạt đồng thời chất lượng, complexity, thời gian và bộ nhớ đã định trước |
| E. Stress và riêng tư | Ảnh lớn, nhiều gradient/filter, đổi file liên tục, cancel, offline; ghi network và lỗi renderer | Không có request mang ảnh; UI hủy được; không báo thành công khi SVG lỗi hoặc vượt budget |

Metric cần gồm MAE/PSNR hoặc SSIM màu, alpha MAE/p99, sai số composite, sai số biên theo ROI, số lỗ/thành phần, path/control point/stop/filter count, byte SVG và runtime từng stage. SSIM là chỉ số cấu trúc, không phải tỷ lệ chính xác.

Chỉ so chất lượng phóng lớn với ground truth vector khi fixture có SVG gốc. Với ảnh thực chỉ có PNG/JPEG, so ở 8× với raster nội suy không chứng minh contour được phục hồi đúng; phải đánh giá vẻ ngoài và topology như một tiêu chí bổ sung.

## 7. Điều được phép đưa vào đặc tả kỹ thuật

**Có thể bổ sung ngay dưới dạng quyết định thiết kế:** engine phải giữ alpha end-to-end; có IR cho solid/linear/radial và nhiều stop; alpha có metric riêng; compare trên nhiều nền; không nhúng raster; không dùng reference SGLIVE như lời giải alpha hoàn chỉnh; native SVG filters là profile riêng cần kiểm chứng.

**Chỉ được bổ sung dưới dạng R&D có điều kiện:** tự nhận diện gradient phức tạp, phân layer bán trong suốt, khôi phục shadow/glow, refine WebGPU, và lời hứa “giữ rất sát” cho các nhóm này. Chưa có số đo để chọn preset hoặc thời hạn chắc chắn.

**Không khả thi để cam kết tổng quát:** phục hồi alpha/layer gốc chính xác từ một JPEG đã flatten; suy ra đúng toàn bộ primitive ban đầu; hoặc mọi illustration phức tạp đều vừa giống tuyệt đối vừa gọn với tài nguyên browser hữu hạn. Một số ảnh có thể có nghiệm SVG rất gọn, nhưng điều đó không biến thành bảo đảm cho đầu vào bất kỳ.

## Nguồn

- **S1.** W3C, [SVG 2 Paint Servers, gradient và stop opacity](https://www.w3.org/TR/SVG2/pservers.html), đặc biệt §14.2.4.
- **S2.** MDN, [SVG `<mask>`](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/mask).
- **S3.** MDN, [SVG `<feGaussianBlur>`](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/feGaussianBlur).
- **S4.** W3C, [Filter Effects Module Level 1](https://www.w3.org/TR/filter-effects-1/), §1, §8, Gaussian blur và color-interpolation-filters.
- **S5.** Chakraborty và cộng sự, [Image Vectorization via Gradient Reconstruction, author-hosted PDF](https://techmatt.github.io/pdfs/imageVectorizationViaGradientReconstruction.pdf), Eurographics 2025, §3.3–3.4 và §5. Trang nhà xuất bản: [DOI 10.1111/cgf.70055](https://doi.org/10.1111/cgf.70055). Author-hosted bản đọc có 11 trang; metadata danh sách tác giả khác bản publisher, nên khi trích dẫn thư mục chính thức dùng publisher.
- **S6.** Cùng nhóm tác giả, [Supplementary Gradient Reconstruction](https://techmatt.github.io/pdfs/imageVectorizationViaGradientReconstructionSupplemental.pdf), §3 và Table 1.
- **S7.** Du, Kang, Tan, Gingold, Xu, [Image vectorization and editing via linear gradient layer decomposition](https://doi.org/10.1145/3592128), ACM TOG/SIGGRAPH 2023. Trang tác giả liên kết source: [Zheng-Jun Du](https://zhengjun-du.github.io/).
- **S8.** Tác giả S7, [ImageVectorViaLayerDecomposition repository/README](https://github.com/Zhengjun-Du/ImageVectorViaLayerDecomposition).
- **S9.** Tác giả S7, [SVG exporter](https://github.com/Zhengjun-Du/ImageVectorViaLayerDecomposition/blob/main/Gen_svg_script/main.py), đặc biệt `parse_gradient_tag` và `parse_path_tag`.
- **S10.** Zhou, Zhang, Wang, [Segmentation-guided Layer-wise Image Vectorization with Gradient Fills](https://www.ecva.net/papers/eccv_2024/papers_ECCV/papers/01546.pdf), ECCV 2024, §3 và §4.8.
- **S11.** SGLIVE, [reference main.py](https://raw.githubusercontent.com/Rhacoal/SGLIVE/main/SGLIVE/main.py), các nhánh đọc RGBA, xử lý background và loss.
- **S12.** SGLIVE, [repository, môi trường và Apache-2.0](https://github.com/Rhacoal/SGLIVE).
- **S13.** Favreau, Lafarge, Bousseau, [Photo2ClipArt: Image Abstraction and Vectorization Using Layered Linear Gradients](https://www-sop.inria.fr/reves/Basilic/2017/FLB17/), SIGGRAPH Asia 2017.
- **S14.** W3C, [Compositing and Blending Level 1](https://www.w3.org/TR/compositing-1/), simple alpha compositing và source-over.

Các URL `main` là source thay đổi được; trước POC phải pin commit và giữ bản manifest/license của đúng snapshot. Không lấy quyền đọc source công khai làm bằng chứng đã có quyền phân phối source đó trong sản phẩm.

[S1]: https://www.w3.org/TR/SVG2/pservers.html
[S2]: https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/mask
[S3]: https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/feGaussianBlur
[S4]: https://www.w3.org/TR/filter-effects-1/
[S5]: https://techmatt.github.io/pdfs/imageVectorizationViaGradientReconstruction.pdf
[S6]: https://techmatt.github.io/pdfs/imageVectorizationViaGradientReconstructionSupplemental.pdf
[S7]: https://doi.org/10.1145/3592128
[S8]: https://github.com/Zhengjun-Du/ImageVectorViaLayerDecomposition
[S9]: https://github.com/Zhengjun-Du/ImageVectorViaLayerDecomposition/blob/main/Gen_svg_script/main.py
[S10]: https://www.ecva.net/papers/eccv_2024/papers_ECCV/papers/01546.pdf
[S11]: https://raw.githubusercontent.com/Rhacoal/SGLIVE/main/SGLIVE/main.py
[S12]: https://github.com/Rhacoal/SGLIVE
[S13]: https://www-sop.inria.fr/reves/Basilic/2017/FLB17/
[S14]: https://www.w3.org/TR/compositing-1/
