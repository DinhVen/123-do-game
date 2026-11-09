# IMPLEMENTATION PLAN: "1, 2, 3 DÔ!" (Master Plan v1.0 — LOCKED & APPROVED)

Lộ trình triển khai được chia làm 5 giai đoạn tuần tự. Nguyên tắc cốt lõi: **Xây dựng và hoàn thiện Mock Mode & Gameplay Engine trước, tích hợp TikTok Live sau. Tuyệt đối không tự động bắt đầu hay chuyển giai đoạn khi chưa có lệnh phê duyệt.**

---

## Giai đoạn 1: Nền tảng Backend, Authoritative State Machine & Mock Simulator
- **Mục tiêu:** Xây dựng toàn bộ lõi logic Backend (6 ghế, hàng chờ 30 người có ưu tiên VIP, máy trạng thái độ say & KO, vòng lặp cụng ly `30s/+5`, Like `100/+1`, Vợ bắt về `60s/10%/CD 180s`) và giao diện Mock Dashboard để kiểm thử độc lập 100% luật chơi.
- **Phạm vi:** Backend Node.js + Express + Socket.io, Event Pipeline, Mock Dashboard (chưa bao gồm Phaser 3 Client).
- **Công việc:**
  1. Khởi tạo cấu trúc thư mục Backend và file cấu hình `config/default.json` với thông số chính thức v1.0 (`cheersIntervalMs: 30000`, `cheersDrunkDelta: 5`, `likeMilestoneStep: 100`, `likeDrunkDelta: 1`, `randomWifeCheckSec: 60`, `randomWifeProb: 0.10`, `randomWifeCooldownSec: 180`, `koHoldDurationMs: 3000`, `afkKickEnabled: false`, ngưỡng VIP riêng và bảng ánh xạ `giftId`).
  2. Xây dựng `inputValidator.js`, `eventNormalizer.js`, `deduplicator.js` (LRU + TTL), `rateLimiter.js` và `eventQueue.js` (xử lý tuần tự).
  3. Xây dựng `gameStateManager.js` cài đặt đầy đủ:
     - Quản lý 6 ghế cố định, hàng chờ tối đa 30 người (`VIP Queue` và `Normal Queue` theo FIFO).
     - Chống trùng `userId` tuyệt đối trong bàn và hàng chờ; không tự động đuổi người đang ngồi khi có VIP mới.
     - Khi hàng chờ đạt 30/30: nếu có VIP mới đủ điều kiện và `Normal Queue` còn người -> loại người cuối `Normal Queue` để nhường vị trí; nếu cả 30 đều là VIP -> từ chối VIP mới; nâng cấp `Normal -> VIP` theo FIFO mà không chiếm thêm slot.
     - Độ say `0–100`, khóa trạng thái `KO` hoặc `LEAVING` đúng 1 lần, giữ ghế `3000ms` trước khi xóa người chơi và cấp ghế tiếp theo.
     - Khi mục tiêu của Gift đã `KO`, `LEAVING` hoặc không còn trên bàn: không thay đổi độ say, không chuyển tác động sang người khác, chỉ phát thông báo/FX và ghi nhận sự kiện đã xử lý; Gift giải say không hồi sinh người đã `KO`.
  4. Xây dựng `mock-dashboard/index.html` (chỉ truy cập từ `localhost` hoặc có token xác thực) cho phép giả lập đầy đủ sự kiện.
  5. Thiết lập Socket.io Server phát `game:state_snapshot`, `game:state_patch` (kèm `stateVersion` và `eventId`).
- **Module:**
  - `config/default.json`, `server/index.js`, `server/config.js`
  - `server/engines/inputValidator.js`, `server/engines/eventNormalizer.js`, `server/engines/deduplicator.js`, `server/engines/rateLimiter.js`, `server/engines/eventQueue.js`
  - `server/services/gameStateManager.js`, `server/services/mockService.js`
  - `server/socket/socketHandler.js`, `mock-dashboard/index.html`
