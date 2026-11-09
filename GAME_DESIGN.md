# GAME DESIGN DOCUMENT: "1, 2, 3 DÔ!" (Master Plan v1.0 — LOCKED & APPROVED)

## 1. Gameplay Loop Cốt Lõi
1. **Giai đoạn Đón khách (Join Phase):** Bàn nhậu có ghế trống. Người xem gõ `nhậu` hoặc `dô` trên livestream để tranh chỗ hoặc vào hàng chờ.
2. **Giai đoạn Nhập tiệc (Drinking Phase):** 
   - Nhân vật hiển thị tên và avatar TikTok trên ghế tương ứng.
   - Định kỳ mỗi `30 giây` (tăng `+5` độ say) hoặc khi tích lũy đủ mỗi `100` lượt Like mới hợp lệ (tăng `+1` độ say): Các người chơi đang `SEATED` trên bàn cùng uống / cụng ly.
   - Khán giả gửi Gift để tác động: ép uống 1 người, mời bia cả bàn, gửi nước giải say (chỉ cho người đang `SEATED`), hoặc gọi "Vợ bắt về".
3. **Giai đoạn Say & Đào thải (Knockout / Leaving Phase):**
   - Chỉ số say tăng từ `0` -> `100`.
   - Đạt `100` (`KO`) hoặc bị sự kiện "Vợ bắt về" (`LEAVING`): Khóa trạng thái người chơi đúng 1 lần, giữ ghế trong `3000ms` (3 giây) để phát animation.
   - Hết `3000ms`, nhân vật bị xóa khỏi ghế, ghế trở thành trống.
4. **Vòng lặp tiếp diễn (Continuous Loop):** Người đứng đầu hàng chờ (ưu tiên `VIP Queue` trước, `Normal Queue` sau, FIFO trong từng nhóm) được cấp ghế ngay lập tức.

## 2. Hệ thống Ghế, Hàng Chờ & Cơ chế Tham Gia / Rời Bàn *(Chính thức v1.0)*

### 2.1. Cấu trúc Ghế & Định Danh Người Chơi
- **Số ghế cố định:** 6 ghế (`seatIndex` từ `0` đến `5`), chia làm 2 hàng:
  - Hàng trên (phía sau bàn): Ghế 0, Ghế 1, Ghế 2 (Hiển thị: Ghế 1, 2, 3).
  - Hàng dưới (phía trước bàn): Ghế 3, Ghế 4, Ghế 5 (Hiển thị: Ghế 4, 5, 6).
- **Định danh duy nhất:** Mọi người chơi được định danh bằng `userId` ổn định từ TikTok. **Tuyệt đối không dùng `nickname` làm khóa định danh** vì người dùng có thể đổi tên hoặc trùng tên hiển thị.
- **Quy tắc chống trùng lặp (Uniqueness Invariant):**
  - Tại mọi thời điểm, một `userId` chỉ được xuất hiện tối đa **1 lần** trong toàn bộ hệ thống (hoặc đang ở 1 trong 6 ghế, hoặc nằm ở 1 vị trí duy nhất trong hàng chờ).
  - Người đang ngồi trên bàn (`SEATED`, `KO`, `LEAVING`) không thể tham gia lại hay vào hàng chờ.
  - Người đã có trong hàng chờ không thể xếp hàng thêm lần nữa.

### 2.2. Hàng Chờ Ưu Tiên Gift (VIP Priority Queue)
- **Giới hạn hàng chờ:** Tối đa `30` người (`maxQueueSize = 30`, tổng số lượng của `VIP Queue` + `Normal Queue` không vượt quá `30`).
- **Cấu trúc 2 nhóm ưu tiên (FIFO trong từng nhóm):**
  1. **Nhóm ưu tiên (`VIP Queue`):** Dành cho người xem tặng Gift đủ điều kiện đạt ngưỡng `vipGiftThreshold` (cấu hình riêng; **không mặc định mọi Gift đều có quyền VIP**).
  2. **Nhóm thông thường (`Normal Queue`):** Dành cho người xem bình luận từ khóa tham gia hợp lệ (`nhậu`, `dô`).
