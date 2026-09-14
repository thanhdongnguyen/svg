# Đối chiếu thiết kế ảnh 3

final result: passed

Phạm vi kết luận: đối chiếu thị giác màn hình đầu và các trạng thái đã xem với ảnh 3, theo design system của repository. Không phải chứng nhận toàn bộ E2E hay chất lượng mọi ảnh; các khoảng trống kiểm thử ở `docs/testing/implementation-verification.vi.md`.

## Hai artifact

- Nguồn: `/Users/dongnt/.codex/generated_images/01a09f1e-6152-7b50-88ec-1b8be5bf8ed2/exec-02279a02-a9bd-435e-8f72-f46be89566cc.png`, ảnh 3 đã chọn, 1484×1060 px.
- Render: `http://127.0.0.1:4173`, screenshot `docs/testing/screenshots/desktop-final.png`, viewport 1484×1060 CSS px, DPR 1, trang `/`, không login, light, trạng thái ảnh mẫu.
- Cặp so sánh cùng một input: `docs/testing/screenshots/design-comparison-final.png`. Hai ảnh được đặt cạnh nhau cùng tỉ lệ bằng trang QA cục bộ; phần typography bên dưới giữ kích thước native và crop cùng vùng. Không dùng việc xem riêng hai ảnh để kết luận.

## Vòng đối chiếu và sửa

1. Capture đầu: `desktop-initial.png` có hero cao hơn nhịp của nguồn. Giảm padding dọc desktop, đưa khung so sánh về khoảng y=344 px. Ở lượt quan sát sớm hơn từng thiếu SVG mẫu; lỗi đã được sửa bằng việc sinh kết quả trace thật trước các board đối chiếu đã lưu.
2. Board `design-comparison.png`: phát hiện P2 artwork nhỏ và heading hơi nhẹ. Tăng diện tích artwork trong pane, đổi heading sang weight 700, tăng supporting text desktop lên 20 px.
3. Board `design-comparison-final.png`: đã mở và kiểm tra cặp nguồn/render sau sửa. Artwork lớn hơn, nhịp hero/khung so sánh khớp gần nguồn; không cắt mất cá hoặc hoa; heading hai dòng rõ và có trọng lượng gần nguồn. Không còn P0/P1/P2 thị giác cần sửa trong phạm vi màn hình đã kiểm.

## Năm bề mặt bắt buộc

| Bề mặt | Kết luận |
|---|---|
| Typography | Dùng Geist heading và Inter body của preset hiện có, self-host qua next/font. Tiêu đề 64 px ở desktop, weight 700, hai dòng. Không xác định font gốc từ hình như một fact; đây là bản thích nghi theo font dự án. |
| Khoảng cách/layout | Max-width 1312, margin x≈86 ở viewport 1484, header 64; CTA bên phải, khung hai pane bên dưới. Mobile 390 dùng một pane và tab để xem rõ ảnh. |
| Màu/tokens | Background trắng, foreground trung tính, primary SKY theo `components.json`/globals. Khác xanh tím của ảnh tham chiếu là chủ ý tuân thủ AGENTS; nút bo pill cũng giữ Base Luma preset. Không thêm gradient trang trí. Ô lưới là nền kiểm alpha. |
| Artwork | Koi xanh, lá và hoa coral được tạo riêng từ art direction ảnh 3; không phải crop screenshot UI hoặc đồ họa dựng từ CSS. Bên SVG là output engine thật. Cảnh báo xấp xỉ giải thích phần thô/vệt khi trace; không dùng bản raster giả làm kết quả. |
| Copy/nội dung | Giữ hero “Ảnh của bạn. Dưới dạng vector.” và workflow không tài khoản. Bổ sung format/giới hạn trước chọn ảnh, cảnh báo, hướng dẫn, trạng thái thật và metric có dữ liệu. Không đưa benchmark/R&D hoặc phần trăm chính xác vào lời hứa marketing. |

Khác biệt chấp nhận: shape/crop koi không trùng pixel với hình ideation; màu/radius/typography tuân theo preset repository; nhãn pane đặt góc để không dịch chuyển khi zoom. Mock chỉ có trạng thái mẫu, nên settings, errors, progress và download là phần triển khai thêm.

## Trạng thái đã xem

Desktop light, source/result và PNG alpha trên nền đen ở zoom 150%; lỗi input; mobile 390 light/dark và result; focus bàn phím; tab gốc/SVG; dialog hướng dẫn. Screenshot trong `docs/testing/screenshots`. Mobile không tràn ngang (document scrollWidth = innerWidth = 390).

## Checklist

- [x] Mở source và capture render thật bằng @Browser.
- [x] Đặt ảnh nguồn và render cạnh nhau, cùng tỉ lệ; có crop typography ở native scale.
- [x] Sửa hero height, image sizing, heading weight và capture lại.
- [x] Kiểm tra desktop/mobile, light/dark, lỗi và output thật.
- [x] Ghi rõ khác biệt do design system và giới hạn engine.
- [ ] Kiểm tra native Finder drag, trình duyệt khác và thiết bị thật — khoảng trống test, không được tuyên bố đã đạt.