- **Phụ thuộc:** `express`, `socket.io`, `cors`, `dotenv`.
- **Kịch bản kiểm thử:**
  1. *Kịch bản 6 ghế, Hàng chờ 30 người & Ưu tiên VIP biên:* Đưa 6 `userId` vào 6 ghế, thêm 30 `userId` vào `Normal Queue`; gửi VIP mới -> người thứ 30 ở cuối `Normal Queue` bị loại để nhường slot cho VIP mới; thử nâng cấp 1 người đang ở `Normal Queue` lên VIP -> chuyển sang cuối `VIP Queue` mà tổng hàng chờ vẫn là 30; thử khi cả 30 người trong hàng chờ đều là VIP -> VIP thứ 31 bị từ chối.
  2. *Kịch bản chống trùng `userId`:* Gửi lệnh tham gia lặp lại của cùng 1 `userId` đang ngồi hoặc đang ở hàng chờ (hệ thống giữ nguyên 1 bản ghi duy nhất).
  3. *Kịch bản Like `100/+1` & Cộng dồn số dư:* Gửi `250` Like mới hợp lệ khi có người đang `SEATED` -> tất cả người đang `SEATED` tăng `+2` độ say, `unconsumedLikes` còn dư `50`; gửi tiếp `50` Like -> kích hoạt thêm `+1` độ say, dư `0`.
  4. *Kịch bản KO `3000ms` & Gift vào mục tiêu không hợp lệ:* Tăng độ say của ghế 0 lên `100` -> chuyển sang `KO` đúng 1 lần -> gửi Gift tăng say và Gift giải say vào ghế 0 trong lúc đang `KO` -> không đổi độ say, không chuyển sang ghế 1..5, chỉ phát sự kiện FX/thông báo -> sau đúng `3000ms`, ghế 0 giải phóng và cấp cho người đầu `VIP Queue`.
- **Tiêu chí nghiệm thu đo được:**
  - 100% kịch bản kiểm thử trên vượt qua chính xác.
  - `stateVersion` tăng đơn điệu chính xác sau mỗi lần thay đổi state.
- **Điều kiện chuyển giai đoạn:** Toàn bộ luật quản lý ghế, hàng chờ VIP, Like `100/+1`, KO `3000ms` và Mock Events hoạt động chính xác tuyệt đối và được người dùng xác nhận nghiệm thu.

---

## Giai đoạn 2: Frontend Phaser 3 (9:16), Placeholder Assets & Đồng Bộ Realtime
- **Mục tiêu:** Xây dựng khung hiển thị dọc 9:16 trên Phaser 3 với hệ tọa độ pixel art thống nhất, hiển thị đúng 6 vị trí ghế bằng placeholder assets và đồng bộ trạng thái thời gian thực với Backend.
- **Phạm vi:** Client Vite + Phaser 3, hiển thị placeholder tách biệt khỏi Game State, kết nối Socket.io (kèm xử lý Snapshot khi reconnect).
- **Công việc:**
  1. Khởi tạo dự án Vite + Phaser 3 tại `client/`, cấu hình canvas logic `360x640` scale nguyên lần (`nearest-neighbor`, `pixelArt: true`) lên `1080x1920`.
  2. Thiết lập cấu trúc 9 Layer hiển thị (`depth` từ `0` đến `80`) và vùng an toàn tránh UI TikTok Live.
  3. Xây dựng các đối tượng hiển thị bằng placeholder đúng kích thước chuẩn (Bàn nhậu, 6 vị trí ghế, khung Avatar, Nickname cắt tối đa 12 ký tự, Thanh độ say `0–100`).
  4. Tích hợp `socketClient.js` kiểm tra `stateVersion`, tự động yêu cầu `game:state_snapshot` khi mới kết nối hoặc sau khi mất kết nối.
  5. Hiển thị đúng các trạng thái bàn trống (0/6), bàn đầy (6/6), danh sách hàng chờ và chỉ báo khi mất kết nối.
