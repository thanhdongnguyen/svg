# R&D: Các khoảng trống vận hành của pipeline vector hóa trong trình duyệt

**Pipeline không dùng dịch vụ chuyển đổi từ xa là khả thi. Những phần còn thiếu chủ yếu cần thiết kế có giới hạn và kiểm thử trên thiết bị thật; không thể biến chúng thành cam kết tuyệt đối về RAM, thời gian, màu sắc hay khả năng mở offline vĩnh viễn.** Chuyên đề này tách các vấn đề đó khỏi bốn nhánh nghiên cứu chất lượng logo, gradient/alpha, ảnh chụp và phục hồi SVG gốc.

Phạm vi đối chiếu đến **14/09/2026**. “Có cơ sở triển khai” bên dưới nghĩa là nền tảng hoặc thư viện cung cấp cơ chế cần thiết, **không có nghĩa dự án đã triển khai hoặc kiểm thử cơ chế đó**. Các probe hiện có không đủ để đóng mọi rủi ro sản phẩm.

## 1. Phạm vi bằng chứng hiện có

Đã đọc báo cáo nền [browser-vectorization-feasibility.vi.md](/Users/dongnt/Desktop/github/svg/docs/research/browser-vectorization-feasibility.vi.md), mã [browser-probe.html](/Users/dongnt/Desktop/github/svg/docs/research/experiments/browser-probe.html), kết quả [cutout](/Users/dongnt/Desktop/github/svg/docs/research/experiments/browser-probe-results.json) và [stacked](/Users/dongnt/Desktop/github/svg/docs/research/experiments/browser-probe-stacked-results.json). Hai bản kết quả chạy trên một môi trường Chrome 152/macOS, sáu fixture tổng hợp 256 × 256, hai engine. Probe có decode trong Dedicated Worker, `OffscreenCanvas`, lời gọi tracing và render kết quả để lấy pixel; có một mẫu dữ liệu PNG giả bị decoder từ chối.

Các bằng chứng này hỗ trợ tính khả thi của **đường đi cơ bản**. Chúng chưa chứng minh giới hạn ảnh lớn, hành vi cancel/timeout/retry, bộ nhớ đỉnh, chính sách màu ICC/16-bit, hiệu năng mobile, sanitizer production hoặc reload offline. JSON ghi `networkOnlineAtRun: false`; giá trị này và việc chạy thành công sau khi tải engine hỗ trợ thử nghiệm conversion khi offline, nhưng tự nó không phải log kiểm toán mọi request hoặc bằng chứng cache ứng dụng tồn tại sau khi đóng tab.

Probe chỉ tìm phần tử `image,feImage` để ghi `hasRaster`; đó là kiểm tra chẩn đoán trong fixture do dự án sinh, không phải validator đầy đủ cho mọi cách tham chiếu nội dung ngoài. Nó không đặt timeout cho Promise công việc. Trong kết quả, output VTracer thiếu `viewBox`; ImageTracerJS được gọi với `viewbox: true`. Hai điều này phải trở thành yêu cầu adapter và test, không nên chỉ để trong ghi chú nghiên cứu.

Khi kiểm tra `package.json`, dự án chưa khai báo dependency conversion, optimizer hoặc sanitizer. Vì vậy các lựa chọn kỹ thuật dưới đây vẫn là thiết kế đề xuất. Chuyên đề này không sửa ứng dụng và không thêm dependency.

## 2. Ma trận các khoảng trống và điều kiện quyết định

Quy ước: **T** = có cơ sở triển khai; **V** = phải xác minh bằng probe sản phẩm; **K** = không thể cam kết tuyệt đối trong phạm vi yêu cầu. Các mã `Gxx` là danh mục công việc theo phạm vi đã biết, không phải khẳng định đã tìm hết mọi lỗi có thể tồn tại.

### Runtime, tài nguyên và vòng đời công việc

