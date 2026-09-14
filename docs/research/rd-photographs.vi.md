# R&D chuyển ảnh chụp thành SVG trong trình duyệt

**Không khả thi nếu đặc tả bắt buộc mọi ảnh chụp đều cho SVG nhỏ, đẹp và giống tuyệt đối. Khả thi có điều kiện nếu mục tiêu là bản vector xấp xỉ, có ngân sách chi tiết và được người dùng duyệt qua so sánh.** Trình duyệt không phải nguyên nhân của giới hạn tuyệt đối: ngay cả xử lý native hay GPU máy chủ cũng không tạo ra một phép nén chính xác, nhỏ cho mọi đầu vào không giới hạn độ phức tạp.

Phạm vi: PNG/JPG/JPEG đầu vào; xử lý trên thiết bị, không API chuyển đổi; SVG tự chứa gồm hình học và paint SVG được hỗ trợ, không nhúng ảnh raster, không cần neural renderer riêng khi mở file. Nguồn được kiểm tra ngày 14/09/2026. Báo cáo chưa chạy benchmark chuyển đổi của engine; có đo byte artifact npm, được ghi riêng để không nhầm với chất lượng hay hiệu năng.

Quy ước bằng chứng: **Xác minh** là nội dung đã đối chiếu từ tiêu chuẩn, paper hoặc mã nguồn; **Suy luận** là kết luận kỹ thuật rút ra có điều kiện; **Đề xuất** là thiết kế/thí nghiệm chưa triển khai; **Chưa kiểm chứng** là điều cần đo hoặc cần artifact bổ sung.

## 1. Định nghĩa để tránh nghiệm thu sai

| Từ trong yêu cầu | Định nghĩa có thể nghiệm thu | Điều không được suy diễn |
| --- | --- | --- |
| Giống tuyệt đối | Dưới decoder, color space, renderer, viewport và nền cố định, tất cả mẫu pixel/alpha đầu ra bằng mẫu tham chiếu | SSIM cao, PSNR cao hoặc nhìn giống không phải pixel equality |
| Giống ở mọi mức zoom | Cần tham chiếu liên tục hoặc hình gốc render lại ở mỗi mức zoom | Phóng PNG lớn hơn không cung cấp đường, tóc hay texture chưa từng được lấy mẫu |
| SVG nhỏ | Giới hạn byte thực tế sau serialize/optimize, đồng thời báo byte truyền tải đã nén | Ít `<path>` có thể vẫn chứa hàng triệu segment hoặc số có nhiều chữ số |
| Có thể chỉnh sửa | Ít nhất sửa được shape/path/paint trong editor; nếu yêu cầu theo đối tượng phải đo riêng khả năng chọn, đổi màu, di chuyển đối tượng | SVG hợp lệ không tự chứng minh có layer ngữ nghĩa tốt |
| Đẹp | Đánh giá có rubric: đường ổn định, không mảnh vụn, không banding gây khó chịu, không méo chi tiết nhận dạng | “Đẹp” không có định nghĩa toán học duy nhất và có thể xung đột với giữ nguyên noise |
| Browser-only | Decode, trace, optimize và kiểm tra trên thiết bị; code/WASM/model tự host nếu dùng; kiểm thử ảnh mới khi chặn mạng | Có UI web hoặc demo trực tuyến không chứng minh tác vụ chạy local |

Đây là **đề xuất đặc tả**, không phải các chỉ số đã đạt. Với JPEG thông dụng, chuẩn so sánh phải là pixel đã giải mã theo pipeline cố định. Không dùng ảnh trước nén vốn không có trong đầu vào làm chuẩn ngầm. JPEG T.81 phân biệt các quy trình có mất mát và lossless; vì vậy không nói mọi biến thể JPEG đều mất mát. [1]

## 2. Vì sao không thể bảo đảm đồng thời “mọi ảnh + nhỏ + chính xác”

### 2.1 Lập luận đếm số biểu diễn hữu hạn

**Suy luận toán học độc lập với engine:** cố định ảnh RGB 8-bit có `n` pixel và bộ render xác định. Miền mọi bộ pixel như vậy có `2^(24n)` phần tử. Tổng số chuỗi nhị phân có độ dài tối đa `B` bit là `2^(B+1) − 1`. Một file SVG cụ thể dưới renderer cố định chỉ cho một ảnh kết quả. Nếu `B < 24n`, số chuỗi khả dụng nhỏ hơn số ảnh cần biểu diễn; luôn tồn tại đầu vào không thể biểu diễn chính xác trong ngân sách đó.