- **Module:**
  - `client/index.html`, `client/vite.config.js`
  - `client/src/main.js`, `client/src/config.js`
  - `client/src/network/socketClient.js`
  - `client/src/scenes/BootScene.js`, `client/src/scenes/TableScene.js`, `client/src/scenes/UIScene.js`
  - `client/src/entities/SeatView.js`, `client/src/entities/PlayerPlaceholder.js`
- **Phụ thuộc:** Hoàn thành và nghiệm thu Giai đoạn 1; thư viện `phaser`, `socket.io-client`, `vite`.
- **Kịch bản kiểm thử:**
  1. *Kịch bản hiển thị 6 vị trí:* Thêm lần lượt 6 người chơi từ Mock Dashboard -> kiểm tra hiển thị đúng vị trí hàng ghế sau (Ghế 1, 2, 3) và hàng ghế trước (Ghế 4, 5, 6), không đè lấp sai thứ tự layer với bàn nhậu.
  2. *Kịch bản Nickname dài:* Thử nghiệm `nickname` dài 30 ký tự -> giao diện tự cắt gọn ở mức 12 ký tự kèm `…`, không tràn sang ghế cạnh bên.
  3. *Kịch bản Reconnect Snapshot:* Ngắt kết nối mạng của Client, thay đổi 3 ghế từ Mock Dashboard, sau đó bật lại kết nối Client -> Client nhận Snapshot và vẽ lại đúng trạng thái mới nhất.
- **Tiêu chí nghiệm thu đo được:**
  - Hiển thị sắc nét ở tỉ lệ `1080x1920` (không nhòe pixel).
  - Đồng bộ 100% vị trí 6 ghế, thanh độ say và hàng chờ giữa Backend và Phaser Client.
- **Điều kiện chuyển giai đoạn:** Giao diện hiển thị chính xác 6 vị trí ghế, đồng bộ `stateVersion` và Snapshot ổn định.

---

## Giai đoạn 3: Hoàn Thiện Vòng Lặp Gameplay, Sự Kiện Đặc Biệt & Animation Queue
- **Mục tiêu:** Hoàn thiện toàn bộ trải nghiệm gameplay ("1, 2, 3 DÔ!" `30s/+5`, Like milestone `100/+1`, Gift actions, Vợ bắt về ngẫu nhiên `60s/10%/CD 180s` & bằng Gift) và hệ thống Animation Queue có giới hạn ở Client.
- **Phạm vi:** Bộ đếm gameplay trên Backend + Animation Queue, hiệu ứng hành động, bong bóng chat, thông báo sự kiện và âm thanh trên Frontend.
- **Công việc:**
  1. Triển khai scheduler duy nhất cho vòng lặp định kỳ "1, 2, 3 DÔ!" trên Backend (chu kỳ `30 giây`, tăng `+5` độ say cho người đang `SEATED`, không tác động người `KO`/`LEAVING`, không nhân đôi timer khi reconnect).
  2. Triển khai sự kiện "Vợ bắt về" ngẫu nhiên (kiểm tra mỗi `60 giây`, xác suất `10%`, cooldown `180 giây`; không kích hoạt khi bàn trống; không chọn người đã `KO`/`LEAVING`) và bằng Gift đặc biệt (độc lập với cooldown ngẫu nhiên).
  3. Xây dựng `animationQueue.js` có giới hạn kích thước tại Client để quản lý hoạt ảnh cụng ly, uống bia, giải say, gục tại bàn (`3000ms`), vợ kéo về (`3000ms`).
  4. Triển khai hiển thị bong bóng chat (`game:chat_bubble`) và banner sự kiện (`game:banner_notice`).
  5. Tích hợp `soundManager.js` (hỗ trợ bật/tắt âm thanh và phát hiệu ứng đồng bộ).
- **Module:**
  - `server/services/gameStateManager.js` (bổ sung timers & wife event)
  - `client/src/managers/animationQueue.js`, `client/src/managers/soundManager.js`
  - `client/src/scenes/TableScene.js`, `client/src/scenes/UIScene.js`