| ID | Vấn đề và trạng thái | Hướng xử lý cụ thể | Bằng chứng và phép thử go/no-go |
| --- | --- | --- | --- |
| G01 | Worker/WASM browser — **T + V** | Mặc định một Dedicated Worker, engine một luồng; adapter nhận kích thước và RGBA, không phụ thuộc `fs`, DOM hay Node. Kiểm tra API và thử khởi tạo engine trước khi báo sẵn sàng. | Worker phù hợp tác vụ CPU [S1]; probe chứng minh một build hoạt động trên một môi trường. **Go** khi production build chạy trên từng browser đã công bố; nếu thiếu khả năng thiết yếu, báo không hỗ trợ hoặc cung cấp đường decode đã kiểm thử. |
| G02 | Nhiều luồng/SAB — **T tùy chọn + V** | Không coi “chạy trong worker” là “đa luồng”. Chỉ thêm shared-memory build sau benchmark; kiểm tra `crossOriginIsolated`, cấu hình COOP/COEP ở static host. Giữ bản một luồng. | Emscripten pthreads yêu cầu cấu hình isolation, và tài liệu nêu cần hai build khi muốn fallback một luồng [S2]. Điều này áp dụng Emscripten, không tự chứng minh Rust engine hiện có hỗ trợ threads. **No-go** với build đa luồng nếu host không đáp ứng hoặc không cải thiện chi phí tổng. |
| G03 | WebGPU — **T tùy chọn + V** | Chỉ dùng cho stage có thuật toán/kernel cụ thể; feature-detect adapter/device/limits; xử lý `device.lost`; giữ đường CPU. Không coi port Python/CUDA sang browser là tự động. | Tài liệu Chrome ghi hỗ trợ tùy nền tảng [S3]; WebGPU có sự kiện mất thiết bị [S4]. **Go** sau so sánh CPU/GPU cả upload/readback/khởi tạo và chất lượng; không suy ra tốc độ từ nhãn GPU. |
| G04 | RAM khả dụng và giới hạn ảnh — **V + K** | Đặt giới hạn byte, từng chiều, tổng pixel, số buffer và độ phức tạp output. Một job đang chạy mỗi tab; không tự dùng toàn bộ `hardwareConcurrency`. Dùng `deviceMemory` nếu có như tín hiệu phụ. | Device Memory trả giá trị xấp xỉ, có làm tròn/giới hạn vì riêng tư [S5]; WASM cho phép lỗi OOM phụ thuộc UA, kể cả crash [S6]. **Không thể hứa không bao giờ hết RAM trên mọi thiết bị**. Go dựa trên ma trận thiết bị và headroom đã đo. |
| G05 | Cancel, timeout, tiến trình — **T + V** | Main thread sở hữu watchdog và job ID. Khi WASM đồng bộ không trả quyền điều khiển, dùng `worker.terminate()`, tạo worker mới cho job sau. Không phụ thuộc message cancel được xử lý giữa một lời gọi đồng bộ. Chỉ hiển thị % nếu thực sự đo được work; còn lại hiển thị stage/indeterminate. | Chuẩn worker cho phép hủy script đang chạy [S1]. **Go** khi cancel giữa decode/trace/optimize không phát success muộn, UI dùng tiếp được; thử treo engine nhân tạo. Timeout UI không phải hạn thời gian thực tuyệt đối khi tab/OS bị đình chỉ. |
| G06 | Lỗi khởi tạo, trap, retry, race — **T + V** | Gắn `jobId`/generation vào mọi message; bỏ kết quả cũ; mọi Promise kết thúc đúng một lần. Phân biệt lỗi tải asset, decoder, WASM, quá tài nguyên và SVG không hợp lệ. Recreate worker sau lỗi không rõ trạng thái; retry chủ động với preset công khai. | WASM có CompileError/LinkError/RuntimeError và các lỗi tài nguyên [S6]. **Go** khi đổi file liên tiếp, cancel rồi convert, script worker 404, WASM hỏng/trap đều đưa app về trạng thái dùng được. Không auto retry vô hạn hoặc âm thầm hạ chất lượng. |
| G07 | Copy buffer và rò tài nguyên — **T + V** | Chuyển quyền sở hữu `ArrayBuffer`/`ImageBitmap` khi phù hợp; giữ File gốc để retry bằng decode lại; đóng bitmap, revoke URL sau khi không còn dùng, giải phóng canvas/reference theo stage. Giới hạn số preview và bản SVG đang giữ. | Transferable có thể chuyển backing resource và detach bên gửi [S7]. **Go** sau nhiều vòng convert/cancel/replace, bộ nhớ quan sát ổn định trong khoảng đã thống nhất. `terminate()`/GC không bảo đảm giải phóng RAM vào một thời điểm chính xác. |
| G08 | SVG đầu ra làm treo renderer — **T + V** | Giới hạn byte, số node, command/path, chiều sâu nhóm, độ lớn tọa độ và vùng filter trước khi render. Tính complexity ngay từ IR nếu có. Không đưa SVG khổng lồ vào DOM trước khi kiểm tra. | Suy luận từ việc parse/render cũng tiêu tốn tài nguyên; worker trace không chuyển renderer của trang sang worker. **Go** khi output cố ý quá lớn bị chặn trước preview; không coi ảnh đầu vào nhỏ là an toàn về output. |

### Decode và chuẩn hóa ảnh