Đây là một áp dụng trực tiếp của nguyên lý pigeonhole. Thêm gradient, filter, mã nén hoặc bộ giải mã cố định dùng chung không thay đổi số lượng chuỗi hữu hạn. Nhét dữ liệu vào tọa độ có độ chính xác cực cao cũng phải trả chi phí lưu chữ số; vì vậy cần tính byte, không chỉ số đường. Nếu cho phép bộ dữ liệu/phần mềm thay đổi theo từng ảnh nhưng không tính nó vào kích thước đầu ra, phép so sánh “SVG nhỏ” đã bỏ sót dữ liệu.

**Phạm vi của chứng minh:** nó bác bỏ cam kết cho miền raster không giới hạn, không chứng minh rằng mỗi ảnh chụp đều khó nén hoặc rằng ảnh thực tế trung bình cần `24n` bit. Nếu chỉ nhận một tập ảnh có cấu trúc giới hạn, giới hạn thông tin phụ thuộc số ảnh phân biệt được trong tập đó. Với “ảnh chụp bất kỳ”, noise cảm biến, hạt phim và texture không được giới hạn trước; muốn giữ chính xác những khác biệt ấy phải có đủ thông tin mô tả chúng. Không thể lấy tính dễ nén của vài ảnh mẫu làm bảo đảm cho toàn bộ miền.

### 2.2 Raster vẫn có thể được biểu diễn bằng vector

**Suy luận xây dựng:** mỗi pixel có thể trở thành một hình chữ nhật màu, với opacity tương ứng khi cần. Trong điều kiện viewport, lấy mẫu và quản lý màu thích hợp, cách này có thể tái tạo lưới pixel ở kích thước gốc. Vì vậy phát biểu “SVG không thể biểu diễn chính xác ảnh raster” là quá mạnh và sai về nguyên lý. SVG có primitive hình chữ nhật và opacity. [2]

Nhưng đó không phải lời giải sản phẩm: có thể cần số phần tử tỷ lệ số pixel; phóng lớn cho cấu trúc ô thay vì phục hồi hình học cảnh; chỉnh một đối tượng như khuôn mặt rất khó. Chọn engine nhanh hơn chỉ giảm thời gian tạo biểu diễn đó, không tự làm nó ngắn hoặc mang ngữ nghĩa.

### 2.3 Tách những điều thực sự khả thi

| Mục tiêu | Kết luận | Lý do |
| --- | --- | --- |
| Một ảnh chụp đơn giản → bản vector nhìn gần ở một kích thước | Có thể | Ảnh có thể gần một mô hình ít vùng/gradient |
| Mọi ảnh chụp → SVG dưới một ngân sách nhỏ, sai số bằng 0 | Không thể bảo đảm trên miền không giới hạn độ phức tạp | Giới hạn thông tin và khả năng biểu diễn |
| Nhiều ảnh chụp → SVG cách điệu, nhận dạng rõ, file có budget | Khả thi có điều kiện | Chấp nhận loại texture/noise và sai số có kiểm soát |
| Ảnh chụp → gradient mesh đẹp | Có cơ sở nghiên cứu | Mesh phải có renderer/export phù hợp; chưa đồng nghĩa SVG web tự chứa |
| Ảnh chụp → neural representation ít tham số | Có cơ sở nghiên cứu | Neural texture/decoder không tự trở thành paint SVG chuẩn |
| Ảnh chụp → đối tượng hoàn chỉnh cả phần bị che | Chỉ có thể suy đoán với prior hoặc dữ liệu thêm | Không thể chứng minh phần inpaint chính là phần thật ban đầu |

## 3. Đối chiếu nghiên cứu 2024–2026

Bảng này đánh giá khả năng giải bài toán của dự án, không xếp hạng bằng cách trộn điểm số từ những dataset hoặc renderer khác nhau.

