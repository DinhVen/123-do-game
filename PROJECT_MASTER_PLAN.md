# PROJECT MASTER PLAN: "1, 2, 3 DÔ!" (Version 1.0 — LOCKED & APPROVED)

## 1. Tổng quan & Tầm nhìn dự án
- **Tên dự án:** 1, 2, 3 DÔ!
- **Phiên bản tài liệu:** Master Plan v1.0 (Chính thức — Đã phê duyệt và khóa thiết kế).
- **Thể loại:** TikTok Live Interactive Game (Trò chơi tương tác livestream).
- **Phong cách thị giác:** Pixel Art 2D, phong cách quán nhậu vỉa hè Việt Nam về đêm.
- **Độ phân giải & Tỉ lệ:** Logic gốc `360x640` (9:16), scale `3x` (`nearest-neighbor`) lên `1080x1920` cho TikTok Live & OBS Browser Source.
- **Tầm nhìn:** Tạo trải nghiệm giải trí mang đậm bản sắc văn hóa vỉa hè Việt Nam, thúc đẩy người xem TikTok tương tác theo thời gian thực (comment, like, gift) để tranh ghế, mời rượu, ép rượu và hạ gục đối thủ trên bàn nhậu ảo.

## 2. Đối tượng mục tiêu & Động lực tham gia
- **Streamer / Host:** Cần công cụ tương tác giữ chân người xem, tăng thời lượng xem trung bình, gia tăng like và doanh thu từ gift TikTok.
- **Người xem vãng lai:** Thấy vui nhộn, âm thanh sống động, comment dễ dàng để xuất hiện trên màn hình.
- **Top Supporter (Gifter):** Thể hiện quyền lực bằng cách donate quà để kích hoạt hiệu ứng đặc biệt (ép uống, gọi "vợ bắt về", bao trọn bàn).

## 3. Trải nghiệm cốt lõi (Core Experience)
- **Cạnh tranh ghế ngồi:** Bàn nhậu chỉ có 6 ghế. Hàng trăm người xem comment tranh 1 ghế trống.
- **Đấu tửu lượng (Drunk Gauge):** Giữ tỉnh táo càng lâu càng nhận danh hiệu/điểm danh dự; hoặc cố tình "troll" ép người khác say gục.
- **Hài hước vỉa hè:** Cụng ly "1, 2, 3 DÔ!", té ghế, bò ra sàn, vợ cầm chổi rượt, đĩa mồi, tiếng khui bia póc-chát.

## 4. Phạm vi dự án (Scope)

### 4.1. Giai đoạn MVP (Phạm vi hiện tại — Đã khóa v1.0)
- **Quản lý bàn & hàng chờ:** 1 bàn nhậu 6 ghế cố định, hàng chờ tối đa 30 người chia thành `VIP Queue` và `Normal Queue` (FIFO trong từng nhóm, không đuổi người đang ngồi).
- **Định danh người chơi:** Sử dụng TikTok `userId` ổn định, chống trùng lặp tuyệt đối trong bàn và hàng chờ.
- **Cơ chế tham gia:** Comment từ khóa cấu hình (ví dụ: `nhậu`, `dô`) để nhận ghế trống hoặc vào hàng chờ.
- **Cơ chế tương tác:**
  - Comment thường: Hiển thị bong bóng chat trên đầu nhân vật đang ngồi.
  - Like: Chuẩn hóa thành số lượng tăng thêm (`likeDelta`), cứ mỗi `100` lượt Like mới hợp lệ thì toàn bộ người chơi đang `SEATED` tăng `+1` độ say (Like dư cộng dồn sang mốc tiếp theo).
  - Gift TikTok: Ánh xạ qua bảng cấu hình `giftId` thành hành động tăng say, giải say (chỉ khi đang `SEATED`), ưu tiên hàng chờ VIP hoặc gọi "Vợ bắt về". Nếu mục tiêu đã `KO`/`LEAVING` hoặc rời bàn: không đổi độ say, không chuyển mục tiêu sang người khác, chỉ phát hiệu ứng hình ảnh/thông báo.