| ID | Vấn đề và trạng thái | Hướng xử lý cụ thể | Bằng chứng và phép thử go/no-go |
| --- | --- | --- | --- |
| G09 | MIME, signature, ảnh hỏng — **T + V** | Kiểm tra `File.type`, chữ ký/header và decode thành công. MIME không xác định phải theo chính sách rõ: có thể xác nhận bằng byte PNG/JPEG và decode, không chỉ dựa phần mở rộng; MIME mâu thuẫn cần từ chối hoặc báo lỗi rõ. | File API cho phép `type` rỗng khi không xác định [S8]. Một mẫu PNG giả bị từ chối chưa bao phủ header hợp lệ nhưng dữ liệu hỏng. **Go** với corpus MIME sai/rỗng, đổi đuôi, truncated, CRC/marker hỏng, file rỗng. |
| G10 | Decompression và metadata bombs — **T giảm thiểu + V + K** | Đọc header có giới hạn trước decode; PNG IHDR, JPEG SOF qua parser kiểm tra bounds/marker. Chặn kích thước/pixel quá lớn trước canvas; giới hạn byte/chunk/metadata; tránh giải nén metadata không cần thiết. Đối chiếu dimensions sau decode. | PNG có header, chunk và metadata nén [S9]; libpng phân biệt giới hạn kích thước ảnh và bộ nhớ chunk [S10]. **Go** khi các mẫu vượt hạn bị chặn trước decode/canvas lớn. Dùng decoder browser không cho app kiểm soát mọi cấp phát nội bộ; không được tuyên bố đã loại mọi decoder bomb. |
| G11 | EXIF orientation — **T + V** | Chọn một nơi duy nhất áp orientation; lấy dimensions sau orientation làm hệ tọa độ SVG. Không xoay lần nữa nếu bitmap đã được xoay. | `createImageBitmap` có `imageOrientation` và mặc định `from-image` [S11]. **Go** khi tám orientation JPEG có chữ/mũi tên test đúng; đổi W/H đúng cho trường hợp xoay 90°. Kiểm tra PNG có eXIf nếu cho phép. |
| G12 | ICC, gamma, wide gamut — **T theo chính sách + V** | Chốt baseline sRGB; source preview và output preview dùng cùng đường chuẩn hóa màu. Không đặt `colorSpaceConversion: 'none'` rồi xem byte từ profile bất kỳ là sRGB. Lưu warning khi policy làm hẹp gamut. | `createImageBitmap` để hành vi conversion `default` phụ thuộc implementation [S11]; PNG có metadata màu [S9]. **Go** sau fixture sRGB, ICC khác, Display-P3/gamma và mẫu thiếu profile trên các browser. Nếu cần kết quả decode tái lập chặt hơn, thử decoder + color management riêng; chưa có build được chứng minh ở dự án. |
| G13 | PNG 16-bit/HDR — **T với giới hạn + V; K nếu qua 8-bit mà đòi giữ mọi mức** | Công bố pipeline baseline là RGBA8/sRGB nếu chọn nó. Phát hiện đầu vào 16-bit, chuyển về baseline có thông báo hoặc từ chối nhóm chưa hỗ trợ. Đường float16 cần kiểm thử từ decoder đến engine và serializer, không chỉ `getImageData` đơn lẻ. | PNG có độ sâu đến 16 bit [S9]; `getImageData` có dạng `rgba-unorm8` và `rgba-float16` [S12]. **No-go** cho lời hứa giữ nguyên toàn bộ mức 16-bit khi engine nhận `Uint8Array` RGBA8. |
| G14 | Alpha/canvas gây sai số trước tracing — **T giảm thiểu + V + K** | Giữ alpha riêng trong pipeline; không flatten nền trắng. Kiểm tra canonical decoded RGBA, premultiplication và halos. Chấm điểm alpha riêng và composite trên nhiều nền. | HTML ghi đổi không gian màu/premultiplied alpha có thể làm pixel trả về khác giá trị ban đầu [S13]. **Go** với alpha 0/1/2/127/128/254/255, cạnh màu bão hòa, nền đen/trắng/màu. Không đòi so RGB ẩn khi alpha bằng 0 như một tiêu chí chất lượng nhìn thấy. |
| G15 | PNG/JPEG không phải một biến thể duy nhất — **T theo phạm vi + V** | Corpus phải có PNG indexed/tRNS, grayscale, interlaced; JPEG baseline/progressive và mẫu profile hiếm. APNG: khuyến nghị từ chối có thông báo trong bản đầu cho ảnh tĩnh, hoặc ghi rõ frame được chọn; không chọn frame ngầm. JPEG CMYK/biến thể decoder không hỗ trợ cần lỗi rõ. | PNG hiện hành bao gồm cả ảnh tĩnh và animation [S9]; T.81 mô tả nhiều tiến trình JPEG [S14]. **Go** khi bảng định dạng/biến thể được thử; không quảng bá mọi PNG/JPEG chỉ từ hai MIME. |

### Chuẩn SVG, tối ưu và đầu ra tải xuống