- **Bảo vệ người đang ngồi:** Người tặng Gift VIP **chỉ được ưu tiên trong hàng chờ**, **tuyệt đối không tự động đuổi người đang ngồi trên bàn** để nhường ghế.
- **Luật cấp ghế:**
  - Khi có ghế trống, hệ thống lấy người đầu tiên trong `VIP Queue` (theo FIFO).
  - Nếu `VIP Queue` trống, lấy người đầu tiên trong `Normal Queue` (theo FIFO).

### 2.3. Quy Tắc Chính Thức Cho Các Tình Huống Biên Của Hàng Chờ
1. **Khi bàn còn ghế trống (dưới 6 người) và hàng chờ trống:** Người comment lệnh hợp lệ hoặc tặng Gift đủ điều kiện được xếp ngồi ngay vào ghế trống có `seatIndex` nhỏ nhất.
2. **Nâng cấp thứ hạng trong hàng chờ (Normal -> VIP Promotion):** Nếu một `userId` đang đứng trong `Normal Queue` mà nhận/tặng Gift đủ điều kiện VIP, người đó được rút khỏi `Normal Queue` và đưa vào cuối `VIP Queue` theo quy tắc FIFO của nhóm VIP (không tạo bản ghi trùng và không chiếm thêm slot hàng chờ).
3. **Khi hàng chờ đã đủ 30 người (30/30):**
   - Người mới thuộc nhóm thường (`Normal`) sẽ bị từ chối vào hàng chờ.
   - **Nếu có VIP mới đủ điều kiện (chưa có mặt trên bàn hay trong hàng chờ):**
     - Nếu `Normal Queue` còn người (`normal.length > 0`): **Loại 1 người ở vị trí cuối cùng của `Normal Queue`** để nhường vị trí và thêm VIP mới vào cuối `VIP Queue`.
     - Nếu toàn bộ 30 người trong hàng chờ đều là VIP (`vip.length === 30`, `normal.length === 0`): **Từ chối VIP mới** (không loại người đang ngồi trên bàn, không loại người đã có VIP trong hàng chờ để nhận VIP mới).
4. **Rời hàng chờ & Tham gia lại:**
   - Người chơi sau khi bị loại khỏi bàn (hoàn tất `3000ms` animation rời bàn và ghế đã giải phóng hoàn toàn) mới được phép comment hoặc tặng Gift để tham gia lại từ đầu.

---

## 3. Hệ Thống Độ Say & Vòng Đời Loại Khỏi Bàn *(Chính thức v1.0)*

### 3.1. Quy Tắc Chỉ Số Độ Say (Drunk Gauge)
- **Phạm vi giá trị:** Số nguyên từ `0` đến `100`.
- **Xử lý tập trung (Backend Authoritative):** Mọi phép cộng/trừ độ say chỉ được tính toán tại Backend và luôn được giới hạn trong đoạn `[0, 100]` (`clampedDrunk = Math.max(0, Math.min(100, current + delta))`). Không cho phép chỉ số âm hoặc vượt `100`.
- **Xử lý tuần tự:** Nếu nhiều sự kiện (Gift, Like, Hô Dô) xảy ra cùng thời điểm, Backend xử lý tuần tự qua Sequential Event Queue. Animation phía Frontend chỉ phản ánh kết quả và **không bao giờ làm thay đổi kết quả logic của Backend**.
- **Trạng thái hiển thị theo ngưỡng:**
  - `0 – 29`: **Tỉnh táo (`SOBER`)** — Tư thế ngồi thẳng, mặt tỉnh táo.
  - `30 – 69`: **Ngà ngà (`TIPSY`)** — Mặt ửng hồng, đung đưa nhẹ.
  - `70 – 99`: **Say mềm (`DRUNK`)** — Mặt đỏ gay, mắt xoáy, lảo đảo mạnh.
  - `100`: **Gục tại bàn (`KO`)** — Chuyển sang quy trình đào thải.