- **Sự kiện đặc biệt:**
  - Hô "1, 2, 3 DÔ!" định kỳ mỗi `30 giây`, tăng `+5` độ say cho toàn bộ người chơi đang `SEATED`.
  - "Vợ bắt về" kích hoạt bằng Gift đặc biệt hoặc sự kiện ngẫu nhiên (kiểm tra mỗi `60 giây`, xác suất `10%`, cooldown `180 giây`).
- **Vòng đời nhân vật:**
  - Ngồi vào (`SEATED`) -> Uống bia tăng độ say (`0–100`) -> Đạt `100` chuyển sang `KO` đúng 1 lần (hoặc `LEAVING` khi bị Vợ bắt), giữ ghế `3000ms` phát hoạt ảnh -> Rời ghế (`EVICTED`) -> Cấp ghế cho người tiếp theo trong hàng chờ.
  - Mặc định tắt AFK Kick trong MVP (hỗ trợ bật lại qua cấu hình).
- **Đồ họa MVP:** Độ phân giải logic `360x640` scale `3x` (`nearest-neighbor`) lên `1080x1920`. Sử dụng bộ asset placeholder đúng kích thước và vị trí chuẩn, tách biệt hoàn toàn khỏi Game State để thay thế hình ảnh sau này mà không sửa logic.
- **Hệ thống Mock Controller độc lập:** Kiểm thử đầy đủ 100% tính năng trước khi kết nối TikTok Live thật.

### 4.2. Giai đoạn mở rộng (Post-MVP - Tương lai)
- Hoàn thiện bộ sprite Pixel Art chi tiết và hiệu ứng môi trường nâng cao sau khi gameplay ổn định.
- Mở rộng nhiều bàn nhậu (Bàn VIP, Bàn Đại Gia).
- Mini-game phụ: Oẳn tù tì uống bia, vòng quay sát phạt.
- Hệ thống lưu trữ cơ sở dữ liệu lâu dài (MongoDB/PostgreSQL) cho bảng xếp hạng "Chiến thần nhậu".
- Tùy biến trang phục nhân vật, chủ đề quán nhậu theo mùa.

## 5. Các Quyết Định Thiết Kế Chính Thức (Approved & Locked v1.0)

1. **Sự kiện "Vợ bắt về" ngẫu nhiên & Gift:**
   - Chu kỳ kiểm tra ngẫu nhiên: `60 giây`; xác suất kích hoạt: `10%` mỗi lần kiểm tra hợp lệ; cooldown: `180 giây` giữa các lần kích hoạt ngẫu nhiên.
   - Chỉ kích hoạt khi có người chơi hợp lệ (`SEATED`) trên bàn; không chọn người đã `KO` hoặc `LEAVING`.
   - Người bị chọn chuyển sang trạng thái `LEAVING` theo State Machine (giữ ghế `3000ms`), không xử lý loại người chơi nhiều lần.
   - Gift đặc biệt kích hoạt sự kiện này độc lập với cooldown ngẫu nhiên.
2. **Vòng lặp "1, 2, 3 DÔ!":**
   - Chu kỳ: `30 giây`; mỗi lần kích hoạt tất cả người chơi đang `SEATED` tăng `+5` độ say.
   - Không tác động lên ghế trống, người đã `KO` hoặc `LEAVING`.
   - Mọi thay đổi thực hiện trên Backend với duy nhất 1 scheduler hợp lệ (tránh timer trùng); Frontend phát animation và âm thanh theo sự kiện Backend.
3. **Tương tác Like:**
   - Cứ mỗi `100` lượt Like mới hợp lệ, toàn bộ người chơi đang `SEATED` tăng `+1` độ say.
   - Chuẩn hóa thành số lượng tăng thêm, không tính trùng Like tích lũy; lượt Like dư được cộng dồn cho mốc tiếp theo (ví dụ: nhận `250` Like mới -> kích hoạt `2` mốc, còn dư `50`).
   - Không áp dụng cho người đã `KO` hoặc `LEAVING`; không tạo animation riêng cho từng lượt Like.