- **Phụ thuộc:** Hoàn thành và nghiệm thu Giai đoạn 2.
- **Kịch bản kiểm thử:**
  1. *Kịch bản Hô Dô định kỳ:* Quan sát chu kỳ hô "1, 2, 3 DÔ!" khi bàn có 3 ghế có người (`SEATED`), 1 ghế đang `KO`, 2 ghế trống -> chỉ 3 ghế `SEATED` tăng điểm say.
  2. *Kịch bản Vợ bắt về:* Kích hoạt "Vợ bắt về" bằng Gift và bằng sự kiện ngẫu nhiên -> mục tiêu chuyển sang `LEAVING`, phát hoạt ảnh 3 giây rồi nhường ghế cho người đầu hàng chờ; kiểm tra chống trùng mục tiêu nếu gửi 2 Gift liên tiếp vào cùng 1 người.
  3. *Kịch bản Bão sự kiện (Burst Stress):* Bắn 50 sự kiện Gift/Like liên tiếp trong 2 giây từ Mock Dashboard -> `AnimationQueue` giữ trong giới hạn cấu hình, gộp hiệu ứng mượt mà, không làm sai lệch Game State.
- **Tiêu chí nghiệm thu đo được:**
  - Hoạt ảnh KO và Vợ bắt về khớp với thời gian giữ ghế 3 giây của Backend trước khi người mới xuất hiện.
  - Hàng đợi Animation không bao giờ vượt quá ngưỡng giới hạn tối đa đã cấu hình.
- **Điều kiện chuyển giai đoạn:** Toàn bộ gameplay và hoạt ảnh vận hành hoàn chỉnh 100% trên Mock Mode.

---

## Giai đoạn 4: Tích Hợp TikTok Live Thật & Bảo Vệ Dòng Sự Kiện Thực Tế
- **Mục tiêu:** Kết nối với phòng livestream TikTok thông qua `tiktok-live-connector`, chuẩn hóa dữ liệu thật, xử lý Gift combo/streak, Like tích lũy và tự động kết nối lại.
- **Phạm vi:** Tầng `tiktokService.js`, cấu hình bảng ánh xạ `giftId`, kiểm thử chống trùng lặp và Rate Limit với dữ liệu TikTok thực.
- **Công việc:**
  1. Cài đặt và tích hợp `tiktok-live-connector` vào `server/services/tiktokService.js`.
  2. Chuẩn hóa sự kiện `chat`, `like`, `gift` từ TikTok sang `NormalizedGameEvent`.
  3. Xử lý chính xác Gift combo/streak (`repeatCount`, `repeatEnd`, `groupId`) và bảng ánh xạ `giftId` trong cấu hình.
  4. Xử lý tính độ lệch Like (`totalLikeCount` vs `likeDelta`) để không cộng trùng Like.
  5. Triển khai cơ chế tự động Reconnect với Exponential Backoff khi luồng TikTok bị ngắt mà không làm mất trạng thái bàn nhậu hay nhân đôi timer.
  6. Đảm bảo quy tắc bảo mật log: tuyệt đối không ghi log cookie, session hoặc token.
- **Module:**
  - `server/services/tiktokService.js`
  - `server/engines/eventNormalizer.js`, `server/engines/deduplicator.js`
  - `config/default.json`
- **Phụ thuộc:** Hoàn thành và nghiệm thu Giai đoạn 3; thư viện `tiktok-live-connector`.
- **Kịch bản kiểm thử:**
  1. *Kịch bản Replay & Streak:* Phát bộ dữ liệu mẫu mô phỏng gói tin TikTok thực tế có chứa gói tin Gift trùng `msgId` và chuỗi combo `repeatCount = 1 -> 5 -> 5 (repeatEnd)` -> hệ thống chỉ tính đúng tổng 5 lần, không tính lặp thành 11 lần.
  2. *Kịch bản Kết nối Live thực tế:* Kết nối vào phiên TikTok Live thử nghiệm, kiểm tra nhận diện bình luận tham gia, Like và Gift.
  3. *Kịch bản Ngắt & Nối lại luồng Live:* Giả lập ngắt kết nối `tiktokService` rồi nối lại -> kiểm tra không bị tạo thêm timer hô DÔ thứ hai.