| ID | Vấn đề và trạng thái | Hướng xử lý cụ thể | Bằng chứng và phép thử go/no-go |
| --- | --- | --- | --- |
| G16 | Định nghĩa “SVG vector thật” — **T, cần chốt profile** | Profile cơ bản chỉ geometry, fill/stroke, gradient và tham chiếu nội bộ cần thiết. Profile hiệu ứng mở rộng chỉ thêm mask/filter đã được phép. Mọi profile cấm raster nhúng/tham chiếu ngoài. | SVG có processing modes khác nhau [S15]; filter thao tác ảnh trung gian [S16]. **Go** với schema/profile rõ. `feGaussianBlur` không nhúng PNG, nhưng cũng không có nghĩa bóng đã thành tập path thuần hình học. |
| G17 | SVG hợp lệ và sanitizer — **T + V** | Serializer từ typed IR; parse XML và kiểm tra root namespace, lỗi parse, số hữu hạn, giới hạn cấu trúc. Allowlist element/attribute và kiểm tra mọi reference chỉ trỏ ID nội bộ hợp lệ. Sanitize bản cuối sau optimize, rồi kiểm tra lại. Không dùng regex để chứng minh an toàn. | DOMPurify hỗ trợ SVG nhưng cảnh báo sửa markup sau sanitize có thể phá bảo vệ [S17]. **Go** với bộ fixture script/onload/foreignObject/URL/data image/namespaces/CSS URL/malformed; sanitize không được âm thầm làm mất nội dung mà vẫn báo thành công đúng chất lượng. |
| G18 | Preview và download không cùng mức an toàn — **T + V** | Preview bằng `<img src=blob:>` với SVG đã kiểm tra, tránh chèn markup tùy ý vào DOM. Download chính byte đã validate. Cấm `<image>`, `<feImage>`, script, event handler, external `href`, foreignObject, style/CSS URL ngoài allowlist. | SVG qua `<img>` có chế độ hạn chế; mở trực tiếp có thể dùng chế độ tương tác đầy đủ [S15]. **Go** nếu SVG tải xuống được mở độc lập mà không cần tài nguyên ngoài; an toàn trong preview không đủ thay sanitize file. |
| G19 | viewBox, winding và topology — **T + V** | Adapter đặt `viewBox="0 0 W H"` theo tọa độ sau orientation/preprocess, không chỉ thêm thuộc tính khi đường chưa đúng hệ tọa độ. Preserve aspect ratio, lỗ, paint order, shared edges và group opacity. | Probe cho thấy thiếu viewBox ở VTracer. **Go** với portrait/landscape/square, hình có lỗ, cạnh sát nhau, nét cực mảnh và chồng alpha; kiểm tra ở kích thước gốc và phóng lớn. Số path thấp không chứng minh đúng topology. |
| G20 | Optimizer đổi hình — **T + V** | Tách giảm markup khỏi simplification làm thay hình. Pin SVGO config; không dùng `removeViewBox`; kiểm soát rounding theo kích thước/hệ tọa độ; khóa ID reference và paint order. So render trước/sau optimize. | `convertPathData` đổi command/round số [S18]; `removeViewBox` có thể làm mất scaling/clip [S19]. **Go** nếu output vượt invariants và visual tolerance đã định; nếu không thì tải bản trước optimize đã validate. Không gọi optimizer là “lossless” cho mọi cấu hình. |

### Privacy, offline, tái lập và đo lường

| ID | Vấn đề và trạng thái | Hướng xử lý cụ thể | Bằng chứng và phép thử go/no-go |
| --- | --- | --- | --- |
| G21 | Không gửi ảnh/không gọi remote API — **T + V** | Tự host JS/WASM/model nếu có; không conversion route/Server Action/upload SDK. Không log tên file, data URL, pixel, output hoặc metadata ảnh lên telemetry. Kiểm toán toàn ứng dụng, worker và service worker. | Static export không cần runtime server cho conversion [S20]. **Go** với request trace trên production build và hoàn thành conversion khi mạng bị chặn sau tải assets. “Không API” ở đây là không dịch vụ từ xa; Web APIs cục bộ như Canvas vẫn cần dùng. |
| G22 | CSP và asset loading — **T + V** | Dùng CSP như lớp bổ sung: giới hạn `connect-src`, `worker-src`, `img-src`, `object-src`, script. Kiểm tra cả CSP của worker; chỉ cho WASM compilation đúng mức cần thiết. Phân biệt request tải asset cố định với truyền dữ liệu ảnh. | CSP có directive cho mạng/worker và `wasm-unsafe-eval` [S21]. **Go** khi worker/WASM vẫn tải được dưới policy production. `connect-src 'none'` có thể làm hỏng loader dùng fetch; `connect-src 'self'` không chứng minh không upload cùng origin. |
| G23 | Offline chạy tiếp, reload và cache eviction — **T + V + K** | Ba test riêng: chạy khi đã có engine trong RAM; reload offline sau precache; mở sau xóa/evict cache. Cache theo manifest/version cả JS chunks và WASM. Chỉ cache asset, không cache file người dùng. | Service worker hỗ trợ fetch/cache cho offline [S22]; storage best-effort có thể bị xóa do áp lực lưu trữ [S23]. **Go** với hai mức offline được hỗ trợ; hiển thị lỗi tải asset khi cache thiếu. Không hứa offline vĩnh viễn sau một lần ghé website. |
| G24 | Pin version, artifact, license — **T + V** | Ghi core commit/release, adapter commit, toolchain, build flags, dependency lock, hash JS/WASM, config schema, notice/license bắc cầu. Cache version đồng bộ glue và WASM. Không lấy license wrapper thay license core. | Báo cáo nền có nguồn core/port và hash artifact nhưng chưa phải manifest production. **Go** khi một build từ source cố định tái tạo kết quả/metadata kiểm thử và kiểm kê license của bản thực tế. “Có mã công khai” không đồng nghĩa được phân phối mọi thành phần hoặc weights. |
| G25 | Chất lượng đo không phải % chính xác — **T + V** | Định nghĩa mục tiêu theo lớp ảnh và ROI; đo màu/alpha/cạnh/topology, path/segment/byte và visual inspection. So ở cùng ngân sách hoặc đường Pareto chất lượng–dung lượng. Tách ground truth SVG tổng hợp khỏi raster thực không có vector gốc. | SSIM là chỉ số cấu trúc [S24], không diễn giải 0,99 là chính xác 99%. Probe hiện không tính SSIM và không phải benchmark công bằng do khác ngân sách preset. **Go** sau corpus/threshold có trước đợt đánh giá cuối; công bố failure cases. |
| G26 | Hiệu năng và browser support — **T + V; K nếu “mọi máy luôn nhanh”** | Đo production build: cold assets/compile, decode, trace, optimize, validate, render, tổng thời gian, responsiveness, cancel, memory. Có nhiều lần chạy và số liệu phân bố; ghi thiết bị/browser/power/thermal state, không chỉ user-agent. | Một timing engine không đo phần còn lại. **Go** riêng cho desktop và mobile thực trong ma trận hỗ trợ; emulation không thay phần cứng thật. Không đặt KPI đã đạt từ sáu ảnh 256² và không cam kết thời gian cố định khi tab bị suspend. |