### 3.2. Quy Trình KO & Giải Phóng Ghế (3000 ms)
1. **Khóa trạng thái KO đúng một lần:** Ngay tại khoảnh khắc `drunkLevel` chạm `100`, trạng thái người chơi chuyển từ `SEATED` sang `KO` đúng **1 lần duy nhất**.
2. **Miễn nhiễm tác động sau khi KO / LEAVING:** Khi người chơi đã ở trạng thái `KO` hoặc `LEAVING`:
   - Mọi sự kiện tăng say tiếp theo không còn tác dụng.
   - **Gift giải say không thể hồi sinh hoặc giảm độ say cho người đã `KO`.**
3. **Giữ ghế 3000 ms phát hoạt ảnh:** Backend giữ slot ghế đó trong đúng `3000ms` (3 giây) để Frontend phát trọn vẹn animation gục bàn / rời bàn.
4. **Xóa người chơi & Cấp ghế mới:** Hết `3000ms`, Backend xóa người chơi khỏi ghế, chuyển ghế về trống (`null`), và lập tức cấp ghế cho người đứng đầu hàng chờ theo luật ưu tiên.

### 3.3. Chính Sách Recovery Cho Người Chơi `KO` / `LEAVING` Khi Backend Restart *(Bản ghi quyết định ngày `2026-11-06`)*
- **Nội dung chính sách:** Khi Backend restart và khôi phục Game State từ snapshot, mọi người chơi đang ở trạng thái `KO` hoặc `LEAVING` được hoàn tất việc rời bàn ngay lập tức trong quá trình recovery (xóa khỏi ghế, không khởi tạo lại timer `3000ms`, không phát lại hiệu ứng `KO`/`LEAVING` cũ cho frontend). Nếu hàng chờ có người, cấp ghế ngay theo thứ tự `VIP Queue` (FIFO) trước, `Normal Queue` (FIFO) sau; bảo toàn bất biến không trùng `userId` và tính nhất quán của `stateVersion` cùng snapshot. Luật giữ ghế `3000ms` trong quá trình chơi bình thường và chính sách Gift/Like/VIP giữ nguyên không đổi.
- **Lý do:** Tránh tình trạng ghế bị kẹt ở trạng thái `KO`/`LEAVING` không có timer giải phóng sau khi tiến trình khởi động lại và tránh phát lại hoạt ảnh cũ trên màn hình livestream.

---

## 4. Cơ Chế Tương Tác & Sự Kiện Gameplay *(Chính thức v1.0)*

### 4.1. Vòng Lặp Cụng Ly Định Kỳ ("1, 2, 3 DÔ!")
- **Chu kỳ chính thức:** `30 giây` (`30000ms`).
- **Tác động chính thức:** Mỗi lần kích hoạt, tất cả người chơi đang ở trạng thái `SEATED` tăng **`+5` độ say**.
- **Điều kiện lọc nghiêm ngặt:**
  - Không tăng độ say cho ghế trống.
  - Không tác động lên người đã `KO` hoặc đang trong trạng thái rời bàn (`LEAVING`).
  - Nếu trên bàn không có người chơi nào ở trạng thái `SEATED`, bỏ qua lượt kích hoạt.
- **Quản lý Scheduler:** Mọi thay đổi thực hiện trên Backend. Chỉ duy trì **duy nhất 1 scheduler hợp lệ** trên Backend, tuyệt đối tránh tạo timer trùng khi kết nối lại. Frontend chỉ phát animation và âm thanh theo sự kiện từ Backend.