| Công trình | Điều đã xác minh từ nguồn gốc | Hệ quả cho dự án |
| --- | --- | --- |
| **SuperSVG, CVPR 2024** | Chia superpixel và dự đoán path, có refinement. Paper đánh giá nhiều ngân sách path trên ImageNet; môi trường RTX 4090 24 GB. Code hiện dùng Python/PyTorch/DiffVG, checkpoint; README khuyến nghị CUDA. [3][4] | Có SVG path thật và phù hợp làm tham chiếu offline trong phát triển. Chưa có bản browser đã kiểm chứng cho dự án; không chuyển timing GPU thành timing WASM/WebGPU |
| **Layered Image Vectorization via Semantic Simplification, CVPR 2025** | Tạo ảnh đơn giản dần bằng SDS rồi dựng layer. Repo yêu cầu PyTorch CUDA, DiffVG, SAM ViT-H và Stable Diffusion 1.5. [5][6] | Ưu tiên cấu trúc chỉnh sửa; sự đơn giản hóa không phải khôi phục chính xác texture. Port cả pipeline là một dự án riêng |
| **COVec / Clair Obscur, 2025, cập nhật 03/2026** | Tách albedo, shade và light; phụ lục B mô tả đầu ra SVG native dùng `multiply` và `plus-lighter`. Thí nghiệm chạy trên bốn NVIDIA L40S; repo dùng PyTorch/DiffVG. [7][8] | Có bằng chứng từ paper về biểu diễn SVG, không chỉ renderer riêng. Chưa chạy kiểm tra file export, blend/isolation và sự tương đương trên browser/editor; pipeline chuyển đổi browser-only vẫn chưa được chứng minh |
| **Vector Scaffolding, preprint 05/2026** | Dựng path phân cấp, thêm chi tiết theo residual, không cần learned external prior. Paper dùng Bézier Splatting, 5.000 iteration và A100; có kết quả Kodak/DIV2K với cùng ngân sách curve. [9] | Hướng refinement theo budget đáng tham khảo. Kết quả vẫn là tối ưu sai số, không lossless. Chưa xác minh được browser package/code có license dùng ngay |
| **VectorArk, CVPR 2026** | VLM dự đoán rounded polygon rồi khôi phục màu; trang tác giả ghi code chưa phát hành. Paper nêu lỗi vùng quá nhiều path dày đặc; hậu xử lý chưa giải gradients, filters và transparency effects. [10][11] | Phù hợp nghiên cứu phục hồi hình nét/mảng rõ hơn là lời giải toàn bộ ảnh chụp. Không chọn làm dependency hiện tại chỉ từ bảng điểm hoặc video |
| **AmodalSVG, preprint 04/2026** | Dùng VLM, segmentation, inpainting rồi vectorize; triển khai trên A100 với Qwen3-VL-8B, SAM ViT-H, Grounding DINO, LaMa, FLUX.1 Fill và DiffVG. Paper nêu khó khăn với vật trong suốt, bóng và che khuất đan xen. [12] | Nhắm chỉnh sửa theo đối tượng, có suy đoán phần khuất. Không chứng minh tái tạo đúng sự thật gốc; không phải pipeline browser đã sẵn sàng |
| **Monte Carlo optimization for gradient meshes, 2026** | Tối ưu mesh tam giác cong và màu, khởi đầu từ vectorization có sẵn. C++/LibTorch chạy GPU RTX 2080 SUPER; bài báo nêu dữ liệu cung cấp khi yêu cầu. [13][14] | Chứng minh mesh có hướng tối ưu, chưa chứng minh export thành SVG tương thích browser không nhúng raster. Không thay bằng ảnh texture rồi vẫn gọi là đạt yêu cầu |
| **Texture-Encapsulated Shape Parameterization, CVPR 2024; Easy-editable Image Vectorization, CVPR 2025** | Đưa mã texture/feature lên hình học rồi nội suy và giải mã; công trình 2024 dùng MLP để lấy RGB. [15][16] | Một biểu diễn liên tục có thể rất sát nhưng khác SVG paint chuẩn. Nếu cần decoder riêng, phải báo rõ là định dạng/renderer khác; chưa xác minh exporter SVG thuần vector tương đương |
| **SwiftSketch, SIGGRAPH 2025** | Tạo vector sketch từ ảnh; repository dùng PyTorch, DiffVG và checkpoint. [17] | Có ích nếu sản phẩm có chế độ phác thảo. Không dùng “under a second” của sketch làm bằng chứng cho chuyển ảnh màu photorealistic |

**Đối chiếu định lượng có kiểm soát:** bảng 1 của SuperSVG ghi SuperSVG-F với 4.000 path đạt MSE `0,0014`, SSIM `0,9028` trên đánh giá ImageNet của tác giả. Đây là số công bố, chưa được dự án tái lập; chỉ dùng để thấy paper vẫn báo sai số khác 0, không diễn giải thành “90,28% chính xác”. [3]

Các paper khác cũng cần cùng cảnh giác: “ít tham số”, “ít path”, “semantic similarity” và “giống ảnh ở pixel” là những trục khác nhau. Với phương pháp dùng renderer xấp xỉ khi tối ưu, cần render lại file SVG cuối bằng browser thực tế; điểm của renderer nội bộ chưa đủ nghiệm thu.