- **Tiêu chí nghiệm thu đo được:**
  - Tỉ lệ cộng trùng Gift hoặc Like bằng `0%` trên bộ test case gói tin trùng lặp.
  - Chuyển đổi qua lại giữa chế độ `MOCK` và `LIVE` thông qua cấu hình mà không cần sửa code.
- **Điều kiện chuyển giai đoạn:** Tích hợp TikTok Live hoạt động ổn định, chính xác và an toàn.

---

## Giai đoạn 5: Tối Ưu Hóa OBS, Khôi Phục Trạng Thái & Đóng Gói Vận Hành
- **Mục tiêu:** Hoàn thiện khả năng chịu lỗi (lưu/khôi phục snapshot khi restart tiến trình), đo đạc và tối ưu hiệu năng thực tế trên OBS Browser Source, bàn giao bộ công cụ vận hành cho Streamer.
- **Phạm vi:** Toàn bộ hệ thống, `snapshotStore.js`, kiểm thử tải dài hạn, tài liệu hướng dẫn OBS và script khởi chạy.
- **Công việc:**
  1. Xây dựng `server/services/snapshotStore.js` lưu định kỳ trạng thái bàn nhậu ra `data/state-snapshot.json` và tự động khôi phục khi tiến trình Backend khởi động lại.
     - *Bản ghi quyết định Recovery Policy (Ngày `2026-11-06`):* Khi recovery từ snapshot, hoàn tất việc rời bàn ngay cho mọi người chơi đang ở trạng thái `KO` hoặc `LEAVING` (không tạo lại timer `3000ms`, không phát lại FX cũ), cấp ghế trống ngay cho `VIP Queue` (FIFO) rồi `Normal Queue` (FIFO), giữ bất biến không trùng `userId` và đồng bộ `stateVersion` nhất quán với snapshot. Lý do: tránh ghế bị treo ở trạng thái `KO`/`LEAVING` khi mất timer trong RAM sau khi restart.
  2. Thiết lập cơ chế xử lý lỗi nghiêm trọng: ghi log, lưu snapshot khẩn cấp và thoát tiến trình an toàn để trình quản lý khởi động lại sạch sẽ.
  3. Thực hiện kiểm thử tải giả lập (Stress & Soak Test) để đo đạc mức sử dụng CPU/RAM và tốc độ khung hình trên OBS Browser Source; tối ưu hóa các đối tượng đồ họa/bộ nhớ dựa trên số liệu thực đo.
  4. Tạo script khởi động nhanh và tài liệu `README.md` hướng dẫn cấu hình OBS Browser Source (`1080x1920`, CSS tối ưu).
- **Module:**
  - `server/services/snapshotStore.js`
  - `start.bat`, `README.md`
- **Phụ thuộc:** Hoàn thành và nghiệm thu Giai đoạn 4.
- **Kịch bản kiểm thử:**
  1. *Kịch bản Khôi phục sau khi Restart:* Khi bàn đang có 6 người ngồi và 10 người trong hàng chờ, tắt ngang và khởi động lại tiến trình Backend -> hệ thống nạp lại đúng 6 người đang ngồi (kèm độ say) và 10 người trong hàng chờ từ `state-snapshot.json`.
  2. *Kịch bản Soak Test (Chạy bền):* Chạy giả lập tương tác liên tục trong tối thiểu 60 phút trên OBS Browser Source, ghi nhận biểu đồ bộ nhớ Heap của Node.js và trình duyệt.
- **Tiêu chí nghiệm thu đo được:**
  - Khôi phục thành công 100% trạng thái ghế và hàng chờ sau khi khởi động lại tiến trình Backend.
  - Bộ nhớ Heap sau khi thu gom rác (GC) ổn định theo thời gian (không tăng tuyến tính vô hạn gây tràn bộ nhớ).
- **Điều kiện chuyển giai đoạn (Bàn giao):** Hoàn thành kiểm thử vận hành thực tế và được người dùng phê duyệt nghiệm thu cuối cùng.