### 4.2. Cơ Chế Tương Tác Like
- **Quy tắc chính thức:** Cứ mỗi **`100` lượt Like mới hợp lệ**, toàn bộ người chơi đang ở trạng thái `SEATED` tăng **`+1` độ say**.
- **Chuẩn hóa & Cộng dồn số dư:**
  - Like nhận từ luồng sự kiện được chuẩn hóa thành số lượng tăng thêm hợp lệ (`likeDelta`), tuyệt đối **không tính trùng Like tích lũy**.
  - Lượt Like dư chưa đủ 100 được giữ trong `unconsumedLikes` để cộng dồn cho mốc tiếp theo.
  - *Ví dụ chuẩn:* Nhận `250` Like mới hợp lệ -> kích hoạt `2` mốc (mỗi người đang `SEATED` tăng `+2` độ say), còn dư `50` Like lưu vào `unconsumedLikes` cho đợt tiếp theo.
- **Điều kiện lọc & Hiển thị:**
  - Không áp dụng cho người đã `KO` hoặc `LEAVING`.
  - **Không tạo một animation riêng cho từng lượt Like đơn lẻ** (chỉ phát hiệu ứng khi đạt mốc 100 Like).
  - **Khi không có người chơi hợp lệ (`SEATED`) trên bàn:** Vẫn cộng `likeDelta` vào tổng Like hiển thị của phiên (`totalLikes`), nhưng **không tích lũy nổ mốc tăng độ say** (`unconsumedLikes` giữ ở `0` khi bàn không có người `SEATED` để tránh dồn độ say bất thường cho người mới vừa ngồi vào).

### 4.3. Cơ Chế Gift & Xử Lý Mục Tiêu Không Hợp Lệ
- **Bảng ánh xạ cấu hình (`Gift Mapping Table`):**
  - Không hardcode Gift ID chưa xác minh trong logic cốt lõi; không phụ thuộc vào tên hiển thị (`giftName`).
  - Ánh xạ `giftId -> ActionConfig` qua file cấu hình.
- **Xử lý Gift Combo / Streak & Chống trùng:**
  - Xử lý dựa trên `repeatCount` tăng thêm (`deltaRepeat`) và `repeatEnd` kết hợp khóa `(userId, giftId, groupId/msgId)` trong Deduplicator.
- **Quy tắc chính thức khi mục tiêu của Gift không hợp lệ:**
  - Backend kiểm tra tính hợp lệ của mục tiêu **tại đúng thời điểm thực thi sự kiện** trong Sequential Event Queue.
  - Nếu mục tiêu của Gift đã `KO`, `LEAVING` hoặc không còn ngồi trên bàn:
    1. **Không thay đổi độ say.**
    2. **Không chuyển tác động sang người chơi khác.**
    3. **Chỉ phát hiệu ứng hình ảnh hoặc thông báo tri ân phù hợp** (`stateChanged: false`).
    4. **Ghi nhận sự kiện đã được xử lý** trong Deduplicator để tránh phát lại.
    5. **Không cho phép Gift giải say hồi sinh người đã `KO`.**
- **Danh mục nhóm hành động Gift:**

| Mã Hành Động (`actionType`) | Tác động Game State (Mặc định) | Quyền Ưu Tiên VIP Queue | Ghi chú |
| :--- | :--- | :--- | :--- |
| `DRINK_SMALL` | `+10` độ say (1 mục tiêu đang `SEATED`) | Theo cấu hình `isVipEligible` | Mời 1 ly bia |
| `DRINK_MEDIUM` | `+25` độ say (1 mục tiêu đang `SEATED`) | Có (`true`) | Ép uống cạn ly |
| `DRINK_ALL` | `+15` độ say toàn bộ người đang `SEATED` | Có (`true`) | Bao cả bàn nhậu |
| `SOBER_UP` | `-20` độ say (chỉ mục tiêu đang `SEATED`) | Theo cấu hình `isVipEligible` | Giải say; **không hồi sinh người đã KO** |
| `WIFE_SUMMON` | Chuyển 1 mục tiêu đang `SEATED` sang `LEAVING` | Có (`true`) | Vợ bắt về ngay (giữ ghế `3000ms`) |