**SVG gradient mesh là một ranh giới định dạng:** bản SVG 2 hiện hành mô tả linear/radial gradients và patterns; tài liệu cũ năm 2016 từng có mesh không phải bằng chứng hỗ trợ hiện tại. Inkscape cảnh báo mesh web không chắc được hỗ trợ và gợi ý bitmap cho web; lựa chọn bitmap đó bị loại trong phạm vi này. [18][19] Có thể chia mesh thành nhiều primitive được hỗ trợ, nhưng chi phí và sai số của bước hạ cấp phải tính vào đầu ra cuối.

## 4. Ứng viên browser mới: Img2Num

**Xác minh:** Img2Num có C++ core, JS/WASM browser exports và release npm `0.4.2`. Mã nguồn ở commit đã pin cho thấy bilateral filter → k-means → tách vùng liên thông/gộp vùng nhỏ → contour → xuất SVG với đường Bézier bậc hai. Tuyên bố tối ưu cho natural images là tuyên bố của tác giả trong README, chưa phải kết quả đối chiếu của dự án. [20][22][23][27]

**Phạm vi WebGPU:** mục “What's next” của bài release `0.4.2` nói hỗ trợ GPU tùy chọn hiện ở Node, còn mở rộng WebGPU ngoài Node đang được nghiên cứu. Do đó baseline browser trong POC là CPU/WASM; có browser entry không đủ để kết luận browser GPU đã hoạt động. Chỉ thêm thử nghiệm GPU/device loss/CPU fallback khi chính build browser được kiểm chứng có đường chạy GPU. [21]

Mã được đọc tại commit `27eda01d7c52b200114f95a666ff134c4bb5fb67`, API GitHub ghi lần push 11/09/2026. `packages/js/package.json` khai báo browser entry cùng `.wasm` riêng. Không được coi `main` biến động là artifact đã pin mãi. [22]

**Khoảng trống xác minh từ source:** `contoursResultToSVG()` xuất path Bézier bậc hai, `fill="#RRGGBB"`, width/height. Hàm này không xuất gradient, opacity hoặc viewBox; màu lấy red/green/blue, không ghi alpha. Vì vậy engine này chưa chứng minh giữ bóng/alpha mềm; adapter ít nhất phải bổ sung viewBox, còn alpha cần xử lý ở pipeline chứ không chỉ thêm thuộc tính cuối. [23]

**License và tình trạng phát triển:** core, bindings và package hiện công bố MIT; docs/example apps có license riêng, có phần AGPL. Không sao chép nguyên example vào sản phẩm rồi chỉ áp dụng license core. Repo đang có hoạt động phát triển, nhưng release còn thay đổi API và chưa có benchmark độc lập trong dự án. [20][24]

**Đã đo, không chạy mã tải về:** đọc tarball `img2num@0.4.2`, lấy byte từng artifact và gzip level 9 với `mtime=0`.

| Browser artifact | Byte gốc | Byte gzip cục bộ | SHA-256 |
| --- | ---: | ---: | --- |
| `dist/browser/img2num.js` | 106.905 | 24.131 | `3fdd072d71b9a503b6b31493be3935f398955215097edbf83112a9996c2fc44d` |
| `dist/browser/img2num.wasm` | 540.053 | 165.101 | `c09fc2e407bbe3f6c89656fc30c43e422f81238945abe1bb5b855573d050ed39` |

