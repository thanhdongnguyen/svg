# R&D: Có thể phục hồi đúng SVG gốc từ PNG/JPG không?

**Không thể bảo đảm phục hồi đúng SVG gốc cho PNG/JPG bất kỳ chỉ từ pixel.** Đây là giới hạn của thông tin đầu vào: nhiều SVG khác nhau có thể tạo cùng một raster. Thêm CPU, WebAssembly, WebGPU, AI hoặc chuyển phép tính sang server không làm lời giải duy nhất xuất hiện. Sản phẩm có thể tạo một SVG mới rất giống ảnh; đó là mục tiêu khác với lấy lại file thiết kế ban đầu.

Đánh giá đối chiếu nguồn đến ngày 14/09/2026, theo điều kiện xử lý hoàn toàn trong trình duyệt, không gọi dịch vụ chuyển đổi và không nhúng raster vào SVG. Phân biệt rõ ba loại bằng chứng: tiêu chuẩn/mã nguồn/paper công bố, suy luận toán học trình bày dưới đây và phép kiểm tra fixture cục bộ. Không có benchmark mô hình AI hoặc tỷ lệ phục hồi của sản phẩm trong báo cáo này.

## 1. Bốn nghĩa khác nhau của “phục hồi”

| Mục tiêu | Nghĩa chính xác | Khả thi chỉ từ raster bất kỳ? |
| --- | --- | --- |
| Giống từng byte | Lấy lại đúng chuỗi XML, tên ID, thứ tự thuộc tính, số thập phân, comment, metadata ban đầu | Không bảo đảm; các thông tin không được vẽ không có trong pixel |
| Giống cấu trúc/ngữ nghĩa | Đúng layer, nhóm đối tượng, text/font, primitive, path, phần bị che, clipping, gradient ban đầu | Không bảo đảm; nhiều cấu trúc vẽ cùng hình |
| Tương đương khi render | Một SVG mới tạo cùng/gần cùng pixel trong renderer, viewport, nền và không gian màu đã xác định | Có thể ở một số trường hợp; không suy ra đã tìm đúng nguồn |
| Tái dựng hợp lý | Một SVG mới gần hình, có đường mượt, nhóm dễ sửa, primitive hợp lý | Khả thi có điều kiện; chất lượng phụ thuộc nội dung và phải đo |

“Cùng pixel ở 256 × 256” không đồng nghĩa “cùng hình học ở mọi kích thước”. “Cùng hình học khi hiển thị” cũng không đồng nghĩa “cùng file gốc”. Quyết định triển khai cần chọn đúng mục tiêu trước khi chọn thuật toán.

## 2. Phản ví dụ chứng minh không có phép nghịch đảo tổng quát

Xét hai file tự tạo sau, không có font, filter, script hoặc tài nguyên ngoài.

SVG A chỉ chứa một hình chữ nhật đỏ:

```svg
<svg xmlns="http://www.w3.org/2000/svg"
     width="64" height="64" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="#ff0000"/>
</svg>
```

SVG B chứa thêm hình tròn xanh, sau đó vẽ cùng hình chữ nhật đục phía trên:

```svg
<svg xmlns="http://www.w3.org/2000/svg"
     width="64" height="64" viewBox="0 0 64 64">
  <circle cx="32" cy="32" r="12" fill="#0000ff"/>
  <rect width="64" height="64" fill="#ff0000"/>
</svg>
```