## 3. Những bổ sung kỹ thuật có thể đưa vào thiết kế ngay

### 3.1. Hợp đồng dữ liệu và stage

Giữ engine độc lập React. Main thread sở hữu vòng đời job; worker sở hữu buffer trung gian. Một bản hợp đồng cần ghi rõ:

```text
Input: File, jobId, preset, outputProfile
Decoded image: width, height, appliedOrientation,
               workingColorSpace, pixelFormat, alphaMode
Stages: validating → decoding → preprocessing → tracing
        → optimizing → validating-output → ready
Terminal states: ready | cancelled | timed-out | failed
Result: SVG bytes, dimensions/viewBox, outputProfile,
        engine+adapter version, settings, metrics, warnings
```

Đây là hợp đồng đề xuất, chưa có code triển khai. `ready` chỉ xuất hiện khi **bản SVG cuối cùng** đã kiểm tra và có Blob có thể download. Main thread bỏ mọi message không thuộc job hiện hành. Khi hủy cứng, không đợi `finally` trong worker đã bị terminate để dọn những tài nguyên main thread giữ.

Một hợp đồng stage không làm tiến độ thành determinate. Nếu engine chỉ cho một lời gọi đồng bộ, UI có thể ghi “Đang tạo đường vector” với elapsed time; không chạy progress giả lên 99%. Những stage optimize và render cũng cần watchdog/giới hạn riêng, vì tracing xong chưa đồng nghĩa toàn workflow an toàn.