### 4.4. Sự Kiện "Vợ Bắt Về" (Wife Aggro Event)
- **Thông số chính thức cho Sự kiện Ngẫu nhiên:**
  - **Chu kỳ kiểm tra:** `60 giây` (`60000ms`).
  - **Xác suất kích hoạt:** `10%` (`0.10`) mỗi lần kiểm tra hợp lệ.
  - **Cooldown:** `180 giây` (`180000ms`) giữa các lần kích hoạt ngẫu nhiên thành công.
- **Điều kiện & Quy tắc thực thi:**
  - Chỉ kích hoạt khi có ít nhất 1 người chơi hợp lệ (`SEATED`) trên bàn (không kích hoạt khi bàn trống hoặc tất cả đang `KO`/`LEAVING`).
  - Không chọn người đã `KO` hoặc `LEAVING`.
  - Người bị chọn chuyển ngay sang trạng thái `LEAVING` theo State Machine (giữ ghế `3000ms` để phát animation bị vợ kéo về, sau đó xóa khỏi ghế và cấp ghế cho người tiếp theo).
  - Không xử lý loại cùng một người chơi nhiều lần.
- **Kích hoạt bằng Gift đặc biệt (`WIFE_SUMMON`):**
  - Hoạt động **độc lập với cooldown của sự kiện ngẫu nhiên** (không bị chặn bởi cooldown 180 giây và không làm reset cooldown ngẫu nhiên nếu cấu hình tách biệt).
  - Nếu mục tiêu chỉ định đã `KO` hoặc `LEAVING`, áp dụng đúng quy tắc mục tiêu không hợp lệ ở Mục 4.3 (không loại lại, không đổi sang người khác, chỉ phát thông báo/FX).

### 4.5. Quy Tắc AFK
- **Trạng thái chính thức trong MVP:** **Tắt AFK Kick mặc định** (`afkKickEnabled: false`).
- **Mở rộng tương lai:** Có thể bật qua cấu hình (`afkKickEnabled: true`) ở phiên bản sau. Không sử dụng việc thiếu bình luận làm bằng chứng chắc chắn rằng người xem đã rời livestream.

### 4.6. Thứ Tự Xử Lý Sự Kiện & Trường Hợp Biên (Event Order & Edge Cases)
Mọi sự kiện (từ TikTok Live, Mock Dashboard và Internal Timers như Hô DÔ / Vợ bắt về ngẫu nhiên) đều đi vào **Sequential Server Event Queue** và thực thi từng bước nguyên tử (atomic step):
1. **Kiểm tra trạng thái tức thời:** Mỗi sự kiện khi đến lượt thực thi sẽ đọc trạng thái mới nhất của ghế sau khi sự kiện liền trước đã hoàn tất.
2. **Đạt KO trong sự kiện diện rộng (Hô DÔ / Like / Gift cả bàn):** Nếu sự kiện tăng say toàn bàn làm nhiều ghế chạm `100` cùng lúc, tất cả các ghế đó đều chuyển sang `KO` trong cùng một `stateVersion`, mỗi ghế giữ `3000ms` rồi lần lượt nhận người mới từ hàng chờ theo thứ tự `seatIndex` tăng dần (`0 -> 5`).
3. **Sự kiện đến trong thời gian giữ ghế 3000 ms:** Trong 3 giây ghế đang ở trạng thái `KO` hoặc `LEAVING`, ghế vẫn chưa trống nên người trong hàng chờ chưa vào; mọi Gift nhắm vào ghế đó trong 3 giây này đều bị tính là mục tiêu không hợp lệ (không đổi độ say, không tác động người sắp vào).

---

## 5. Thiết Kế Giao Diện Pixel Art 2D & Bố Cục 9:16 *(Chính thức v1.0)*

### 5.1. Độ Phân Giải & Quy Tắc Scale Pixel Art
- **Độ phân giải logic chính thức:** `360 x 640` px (tỉ lệ `9:16`).
- **Scale:** `3x` nguyên lần.
- **Output mục tiêu (OBS Browser Source):** `1080 x 1920` px.
- **Pixel rendering:** `nearest-neighbor` (`pixelArt: true`, `antialias: false`, `roundPixels: true`).
- **Tách biệt Assets và Logic:** Trong MVP sử dụng placeholder chuẩn hóa kích thước và vị trí; có thể thay thế toàn bộ hình ảnh sang Pixel Art hoàn chỉnh ở giai đoạn sau mà không thay đổi Game State.