4. **Hàng chờ ưu tiên Gift (VIP Priority Queue):**
   - Tối đa `6` ghế, hàng chờ tối đa `30` người chia thành `VIP Queue` và `Normal Queue` (FIFO trong từng nhóm, ưu tiên VIP khi có ghế trống).
   - Không tự động đuổi người đang ngồi.
   - Khi hàng chờ đã đủ `30` người: nếu có VIP mới đủ điều kiện và `Normal Queue` còn người -> loại người cuối `Normal Queue` để nhường vị trí; nếu toàn bộ 30 người đều là VIP -> từ chối VIP mới; không loại người đang ngồi, không loại VIP cũ để nhận VIP mới, không tạo bản ghi trùng.
   - Nếu người đang trong `Normal Queue` nhận Gift đủ điều kiện -> nâng cấp thành VIP theo quy tắc FIFO của nhóm VIP, không chiếm thêm slot.
   - Ngưỡng Gift đủ điều kiện VIP được cấu hình riêng (không mặc định mọi Gift đều có quyền VIP).
5. **Xử lý Gift tác động lên mục tiêu không hợp lệ:**
   - Kiểm tra tính hợp lệ của mục tiêu tại thời điểm Backend thực thi sự kiện.
   - Nếu mục tiêu đã `KO`, `LEAVING` hoặc không còn ngồi trên bàn: **không thay đổi độ say, không chuyển tác động sang người khác**, chỉ phát hiệu ứng hình ảnh/thông báo phù hợp, ghi nhận sự kiện đã xử lý để tránh phát lại.
   - Không cho phép Gift giải say hồi sinh người đã `KO`.
6. **Độ phân giải, Pixel Art & Assets MVP:**
   - Độ phân giải logic chính thức: `360x640` (9:16), scale `3x` (`nearest-neighbor`) lên `1080x1920`.
   - Giữ bảng màu đêm vỉa hè Việt Nam làm định hướng thiết kế chính thức.
   - Sử dụng placeholder chuẩn kích thước/vị trí trong MVP, tách biệt hoàn toàn khỏi Game State để thay thế bằng Pixel Art hoàn chỉnh ở giai đoạn sau mà không thay đổi Game State.
7. **Nền tảng Kiến trúc & Công nghệ:**
   - Backend là Single Source of Truth; người chơi định danh bằng `userId`; độ say giới hạn `0–100`; `KO` đúng 1 lần; giữ ghế `3000ms` sau `KO`/`LEAVING`; tắt AFK Kick mặc định trong MVP.
   - Công nghệ cố định: Node.js, Express, Socket.io, Phaser 3, Vite, `tiktok-live-connector`, OBS Browser Source, ưu tiên hoàn thiện Mock Mode trước TikTok Live thật.
8. **Chính sách Khôi phục Trạng thái (Snapshot Recovery Policy — Bản ghi quyết định ngày `2026-11-06`):**
   - **Nội dung:** Khi Backend restart và khôi phục Game State từ snapshot (`data/state-snapshot.json`), mọi người chơi đang ở trạng thái `KO` hoặc `LEAVING` phải được hoàn tất việc rời bàn ngay trong quá trình recovery (xóa khỏi ghế, không khởi tạo lại timer `3000ms` cho những người này, không phát lại hiệu ứng `KO`/`LEAVING` cũ cho frontend); nếu có người trong hàng chờ thì cấp ghế ngay theo thứ tự `VIP Queue` trước, `Normal Queue` sau (FIFO trong từng nhóm), không tạo `userId` trùng và đảm bảo `stateVersion` cùng snapshot nhất quán. Không thay đổi luật giữ ghế `3000ms` khi `KO`/`LEAVING` trong quá trình chơi bình thường.
   - **Lý do:** Timer `3000ms` trong bộ nhớ RAM bị mất khi tiến trình restart; hoàn tất rời bàn ngay khi recovery giúp ngăn chặn ghế bị chiếm vĩnh viễn bởi trạng thái `KO`/`LEAVING` mồ côi, tránh tạo timer trùng hoặc phát lại hoạt ảnh cũ gây lệch trạng thái với Frontend.