SVG dùng mô hình vẽ lần lượt; vật được vẽ sau có thể che vật được vẽ trước. Phép compositing source-over thông thường có thành phần màu premultiplied `co = αs × Cs + αb × Cb × (1 − αs)`. Với hình chữ nhật phủ kín và đục (`αs = 1`), màu đầu ra là `Cs`, độc lập màu/nội dung bên dưới. Hình tròn nằm sâu bên trong vùng bị che, nên không có vấn đề antialias ở biên viewport làm lộ nó. [W3C SVG 2, Rendering Model](https://www.w3.org/TR/SVG2/render.html), [W3C Compositing and Blending Level 1, §5.1](https://www.w3.org/TR/compositing-1/#simplealphacompositing).

Gọi `R` là phép render cùng một cấu hình. Ta có `A ≠ B` nhưng `R(A) = R(B) = I`. Nếu một thuật toán `F` luôn phục hồi đúng file gốc từ raster `I`, nó đồng thời phải thỏa `F(I) = A` và `F(I) = B`, điều không thể vì `A ≠ B`. Thuật toán ngẫu nhiên cũng không thể cam kết đúng với xác suất 1 cho cả hai nguồn từ cùng đầu vào mà không có thông tin phân biệt.

Đây là **chứng minh bằng phản ví dụ**, không phải suy đoán rằng thư viện hiện tại chưa đủ mạnh. Một phản ví dụ đã đủ bác bỏ lời hứa áp dụng cho mọi đầu vào. Thậm chí quan sát cùng thiết kế ở vô số mức zoom vẫn không cho biết có hình tròn bị che hay không.

Một số mất mát khác không cần hình bị che:

- Đổi comment, tên layer hoặc thứ tự thuộc tính không nhất thiết đổi hình vẽ; byte nguồn vẫn khác.
- Cùng hình chữ nhật có thể viết bằng `<rect>` hoặc một đường khép kín; hình hiển thị không chỉ ra tác giả đã dùng primitive nào.
- Một đường Bézier có thể chia thành nhiều đoạn tương đương; số anchor gốc không do hình cuối quyết định.
- Text vẽ thành outline có thể trông như text dùng font, nhưng raster không lưu bằng chứng về cách tác giả biểu diễn chữ.

### Fixture browser có thể chạy lại

[original-svg-collision.html](/Users/dongnt/Desktop/github/svg/docs/research/evidence/original-svg-collision.html) là file độc lập: tự render A/B ở 64², 128², 256²; so mọi thành phần RGBA; encode riêng từng canvas thành PNG và JPEG cùng tham số; so byte và SHA-256. File không tải thư viện hoặc dữ liệu bên ngoài và giải phóng Blob URL sau decode.

Mở file trực tiếp bằng browser có hỗ trợ Web Crypto ở local origin, hoặc phục vụ thư mục này qua HTTP localhost. Khi chạy xong, `#result` hiển thị JSON, `window.collisionReport` chứa kết quả và thuộc tính `data-complete` của `<html>` bằng `true`. Kết quả đo cần ghi kèm browser/version; so byte của PNG/JPEG áp dụng cho encoder cụ thể trong lần chạy, không phải khẳng định mọi encoder tạo cùng cách nén. Bằng chứng bất khả phục hồi vẫn dựa trên cặp raster giống nhau và chứng minh ở trên.

**Đã kiểm chứng cục bộ ngày 14/09/2026 lúc 08:30:43 UTC, Chrome 152 trên macOS:** hai chuỗi nguồn có SHA-256 khác nhau, nhưng mọi thành phần RGBA và mọi byte PNG/JPEG của cặp A/B bằng nhau ở cả ba độ phân giải. [Kết quả JSON và hash đầy đủ](/Users/dongnt/Desktop/github/svg/docs/research/evidence/original-svg-collision-result.json).

| Độ phân giải | Thành phần RGBA khác nhau | Byte PNG khác nhau | Byte JPEG khác nhau |
| --- | ---: | ---: | ---: |
| 64 × 64 | 0 / 16.384 | 0 / 277 | 0 / 786 |
| 128 × 128 | 0 / 65.536 | 0 / 866 | 0 / 858 |
| 256 × 256 | 0 / 262.144 | 0 / 2.370 | 0 / 1.146 |

Mẫu số là tổng số thành phần/byte của **mỗi ảnh** trong lần đo, không phải chỉ số chất lượng của engine. Kết quả này còn loại trừ giả thuyết rằng một bộ phục hồi có thể phân biệt hai nguồn qua metadata hoặc cách nén của các PNG/JPEG cụ thể trong fixture: toàn bộ file encode của mỗi cặp giống nhau.

## 3. PNG lossless và JPEG quality cao không giải quyết được bài toán

PNG có thể lưu mẫu pixel không mất mát, đồng thời có các chunk chứa thông tin bổ sung. “Lossless PNG” nói về mẫu ảnh được mã hóa, không cam kết lưu cấu trúc tài liệu đã tạo ảnh. [W3C PNG Third Edition](https://www.w3.org/TR/png-3/).

Baseline JPEG dùng biến đổi DCT và lượng tử hóa, nên thông thường còn thêm sai lệch so với raster trước nén. Tiêu chuẩn T.81 cũng mô tả chế độ lossless riêng; do đó không nên khẳng định mọi JPEG đều mất mát. Dù dùng JPEG lossless, phản ví dụ che khuất vẫn tồn tại. [ITU-T T.81, §4 và Annex F/H](https://www.w3.org/Graphics/JPEG/itu-t81.pdf).

Chất lượng đầu vào thấp còn làm việc ước lượng đường, góc, dấu chữ và màu khó hơn. Khử nhiễu hoặc super-resolution có thể bổ sung một giả thuyết về chi tiết; chúng không chứng minh chi tiết ấy có trong SVG gốc. Với ảnh chụp từ camera, nhiều trường hợp vốn không có một “SVG gốc” để khôi phục.

## 4. Khi nào lấy lại nguồn chính xác có thể làm được?

| Thông tin bổ sung | Điều kiện đủ cần kiểm chứng | Tên tác vụ đúng |
| --- | --- | --- |
| Người dùng còn file SVG, bản backup hoặc lịch sử tài liệu | Đúng phiên bản, đúng tài nguyên phụ thuộc, giữ byte gốc | Khôi phục file/lấy lại phiên bản |
| PNG chứa đầy đủ nguồn SVG trong metadata theo quy ước đã biết | Payload còn nguyên, có định dạng rõ, xác minh tính toàn vẹn và nguồn gốc; không chỉ có tên phần mềm/ảnh preview | Trích xuất nguồn đã nhúng |
| Có một thư viện hữu hạn các SVG nguồn đã biết | Biết chắc ảnh được tạo từ thư viện đó; renderer, kích thước, màu, export/compression xác định; ánh xạ sau xuất không có hai ứng viên trùng nhau | Nhận diện/truy hồi trong tập đóng |
| Một template có tham số rời rạc, miền tham số hạn chế | Chứng minh tính phân biệt của các giá trị sau render, không chỉ thấy đúng trên vài ví dụ | Ước lượng tham số có ràng buộc |

PNG cho phép chunk text và private ancillary chunk; về nguyên lý có thể mang nguồn bổ sung. Đây là khả năng của container, không phải một bảo đảm rằng PNG thông thường chứa SVG. Không nên quảng bá “đọc metadata để khôi phục” trước khi có định dạng đầu vào cụ thể. [W3C PNG, §11.3.3 và §5.7.3](https://www.w3.org/TR/png-3/#11textinfo).

**Suy luận điều kiện:** với thư viện hữu hạn `S`, nếu biết `I = R(s)` cho một `s ∈ S` và `R` là đơn ánh trên `S`, tra cứu trả được duy nhất `s`. Nếu tồn tại hai mẫu cùng raster, biết chắc ảnh thuộc thư viện cũng chưa đủ. Với JPEG/nhiễu, phải xét các tập đầu ra có thể xảy ra của từng mẫu; nearest-neighbor cho ra ứng viên gần nhất chưa phải bằng chứng nguồn chính xác.

Một hash hoặc ID tự khai trong metadata chỉ là đầu mối nếu không có bản nguồn đối chiếu hoặc cơ chế xác thực. Với yêu cầu không gọi API, nguồn/thư viện phải đã có cục bộ; tìm ngược trên Internet là một workflow khác. Các ngoại lệ trên sử dụng thông tin ngoài pixel, nên không phủ định chứng minh ở mục 2.

## 5. AI sinh SVG có thay đổi kết luận không?

AI có thể học quy luật thiết kế để tạo cấu trúc hợp lý hơn tracing thuần túy: nhận ra hình tròn, chữ, biểu tượng, nhóm đối tượng hoặc chọn một gradient. Điều này hữu ích cho **tái dựng**, nhưng chọn cấu trúc có xác suất cao không đồng nghĩa xác định lịch sử tác giả. Trong cặp A/B, bất kỳ mô hình chỉ thấy raster nào cũng nhận đầu vào giống hệt.

| Công trình | Bằng chứng có liên quan | Giới hạn đối với yêu cầu dự án |
| --- | --- | --- |
| StarVector, CVPR 2025 | Sinh mã SVG từ ảnh, sử dụng các primitive và học trên dữ liệu SVG | Không chứng minh phục hồi file/DOM nguồn duy nhất |
| OmniSVG, bản paper v3 ngày 01/12/2025 | Sinh SVG đa phương thức, có nhóm illustration và character phức tạp hơn | Paper nêu thất bại trên ảnh tự nhiên và thời gian sinh dài với nhiều token |
| RLRF, bản paper v2 ngày 30/11/2025 | Học từ phản hồi sau render, cân bằng độ giống và độ gọn | Reward ảnh không có tín hiệu về vật thể bị che; độ dài context vẫn giới hạn |

StarVector được trình bày tại CVPR 2025. README tác giả giới hạn model vào icon, logo, technical diagram/graph/chart, và nêu rõ không dành cho natural images hoặc illustrations. Quickstart sử dụng Python/CUDA; bản demo Gradio có model worker, không phải suy luận trong browser. Các mô tả như “semantic structure” cần hiểu là cấu trúc model tạo ra, không phải xác nhận nguyên bản. [StarVector paper](https://openaccess.thecvf.com/content/CVPR2025/html/Rodriguez_StarVector_Generating_Scalable_Vector_Graphics_Code_from_Images_and_Text_CVPR_2025_paper.html), [StarVector repository](https://github.com/joanrod/star-vector).

OmniSVG là bằng chứng rằng mô hình đời sau có thể mở rộng từ icon sang illustration phức tạp; không nên dùng giới hạn StarVector để kết luận mọi AI đều chỉ làm icon. Tuy nhiên paper OmniSVG vẫn nêu phạm vi vector-style và thất bại với ảnh tự nhiên; việc sinh hàng chục nghìn token có thể chậm. Đó là kết luận của tác giả trong phạm vi thí nghiệm, chưa phải benchmark trên browser của dự án. [OmniSVG paper v3, §6](https://arxiv.org/html/2504.06263v3).

RLRF bổ sung feedback từ ảnh render thay vì chỉ học token nguồn. Paper dùng cả reward tái tạo, ngữ nghĩa và hiệu quả mã; còn ghi nhận lỗi reward hacking và giới hạn context. Đây là hướng tăng chất lượng bản tái dựng. Nó không cung cấp dữ liệu về nguồn bị che mà phép render đã loại bỏ. [RLRF paper v2, §3, Appendix A.5/C.4](https://arxiv.org/html/2505.20793v2).

### Chi phí triển khai trong browser

Model card StarVector-1B công bố quy mô khoảng một tỷ tham số. Để hình dung payload thô, `1 tỷ × 2 byte = 2 GB` nếu toàn bộ là 16-bit; `1 tỷ × 4 bit ≈ 0,5 GB` nếu lượng tử hóa lý tưởng. Đây là phép tính trọng số, **không phải dung lượng checkpoint hoặc peak memory đo được**; còn tokenizer, encoder, scale lượng tử hóa, activation, KV cache và bản sao buffer. [StarVector-1B model card](https://huggingface.co/starvector/starvector-1b-im2svg).

OmniSVG README hiện liệt kê 1.1_4B ở 7,69 GB và 1.1_8B ở 17,2 GB, cùng môi trường Python/PyTorch/CUDA. Số này do upstream công bố, không phải số đã tải và đo trong báo cáo. Trong tài liệu được kiểm tra chưa thấy browser SDK chính thức cho các model này. [OmniSVG repository, Models/Installation](https://github.com/OmniSVG/OmniSVG).

**Đánh giá triển khai:** có thể nghiên cứu port một model nhỏ/lượng tử hóa qua WebGPU/WASM, nhưng phải kiểm chứng hỗ trợ kiến trúc, operator, tokenizer, decoding, bộ nhớ, thời gian và chất lượng sau lượng tử hóa. Không thể suy ra “có ONNX Runtime Web” là các checkpoint trên chạy ngay. Tài liệu runtime cũng có giới hạn đối với model lớn; các giới hạn đó phải hiểu theo runtime/build/browser cụ thể. [ONNX Runtime Web, Large Models](https://onnxruntime.ai/docs/tutorials/web/large-models.html).

Phép thử browser của một model có thể chứng minh inference cục bộ khả thi trong cấu hình ấy. Nó không thể chứng minh khả năng khôi phục nguồn duy nhất, vì hai vấn đề độc lập.

## 6. Bổ sung vào đặc tả kỹ thuật

| Hạng mục | Quyết định |
| --- | --- |
| Tính năng “khôi phục đúng SVG gốc từ mọi PNG/JPG” | Loại khỏi cam kết; bất khả bảo đảm theo phản ví dụ |
| Tạo SVG có độ trung thực cao | Giữ; nghiệm thu hình render và khả năng chỉnh sửa theo lớp ảnh |
| Khôi phục text/font/layer | Chỉ mô tả là nhận diện/ước lượng; không cam kết nguyên bản |
| ML nhận dạng primitive/cấu trúc | Nhánh R&D tùy chọn, không là điều kiện cho tracing cơ bản |
| Trích xuất SVG từ metadata | Ngoài workflow PNG/JPG phổ thông; chỉ làm nếu sau này có định dạng và nhu cầu cụ thể |
| Mọi mã SVG sinh/trích xuất | Phải qua validation/sanitization trước preview; nội dung lấy từ metadata không tự trở nên đáng tin |

Mô hình dữ liệu nên phân biệt nguồn kết quả: `traced`, `model-reconstructed` và `source-extracted` nếu sau này có nhánh thứ ba. Trạng thái “source-extracted” chỉ dùng khi thực sự đọc được payload nguồn; không gán nó chỉ vì điểm SSIM cao hoặc model tự nhận đã phục hồi. Nếu output được sanitize hoặc optimize thì byte sẽ thay đổi; không gọi bản đã biến đổi đó là bản nguồn giống từng byte.

## 7. Nghiệm thu có thể đo mà không đánh tráo mục tiêu

Với fixture xuất từ SVG đã biết, giữ cả raster đầu vào và SVG chuẩn. Đo đầu ra render so với raster ở kích thước gốc; đồng thời render SVG chuẩn ở 2×/4× để đánh giá đường nét ngoài lưới đầu vào. Báo cáo thêm path, segment, primitive, nhóm/layer, text có chỉnh sửa được, lỗi lỗ/nét/góc và ngân sách thời gian/bộ nhớ.

Cần tách “ground truth dùng đánh giá” khỏi “thông tin đầu vào thuật toán”: thuật toán chỉ được thấy PNG/JPG nếu thử đúng bài toán raster inversion. Dùng SVG chuẩn để chọn kết quả đẹp nhất rồi báo như thể production làm được sẽ gây sai lệch đánh giá.

Với byte/cấu trúc, không dùng exact-match source làm thước đo chất lượng duy nhất: một bản vector mới khác XML vẫn có thể phục vụ người dùng tốt. Ngược lại, pixel error bằng 0 không chứng minh đúng layer hoặc font gốc. Cặp collision là test giải thích giới hạn, không là quality benchmark cho engine. Thí nghiệm nào chưa chạy phải được ghi là đề xuất, không được đưa số phỏng đoán vào cột kết quả.

## Nguồn

1. W3C. [SVG 2 — Rendering Model](https://www.w3.org/TR/SVG2/render.html), mô hình vẽ và thứ tự compositing.
2. W3C. [Compositing and Blending Level 1, §5.1](https://www.w3.org/TR/compositing-1/#simplealphacompositing), công thức alpha source-over.
3. W3C. [PNG Specification, Third Edition](https://www.w3.org/TR/png-3/), pixel, metadata và private chunk.
4. ITU-T. [T.81 / JPEG](https://www.w3.org/Graphics/JPEG/itu-t81.pdf), 1992, các chế độ lossy/lossless.
5. Rodriguez et al. [StarVector: Generating Scalable Vector Graphics Code from Images and Text](https://openaccess.thecvf.com/content/CVPR2025/html/Rodriguez_StarVector_Generating_Scalable_Vector_Graphics_Code_from_Images_and_Text_CVPR_2025_paper.html), CVPR 2025.
6. Tác giả StarVector. [Mã nguồn, README và giới hạn model](https://github.com/joanrod/star-vector), snapshot đọc ngày 14/09/2026.
7. Tác giả StarVector. [StarVector-1B model card](https://huggingface.co/starvector/starvector-1b-im2svg), snapshot đọc ngày 14/09/2026.
8. Yang et al. [OmniSVG: A Unified Scalable Vector Graphics Generation Model](https://arxiv.org/html/2504.06263v3), v3, 01/12/2025.
9. Tác giả OmniSVG. [OmniSVG repository](https://github.com/OmniSVG/OmniSVG), checkpoint 1.1 phát hành 02/12/2025; snapshot đọc ngày 14/09/2026.
10. Rodriguez et al. [Rendering-Aware Reinforcement Learning for Vector Graphics Generation](https://arxiv.org/html/2505.20793v2), v2, 30/11/2025.
11. Microsoft/ONNX Runtime. [Working with Large Models](https://onnxruntime.ai/docs/tutorials/web/large-models.html), snapshot đọc ngày 14/09/2026.

Các liên kết repository/model card biến đổi theo thời gian; trước khi tích hợp cần pin commit và revision trọng số. Báo cáo không khẳng định đã rà soát hết mọi model SVG tồn tại; kết luận bất khả phục hồi duy nhất không phụ thuộc việc tìm được model mới hơn.