### 5.2. Bố Cục Chi Tiết Màn Hình 9:16 & Vùng An Toàn (Safe Zones)
```
+---------------------------------------------------+ (0, 0) [Logic: 360x640 | OBS: 1080x1920]
| [VÙNG TRÁNH UI TIKTOK TOP] (Y: 0..120px OBS)      | Tránh avatar Host, số mắt xem của TikTok
+---------------------------------------------------+
| [1. VÙNG TIÊU ĐỀ GAME - TOP BAR]                  | Y: 120..240px OBS (Logic Y: 40..80)
| Biển hiệu: "1, 2, 3 DÔ!" | Tổng Like & Tiến độ mốc|
+---------------------------------------------------+
| [2. VÙNG THÔNG BÁO SỰ KIỆN - EVENT BANNER]        | Y: 240..390px OBS (Logic Y: 80..130)
| Hiển thị: Cụng ly, Gift, KO, Vợ bắt về            |
+---------------------------------------------------+
| [3. KHU VỰC BÀN NHẬU CHÍNH - PLAYFIELD]           | Y: 390..1170px OBS (Logic Y: 130..390)
|                                                   | Lề an toàn phải: cách mép phải 120px OBS
|    [Ghế 1 (0)]    [Ghế 2 (1)]    [Ghế 3 (2)]      | Hàng ghế sau (Logic Y: 205)
|   +-------------------------------------------+   |
|   |        BÀN NHỰA ĐỎ & MỒI NHẬU, BIA        |   | Mặt bàn chính (Logic Y: 265)
|   +-------------------------------------------+   |
|    [Ghế 4 (3)]    [Ghế 5 (4)]    [Ghế 6 (5)]      | Hàng ghế trước (Logic Y: 325)
|                                                   |
+---------------------------------------------------+
| [4. VÙNG HÀNG CHỜ & HƯỚNG DẪN TƯƠNG TÁC]          | Y: 1170..1440px OBS (Logic Y: 390..480)
| Hàng chờ: VIP (..) | Thường (..) [Tối đa 30]      | Đặt cao hơn vùng chat của TikTok Live
| Hướng dẫn: Comment "nhậu" | 100 Like = +1 độ say  |
+---------------------------------------------------+
| [VÙNG AN TOÀN ĐÁY - TIKTOK CHAT OVERLAY ZONE]     | Y: 1440..1920px OBS (Logic Y: 480..640)
| Chỉ vẽ nền vỉa hè tĩnh, tuyệt đối không đặt HUD   | Tránh bị khung bình luận và nút Gift TikTok che
+---------------------------------------------------+ (1080, 1920)
```

### 5.3. Kích Thước Placeholder Chuẩn & Giới Hạn Hiển Thị (Trên Hệ Tọa Độ Logic `360x640`)
- **Bàn nhậu trung tâm:** `220 x 80 px` (tâm tại `X: 170, Y: 265`).
- **Tọa độ 6 vị trí ghế:**
  - Ghế 1 (`seatIndex: 0`): `(85, 205)` | Ghế 2 (`seatIndex: 1`): `(170, 205)` | Ghế 3 (`seatIndex: 2`): `(255, 205)`
  - Ghế 4 (`seatIndex: 3`): `(85, 325)` | Ghế 5 (`seatIndex: 4`): `(170, 325)` | Ghế 6 (`seatIndex: 5`): `(255, 325)`
- **Sprite Nhân vật (Placeholder / Thực tế):** `48 x 48 px` (neo `origin(0.5, 1.0)`).
- **Khung Avatar TikTok:** `20 x 20 px`.
- **Thanh Độ Say (Drunk Gauge Bar):** `44 x 6 px` (Xanh lá `0–29`, Vàng `30–69`, Đỏ cam `70–99`, Nhấp nháy tím/đỏ `100`).
- **Giới hạn hiển thị `nickname`:** Tối đa **12 ký tự** trên HUD nhân vật (thêm `…` nếu vượt quá); bong bóng chat tối đa **40 ký tự**.