### 5.1. Cấu hình dữ liệu vận hành (Open Configuration Items)
- Bảng ánh xạ mã `giftId` thực tế của TikTok sang các hành động (`DRINK_SMALL`, `DRINK_MEDIUM`, `DRINK_ALL`, `SOBER_UP`, `WIFE_SUMMON`) và giá trị xu cụ thể của ngưỡng `vipGiftThreshold` sẽ được nạp từ `config/default.json` (dùng ID chuẩn giả lập ở Giai đoạn 1–3 và đối chiếu ID TikTok thực ở Giai đoạn 4).

## 6. Yêu cầu chức năng (FR)
- **FR-01 (Authoritative Seat & Queue Management):** Backend là nguồn trạng thái duy nhất quản lý 6 ghế và hàng chờ 30 chỗ (2 mức ưu tiên VIP/Normal), định danh bằng `userId`.
- **FR-02 (Deterministic Drunk & KO State Machine):** Quản lý độ say `0–100` tại Backend, khóa trạng thái khi KO hoặc bị Vợ bắt, giữ ghế 3 giây chờ animation trước khi cấp ghế mới.
- **FR-03 (Realtime State Sync & Versioning):** Đồng bộ trạng thái qua Socket.io kèm `stateVersion` và `eventId`, hỗ trợ State Snapshot khi kết nối lại.
- **FR-04 (TikTok & Mock Event Pipeline):** Chuẩn hóa sự kiện từ `tiktok-live-connector` và Mock Dashboard qua bộ Normalizer, Deduplicator (có TTL và giới hạn RAM) và Rate Limiter.
- **FR-05 (Pixel Art 9:16 Presentation):** Hiển thị trên Phaser 3 với hệ tọa độ logic thống nhất, scale `nearest-neighbor`, Animation Queue có giới hạn chống nghẽn.

## 7. Yêu cầu phi chức năng (NFR)
- **NFR-01 (Độ trễ mục tiêu):** Hướng tới thời gian phản hồi từ lúc Server nhận sự kiện hợp lệ đến khi phát lệnh tới Client < 500ms trong điều kiện tải thông thường.
- **NFR-02 (Kiểm soát bộ nhớ & Chống tràn):** Mọi hàng đợi (Waiting Queue, Server Event Queue, Client Animation Queue, Deduplication Cache, Rate Limit Map) phải có giới hạn kích thước cứng (Bounded Memory) và TTL.
- **NFR-03 (Bảo mật & An toàn dữ liệu):** Mock Dashboard chỉ truy cập từ `localhost` hoặc có token xác thực; kiểm tra và cắt giới hạn độ dài input (`nickname`, `comment`); tuyệt đối không ghi log cookie, session hoặc token.
- **NFR-04 (Khả năng phục hồi & Khởi động lại):** Tự động kết nối lại Socket.io/TikTok Live mà không nhân đôi bộ đếm timer. Có cơ chế lưu/khôi phục trạng thái bàn nhậu khi tiến trình Backend cần khởi động lại.

## 8. Tiêu chí đánh giá thành công
1. Toàn bộ luật chơi (6 ghế, hàng chờ VIP/Thường, độ say 0-100, KO giữ ghế 3s, Vợ bắt về, cụng ly định kỳ) vượt qua kịch bản kiểm thử trên Mock Mode trước khi nối TikTok thật.
2. Không xảy ra lỗi cộng trùng Gift streak/combo hoặc cộng trùng Like tích lũy.
3. Thay thế file hình ảnh từ placeholder sang sprite Pixel Art mà không cần sửa bất kỳ dòng code nào trong `gameStateManager`.
4. Vận hành ổn định trên OBS Browser Source khung hình dọc 9:16, tự đồng bộ lại trạng thái khi rớt mạng tạm thời.