**Ranh giới sanitizer cần được thiết kế đúng:** `DOMParser` được chuẩn khai báo `Exposed=Window`, còn DOMPurify cần DOM; không đặt nguyên hai công cụ này vào Dedicated Worker rồi giả định chúng chạy. Worker có thể kiểm tra IR và dùng parser không DOM đã đánh giá, còn bước DOMPurify/DOM validation cuối chạy trên main thread sau khi giới hạn kích thước output. Nếu bắt buộc toàn bộ parse/sanitize chạy ngoài main thread, cần chọn và kiểm thử công cụ không phụ thuộc DOM riêng. SVGO cung cấp entry `svgo/browser`; vẫn phải xác minh worker bundle/config của dự án. [DOMParser](https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#the-domparser-interface), [DOMPurify](https://github.com/cure53/DOMPurify), [SVGO browser](https://svgo.dev/docs/usage/browser/).

### 3.2. Giới hạn nguồn vào và bộ nhớ

Chưa có bằng chứng để chọn một pixel limit bảo đảm cho mọi máy. Nên đo tập thử có kiểm soát theo mức 1, 4, 8 và 16 megapixel, tăng dần trên thiết bị mục tiêu và dừng trước khi gây mất ổn định. Đây là kích thước fixture đề xuất, **không phải giới hạn hỗ trợ đã được xác nhận**.

Mô hình để tính budget, không phải số đo thực tế:

```text
peak ≈ encoded file còn giữ
     + bitmap decoder + canvas backing store
     + RGBA readback + bản sao/working memory WASM
     + labels/contours/palette/IR
     + chuỗi SVG + parser/optimizer + preview renderer
```

Chỉ riêng một buffer RGBA8 2.000 × 2.000 là 16.000.000 byte, khoảng 15,26 MiB; tổng pipeline có thể cao hơn nhiều. Không được lấy `file.size`, kích thước heap WASM hoặc `4 × width × height` làm tổng RAM. Giới hạn memory của WASM chỉ ràng buộc vùng đó, không tự giới hạn decoder, JavaScript, DOM hoặc GPU.

Nếu cần kiểm soát decode chặt hơn browser decoder, một nhánh POC có thể build decoder được pin version vào WASM với giới hạn allocation/chunk riêng. libpng có API giới hạn ảnh và chunk, nhưng chọn nó còn đòi hỏi benchmark dung lượng, ICC, interop và cập nhật bảo mật. Chưa có căn cứ thay decoder browser ngay chỉ vì tồn tại thư viện này. [S10](https://www.libpng.org/pub/png/libpng-manual.txt).

### 3.3. Ba profile SVG cần được phân biệt

| Profile đề xuất | Nội dung cho phép | Phạm vi diễn giải |
| --- | --- | --- |
| Vector cơ bản | path/shape, solid fill/stroke, opacity và clipPath nội bộ đã kiểm thử | Tạo hình vector thật, các thuộc tính được giới hạn để tăng tính tương thích |
| Vector gradient | Profile cơ bản cùng linear/radial gradient và stop-opacity | Cần kiểm thử gradient units, transform, interpolation và stop |
| Vector hiệu ứng | Profile gradient cùng mask vector và allowlist filter/blend nhỏ đã kiểm thử | Không nhúng ảnh raster; hiệu ứng có thể được renderer xử lý qua ảnh trung gian và không phải tất cả đều thành path chỉnh sửa độc lập |

Không bật toàn bộ SVG chỉ để giữ bóng. Nếu thêm filter, validator phải ràng buộc vùng filter, số primitive, input reference và vòng tham chiếu; cấm `feImage`. Cần thử import/export trong editor mục tiêu vì hỗ trợ một hiệu ứng khi xem trên browser không tự bảo đảm editor giữ nguyên sau chỉnh sửa. [SVG processing modes](https://www.w3.org/TR/SVG2/conform.html), [Filter Effects](https://www.w3.org/TR/filter-effects-1/).

Giải pháp an toàn đơn giản hơn là serializer chỉ sinh cấu trúc từ IR có kiểu, tiếp theo là validator allowlist và sanitizer. Khi tối ưu làm sai rendering vượt tolerance, giữ output trước optimize đã validate. Không bỏ những phần tử không được phép rồi báo chất lượng thành công mà không kiểm tra lại hình ảnh.

### 3.4. Bất biến không truyền ảnh và offline

Yêu cầu test được đề xuất:

1. Manifest cho phép chỉ gồm URL asset cố định cần để khởi tạo; request không phụ thuộc byte, tên hoặc metadata ảnh được chọn.
2. Sau ready, chặn mạng và chuyển một **file mới**; preview, đổi preset, cancel/retry và download vẫn hoạt động.
3. Ở chế độ online, ghi log request của page, worker và service worker trong toàn workflow; kiểm tra không có payload ảnh, SVG, tên file hoặc derived image data.
4. Nếu công bố reload offline, đóng/mở lại trang khi mạng bị chặn và kiểm tra đủ chunks/WASM; thử missing/stale cache để bảo đảm lỗi có hướng xử lý.
5. Cache Storage/IndexedDB/localStorage không có input/output người dùng sau success/cancel/fail; chỉ có asset theo quyết định cache ứng dụng.

Những bước này kiểm chứng phiên bản ứng dụng đang phân phối; không phải chứng minh mọi bản cập nhật trong tương lai luôn giữ privacy. CSP hỗ trợ kiểm soát tài nguyên nhưng không thay kiểm toán mã và mạng. Không đặt “zero network requests từ lần mở đầu” cho một website cần tải chính chương trình; điều cần giữ là không có remote processing hay truyền dữ liệu ảnh. [CSP](https://www.w3.org/TR/CSP3/), [Service Workers](https://www.w3.org/TR/service-workers/).

## 4. Phép thử còn thiếu, theo thứ tự ưu tiên

| Cổng | Bằng chứng bắt buộc để đóng | Ý nghĩa nếu không đạt |
| --- | --- | --- |
| A — Hợp đồng decoder | MIME/header/decode, ảnh hỏng, orientation, variants, profile màu/alpha; output sau chuẩn hóa được lưu cho fixture công khai | Thu hẹp tập input được hỗ trợ; không trộn lỗi decode với lỗi tracer |
| B — Sống sót và phục hồi | Limits trước allocation lớn; cancel/timeout/trap/retry/race; nhiều vòng xử lý; thử trên mobile thật | Chưa cho production trên nhóm thiết bị chưa đạt; giảm limit có công bố |
| C — File SVG cuối | Allowlist/namespace/reference, không raster ngoài/nhúng, đúng viewBox, topology/visual trước–sau optimize; tải và mở độc lập | Không hiển thị success; dùng bản chưa optimize hợp lệ hoặc báo thất bại |
| D — Chất lượng trong budget | Corpus riêng logo/alpha/gradient/photo; độ giống + complexity + visual review; threshold theo lớp có trước đánh giá cuối | Không quảng bá quality claim cho lớp đó; R&D hoặc loại khỏi cam kết |
| E — Privacy/offline | Request trace production, xử lý file mới offline, reload nếu hỗ trợ, không lưu ảnh; CSP/asset version test | Không công bố tính năng privacy/offline vượt điều đã chứng minh |
| F — Bản phát hành tái lập | Hash/version/toolchain/config/license inventory; test lại khi engine/decoder/browser quan trọng thay đổi | Không biết kết quả thuộc bản nào; chưa đủ cơ sở phát hành dependency |

Bộ ảnh benchmark cần một tập tuning và một tập đánh giá chưa dùng để chỉnh preset; không chỉ đưa ảnh thuận lợi vào tập kiểm thử cuối. Dùng fixture tổng hợp từ SVG biết trước cho cạnh/lỗ/gradient/alpha, đồng thời dùng raster thực có giấy phép thích hợp cho độ khó ngoài dự đoán. Giữ raw measurements, config và failure cases; thống kê theo nhóm ảnh thay vì một điểm trung bình duy nhất.

Đánh giá chất lượng pixel nên so output với **ảnh đã decode/chuẩn hóa theo policy**; nếu có SVG nguồn, đánh giá thêm geometry/semantics riêng. Không yêu cầu SVG tái hiện chi tiết ở zoom lớn mà đầu vào raster vốn không có. Với trong suốt, dùng alpha error cộng composite nhiều nền; với logo, ROI nhỏ và topology là điều kiện riêng. SSIM/RMSE toàn ảnh có thể che mất một dấu nhỏ quan trọng; không chuyển các metric này thành phần trăm “chính xác”. [SSIM của tác giả](https://ece.uwaterloo.ca/~z70wang/research/ssim/).

## 5. Kết luận khả thi và giới hạn chưa đóng

**Có thể đưa ngay vào đặc tả kỹ thuật:** worker một luồng, adapter RGBA có version, input preflight có giới hạn, job ID và hủy cứng/retry, chính sách màu/alpha, profile SVG allowlist, validation bản cuối, giữ viewBox, kiểm tra trước–sau optimize, self-host asset và phép thử không truyền ảnh.

**Cần POC trước khi quyết định:** con số giới hạn file/pixel/path/timeout; mức giảm memory thực tế; màu ICC/16-bit trên browser mục tiêu; khả năng tăng tốc threads/GPU; hỗ trợ filter trong editor; chi phí bundle production; reload offline trên deployment thật; chất lượng và performance ở mobile.

**Không khả thi dưới dạng bảo đảm tuyệt đối:** luôn biết RAM có thể dùng; không bao giờ bị browser/OS đóng; mọi ảnh lớn đều chạy nhanh; giữ mọi sample 16-bit qua RGBA8; Canvas round-trip giữ đúng mọi byte alpha/RGB; cache offline không bao giờ bị xóa. Đây là những giới hạn phải ghi trong thiết kế, không phải các ô “R&D thêm” có thể mặc định sẽ được giải quyết bằng một thư viện.

Danh mục G01–G26 bao phủ các điểm còn mở đã nhận diện từ tài liệu nền và probe hiện có. Nó không khẳng định mọi unknown đã được giải quyết; một engine/build hoặc corpus mới có thể làm xuất hiện gap khác.

## Nguồn

Nguồn được truy cập ngày 14/09/2026; ưu tiên tiêu chuẩn, tài liệu nhà triển khai và upstream. Các Living Standard/Working Draft mô tả cơ chế, không thay bằng chứng hỗ trợ đầy đủ trên từng browser. URL không pin commit phải được cố định khi áp dụng vào bản phát hành.

- **S1.** WHATWG. [HTML Standard — Web workers, event loop và terminate](https://html.spec.whatwg.org/multipage/workers.html#terminate-a-worker). Living Standard.
- **S2.** Emscripten. [Pthreads support](https://emscripten.org/docs/porting/pthreads.html). Tài liệu upstream hiện hành; cơ chế threads riêng của Emscripten.
- **S3.** Google Chrome Developers. [Overview of WebGPU](https://developer.chrome.com/docs/web-platform/webgpu/overview), cập nhật 11/08/2025. Mốc release minh họa, không dùng làm ma trận thiết bị đầy đủ tại 2026.
- **S4.** MDN Web Docs. [GPUDevice.lost](https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/lost).
- **S5.** W3C. [Device Memory API — Security & privacy considerations](https://www.w3.org/TR/device-memory/).
- **S6.** W3C. [WebAssembly JavaScript Interface — Error conditions, out of memory và implementation-defined limits](https://www.w3.org/TR/wasm-js-api-2/#error-condition-mappings-to-javascript).
- **S7.** MDN Web Docs. [Transferable objects](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects).
- **S8.** W3C. [File API — Blob.type và File type guidelines](https://www.w3.org/TR/FileAPI/#dfn-type).
- **S9.** W3C. [PNG Specification, Third Edition](https://www.w3.org/TR/2025/REC-png-3-20250624/), Recommendation 24/06/2025; IHDR, alpha, color metadata, bit depth và APNG.
- **S10.** libpng maintainers. [libpng manual](https://www.libpng.org/pub/png/libpng-manual.txt), tài liệu ghi cập nhật đến 1.6.58, 04/2026; user limits và chunk limits.
- **S11.** MDN Web Docs. [WorkerGlobalScope.createImageBitmap — options](https://developer.mozilla.org/en-US/docs/Web/API/WorkerGlobalScope/createImageBitmap).
- **S12.** MDN Web Docs. [CanvasRenderingContext2D.getImageData](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/getImageData).
- **S13.** WHATWG. [HTML Standard — Canvas pixel manipulation, color spaces và premultiplied alpha](https://html.spec.whatwg.org/multipage/canvas.html#premultiplied-alpha-and-the-2d-rendering-context).
- **S14.** ITU-T. [Recommendation T.81, Digital compression and coding of continuous-tone still images](https://www.w3.org/Graphics/JPEG/itu-t81.pdf), 1992; nguồn tiêu chuẩn được báo cáo nền đối chiếu.
- **S15.** W3C. [SVG 2 — Conformance Criteria và processing modes](https://www.w3.org/TR/SVG2/conform.html).
- **S16.** W3C. [Filter Effects Module Level 1](https://www.w3.org/TR/filter-effects-1/).
- **S17.** Cure53 và contributors. [DOMPurify — SVG support, configuration và cảnh báo sửa markup sau sanitize](https://github.com/cure53/DOMPurify).
- **S18.** SVGO. [convertPathData](https://svgo.dev/docs/plugins/convertPathData/).
- **S19.** SVGO. [removeViewBox](https://svgo.dev/docs/plugins/removeViewBox/).
- **S20.** Next.js. [Static Exports](https://nextjs.org/docs/app/guides/static-exports).
- **S21.** W3C. [Content Security Policy Level 3](https://www.w3.org/TR/CSP3/), Working Draft 13/08/2026.
- **S22.** W3C. [Service Workers](https://www.w3.org/TR/service-workers/), Candidate Recommendation Draft 12/08/2026.
- **S23.** WHATWG. [Storage Standard — Storage pressure](https://storage.spec.whatwg.org/#storage-pressure).
- **S24.** Zhou Wang và cộng sự. [The SSIM Index](https://ece.uwaterloo.ca/~z70wang/research/ssim/), công trình gốc IEEE TIP 2004 và tài liệu/mã của tác giả.
- **S25.** WHATWG. [HTML Standard — DOMParser interface](https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#the-domparser-interface), `Exposed=Window` và khác biệt parsing/sanitization.
- **S26.** SVGO. [Browser usage](https://svgo.dev/docs/usage/browser/), entry `svgo/browser`.

[S1]: https://html.spec.whatwg.org/multipage/workers.html#terminate-a-worker
[S2]: https://emscripten.org/docs/porting/pthreads.html
[S3]: https://developer.chrome.com/docs/web-platform/webgpu/overview
[S4]: https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/lost
[S5]: https://www.w3.org/TR/device-memory/
[S6]: https://www.w3.org/TR/wasm-js-api-2/#error-condition-mappings-to-javascript
[S7]: https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects
[S8]: https://www.w3.org/TR/FileAPI/#dfn-type
[S9]: https://www.w3.org/TR/2025/REC-png-3-20250624/
[S10]: https://www.libpng.org/pub/png/libpng-manual.txt
[S11]: https://developer.mozilla.org/en-US/docs/Web/API/WorkerGlobalScope/createImageBitmap
[S12]: https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/getImageData
[S13]: https://html.spec.whatwg.org/multipage/canvas.html#premultiplied-alpha-and-the-2d-rendering-context
[S14]: https://www.w3.org/Graphics/JPEG/itu-t81.pdf
[S15]: https://www.w3.org/TR/SVG2/conform.html
[S16]: https://www.w3.org/TR/filter-effects-1/
[S17]: https://github.com/cure53/DOMPurify
[S18]: https://svgo.dev/docs/plugins/convertPathData/
[S19]: https://svgo.dev/docs/plugins/removeViewBox/
[S20]: https://nextjs.org/docs/app/guides/static-exports
[S21]: https://www.w3.org/TR/CSP3/
[S22]: https://www.w3.org/TR/service-workers/
[S23]: https://storage.spec.whatwg.org/#storage-pressure
[S24]: https://ece.uwaterloo.ca/~z70wang/research/ssim/
[S25]: https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#the-domparser-interface
[S26]: https://svgo.dev/docs/usage/browser/