Nguồn là [artifact npm 0.4.2](https://registry.npmjs.org/img2num/-/img2num-0.4.2.tgz); metadata và phương pháp lưu ở [rd-photographs-artifacts.json](/Users/dongnt/Desktop/github/svg/docs/research/rd-photographs-artifacts.json). Đây không phải tổng bundle app, HTTP/Brotli, bộ nhớ runtime hoặc tốc độ chuyển đổi. Không so trực tiếp với kích thước source chưa minify của thư viện khác.

**Đề xuất:** thêm Img2Num vào ma trận POC ảnh chụp cách điệu cùng VTracer và ImageTracerJS. Bọc CPU/WASM trong worker do app quản lý; kiểm tra hủy bằng terminate, tải WASM từ cùng origin và không request xử lý ảnh. Chưa tuyên bố thư viện thắng VTracer trước khi chạy cùng corpus và cùng ngân sách chất lượng.

## 5. License và mức sẵn sàng không được đánh đồng

| Thành phần | Quyền sử dụng/code quan sát được | Trạng thái lựa chọn |
| --- | --- | --- |
| Img2Num | MIT ở core/package; một số thư mục khác AGPL, phải kiểm tra theo file/version | Có thể vào POC browser với kiểm tra dependency và artifact |
| DiffVG | Repo công bố Apache-2.0; native/Python renderer [25] | Tham chiếu R&D; chưa tự có port browser |
| COVec | LICENSE ở commit `bca314adf83a11c8309d5a7001d09a01bd21cd2a` khai báo Apache-2.0 [26] | Code có thể nghiên cứu; phải kiểm tra dependency/checkpoint riêng |
| SuperSVG | Cây source ở commit `6c3d45b435e0cc7ca0de3976d4d1aef6b50111a1` có license dependency DiffVG; không thấy LICENSE chung cho toàn dự án | Chưa xác minh quyền phân phối toàn bộ code/checkpoint; không lấy license dependency thay license tác giả |
| Layered Vectorization | Cây source `1224d0a299015752a43ad5daacd40f460f04f0db` không thấy LICENSE chung | Chưa đủ căn cứ đưa vào dependency phân phối |
| SwiftSketch | Cây source `6f9fa8654711b9a5d3022b08a59835f0dda08f40` có LICENSE trong CLIP vendored; không thấy LICENSE chung | Chưa xác minh quyền của toàn pipeline/checkpoint |
| VectorArk, Vector Scaffolding, AmodalSVG, mesh/implicit representation | Có paper; chưa xác minh artifact browser và license phân phối đáp ứng yêu cầu | Theo dõi/nghiên cứu thuật toán; chưa làm cam kết triển khai dựa trên mã dùng ngay |

Các nhận định trên là **kiểm kê kỹ thuật ở snapshot**, không là kết luận pháp lý rằng tác giả không cho phép sử dụng. License của bài báo, website, dataset, model và code là những quyền riêng.

## 6. Pipeline thực tế cho ảnh chụp xấp xỉ

**Đề xuất thiết kế:** giữ decoder và trace tách khỏi React; xử lý trong Dedicated Worker. Khởi đầu CPU/WASM một luồng, thêm WebGPU khi profiling chứng minh có lợi. Tránh tăng độ phức tạp chỉ để đạt một điểm pixel toàn ảnh.

1. Decode ảnh, cố định orientation và color space. Giữ buffer nguồn để so sánh; không âm thầm downscale ở chế độ chất lượng cao.
2. Ước lượng vùng nhiễu/texture và vùng có biên quan trọng. Có lựa chọn denoise nhẹ cho “cách điệu”; nếu bật, ghi rõ kết quả không nhằm giữ mọi pixel.
3. Phân vùng theo màu và tính liên thông, bảo vệ vùng quan trọng như mắt, môi, chữ, dây mảnh. Mỗi nhóm màu không mặc nhiên là một đối tượng.
4. Dựng biên chung, fit curve với ràng buộc topology. Fitting gradient chỉ cho vùng có residual phù hợp với mô hình; không ép mọi texture thành gradient.
5. Phân bổ primitive theo residual và mức quan trọng. Dừng khi đạt budget hoặc lợi ích cải thiện thấp; giới hạn số segment, byte và thời gian riêng.
6. Render SVG cuối, đo lỗi toàn ảnh lẫn crop khó; nếu ảnh không đạt chất lượng trong budget, hiển thị kết quả là xấp xỉ và cho người dùng điều chỉnh/không tải.

**Chưa kiểm chứng:** phương án tự viết phân vùng ngữ nghĩa/refinement có thể cải thiện chất lượng, nhưng phải chứng minh lợi ích trên máy mục tiêu. Không đề nghị port ngay chuỗi VLM + diffusion lớn vào browser chỉ vì WebGPU tồn tại.

| Nhóm ảnh | Failure mode dự kiến | Kiểm tra bắt buộc |
| --- | --- | --- |
| Tóc, lông, cỏ, lá | Nhiều vùng nhỏ; tăng path hoặc mất texture | Crop 1×/2×/4×; số segment, byte và lag editor |
| Khuôn mặt | Sai khác nhỏ làm thay đổi nhận dạng dù điểm trung bình tốt | Crop mắt/mũi/miệng, đánh giá con người; không “beautify” ngầm |
| Bầu trời, da, bóng mềm | Quantization thành dải màu; fitting sai ánh sáng | Error map vùng trơn, xem ở nhiều nền nếu có alpha |
| Kính, khói, phản chiếu | Segmentation sai quan hệ trước/sau; màu bị trộn | So composite, transparency và layer chỉnh sửa |
| Vải, lưới, chữ xa | Xóa nét hoặc gộp vùng | Biên, topology, ROI; quan sát pattern lặp |
| JPEG nhiều noise/ringing | Trace artifact thành hình thật hoặc làm mịn mất chi tiết | Nhiều mức nén của cùng nguồn, đo riêng denoise on/off |

## 7. Thí nghiệm quyết định có triển khai hay không

**Đề xuất corpus:** chọn tối thiểu 6 nhóm trong bảng trên, gồm ảnh chụp thật được cấp phép, ảnh công khai có quyền sử dụng rõ và fixture synthetic stress. Giữ tập dùng chỉnh tham số tách khỏi tập đánh giá cuối. Với synthetic noise, ghi rõ đây là ca kiểm thử giới hạn, không đại diện thẩm mỹ ảnh chụp.

**Thiết kế phép so sánh:** chạy VTracer, ImageTracerJS và Img2Num trên cùng buffer đã decode; thử dải ngân sách byte/segment, không chỉ preset tên giống nhau. Với phương pháp ML/native, báo riêng là tham chiếu research; không đưa timing vào cùng cột browser. Pin commit, asset hash, seed, browser và thiết bị.

| Trục | Thước đo/tiêu chí | Cách đọc |
| --- | --- | --- |
| Exactness | Số pixel khác và sai số tuyệt đối lớn nhất dưới pipeline cố định | Khác dù một pixel thì chưa pixel-exact; không dùng làm KPI mặc định cho photo approximation |
| Độ giống | RMSE/PSNR, SSIM; optional LPIPS trong harness phát triển | Nêu chuẩn màu và scale; không quy đổi thành phần trăm chính xác |
| Cảm nhận | Chấm độc lập vùng nhận dạng, banding, chi tiết, đường viền | Một điểm toàn ảnh không được che lỗi mắt/chữ |
| Dung lượng | SVG UTF-8 byte trước/sau optimize; gzip/Brotli riêng | Vẽ đường quality–size, so ở cùng budget |
| Chỉnh sửa | Path, subpath, segment, control point, group; thử sửa vùng cụ thể | Một path dài không được coi là đơn giản chỉ vì đếm bằng 1 |
| Hiệu năng | Cold/warm time, p50/p95, peak memory quan sát được, responsive UI, import editor | Đo CPU/WASM và WebGPU riêng trên thiết bị thật |
| Tính đúng sản phẩm | SVG hợp lệ/sanitized, không `<image>`/external asset, đúng viewBox, tải được, cancel/retry, offline ảnh mới | Fail mục này thì không báo thành công |

Ngân sách có thể quét ban đầu, ví dụ 64/256/1.024 KiB và các mức segment tăng dần; đây chỉ là **điểm khảo sát**, không phải cam kết mọi ảnh đạt chất lượng ở mức đó. Không đặt “99,9% chính xác” hoặc tốc độ mobile trước dữ liệu. Đối với ảnh có vector gốc, render lại SVG gốc ở nhiều độ phân giải làm tham chiếu; với ảnh chụp, zoom chỉ đánh giá hành vi phóng lớn, không chứng minh phục hồi chi tiết thật ngoài dữ liệu nguồn.

**Điều kiện tiến hành:** đạt chuẩn SVG, local-only và kiểm soát tài nguyên; corpus mục tiêu có kết quả được duyệt ở ngân sách chấp nhận được. **Điều kiện dừng nhánh photorealistic:** muốn giữ chất lượng buộc tạo file/segment vượt giới hạn, hoặc phải nhúng raster/custom decoder. Khi đó ghi rõ không đáp ứng đặc tả, không giấu fallback dưới nhãn SVG.

## 8. Nội dung nên bổ sung vào thiết kế kỹ thuật

**Có thể thêm:** chế độ ảnh chụp xấp xỉ/cách điệu, budget byte và segment, phân bổ chi tiết theo residual, renderer kiểm tra đầu ra cuối, thông tin chất lượng và crop so sánh; thêm Img2Num vào POC engine. Giữ core local và worker, không backend chuyển đổi.

**Chỉ thêm dưới cờ R&D sau khi có bằng chứng:** gradient/illumination fitting, semantic grouping và differentiable refinement trên WebGPU. Mỗi nhánh cần chứng minh export SVG chuẩn, không chỉ render tốt trong demo riêng.

**Loại khỏi cam kết sản phẩm:** mọi ảnh chụp → SVG nhỏ giống tuyệt đối; khôi phục texture vượt độ phân giải nguồn; đảm bảo nhóm đối tượng/che khuất chính là cấu trúc thật; bảo đảm SVG nhỏ hơn JPG gốc trong mọi trường hợp.

Cách phát biểu có thể triển khai: **“Chuyển ảnh chụp thành SVG gồm các hình vector có thể chỉnh sửa ngay trên thiết bị, với mức chi tiết và dung lượng lựa chọn được. Ảnh có texture hoặc ánh sáng phức tạp được xấp xỉ và có phần so sánh trước khi tải.”** Mức “giữ rất sát” chỉ bổ sung sau benchmark theo nhóm ảnh và thiết bị.

## Nguồn

1. ITU-T, [Recommendation T.81](https://www.w3.org/Graphics/JPEG/itu-t81.pdf), 1992, mục 4.2–4.3.
2. W3C, [SVG 2 basic shapes](https://www.w3.org/TR/SVG2/shapes.html) và [rendering model](https://www.w3.org/TR/SVG2/render.html).
3. Hu và cộng sự, [SuperSVG](https://arxiv.org/html/2406.09794v1), CVPR 2024, §4.1–4.2, bảng 1.
4. sjtuplayer, [SuperSVG source](https://github.com/sjtuplayer/SuperSVG/tree/6c3d45b435e0cc7ca0de3976d4d1aef6b50111a1), snapshot kiểm tra 14/09/2026.
5. Wang và cộng sự, [Layered Image Vectorization via Semantic Simplification](https://openaccess.thecvf.com/content/CVPR2025/papers/Wang_Layered_Image_Vectorization_via_Semantic_Simplification_CVPR_2025_paper.pdf), CVPR 2025; [trang tác giả](https://szuviz.github.io/layered_vectorization/).
6. SZUVIZ, [source và yêu cầu môi trường](https://github.com/SZUVIZ/layered_vectorization/tree/1224d0a299015752a43ad5daacd40f460f04f0db).
7. Lin và cộng sự, [Clair Obscur / COVec](https://arxiv.org/html/2511.20034v2), 25/11/2025, cập nhật 11/03/2026, §4–5 và phụ lục B về SVG blending.
8. COVec, [repository](https://github.com/decade-de/COVec/tree/bca314adf83a11c8309d5a7001d09a01bd21cd2a).
9. Lee và cộng sự, [Vector Scaffolding](https://arxiv.org/html/2605.11913v1), preprint 12/05/2026, §3–4.
10. Gehlaut và cộng sự, [VectorArk](https://arxiv.org/html/2605.24398v1), CVPR 2026, §6.4 và §7.
11. Adobe/tác giả VectorArk, [project page](https://vectorark.github.io/), trạng thái code kiểm tra 14/09/2026.
12. [AmodalSVG](https://arxiv.org/html/2604.10940v1), preprint 13/04/2026, phụ lục A và D.
13. He, Roerdink và Kosinka, [Monte Carlo optimization for gradient meshes](https://www.cs.rug.nl/~jiri/papers/26HeRoKo.pdf), Graphical Models 143, 2026, §9.
14. Elsevier, [trang công bố và data availability](https://www.sciencedirect.com/science/article/pii/S1524070326000019), DOI 10.1016/j.gmod.2026.101320.
15. Chen và cộng sự, [Texture-Encapsulated Shape Parameterization](https://openaccess.thecvf.com/content/CVPR2024/papers/Chen_Towards_High-fidelity_Artistic_Image_Vectorization_via_Texture-Encapsulated_Shape_Parameterization_CVPR_2024_paper.pdf), CVPR 2024, §3.3.
16. Chen và cộng sự, [Easy-editable Image Vectorization](https://openaccess.thecvf.com/content/CVPR2025/papers/Chen_Easy-editable_Image_Vectorization_with_Multi-layer_Multi-scale_Distributed_Visual_Feature_Embedding_CVPR_2025_paper.pdf), CVPR 2025.
17. Arar và cộng sự, [SwiftSketch project](https://swiftsketch.github.io/) và [source snapshot](https://github.com/swiftsketch/SwiftSketch/tree/6f9fa8654711b9a5d3022b08a59835f0dda08f40), SIGGRAPH 2025.
18. W3C, [SVG 2 paint servers](https://www.w3.org/TR/SVG2/pservers.html), bản hiện hành được kiểm tra 14/09/2026.
19. Inkscape, [Mesh Gradients](https://wiki.inkscape.org/wiki/Mesh_Gradients).
20. Ryan Millard, [Img2Num README](https://github.com/Ryan-Millard/Img2Num/blob/27eda01d7c52b200114f95a666ff134c4bb5fb67/README.md).
21. Img2Num, [release JS 0.4.2](https://img2num.dev/blog/img2num_js_0_4_2/), 19/08/2026, đặc biệt mục “What's next” về giới hạn hỗ trợ GPU.
22. Img2Num, [package.json ở commit kiểm tra](https://github.com/Ryan-Millard/Img2Num/blob/27eda01d7c52b200114f95a666ff134c4bb5fb67/packages/js/package.json).
23. Img2Num, [SVG serializer](https://github.com/Ryan-Millard/Img2Num/blob/27eda01d7c52b200114f95a666ff134c4bb5fb67/core/src/internal/labels_to_svg.cpp#L175-L196).
24. Img2Num, [core license](https://github.com/Ryan-Millard/Img2Num/blob/27eda01d7c52b200114f95a666ff134c4bb5fb67/core/LICENSE) và [package license](https://github.com/Ryan-Millard/Img2Num/blob/27eda01d7c52b200114f95a666ff134c4bb5fb67/packages/LICENSE).
25. Li và cộng sự, [DiffVG code](https://github.com/BachiLi/diffvg), SIGGRAPH Asia 2020.
26. COVec, [LICENSE ở commit kiểm tra](https://github.com/decade-de/COVec/blob/bca314adf83a11c8309d5a7001d09a01bd21cd2a/LICENSE).
27. Img2Num, [entry point pipeline ở commit kiểm tra](https://github.com/Ryan-Millard/Img2Num/blob/27eda01d7c52b200114f95a666ff134c4bb5fb67/core/src/internal/image_to_svg.cpp).

[1]: https://www.w3.org/Graphics/JPEG/itu-t81.pdf
[2]: https://www.w3.org/TR/SVG2/shapes.html
[3]: https://arxiv.org/html/2406.09794v1
[4]: https://github.com/sjtuplayer/SuperSVG/tree/6c3d45b435e0cc7ca0de3976d4d1aef6b50111a1
[5]: https://openaccess.thecvf.com/content/CVPR2025/papers/Wang_Layered_Image_Vectorization_via_Semantic_Simplification_CVPR_2025_paper.pdf
[6]: https://github.com/SZUVIZ/layered_vectorization/tree/1224d0a299015752a43ad5daacd40f460f04f0db
[7]: https://arxiv.org/html/2511.20034v2
[8]: https://github.com/decade-de/COVec/tree/bca314adf83a11c8309d5a7001d09a01bd21cd2a
[9]: https://arxiv.org/html/2605.11913v1
[10]: https://arxiv.org/html/2605.24398v1
[11]: https://vectorark.github.io/
[12]: https://arxiv.org/html/2604.10940v1
[13]: https://www.cs.rug.nl/~jiri/papers/26HeRoKo.pdf
[14]: https://www.sciencedirect.com/science/article/pii/S1524070326000019
[15]: https://openaccess.thecvf.com/content/CVPR2024/papers/Chen_Towards_High-fidelity_Artistic_Image_Vectorization_via_Texture-Encapsulated_Shape_Parameterization_CVPR_2024_paper.pdf
[16]: https://openaccess.thecvf.com/content/CVPR2025/papers/Chen_Easy-editable_Image_Vectorization_with_Multi-layer_Multi-scale_Distributed_Visual_Feature_Embedding_CVPR_2025_paper.pdf
[17]: https://swiftsketch.github.io/
[18]: https://www.w3.org/TR/SVG2/pservers.html
[19]: https://wiki.inkscape.org/wiki/Mesh_Gradients
[20]: https://github.com/Ryan-Millard/Img2Num/blob/27eda01d7c52b200114f95a666ff134c4bb5fb67/README.md
[21]: https://img2num.dev/blog/img2num_js_0_4_2/
[22]: https://github.com/Ryan-Millard/Img2Num/blob/27eda01d7c52b200114f95a666ff134c4bb5fb67/packages/js/package.json
[23]: https://github.com/Ryan-Millard/Img2Num/blob/27eda01d7c52b200114f95a666ff134c4bb5fb67/core/src/internal/labels_to_svg.cpp#L175-L196
[24]: https://github.com/Ryan-Millard/Img2Num/blob/27eda01d7c52b200114f95a666ff134c4bb5fb67/core/LICENSE
[25]: https://github.com/BachiLi/diffvg
[26]: https://github.com/decade-de/COVec/blob/bca314adf83a11c8309d5a7001d09a01bd21cd2a/LICENSE
[27]: https://github.com/Ryan-Millard/Img2Num/blob/27eda01d7c52b200114f95a666ff134c4bb5fb67/core/src/internal/image_to_svg.cpp