### 5.4. Thứ Tự Layer Hiển Thị (Z-Order / Depth Hierarchy)
1. **Layer `0` (`BG_BASE`):** Nền đường phố, vỉa hè, tường quán ban đêm.
2. **Layer `10` (`BG_AMBIENT`):** Xe cộ chạy ngang phía xa, đèn đường.
3. **Layer `20` (`BACK_ROW_SEATS`):** Ghế nhựa và nhân vật hàng sau (`seatIndex: 0, 1, 2`).
4. **Layer `30` (`TABLE_AND_PROPS`):** Bàn nhậu chính, đĩa mồi, chai bia trên bàn.
5. **Layer `40` (`FRONT_ROW_SEATS`):** Ghế nhựa và nhân vật hàng trước (`seatIndex: 3, 4, 5`).
6. **Layer `50` (`ACTION_FX_LAYER`):** Hoạt ảnh cụng ly, hiệu ứng bọt bia, nhân vật "Vợ" kéo người chơi.
7. **Layer `60` (`PLAYER_WORLD_UI`):** Khung Avatar, Nickname, Thanh độ say, Bong bóng chat.
8. **Layer `70` (`SCREEN_HUD`):** Bảng hiệu "1, 2, 3 DÔ!", khung Hàng chờ VIP/Thường, bảng Hướng dẫn.
9. **Layer `80` (`EVENT_BANNER_AND_SYSTEM`):** Thông báo Gift/Sự kiện và chỉ báo trạng thái kết nối.

### 5.5. Bảng Màu Đêm Vỉa Hè (Định Hướng Thiết Kế Chính Thức)
- **Nền đêm vỉa hè (`Night Asphalt`):** `#181425` / `#262B44`
- **Ánh đèn dây tóc quán nhậu (`Warm Streetlight`):** `#FEAE34` / `#FEE761`
- **Đỏ bàn ghế nhựa (`Plastic Red`):** `#E43B44` / `#9E2835`
- **Xanh ghế nhựa (`Plastic Blue`):** `#0099DB` / `#124E89`
- **Thanh độ say (Tỉnh -> Ngà -> Say -> KO):** `#63C74D` -> `#FEAE34` -> `#E43B44` -> `#B55088`
- **Chữ UI & Viền Pixel:** Trắng kem `#FFFFFF` với viền đen `#181425` dày `1px`–`2px`.

### 5.6. Quy Tắc Hiển Thị Các Trạng Thái Hệ Thống Đặc Biệt
- **Khi bàn trống (0/6 người):** Hiển thị 6 ghế nhựa trống kèm biển vẫy giữa bàn: *"Bàn đang trống! Bình luận 'nhậu' để mở hàng!"*.
- **Khi bàn đầy (6/6 người):** Ẩn biển mời giữa bàn, làm nổi bật khung **Hàng chờ** bên dưới.
- **Khi mất kết nối tạm thời:** Giữ nguyên hình ảnh bàn nhậu hiện tại, hiển thị biểu tượng nhỏ góc trên bên trái *"Đang đồng bộ lại kết nối..."*.

## 6. Danh Mục Assets (MVP Placeholder vs Bản Hoàn Thiện)
- **Giai đoạn MVP (Placeholder):** Sử dụng hình khối/sprite placeholder đúng kích thước chuẩn (`48x48` cho nhân vật với 6 trạng thái hiển thị: `IDLE`, `CHEERS`, `DRINK`, `DIZZY`, `KO`, `WIFE_DRAG`; `220x80` cho bàn), tách biệt hoàn toàn khỏi Game State.
- **Giai đoạn Hậu MVP (Full Pixel Art & Audio):** Thay thế bằng spritesheet Pixel Art hoàn chỉnh mà không sửa đổi Game State.
