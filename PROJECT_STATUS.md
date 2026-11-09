# PROJECT STATUS: "1, 2, 3 DÔ!"

- **Project Name:** 1, 2, 3 DÔ!
- **Master Plan Version:** 1.0 (LOCKED — APPROVED) — **IMPLEMENTATION COMPLETE — PENDING FINAL ACCEPTANCE**
- **Current Task:** Phase 5 — Task 5.4 COMPLETED — PASS (Phase 5: IMPLEMENTATION COMPLETE — PENDING OBS MANUAL VALIDATION)
- **Cập nhật lần cuối:** 2026-11-07

## 1. Bảng Trạng Thái Tiến Độ Tổng Thể

| Giai đoạn / Nhiệm vụ | Mô tả | Trạng thái | Ghi chú / Tiến độ |
| :--- | :--- | :--- | :--- |
| **Giai đoạn 0** | Phân tích yêu cầu, Kiến trúc & Master Plan | **COMPLETED — APPROVED** | Đã phê duyệt và khóa Master Plan v1.0 |
| **Giai đoạn 1** | Nền tảng Backend & Mock Simulator Engine | **COMPLETED — PASS** | Hoàn thành toàn bộ Nhiệm vụ 1.1–1.5 |
| ↳ **Nhiệm vụ 1.1** | Khởi tạo Backend, Socket.io & Mock Simulator tối thiểu | **COMPLETED — PASS** | Đạt 8/8 kịch bản kiểm thử tự động |
| ↳ **Nhiệm vụ 1.2** | Game State, 6 Ghế & VIP Queue | **COMPLETED — PASS** | Đạt 16/16 kịch bản kiểm thử + 8/8 regression 1.1 |
| ↳ **Nhiệm vụ 1.3** | Độ say (`drunkLevel`), Like (`100/+1`), Vòng lặp DÔ (`30s/+5`) & KO (`3000ms`) | **COMPLETED — PASS** | Đạt 24/24 kịch bản kiểm thử + regression 1.2 & 1.1 |
| ↳ **Nhiệm vụ 1.4** | Gift Gameplay & Sự kiện "Vợ bắt về" (`60s/10%/CD 180s`) | **COMPLETED — PASS** | Đạt 28/28 kịch bản kiểm thử + regression 1.3, 1.2 & 1.1 |
| ↳ **Nhiệm vụ 1.5** | Kiểm thử tích hợp, Bảo mật, Snapshot & Hoàn thiện Backend MVP | **COMPLETED — PASS** | Đạt 20/20 tích hợp + Invariants + Security + Snapshot/Recovery Policy + Perf |
| **Giai đoạn 2** | Frontend Pixel Art & Kết nối Realtime | **COMPLETED — PASS** | Hoàn thành toàn bộ Nhiệm vụ 2.1–2.5 |
| ↳ **Nhiệm vụ 2.1** | Khởi tạo Phaser 3 + Vite & Khung Giao diện 9:16 (`360x640`) | **COMPLETED — PASS** | Đạt 11/11 kiểm thử cấu trúc/tọa độ/dev server/build + regression 1.1–1.5 |
| ↳ **Nhiệm vụ 2.2** | Hoàn thiện Bàn nhậu (`TableView`), 6 Ghế (`SeatView`) & Nhân vật Placeholder (`PlayerPlaceholder`) | **COMPLETED — PASS** | Đạt 11/11 kiểm thử 2.2 + 11/11 regression 2.1 + production build |
| ↳ **Nhiệm vụ 2.3** | Kết nối Socket.io Realtime & Đồng bộ Snapshot/StateVersion | **COMPLETED — PASS** | Đạt 14/14 kiểm thử tích hợp Socket.io 2.3 + regression 2.2 & 2.1 + build |
| ↳ **Nhiệm vụ 2.4** | Animation Gameplay & Event FX (`AnimationManager`) | **COMPLETED — PASS** | Đạt 12/12 kiểm thử 2.4 (kèm tích hợp Backend thật) + regression 2.1–2.3, 1.5 + build |
| ↳ **Nhiệm vụ 2.5** | UI Polish, Responsive 9:16, OBS Browser Source Readiness & Kiểm thử Tải | **COMPLETED — PASS** | Đạt 100% kiểm thử tĩnh, Unicode, reconnect, burst load 2.5 + regression 2.1–2.4, 1.5 + build |
| **Giai đoạn 3** | Logic Gameplay, Animation & UI HUD | **COMPLETED — PASS** | Hoàn thành toàn bộ Hạng mục 3.1–3.5 |
| ↳ **Hạng mục 3.1** | Vòng lặp tự động `1, 2, 3 DÔ!` (`30s/+5`) & Điểm say Like/Gift | **COMPLETED — PASS** | Đã triển khai ở Giai đoạn 1 (`1.3`, `1.4`) & xác minh lại ở `test-3.4.js` |
| ↳ **Hạng mục 3.2** | Sự kiện "Vợ bắt về" ngẫu nhiên (`60s/10%/CD 180s`) & Gift gọi vợ | **COMPLETED — PASS** | Đã triển khai ở Giai đoạn 1 (`1.4`) & xác minh lại ở `test-3.4.js` |
| ↳ **Hạng mục 3.3** | Client Animation Queue có giới hạn & Thanh độ say (`Drunk Gauge`) | **COMPLETED — PASS** | Đã triển khai ở Giai đoạn 2 (`2.2`, `2.4`, `2.5`) & xác minh lại ở `test-3.4.js` |
| ↳ **Hạng mục 3.4** | Bong bóng chat (`game:chat_bubble`), Banner sự kiện (`game:banner_notice`) & BXH Tửu Lượng (`leaderboard`) | **COMPLETED — PASS** | Đạt 4/4 kiểm thử tích hợp `test-3.4.js` + toàn bộ regression `1.5`, `2.1–2.5` + build |
| ↳ **Hạng mục 3.5** | Tích hợp `soundManager.js` (bật/tắt âm thanh & phát hiệu ứng đồng bộ) | **COMPLETED — PASS** | Đạt 14/14 kiểm thử `test-3.5.js` + toàn bộ regression `1.5`, `2.1–2.5`, `3.4` + build |
| **Giai đoạn 4** | Tích hợp TikTok Live Thật & Anti-Spam | **COMPLETED — PASS** | Hoàn thành toàn bộ Hạng mục 4.1–4.6 |
| ↳ **Hạng mục 4.1** | Cài đặt & tích hợp `tiktok-live-connector@2.5.0` vào `server/services/tiktokService.js` | **COMPLETED — PASS** | Đạt 5/5 kiểm thử tích hợp `test-4.1.js` + toàn bộ regression `1.4–3.5` + build |
| ↳ **Hạng mục 4.2** | Chuẩn hóa sâu sự kiện `chat`, `like`, `gift` từ TikTok sang `NormalizedGameEvent` | **COMPLETED — PASS** | Đạt 15/15 kiểm thử `test-4.2.js` + toàn bộ regression `1.4–4.1` + build |
| ↳ **Hạng mục 4.3** | Xử lý Gift combo/streak (`repeatCount`, `repeatEnd`, `groupId`) & bảng ánh xạ `giftId` | **COMPLETED — PASS** | Đạt 18/18 kiểm thử `test-4.3.js` + toàn bộ regression `1.4–4.2` + build |
| ↳ **Hạng mục 4.4** | Xử lý tính độ lệch Like (`totalLikeCount` vs `likeDelta`) chống cộng trùng | **COMPLETED — PASS** | Đạt 18/18 kiểm thử `test-4.4.js` + toàn bộ regression `1.4–4.3` + build |
| ↳ **Hạng mục 4.5** | Tự động Reconnect với Exponential Backoff có Jitter không nhân đôi timer | **COMPLETED — PASS** | Đạt 20/20 kiểm thử `test-4.5.js` + toàn bộ regression `1.4–4.4` + build |
| ↳ **Hạng mục 4.6** | Kiểm toán & xác minh quy tắc bảo mật log toàn diện trong luồng TikTok Live | **COMPLETED — PASS** | Đạt 22/22 kiểm thử bảo mật `test-4.6.js` + toàn bộ regression `1.4–4.5` + build |
| **Giai đoạn 5** | Tối ưu Hiệu năng OBS & Đóng gói Vận hành | **IMPLEMENTATION COMPLETE — PENDING OBS MANUAL VALIDATION** | Đã hoàn thành toàn bộ Hạng mục 5.1–5.4; chờ nghiệm thu OBS Studio 60 phút thực tế |
| ↳ **Hạng mục 5.1** | Lưu `data/state-snapshot.json` định kỳ (`3–5s`) & tự động khôi phục khi Backend khởi động lại (Recovery Policy `2026-11-06`) | **COMPLETED — PASS** | Đạt 8/8 kiểm thử `test-5.1.js` + toàn bộ regression `1.4–4.6` + build |
| ↳ **Hạng mục 5.2** | Bắt lỗi toàn cục (`uncaughtException`, `unhandledRejection`): ghi log, lưu snapshot khẩn cấp & thoát sạch (`process.exit(1)`) | **COMPLETED — PASS** | Đạt 16/16 kịch bản (`test-5.2.js` 9/9 PASS) + toàn bộ regression `1.4–5.1` + build |
| ↳ **Hạng mục 5.3** | Kiểm thử tải giả lập (Stress & Soak Test) đo CPU/RAM/bộ nhớ & tối ưu tài nguyên | **COMPLETED — PASS (OBS 60m: PENDING MANUAL VALIDATION)** | Đạt 5/5 `test-5.3.js` + Playwright WebGL (`95.6–139.6 FPS`) + toàn bộ regression `1.4–5.2` + build; OBS Desktop `60m` chờ nghiệm thu thủ công |
| ↳ **Hạng mục 5.4** | Tạo script khởi chạy nhanh (`start.bat`) & `README.md` hướng dẫn OBS Browser Source (`1080x1920`) | **COMPLETED — PASS** | Đạt 4/4 `test-5.4.js` (bao gồm kiểm tra tĩnh, tích hợp phục vụ `client/dist` và thực thi `start.bat` trên Windows) + toàn bộ regression `1.4–5.3` + build |

---

## 2. Công Việc Đã Hoàn Thành
- [x] Khảo sát không gian làm việc `D:\game`.
- [x] Hoàn thiện, kiểm tra chéo và khóa bộ 6 tài liệu **Master Plan v1.0**.
- [x] **Hoàn thành Nhiệm vụ 1.1 (Khởi tạo Backend & Mock Simulator tối thiểu):** Đạt **8/8 PASS** (`tests/test-1.1.js`).
- [x] **Hoàn thành Nhiệm vụ 1.2 (Game State, 6 Ghế và VIP Queue):**
  - **File đã tạo mới:**
    - `server/engines/eventQueue.js`: Hàng đợi sự kiện tuần tự (`SequentialEventQueue`, giới hạn 1000 phần tử).
    - `server/services/gameStateManager.js`: Quản lý Game State tập trung (6 ghế `seatId: 1..6`, `seatedPlayers`, `vipQueue`, `normalQueue`, `totalWaiting`, `stateVersion`, `updatedAt`).
    - `tests/test-1.2.js`: Bộ kiểm thử tự động 16 kịch bản cho Nhiệm vụ 1.2.
  - **File đã chỉnh sửa:**
    - `server/engines/inputValidator.js`: Hỗ trợ kiểm tra sự kiện chuyên dụng Mock Mode (`VIP_JOIN`, `MOCK_RELEASE_SEAT`).
    - `server/engines/eventNormalizer.js`: Chuẩn hóa sự kiện `VIP_JOIN` và `MOCK_RELEASE_SEAT`.
    - `server/services/mockService.js`: Kết nối qua `SequentialEventQueue` và bổ sung helper kiểm thử VIP / giải phóng ghế.
    - `server/socket/socketHandler.js`: Đồng bộ `game:state_snapshot` khi kết nối mới, kết nối lại (`client:ready`, `client:request_snapshot`).
    - `server/index.js`: Tích hợp `GameStateManager` + `SequentialEventQueue`, phát `game:state_patch` và `game:state_snapshot` khi `stateVersion` tăng, bổ sung `GET /api/state`.
    - `mock-dashboard/index.html`, `package.json`: Bổ sung điều khiển kiểm thử 1.2 và script `npm run test:1.2`.
  - **Kết quả kiểm thử Nhiệm vụ 1.2 (`npm run test:1.2` — 16/16 PASS & Regression `npm run test:1.1` — 8/8 PASS):**
    1. Người đầu tiên vào ghế 1 (`seatId: 1`): **PASS**
    2. Sáu người vào đủ 6 ghế (`seatId: 1..6`): **PASS**
    3. Người thứ 7 vào `Normal Queue`: **PASS**
    4. Không cho phép `userId` trùng (không dùng `nickname` làm định danh): **PASS**
    5. Hai lệnh `"nhậu"` và `"dô"` hoạt động đúng: **PASS**
    6. Hàng chờ không vượt quá 30 người: **PASS**
    7. VIP được ưu tiên khi giải phóng ghế: **PASS**
    8. FIFO trong `VIP Queue`: **PASS**
    9. FIFO trong `Normal Queue`: **PASS**
    10. VIP mới thay thế người cuối `Normal Queue` khi hàng chờ đầy (30/30): **PASS**
    11. Từ chối VIP mới nếu toàn bộ 30 vị trí hàng chờ đều là VIP: **PASS**
    12. Nâng cấp `Normal` thành `VIP` không tăng tổng số người chờ: **PASS**
    13. `stateVersion` chỉ tăng khi Game State thực sự thay đổi: **PASS**
    14. Client mới kết nối nhận đúng snapshot hiện tại: **PASS**
    15. Client reconnect nhận trạng thái mới nhất: **PASS**
    16. Các Mock Event liên tiếp xử lý tuần tự, không làm trùng người chơi hoặc vượt giới hạn ghế: **PASS**
- [x] **Hoàn thành Nhiệm vụ 1.3 (Độ say, Like, Vòng lặp DÔ và KO):**
  - **File đã tạo mới:**
    - `server/engines/deduplicator.js`: Bộ lọc trùng lặp `eventId` giới hạn kích thước và TTL (`BoundedDeduplicator`).
    - `tests/test-1.3.js`: Bộ kiểm thử tự động 24 kịch bản cho Nhiệm vụ 1.3.
  - **File đã chỉnh sửa:**
    - `server/config.js`: Hỗ trợ ghi đè một phần `gameplayV1` trong kiểm thử mà vẫn giữ nguyên thông số sản xuất trong `config/default.json`.
    - `server/engines/inputValidator.js`, `server/engines/eventNormalizer.js`: Hỗ trợ kiểm tra `eventId` tùy chỉnh và sự kiện `MOCK_CHEERS` (`SYSTEM_CHEERS`).
    - `server/services/gameStateManager.js`: Quản lý `drunkLevel` (`0–100`), xử lý mốc `100` Like (`+1`), bộ lập lịch đơn nhất `"1, 2, 3 DÔ!"` (`30000ms/+5`), trạng thái `KO` một lần duy nhất, giữ ghế `3000ms` với `koToken` an toàn và giải phóng tuần tự qua `SequentialEventQueue`.
    - `server/services/mockService.js`, `server/index.js`, `mock-dashboard/index.html`, `package.json`: Đồng bộ `likeMetrics`, `cheersConfig`, phát `game:action_fx` (`CHEERS`, `LIKE_MILESTONE`, `KO`, `KO_RELEASED`), hủy sạch timer khi `shutdown()`.
  - **Kết quả kiểm thử Nhiệm vụ 1.3 (`npm run test:1.3` — 24/24 PASS, Regression `1.2` — 16/16 PASS, Regression `1.1` — 8/8 PASS):**
    1. Người mới ngồi có `drunkLevel = 0`: **PASS**
    2. `50` Like chưa tăng độ say, `unconsumedLikes = 50`: **PASS**
    3. Thêm `50` Like -> đủ `100` -> mọi người `SEATED` tăng `+1`, `unconsumedLikes = 0`: **PASS**
    4. `250` Like -> mọi người `SEATED` tăng `+2`, `unconsumedLikes = 50`: **PASS**
    5. Khi bàn không có người `SEATED`, Like không được tích lũy cho người vào sau: **PASS**
    6. Duplicate `eventId` không được cộng Like hoặc độ say hai lần: **PASS**
    7. Chu kỳ `"DÔ"` tăng `+5` cho tất cả người chơi `SEATED`: **PASS**
    8. Chu kỳ `"DÔ"` không tăng độ say cho người đang `KO`: **PASS**
    9. Chu kỳ `"DÔ"` khi bàn trống không làm đổi `stateVersion`: **PASS**
    10. Không tạo trùng timer `"DÔ"`: **PASS**
    11. Độ say tăng từ `96 + 5` bị kẹp tại `100`: **PASS**
    12. Đạt `100` chuyển sang `KO` đúng 1 lần: **PASS**
    13. Người đang `KO` không bị `KO` lần thứ hai khi có thêm Like hoặc `"DÔ"`: **PASS**
    14. Ghế của người `KO` được giữ trong `3000ms`: **PASS**
    15. Sau `3000ms`, người `KO` rời bàn: **PASS**
    16. Nếu `vipQueue` có người, VIP đầu hàng vào ghế trống trước: **PASS**
    17. Nếu `vipQueue` trống và `normalQueue` có người, Normal đầu hàng vào ghế trống: **PASS**
    18. Người mới từ hàng chờ vào ghế có `drunkLevel = 0`: **PASS**
    19. Nếu hàng chờ trống, ghế trở thành trống sau `KO`: **PASS**
    20. Timer `KO` cũ không xóa nhầm người chơi mới nếu ghế đã thay đổi: **PASS**
    21. Nhiều người chơi cùng đạt `100` trong một lần `"DÔ"` đều được xử lý `KO` và giải phóng ghế đúng thứ tự: **PASS**
    22. `stateVersion` luôn tăng tuần tự: **PASS**
    23. Client reconnect nhận snapshot có `drunkLevel`, `status`, `unconsumedLikes` chính xác: **PASS**
    24. Khi dừng server, toàn bộ timer `DÔ` và `KO` được hủy sạch: **PASS**
- [x] **Hoàn thành Nhiệm vụ 1.4 (Gift Gameplay & Sự kiện "Vợ bắt về"):**
  - **File đã tạo mới:**
    - `tests/test-1.4.js`: Bộ kiểm thử tự động 28 kịch bản cho Nhiệm vụ 1.4.
  - **File đã chỉnh sửa:**
    - `config/default.json`: Cấu hình `leavingHoldDurationMs: 3000`, `vipGiftThreshold: null`, `liveGiftMappings: {}` (giữ trạng thái chưa cấu hình đối với TikTok thật) và đầy đủ 4 nhóm hành động `mockGifts` (`DRUNK_INCREASE`, `DRUNK_DECREASE`, `VIP_ACCESS`, `WIFE_EVENT`).
    - `server/engines/deduplicator.js`: Mở rộng `BoundedDeduplicator.resolveStreakDelta()` tính `deltaRepeat = currentRepeatCount - lastProcessedRepeatCount` theo khóa `streak:${userId}:${giftKey}:${streakId}`.
    - `server/engines/inputValidator.js`, `server/engines/eventNormalizer.js`: Hỗ trợ `repeatEnd`, `streakId`, `targetSeatId`, `targetUserId` và sự kiện `MOCK_RANDOM_WIFE_CHECK` (`SYSTEM_WIFE_CHECK`).
    - `server/services/gameStateManager.js`: Xử lý 4 nhóm Gift (`DRUNK_INCREASE`, `DRUNK_DECREASE`, `VIP_ACCESS`, `WIFE_EVENT`), quy tắc mục tiêu không hợp lệ (`KO`, `LEAVING`, đã rời bàn), trạng thái `LEAVING` giữ ghế `3000ms` qua `SequentialEventQueue` (`SYSTEM_LEAVING_RELEASE`), bộ lập lịch đơn nhất `"Vợ bắt về"` ngẫu nhiên (`60s` / xác suất `10%` / cooldown `180s`) kèm injectable `setClock`/`setRandom`.
    - `server/services/mockService.js`, `server/index.js`, `mock-dashboard/index.html`, `package.json`: Đồng bộ `wifeConfig`, thêm điều khiển Mock Gift/Vợ bắt về và script `npm run test:1.4`.
  - **Kết quả kiểm thử Nhiệm vụ 1.4 (`npm run test:1.4` — 28/28 PASS, Regression `1.3` — 24/24 PASS, Regression `1.2` — 16/16 PASS, Regression `1.1` — 8/8 PASS):**
    1. Gift tăng say đúng giá trị: **PASS**
    2. Gift giảm say đúng giá trị: **PASS**
    3. Độ say không vượt `100`: **PASS**
    4. Độ say không nhỏ hơn `0`: **PASS**
    5. Gift tăng say có thể kích hoạt `KO`: **PASS**
    6. Gift giảm say không hồi sinh `KO`: **PASS**
    7. Gift không hợp lệ bị bỏ qua: **PASS**
    8. Gift mục tiêu `KO` không làm thay đổi state: **PASS**
    9. Gift mục tiêu `LEAVING` không làm thay đổi state: **PASS**
    10. Gift mục tiêu đã rời bàn không tự chuyển sang người khác: **PASS**
    11. Gift VIP nâng cấp `Normal Queue` đúng: **PASS**
    12. Gift VIP không tạo `userId` trùng: **PASS**
    13. Gift VIP không đuổi người đang ngồi: **PASS**
    14. VIP mới khi hàng chờ đầy thay thế người cuối `Normal Queue`: **PASS**
    15. VIP mới bị từ chối khi toàn bộ hàng chờ là VIP: **PASS**
    16. Gift vợ bắt về chuyển người hợp lệ sang `LEAVING`: **PASS**
    17. Không kích hoạt vợ bắt về trên người `KO`: **PASS**
    18. Sự kiện ngẫu nhiên không chạy khi bàn trống: **PASS**
    19. Sự kiện ngẫu nhiên tuân thủ xác suất `10%`: **PASS**
    20. Sự kiện ngẫu nhiên tuân thủ cooldown `180 giây`: **PASS**
    21. Gift vợ bắt về không bị chặn bởi cooldown ngẫu nhiên: **PASS**
    22. Không có scheduler trùng: **PASS**
    23. Gift streak không bị tính trùng: **PASS**
    24. Duplicate `eventId` không thay đổi state lần hai: **PASS**
    25. Timer cũ không xóa nhầm người mới: **PASS**
    26. `stateVersion` chỉ tăng khi Game State thay đổi: **PASS**
    27. Client reconnect nhận đúng trạng thái: **PASS**
    28. `shutdown()` hủy timer an toàn: **PASS**
- [x] **Hoàn thành Nhiệm vụ 1.5 (Kiểm thử tích hợp & Hoàn thiện Backend MVP):**
  - **File đã tạo mới:**
    - `server/engines/rateLimiter.js`: Bộ giới hạn tần suất `BoundedRateLimiter` theo cặp `(userId, eventType)` kèm dọn dẹp TTL tự động.
    - `server/services/snapshotStore.js`: Cơ chế lưu atomic (`temp file + rename`) và khôi phục `data/state-snapshot.json` có kiểm tra toàn vẹn invariants.
    - `tests/test-1.5.js`: Bộ kiểm thử tích hợp toàn diện (20 kịch bản tích hợp, kiểm tra invariants, bảo mật, snapshot/recovery và hiệu năng 1.000 sự kiện).
  - **File đã chỉnh sửa:**
    - `server/config.js`: Lọc triệt để wildcard `'*'` trong `corsOrigins` ngay cả khi truyền qua `overrides`, hỗ trợ cấu hình `security` và `app`.
    - `server/logger.js`: Bổ sung `x-admin-token` vào danh sách khóa nhạy cảm tự động che (`[REDACTED]`).
    - `server/services/mockService.js` & `server/services/gameStateManager.js`: Chặn hoàn toàn sự kiện `MOCK` khi hệ thống đang ở chế độ `LIVE` (`defaultMode === 'LIVE'`), tích hợp `BoundedRateLimiter`.
    - `package.json`: Bổ sung script `npm run test:1.5`.
  - **Kết quả kiểm thử tích hợp & hồi quy:**
    - `npm run test:1.5`: **20/20 kịch bản tích hợp PASS**, **Invariants PASS**, **Security PASS**, **Snapshot/Recovery PASS**, **Performance PASS** (`1000` sự kiện — `800` hợp lệ / `200` từ chối trong `271.41 ms`, tồn đọng queue `0`).
    - Regression `npm run test:1.4`: **28/28 PASS**
    - Regression `npm run test:1.3`: **24/24 PASS**
    - Regression `npm run test:1.2`: **16/16 PASS**
    - Regression `npm run test:1.1`: **8/8 PASS**
  - **Mức độ sẵn sàng của Backend MVP:** Sẵn sàng 100% cho Giai đoạn 2 (Phaser 3 Frontend).
- [x] **Hoàn thành Nhiệm vụ 2.1 (Chốt Recovery Policy v1.0 & Triển khai Phaser 3 + Vite + Game Layout 9:16):**
  - **Cập nhật Chính sách Recovery v1.0 (Ngày `2026-11-06`):**
    - Đã ghi nhận quyết định chính thức vào `PROJECT_MASTER_PLAN.md`, `GAME_DESIGN.md`, `TECHNICAL_ARCHITECTURE.md`, `IMPLEMENTATION_PLAN.md`, `PROJECT_STATUS.md`, `AGENTS.md` và xác nhận bằng kiểm thử tự động trong `tests/test-1.5.js`.
  - **File frontend đã tạo mới:**
    - `client/package.json`: Cấu hình dự án frontend riêng (`phaser`, `vite`).
    - `client/vite.config.js`: Cấu hình Vite dev server và production build.
    - `client/index.html`: Khung HTML/CSS tối thiểu canh giữa `#game-container`, nền đêm ngoài khung 9:16 và `image-rendering: pixelated`.
    - `client/src/main.js`: Khởi tạo duy nhất 1 instance `Phaser.Game`.
    - `client/src/game/config.js`: Cấu hình Phaser (`360x640`, `pixelArt: true`, `antialias: false`, `roundPixels: true`, `Phaser.Scale.FIT`, `Phaser.Scale.CENTER_BOTH`).
    - `client/src/game/scenes/BootScene.js`: Khởi tạo cảnh tối thiểu và chuyển sang `MainScene`.
    - `client/src/game/scenes/MainScene.js`: Dựng toàn bộ khung giao diện 9:16 bằng Phaser Graphics/Shapes/Text (Header, nhãn LIVE, Event Banner, BXH Top nhậu, Bàn nhựa đỏ + 6 ghế + 6 nhân vật placeholder + thanh độ say, Hàng chờ VIP/Normal, Hướng dẫn tương tác, Safe Zones) theo đúng 9 Layer (`depth: 0..80`).
    - `client/src/game/ui/Layout.js`: Tách biệt tọa độ `360x640`, bảng màu đêm vỉa hè, 9 layer và dữ liệu preview tĩnh.
    - `tests/test-2.1.js`: Bộ kiểm thử tự động 11 hạng mục cho Nhiệm vụ 2.1.
  - **Lệnh chạy frontend:**
    - Chạy môi trường phát triển: `cd client && npm run dev`
    - Build bản production: `cd client && npm run build`
    - Chạy kiểm thử tự động 2.1: `node tests/test-2.1.js`
  - **Kết quả kiểm thử & hồi quy:**
    - `node tests/test-2.1.js`: **11/11 PASS** (Cấu trúc file, cô lập package, độ phân giải `360x640`, 9 Layer `0..80`, kiểm tra hình học chống tràn và chống đè chữ/nhân vật/bàn trên cả 6 ghế, Vite dev server HTTP transform, Vite production build `client/dist`).
    - Regression Backend `npm run test:1.5` (kèm kiểm thử Recovery Policy `KO`/`LEAVING`): **PASS** (`353.14 ms` cho 1000 sự kiện).
    - Regression Backend `npm run test:1.4` (28/28), `test:1.3` (24/24), `test:1.2` (16/16), `test:1.1` (8/8): **100% PASS**.
  - **Giới hạn còn tồn tại ở Nhiệm vụ 2.1:**
    - Chưa kết nối Socket.io / Backend (dùng dữ liệu tĩnh preview theo đúng phạm vi 2.1; sẽ kết nối ở Nhiệm vụ 2.3).
    - Chưa có công cụ trình duyệt đồ họa (headless browser) trong môi trường CLI để chụp ảnh màn hình kiểm chứng trực quan; việc xác minh bố cục không chồng lấp/không tràn hiện được chứng minh bằng kiểm thử tọa độ hình học và kiểm tra Vite HTTP/build.
    - Trên các viewport có hệ số nhân không nguyên (như `540x960` = `1.5x` hoặc cửa sổ desktop ngang `1366x768` = `1.2x`), `Phaser.Scale.FIT` giữ đúng tỷ lệ `9:16` không méo hình và bật `nearest-neighbor`, nhưng chỉ đạt pixel-perfect nguyên khối tuyệt đối ở các bội số nguyên (`360x640` = `1x`, `1080x1920` = `3x`).
- [x] **Hoàn thành Nhiệm vụ 2.2 (Hoàn thiện Bàn nhậu, 6 Ghế và Hệ thống Nhân vật Placeholder):**
  - **File đã tạo mới:**
    - `client/src/game/entities/PlayerPlaceholder.js`: Tách biệt rõ 3 lớp hình ảnh `stoolGfx` (Ghế), `torsoGfx` (Thân áo 6 màu phân biệt) và `headGfx` (Đầu & biểu cảm theo trạng thái `EMPTY`, `SOBER`, `TIPSY`, `DRUNK`, `KO`, `LEAVING`), sẵn sàng thay bằng Pixel Art spritesheet mà không sửa `SeatView`.
    - `client/src/game/entities/SeatView.js`: Quản lý hiển thị từng ghế cố định `seatId: 1..6` (`updateSeat()`, `clearSeat()`, `getDisplayState()`), ẩn nhân vật và xóa sạch nickname cũ khi `EMPTY`, không chứa logic/timer gameplay.
    - `client/src/game/entities/TableView.js`: Module hiển thị bàn nhựa đỏ, 3 đĩa mồi nhậu, hộp khăn giấy, chai bia và 6 vị trí ly bia đồng bộ trạng thái hiển thị với 6 ghế.
    - `tests/test-2.2.js`: Bộ kiểm thử tự động cho Nhiệm vụ 2.2.
  - **File đã chỉnh sửa:**
    - `client/src/game/ui/Layout.js`: Tinh chỉnh tọa độ và kích thước tăng khả năng đọc trên điện thoại (tăng cỡ chữ nickname lên `10px`, trạng thái `9px`, mở rộng thanh độ say lên `52×8 px` có vạch chia mốc `30%`/`70%`, nới khoảng cách giữa BXH và HUD hàng ghế sau lên `16px`, tăng giới hạn tên trên BXH lên `14` ký tự, làm gọn bảng hướng dẫn tương tác; bổ sung bộ dữ liệu preview đủ 4 trạng thái `EMPTY`, `SEATED`, `KO`, `LEAVING`, nickname dài và các preset `1/2/3`).
    - `client/src/game/scenes/MainScene.js`: Tích hợp `TableView` và 6 `SeatView`, hỗ trợ chuyển nhanh 3 chế độ preview (`MIXED_DEMO`, `FULL_TABLE`, `EMPTY_TABLE`) qua phím `1`, `2`, `3`.
    - `tests/test-2.1.js`: Hỗ trợ kiểm tra ghế `EMPTY` trong dữ liệu preview chung.
  - **Kết quả kiểm thử & build:**
    - `node tests/test-2.2.js`: **PASS** (11/11 hạng mục kiểm thử).
    - `node tests/test-2.1.js`: **PASS** (11/11 hạng mục regression).
    - `cd client && npm run build`: **PASS** (`dist/index.html` + `dist/assets/index-*.js`).
- [x] **Hoàn thành Nhiệm vụ 2.3 (Kết nối Phaser 3 với Backend qua Socket.io):**
  - **File đã tạo mới:**
    - `client/src/network/SocketClient.js`: Quản lý duy nhất 1 kết nối Socket.io (`CONNECTING`, `CONNECTED`, `DISCONNECTED`, `ERROR`), tự động reconnect, bảo vệ thứ tự `stateVersion`, tự động gửi `client:request_snapshot` khi thiếu version, lọc trùng `eventId` cho `game:action_fx`, chống đăng ký trùng listener theo subscriber key.
    - `tests/test-2.3.js`: Bộ kiểm thử tích hợp trực tiếp giữa `SocketClient` + `SeatView` + `TableView` và Backend Socket.io thật.
  - **File đã chỉnh sửa:**
    - `client/package.json`: Bổ sung `socket.io-client`.
    - `client/src/game/config.js`: Bổ sung `isDevPreviewModeRequested()` (mặc định chạy chế độ kết nối Backend; chỉ bật Preview khi ở môi trường dev và có `?preview=1` hoặc `VITE_PREVIEW_MODE=true`; khóa hoàn toàn Preview trên production).
    - `client/src/game/scenes/MainScene.js`: Kết nối `SocketClient`, đồng bộ 6 `SeatView`, `TableView`, `VIP Queue`/`Normal Queue`, bộ đếm Like và trạng thái kết nối; hiển thị placeholder trung thực cho BXH khi Server chưa cung cấp leaderboard; khóa phím `1, 2, 3` khi đang ở chế độ Backend; dọn dẹp listener khi scene `shutdown`/`destroy`.
    - `tests/test-2.1.js`: Cho phép dependency `socket.io-client` trong `client/package.json`.
  - **Hợp đồng sự kiện Socket.io thực tế (Socket.io Event Contract):**
    - `Server -> Client`:
      - `game:state_snapshot`: `{ stateVersion, state }` (chứa `roomId`, `mode`, `stateVersion`, `seats[0..5]`, `vipQueue`, `normalQueue`, `totalWaiting`, `waitingQueue`, `likeMetrics`, `cheersConfig`, `wifeConfig`).
      - `game:state_patch`: `{ eventId, stateVersion, updatedAt, seats, seatedPlayers, vipQueue, normalQueue, totalWaiting, waitingQueue, likeMetrics, cheersConfig, wifeConfig }`.
      - `game:action_fx`: `{ actionType, actionCategory, eventId, stateVersion, timestamp, ... }`.
      - `server:ready`: Phản hồi handshake khi nhận `client:ready`.
    - `Client -> Server`:
      - `client:ready`: `{ clientType: 'obs', lastStateVersion }`.
      - `client:request_snapshot`: `{ currentVersion }` (yêu cầu đồng bộ lại khi phát hiện nhảy cóc `stateVersion`).
  - **Cách chạy đồng thời Backend và Frontend:**
    - Terminal 1 (Backend + Mock Dashboard tại `http://127.0.0.1:3000/mock`): `npm start`
    - Terminal 2 (Frontend Phaser 3 tại `http://127.0.0.1:5173`): `cd client && npm run dev` (hoặc truyền `VITE_BACKEND_URL=http://127.0.0.1:3000`)
    - Chế độ xem thử UI tĩnh (chỉ trong dev): mở `http://127.0.0.1:5173/?preview=1`
  - **Kết quả kiểm thử & build:**
    - `node tests/test-2.3.js`: **PASS** (14/14 kịch bản tích hợp Socket.io thật).
    - `node tests/test-2.2.js`: **PASS** (11/11 regression).
    - `node tests/test-2.1.js`: **PASS** (11/11 regression).
    - `cd client && npm run build`: **PASS** (`dist/index.html` + `dist/assets/index-C-P8Nk4r.js`).
  - **Giới hạn còn tồn tại ở Nhiệm vụ 2.3:**
    - Sự kiện `game:action_fx` hiện chỉ cập nhật tóm tắt trên `Event Banner` và lưu vào bộ đệm tích hợp (`recentFxEvents`), chưa chạy hoạt ảnh nhân vật/cụng ly/vợ kéo chi tiết (đã hoàn thành ở Nhiệm vụ 2.4).
    - Môi trường CLI không có trình duyệt đồ họa để chụp ảnh màn hình tự động.
- [x] **Hoàn thành Nhiệm vụ 2.4 (Animation Gameplay & Event FX):**
  - **File đã tạo mới:**
    - `client/src/game/fx/AnimationManager.js`: Quản lý hoạt ảnh & hiệu ứng sự kiện tập trung trên `Layer 50` (`ACTION_FX_LAYER`), tái sử dụng object pool (`centerFxGfx`, `centerFxText`, 6 `seatFxPool`), giới hạn hàng đợi (`maxQueueSize = 20`), lọc trùng `eventId` (`maxSeenKeys = 200`), kiểm tra `stateVersion` & `userId` trên từng ghế, chống lặp hoạt ảnh `KO`/`LEAVING`, vòng lặp lắc lư theo bậc say (`SOBER`, `TIPSY`, `DRUNK`), dọn sạch toàn bộ timer/tween khi `shutdown()` hoặc `reconnect`.
    - `tests/test-2.4.js`: Bộ kiểm thử tự động 12 hạng mục (kèm tích hợp trực tiếp với Backend Socket.io server thật).
  - **File đã chỉnh sửa:**
    - `client/src/game/entities/PlayerPlaceholder.js`: Bổ sung `poseOffset` (`setPoseOffset`, `resetPoseOffset`, `getPoseOffset`) và vẽ tay nâng ly cụng khi `raiseMug = true`.
    - `client/src/game/entities/SeatView.js`: Lưu `userId` vào `viewState`, bổ sung `setAnimationOffset()`, `resetAnimationOffset()` và tự động reset pose khi đổi `userId` hoặc ghế về `EMPTY`.
    - `client/src/game/entities/TableView.js`: Bổ sung `setCheeringSeats(seatIds)` dịch chuyển ly bia hướng vào tâm bàn kèm vòng sáng cụng ly khi `CHEERS`.
    - `client/src/game/scenes/MainScene.js`: Tích hợp `AnimationManager` vào `create()`, `applyBackendViewData()`, `applyActionFx()`, `updateConnectionStatusDisplay()`, `applyPreviewPreset()` và `cleanupSocketSubscription()`.
  - **Kết quả kiểm thử & build:**
    - `node tests/test-2.4.js`: **PASS** (12/12 hạng mục kiểm thử đơn vị & tích hợp Backend thật).
    - `node tests/test-2.3.js`: **PASS** (14/14 regression).
    - `node tests/test-2.2.js`: **PASS** (11/11 regression).
    - `node tests/test-2.1.js`: **PASS** (11/11 regression).
    - `node tests/test-1.5.js`: **PASS** (20/20 tích hợp Backend + Invariants + Security + Recovery + Perf).
    - `cd client && npm run build`: **PASS** (`dist/index.html` + `dist/assets/index-CvOwOsli.js`).
  - **Giới hạn còn tồn tại ở Nhiệm vụ 2.4:**
    - Tất cả hoạt ảnh hiện vẽ bằng hình khối/văn bản placeholder trên Phaser Graphics/Text (sẵn sàng thay bằng Pixel Art spritesheet ở giai đoạn sau mà không đổi logic đồng bộ).
    - Môi trường CLI không có trình duyệt đồ họa để chụp ảnh màn hình tự động; người dùng có thể kiểm tra trực quan qua `npm start` + `cd client && npm run dev` kết hợp `http://127.0.0.1:3000/mock`.
- [x] **Hoàn thành Nhiệm vụ 2.5 (UI Polish, Responsive 9:16, OBS Browser Source Readiness & Kiểm thử Tải — Hoàn tất Giai đoạn 2):**
  - **File đã tạo mới:**
    - `OBS_GUIDE.md`: Tài liệu hướng dẫn cấu hình OBS Browser Source (`1080×1920`, CSS, quy trình chạy Production vs Dev, kiểm tra `CONNECTED`/`OFFLINE`, bảo mật không lộ Mock Dashboard và `ADMIN_SECRET_TOKEN` trên sóng).
    - `tests/test-2.5.js`: Bộ kiểm thử tự động toàn diện cho Nhiệm vụ 2.5 (phân tách rõ kiểm thử tĩnh, kiểm thử đơn vị Unicode/HUD overflow, kiểm thử tích hợp & kiểm thử tải 143 sự kiện burst với Backend Socket.io thật).
  - **File đã chỉnh sửa:**
    - `client/src/game/ui/Layout.js`: Bổ sung `splitGraphemes()` và `truncateTextSafe()` sử dụng `Intl.Segmenter('vi', { granularity: 'grapheme' })` (fallback `Array.from`), lọc sạch ký tự điều khiển/lone surrogates và cắt chuỗi an toàn theo grapheme cho tiếng Việt có dấu, emoji phức hợp (`👨‍👩‍👧‍👦`, `🍻👑🔥`) mà không làm hỏng ký tự hoặc sửa `rawNickname`.
    - `client/src/game/entities/SeatView.js`: Bổ sung nền đệm tối (`fillRoundedRect` alpha `0.68`) dưới cụm HUD của từng ghế, tăng `strokeThickness: 3`, tô màu vàng ấm (`#FEE761`) cho nickname người chơi VIP trên ghế, bổ sung dải sáng bóng trên thanh độ say và viền nhấn màu theo bậc say (`SOBER`, `TIPSY`, `DRUNK`, `KO`).
    - `client/src/network/SocketClient.js`: Nâng cấp `formatActionFxBanner()` tự động cắt gọn nickname (`12` grapheme) và giới hạn độ dài toàn chuỗi thông báo (`48` grapheme).
    - `client/src/game/scenes/MainScene.js`: Giới hạn danh sách hiển thị hàng chờ `VIP`/`Normal` tối đa 3 tên đầu kèm `(+N)` khi hàng chờ đông, giới hạn BXH tối đa Top 3 kèm `truncateTextSafe(..., 48)`, tăng `strokeThickness` cho các nhãn HUD/Banner/Hàng chờ.
    - `client/src/game/fx/AnimationManager.js`: Căn chỉnh banner FX trung tâm đúng tâm bàn (`tableCenter.y`), giới hạn độ dài text banner trung tâm (`28` grapheme) và nhãn ghế (`14` grapheme); cập nhật `minAcceptableStateVersion` theo snapshot mới khi Backend khởi động lại từ `stateVersion = 0`.
  - **Kết quả kiểm thử & build:**
    - `node tests/test-2.5.js`: **PASS** (6/6 nhóm kiểm thử tĩnh, hình học 9:16, Unicode/Emoji, bảo mật OBS, tích hợp reconnect/restart & tải 143 sự kiện burst trong `135.4 ms`, `ΔHeap: 2.22 MB`, `0` GameObject tạo mới).
    - Regression `node tests/test-2.4.js`: **12/12 PASS**
    - Regression `node tests/test-2.3.js`: **14/14 PASS**
    - Regression `node tests/test-2.2.js`: **11/11 PASS**
    - Regression `node tests/test-2.1.js`: **11/11 PASS**
    - Regression Backend `node tests/test-1.5.js`: **20/20 PASS**
    - `cd client && npm run build`: **PASS** (`dist/index.html` `1.35 kB` + `dist/assets/index-BnMNxG2G.js` `1,573.23 kB`).
  - **Giới hạn còn tồn tại sau Giai đoạn 2:**
    - Môi trường CLI không cài đặt phần mềm OBS Studio và không có GPU/trình duyệt đồ họa để đo FPS trực tiếp bên trong OBS thực tế; việc sẵn sàng cho OBS Browser Source đã được xác minh qua cấu hình HTML/CSS/Phaser (`1080×1920`, `Phaser.Scale.FIT`, `pixelArt: true`), kiểm thử bảo mật tĩnh và kiểm thử tải tích hợp Node.js.
    - Nhân vật, bàn nhậu và hiệu ứng đang dùng hình khối/text placeholder theo đúng lộ trình MVP.
- [x] **Hoàn thành Giai đoạn 3 — Hạng mục 3.4 (Bong bóng chat `game:chat_bubble`, Banner sự kiện `game:banner_notice` & Đồng bộ BXH Tửu Lượng `leaderboard`):**
  - **Rà soát các hạng mục 3.1–3.3 đã hoàn thành từ Giai đoạn 1–2 (không viết lại module đang chạy tốt):**
    - `3.1` Tính điểm say từ Like (`100/+1`), Gift (`DRUNK_INCREASE`/`DRUNK_DECREASE`) & Vòng lặp tự động `1, 2, 3 DÔ!` (`30s/+5`): Đã hoạt động ổn định trong `server/services/gameStateManager.js`.
    - `3.2` Sự kiện "Vợ bắt về" ngẫu nhiên (`60s/10%/CD 180s`) & Gift gọi vợ (`WIFE_SUMMON`): Đã hoạt động ổn định trong `server/services/gameStateManager.js`.
    - `3.3` Thanh độ say (`Drunk Gauge` 4 cấp màu) & Hàng đợi hoạt ảnh giới hạn (`AnimationManager` `maxQueueSize = 20`, object pool): Đã hoạt động ổn định trong `SeatView.js` và `AnimationManager.js`.
  - **File đã tạo mới:**
    - `tests/test-3.4.js`: Bộ kiểm thử tích hợp E2E cho Hạng mục 3.4 và xác minh chéo các hạng mục 3.1–3.3.
  - **File đã chỉnh sửa:**
    - `server/services/gameStateManager.js`: Bổ sung callback `onChatBubble`, phương thức `handleChat()` (chỉ phát `game:chat_bubble` khi người gửi đang `SEATED`, giới hạn `40` ký tự, không làm tăng `stateVersion`) và `_computeLeaderboard()` trả về Top 3 người chơi trên bàn có `drunkLevel` cao nhất trong `getSnapshot()`.
    - `server/index.js`: Phát `leaderboard` trong `game:state_patch`, phát `game:banner_notice` (`level: 'info' | 'success' | 'warning' | 'danger'`) đồng bộ với `game:action_fx`, và phát `game:chat_bubble` qua Socket.io.
    - `server/services/mockService.js`: Bổ sung `simulateChat(userId, nickname, comment)` phục vụ kiểm thử bong bóng chat.
    - `client/src/network/SocketClient.js`: Lắng nghe và lọc trùng `game:chat_bubble`, `game:banner_notice`, bảo vệ `stateVersion` và ánh xạ `leaderboard` sang `viewData`.
    - `client/src/game/fx/AnimationManager.js`: Cấp phát sẵn 6 slot `chatBubblePool` (`bubbleGfx`, `bubbleText`) trên `Layer 42..43`, triển khai `enqueueChatBubble()` và `cancelChatBubble()` (tự động hủy ngay khi người chơi chuyển sang `KO`, `LEAVING`, `EMPTY` hoặc đổi `userId`).
    - `client/src/game/scenes/MainScene.js`: Kết nối `onChatBubble`, `onBannerNotice`, cập nhật màu viền `eventBannerGfx` theo mức độ sự kiện và hiển thị ` (#1 Tên (XX%) | ...)` trên thanh BXH Tửu Lượng.
  - **Kết quả kiểm thử & build:**
    - `node tests/test-3.4.js`: **4/4 PASS**
    - Regression `node tests/test-2.5.js`, `test-2.4.js`, `test-2.3.js`, `test-2.2.js`, `test-2.1.js`, `test-1.5.js`: **100% PASS**
    - `cd client && npm run build`: **PASS** (`dist/index.html` + `dist/assets/index-CeAO5_sD.js`).
- [x] **Hoàn thành Giai đoạn 3 — Hạng mục 3.5 (Sound Manager — Hoàn tất Giai đoạn 3):**
  - **File đã tạo mới:**
    - `client/src/game/audio/soundManager.js`: Quản lý âm thanh tập trung (`SoundManager`), hỗ trợ 6 SFX chuẩn (`CHEERS`, `DRINK`, `KO`, `WIFE_DRAG`, `GIFT`, `VIP`), điều khiển `mute()`/`unmute()`/`toggleMute()`/`setVolume()` (`[0.0, 1.0]`, mặc định `0.5`), đọc cấu hình khởi tạo từ URL query (`?muted=1`, `?volume=0.4`) hoặc `VITE_AUDIO_*` cho OBS Browser Source, chống phát trùng theo `eventId`, chặn chồng âm thanh gây chói bằng cooldown mỗi SFX và trần `maxConcurrentSounds = 4`, tái sử dụng object pool cho Phaser Sound (`<= 6` instance) và dùng chung duy nhất `AudioContext`, an toàn trước chính sách Autoplay của trình duyệt, dọn sạch tài nguyên khi `shutdown()`.
    - `tests/test-3.5.js`: Bộ kiểm thử tự động 14 kịch bản đơn vị & tích hợp E2E với Backend Socket.io thật.
  - **File đã chỉnh sửa:**
    - `client/src/game/scenes/MainScene.js`: Tích hợp `SoundManager` vào `create()`, `applyBackendViewData()`, `applyActionFx()`, `updateConnectionStatusDisplay()`, `cleanupSocketSubscription()` và bổ sung phím tắt `M` để bật/tắt âm thanh.
    - `OBS_GUIDE.md`: Bổ sung Mục 5 hướng dẫn cấu hình âm thanh, tham số URL `?muted` / `?volume` và xử lý Autoplay trong OBS Browser Source.
  - **Kết quả kiểm thử & build:**
    - `node tests/test-3.5.js`: **14/14 PASS**
    - Regression `node tests/test-3.4.js` (4/4), `test-2.5.js` (6/6 nhóm), `test-2.4.js` (12/12), `test-2.3.js` (14/14), `test-2.2.js` (11/11), `test-2.1.js` (11/11), `test-1.5.js` (20/20): **100% PASS**
    - `cd client && npm run build`: **PASS** (`dist/index.html` `1.35 kB` + `dist/assets/index-D_T9t9tH.js` `1,583.48 kB`).
  - **Giới hạn còn tồn tại sau Giai đoạn 3:**
    - Đang sử dụng **Placeholder SFX tổng hợp (Web Audio 8-bit/pixel synth ngắn)** vì chưa có file âm thanh bản quyền trong `client/public/assets/audio/`; khi nạp file âm thanh thực vào Phaser Audio Cache (`sfx_cheers`, `sfx_drink`, `sfx_ko`, `sfx_wife_drag`, `sfx_gift`, `sfx_vip`), `SoundManager` sẽ tự động chuyển sang phát file asset.
    - Môi trường CLI không có phần mềm OBS Studio và thiết bị loa vật lý để nghe kiểm tra trực tiếp trên sóng; việc phát âm thanh trong OBS Browser Source cần được kiểm tra thực tế trên máy chạy OBS theo `OBS_GUIDE.md`.
- [x] **Hoàn thành Giai đoạn 4 — Hạng mục 4.1 (Cài đặt & tích hợp `tiktok-live-connector@2.5.0` vào `server/services/tiktokService.js`):**
  - **Dependency đã được phê duyệt & cài đặt:**
    - `tiktok-live-connector@2.5.0` (`--save-exact` trong `package.json` và `package-lock.json`).
  - **File đã tạo mới:**
    - `server/services/tiktokService.js`: Tích hợp `TikTokLiveConnection`, `ControlEvent` (`connected`, `disconnected`, `error`) và `WebcastEvent` (`chat`, `like`, `gift`, `streamEnd`) từ `tiktok-live-connector@2.5.0`; kết nối luồng sự kiện `LIVE` qua `validateRawEvent` -> `normalizeEvent` -> `BoundedRateLimiter` -> `SequentialEventQueue` -> `GameStateManager`; cô lập hoàn toàn `MOCK`/`LIVE` mode (không tự động kết nối trong `MOCK` mode, chặn mọi sự kiện `LIVE` khi server ở `MOCK` mode); trích xuất `userId` ổn định từ `user.id` (tuyệt đối không dùng `nickname` làm `userId`); quản lý `connect()`, `disconnect()`, `shutdown()` và gỡ bỏ 100% listener khi ngắt kết nối hoặc kết nối lại.
    - `tests/test-4.1.js`: Bộ kiểm thử tự động 5 nhóm kịch bản cho Hạng mục 4.1.
  - **File đã chỉnh sửa:**
    - `package.json`, `package-lock.json`: Khóa phiên bản `"tiktok-live-connector": "2.5.0"`.
    - `config/default.json`, `server/config.js`, `.env.example`: Bổ sung cấu hình `tiktok` (`uniqueId`, `autoConnect`, `processInitialData`, `fetchRoomInfoOnConnect`, `enableExtendedGiftInfo`) và biến môi trường `APP_MODE`, `TIKTOK_UNIQUE_ID`.
    - `server/logger.js`: Bổ sung redact cho các khóa nhạy cảm của TikTok connector (`signApiKey`, `sign_api_key`, `oAuthToken`, `oauth_token`, `tt-target-idc`, `tt_target_idc`).
    - `server/engines/inputValidator.js`, `server/engines/eventNormalizer.js`: Hỗ trợ `giftId` cho sự kiện `GIFT` có `source: 'LIVE'` mà không tự suy đoán `giftId` hay `vipGiftThreshold`.
    - `server/index.js`: Khởi tạo `tiktokService` trong `createAppServer`, tự động kết nối trong `startServer` chỉ khi `defaultMode === 'LIVE'` và có `tiktok.uniqueId`, đóng kết nối an toàn trong `shutdown()`.
  - **Kết quả kiểm thử & build:**
    - `node tests/test-4.1.js`: **5/5 PASS**
    - Regression `node tests/test-3.5.js` (14/14), `test-3.4.js` (4/4), `test-2.5.js` (6/6), `test-2.4.js` (12/12), `test-2.3.js` (14/14), `test-2.2.js` (11/11), `test-2.1.js` (11/11), `test-1.5.js` (20/20), `test-1.4.js` (28/28): **100% PASS**
    - `cd client && npm run build`: **PASS** (`dist/index.html` `1.35 kB` + `dist/assets/index-7ZwmIzV8.js` `1,589.99 kB`).
  - **Giới hạn hiện tại ở Hạng mục 4.1:**
    - Chưa có luồng livestream TikTok đang phát thực tế trong môi trường CLI; việc kết nối và nhận sự kiện đang được kiểm chứng qua khởi tạo instance `TikTokLiveConnection` thật kết hợp connector giả lập đúng giao diện v2.5.0.
    - Bảng `liveGiftMappings` và `vipGiftThreshold` đang để trống (`{}` và `null`) chờ dữ liệu cấu hình thực tế ở các hạng mục tiếp theo.
- [x] **Hoàn thành Hạng mục 4.2 (Chuẩn hóa sự kiện `CHAT`, `LIKE`, `GIFT` từ TikTok sang `NormalizedGameEvent`):**
  - **File đã tạo mới:**
    - `tests/test-4.2.js`: Bộ kiểm thử tự động 15 kịch bản cho Hạng mục 4.2.
  - **File đã chỉnh sửa:**
    - `server/services/tiktokService.js`: Bổ sung và xuất hàm `normalizeTikTokRawPayload`, `extractUserNickname`, `extractAvatarUrl`, `extractMessageId`; chuẩn hóa gói tin `WebcastChatMessage`, `WebcastLikeMessage`, `WebcastGiftMessage` từ `tiktok-live-connector@2.5.0`; tách bạch `likeDelta` (`count`/`likeCount`) và `totalLikeCount` (`total`), không dùng `totalLikeCount` làm `likeDelta`; trích xuất `giftId`, `giftName`, `giftType`, `repeatCount`, `repeatEnd` (`0`/`1` hoặc `boolean`), `groupId`/`streakId`, `toUser`.
    - `server/engines/inputValidator.js`: Cắt chuỗi theo Unicode code-point (`Array.from`) để bảo toàn trọn vẹn emoji và ký tự tiếng Việt trong `nickname`/`displayNickname`/`comment`; xác thực `totalLikeCount` tách biệt với `likeDelta` (từ chối gói `LIKE` chỉ có `totalLikeCount` mà thiếu `likeDelta`); hỗ trợ `repeatEnd` (`0`/`1` hoặc `boolean`), `groupId`/`streakId`, `giftType`, `giftName`.
    - `server/engines/eventNormalizer.js`: Đưa `totalLikeCount` vào `NormalizedGameEvent.payload` cho sự kiện `LIKE`; đưa `giftId`, `giftName`, `giftType`, `groupId`, `streakId`, `repeatCount`, `repeatEnd`, `isStreak` vào `NormalizedGameEvent.payload` cho sự kiện `GIFT` và ánh xạ qua `gameplayV1.liveGiftMappings` (giữ `UNMAPPED` khi chưa cấu hình, không tự suy đoán giá trị Gift).
  - **Kết quả kiểm thử & build:**
    - `node tests/test-4.2.js`: **15/15 PASS**
    - Regression `node tests/test-4.1.js` (5/5), `test-3.5.js` (14/14), `test-3.4.js` (4/4), `test-2.5.js` (6/6), `test-2.4.js` (12/12), `test-2.3.js` (14/14), `test-2.2.js` (11/11), `test-2.1.js` (11/11), `test-1.5.js` (20/20), `test-1.4.js` (28/28): **100% PASS**
    - `cd client && npm run build`: **PASS** (`dist/index.html` `1.35 kB` + `dist/assets/index-7ZwmIzV8.js` `1,589.99 kB`).
- [x] **Hoàn thành Hạng mục 4.3 (Xử lý Gift Combo/Streak & Bảng ánh xạ `liveGiftMappings`):**
  - **File đã tạo mới:**
    - `tests/test-4.3.js`: Bộ kiểm thử tự động 18 kịch bản cho Hạng mục 4.3.
  - **File đã chỉnh sửa:**
    - `server/engines/deduplicator.js`: Mở rộng `BoundedDeduplicator.resolveStreakDelta` theo công thức `newGiftCount = Math.max(0, currentRepeatCount - lastProcessedRepeatCount)`, giữ nguyên đỉnh `lastRepeatCount` khi gói đến trễ có `repeatCount` giảm, hỗ trợ chế độ fallback khi thiếu `groupId` (`isFallbackNoGroup`, tự động đóng và xoay vòng khi `repeatEnd === true` hoặc khi gửi các Gift đơn lẻ không có `repeatEnd` để không gộp nhầm 2 combo độc lập), bổ sung giới hạn `maxStreakEntries`, `fallbackStreakTtlMs`, `getStreakSize()` và `cleanup()`.
    - `server/services/tiktokService.js`, `server/engines/inputValidator.js`, `server/engines/eventNormalizer.js`: Trích xuất và chuẩn hóa `combo` (`boolean`), `diamondCount` (`integer >= 0`), `isNonStreakable` (`giftType !== 1` hoặc `combo === false`); xử lý giá trị mặc định `"0"`/`""` của `uint64 groupId` trong Protobuf v3 về `null`.
    - `server/services/gameStateManager.js`: Phân biệt Gift `isNonStreakable` (tính độc lập từng gói theo `msgId`) và Gift `isStreak` (định danh khóa `streak:${senderId}:${giftKey}:grp:${groupId}` hoặc `streak:${senderId}:${giftKey}:nogrp:${targetScope}` chỉ dùng `userId`, tuyệt đối không dùng `nickname`); hỗ trợ kiểm tra ngưỡng `vipGiftThreshold` kết hợp `liveGiftMappings` mà vẫn giữ cấu hình sản xuất `liveGiftMappings = {}` và `vipGiftThreshold = null`.
  - **Kết quả kiểm thử & build:**
    - `node tests/test-4.3.js`: **18/18 PASS**
    - Regression `node tests/test-4.2.js` (15/15), `test-4.1.js` (5/5), `test-3.5.js` (14/14), `test-3.4.js` (4/4), `test-2.5.js` (6/6), `test-2.4.js` (12/12), `test-2.3.js` (14/14), `test-2.2.js` (11/11), `test-2.1.js` (11/11), `test-1.5.js` (20/20), `test-1.4.js` (28/28): **100% PASS**
    - `cd client && npm run build`: **PASS** (`dist/index.html` `1.35 kB` + `dist/assets/index-7ZwmIzV8.js` `1,589.99 kB`).
- [x] **Hoàn thành Hạng mục 4.4 (Xử lý tính độ lệch Like `totalLikeCount` vs `likeDelta` chống cộng trùng):**
  - **File đã tạo mới:**
    - `tests/test-4.4.js`: Bộ kiểm thử tự động 18 kịch bản cho Hạng mục 4.4 (Like có `likeDelta`, có cả `likeDelta` + `totalLikeCount`, chỉ có `totalLikeCount` khởi tạo baseline lần đầu `+0`, duplicate `msgId`, gói đến trễ theo `createTime`, gói đảo thứ tự lấp gap `OUT_OF_ORDER_GAP_FILLED`, `totalLikeCount` giảm, reconnect giữ baseline/dedup, 2 người gửi Like độc lập, tích lũy đủ `100` Like tăng `+1` độ say và kích hoạt `KO`, bỏ qua Like khi bàn trống, người `KO`/`LEAVING` không nhận độ say, payload hỏng, giới hạn bộ nhớ cache `maxLikeBaselineEntries` & TTL, cách ly `MOCK`/`LIVE`, và tích hợp Socket.io E2E).
  - **File đã chỉnh sửa:**
    - `server/engines/deduplicator.js`: Bổ sung `likeBaselineCache` có giới hạn kích thước (`maxLikeBaselineEntries = 1000`), TTL (`likeBaselineTtlMs = 3600000`), ngưỡng gói trễ (`staleLikeThresholdMs = 5000`), và hàm `resolveLikeDelta(roomKey, payload, now)` phân tách phạm vi `likeDelta` (theo gói/người dùng) với `totalLikeCount` (tích lũy toàn phòng livestream theo khóa `room:${roomId}`).
    - `server/engines/inputValidator.js`, `server/engines/eventNormalizer.js`: Hỗ trợ `roomId`, `createTime` và cho phép gói `LIVE` chỉ có `totalLikeCount` khi có `roomId` hợp lệ (để khởi tạo/tính độ lệch theo baseline phòng).
    - `server/services/tiktokService.js`: Trích xuất `common.roomId`, `common.createTime` trong `WebcastLikeMessage`, fallback `this.roomId`, kiểm tra độ lệch đột biến (`> 10000`) so với baseline phòng và bảo vệ gói khởi tạo baseline không bị rơi bởi `BoundedRateLimiter`.
    - `server/services/gameStateManager.js`: Cập nhật `handleLike` và `processEvent` gọi `deduplicator.resolveLikeDelta(roomKey, payload, now)` để xác định `effectiveLikeDelta` chính xác trước khi tích lũy mốc `100 Like = +1 độ say`.
  - **Kết quả kiểm thử & build:**
    - `node tests/test-4.4.js`: **18/18 PASS**
    - Regression `node tests/test-4.3.js` (18/18), `test-4.2.js` (15/15), `test-4.1.js` (5/5), `test-3.5.js` (14/14), `test-3.4.js` (4/4), `test-2.5.js` (6/6), `test-2.4.js` (12/12), `test-2.3.js` (14/14), `test-2.2.js` (11/11), `test-2.1.js` (11/11), `test-1.5.js` (20/20), `test-1.4.js` (28/28): **100% PASS**
    - `cd client && npm run build`: **PASS** (`dist/index.html` `1.35 kB` + `dist/assets/index-7ZwmIzV8.js` `1,589.99 kB`).
- [x] **Hoàn thành Hạng mục 4.5 (Tự động Reconnect TikTok Live với Exponential Backoff có Jitter):**
  - **File đã tạo mới:**
    - `tests/test-4.5.js`: Bộ kiểm thử tự động 20 kịch bản với `FakeTimerScheduler` cho Hạng mục 4.5 (Kết nối thành công, mất kết nối ngoài ý muốn, reconnect lần 1, reconnect nhiều lần theo Exponential Backoff `1s -> 2s -> 4s -> 8s...`, giới hạn `maxReconnectDelayMs` & `maxReconnectAttempts`, Jitter hợp lệ `±20%`, không nhân đôi reconnect timer, không tạo 2 kết nối đồng thời, không nhân đôi listener, manual `disconnect()` và `shutdown()` không reconnect, `MOCK` mode không reconnect, xử lý `streamEnd`, phân loại lỗi tạm thời vs lỗi không phục hồi/`UserOfflineError`, giữ nguyên Game State/timers, không replay Like/Gift, bảo toàn baseline Like cùng `roomId` và tách baseline khi đổi `roomId`, tích hợp Socket.io E2E và dọn sạch tài nguyên).
  - **File đã chỉnh sửa:**
    - `server/services/tiktokService.js`: Triển khai máy trạng thái kết nối (`IDLE`, `CONNECTING`, `CONNECTED`, `RECONNECTING`, `STOPPED`), hàm phân loại lỗi `classifyTikTokError()`, công thức Exponential Backoff + Jitter `calculateReconnectDelay()`, quản lý thế hệ kết nối `_connectionGeneration`, timeout kết nối `connectTimeoutMs`, xử lý `streamEnd` và chính sách phiên `roomId` (`_handleConnectedRoomSession`).
    - `server/engines/deduplicator.js`: Bổ sung `clearLikeBaseline(roomKey)` để cô lập baseline của phòng cũ khi `roomId` thay đổi sang phiên livestream mới.
    - `config/default.json`, `server/config.js`: Bổ sung thông số mặc định cho TikTok Reconnect (`baseReconnectDelayMs: 1000`, `maxReconnectDelayMs: 60000`, `reconnectBackoffFactor: 2`, `reconnectJitterRatio: 0.2`, `maxReconnectAttempts: 10`, `connectTimeoutMs: 15000`).
  - **Kết quả kiểm thử & build:**
    - `node tests/test-4.5.js`: **20/20 PASS**
    - Regression `node tests/test-4.4.js` (18/18), `test-4.3.js` (18/18), `test-4.2.js` (15/15), `test-4.1.js` (5/5), `test-3.5.js` (14/14), `test-3.4.js` (4/4), `test-2.5.js` (6/6), `test-2.4.js` (12/12), `test-2.3.js` (14/14), `test-2.2.js` (11/11), `test-2.1.js` (11/11), `test-1.5.js` (20/20), `test-1.4.js` (28/28): **100% PASS**
    - `cd client && npm run build`: **PASS** (`dist/index.html` `1.35 kB` + `dist/assets/index-7ZwmIzV8.js` `1,589.99 kB`).
- [x] **Hoàn thành Hạng mục 4.6 (Kiểm toán & xác minh bảo mật log toàn diện trong luồng TikTok Live — Hoàn tất Giai đoạn 4):**
  - **File đã tạo mới:**
    - `.gitignore`: Loại trừ `.env`, `.env.*` (giữ `!.env.example`), `node_modules/`, `client/dist/`, `data/state-snapshot.json`, `*.log` khỏi quản lý phiên bản.
    - `tests/test-4.6.js`: Bộ kiểm thử tự động 22 kịch bản kiểm toán bảo mật log, Socket.io payload, Mock Dashboard, Frontend bundle và cấu hình.
  - **File đã chỉnh sửa:**
    - `server/logger.js`: Mở rộng danh sách khóa nhạy cảm (`SENSITIVE_KEYS`, `SENSITIVE_KEY_PATTERN`), bổ sung `redactString()` lọc các chuỗi chứa `sessionid=`, `ttwid=`, `oAuthToken=`, `signApiKey=`, `Authorization: Bearer ...`, `Cookie:`, `ADMIN_SECRET_TOKEN=`, `password=`; xử lý an toàn đối tượng `Error` (loại bỏ `config`, `request`, `response`, `headers`, `cookieJar` của HTTP/WebSocket client); chặn rò rỉ ở độ sâu `depth > 6` bằng `'[TRUNCATED_DEPTH]'` và chống vòng lặp tham chiếu (`WeakSet`).
    - `server/services/tiktokService.js`: Áp dụng `logger.redactString()` cho toàn bộ thông điệp lỗi kết nối, lý do ngắt WebSocket và `lastError` trước khi lưu trạng thái hoặc ghi log; đảm bảo chỉ ghi log các trường allowlist an toàn, tuyệt đối không ghi raw payload TikTok.
  - **Kết quả kiểm thử & build:**
    - `node tests/test-4.6.js`: **22/22 PASS**
    - Regression `node tests/test-4.5.js` (20/20), `test-4.4.js` (18/18), `test-4.3.js` (18/18), `test-4.2.js` (15/15), `test-4.1.js` (5/5), `test-3.5.js` (14/14), `test-3.4.js` (4/4), `test-2.5.js` (6/6), `test-2.4.js` (12/12), `test-2.3.js` (14/14), `test-2.2.js` (11/11), `test-2.1.js` (11/11), `test-1.5.js` (20/20), `test-1.4.js` (28/28): **100% PASS**
    - `cd client && npm run build`: **PASS** (`dist/index.html` `1.35 kB` + `dist/assets/index-7ZwmIzV8.js` `1,589.99 kB`).
- [x] **Hoàn thành Giai đoạn 5 — Hạng mục 5.1 (Lưu `data/state-snapshot.json` định kỳ `3–5s` & Tự động khôi phục trạng thái khi Backend khởi động lại):**
  - **File đã tạo mới:**
    - `tests/test-5.1.js`: Bộ kiểm thử tự động 8 kịch bản cho Hạng mục 5.1 (cấu hình mặc định `data/state-snapshot.json` / `15m` / `3000ms`, ghi atomic `saveSnapshotSync` & `saveSnapshotAsync` qua file `.tmp` + rename không để lại file rác, `scheduleSave` gộp biến đổi định kỳ `3000ms`, `flushSync()`/`shutdown()` ghi ngay lập tức bản nháp đang chờ, khôi phục hoàn chỉnh `6` ghế + `10` người hàng chờ `VIP`/`Normal` + `likeMetrics` + `randomWifeCooldownUntil` + `stateVersion` sau khi restart server, thực thi Recovery Policy `2026-11-06` cho người chơi `KO`/`LEAVING`, từ chối snapshot quá hạn `> 15 phút` / JSON lỗi / vi phạm invariants, và đồng bộ Socket.io E2E với Frontend sau khi Backend restart).
  - **File đã chỉnh sửa:**
    - `server/services/snapshotStore.js`: Bổ sung `DEFAULT_THROTTLE_MS = 3000`, `saveSnapshotAsync()`, `scheduleSave(snapshot)` lưu định kỳ có gộp biến đổi (`3–5 giây`), `cancelPendingTimer()`, `flushSync()`, `shutdown()` và khôi phục đầy đủ `roomId`, `timers.randomWifeCooldownUntil` cùng chính sách Recovery `2026-11-06` cho `KO`/`LEAVING`.
    - `server/index.js`: Tích hợp `SnapshotStore` vào `createAppServer` và `startServer` (tự động gọi `snapshotStore.loadAndRestore(gameStateManager)` khi khởi động, gọi `snapshotStore.scheduleSave(snapshot)` mỗi khi `GameState` thay đổi, và gọi `snapshotStore.shutdown()` khi dừng server).
  - **Kết quả kiểm thử & build:**
    - `node tests/test-5.1.js`: **8/8 PASS**
    - Regression `node tests/test-4.6.js` (22/22), `test-4.5.js` (20/20), `test-4.4.js` (18/18), `test-4.3.js` (18/18), `test-4.2.js` (15/15), `test-4.1.js` (5/5), `test-3.5.js` (14/14), `test-3.4.js` (4/4), `test-2.5.js` (6/6), `test-2.4.js` (12/12), `test-2.3.js` (14/14), `test-2.2.js` (11/11), `test-2.1.js` (11/11), `test-1.5.js` (20/20), `test-1.4.js` (28/28): **100% PASS**
    - `cd client && npm run build`: **PASS** (`dist/index.html` `1.35 kB` + `dist/assets/index-7ZwmIzV8.js` `1,589.99 kB`).
- [x] **Hoàn thành Giai đoạn 5 — Hạng mục 5.2 (Bắt lỗi toàn cục `uncaughtException`, `unhandledRejection` & Lưu Snapshot Khẩn Cấp):**
  - **File đã tạo mới:**
    - `tests/test-5.2.js`: Bộ kiểm thử tự động kiểm chứng toàn bộ 16 yêu cầu của Hạng mục 5.2 (bao gồm kiểm thử child process thật bằng `spawnSync`).
  - **File đã chỉnh sửa:**
    - `server/services/snapshotStore.js`: Bổ sung `saveEmergencySnapshotSync(gameStateManager, now)` kiểm tra toàn vẹn invariants (`validateSnapshotData`, kiểm tra `status` thuộc `['SEATED', 'KO', 'LEAVING']`, `drunkLevel` `0..100`, không trùng `userId`) trước khi ghi atomic đồng bộ; nếu trạng thái trong RAM đã bị hỏng thì từ chối ghi đè và bảo toàn bản chụp hợp lệ trước đó trên đĩa.
    - `server/engines/eventQueue.js`: Bổ sung `stop()` dừng xử lý hàng đợi và chặn nhận sự kiện mới ngay khi bắt đầu tắt khẩn cấp.
    - `server/services/tiktokService.js`: Chặn nhận sự kiện mới trong `handleRawWebcastEvent` ngay khi `_isShuttingDown` hoặc `_manualStopRequested` được bật (`reason: 'SERVICE_STOPPED'`).
    - `server/index.js`: Triển khai `emergencyShutdown(fatalType, errOrReason, execOptions)`, `registerGlobalErrorHandlers()` (singleton `WeakMap` theo `process`, chống đăng ký trùng listener và chống chạy lặp emergency shutdown) và `unregisterGlobalErrorHandlers()`.
  - **Kết quả kiểm thử & build:**
    - `node tests/test-5.2.js`: **PASS** (`9/9` nhóm kiểm thử bao phủ đủ 16 kịch bản).
    - Regression `node tests/test-5.1.js` (8/8), `test-4.6.js` (22/22), `test-4.5.js` (20/20), `test-4.4.js` (18/18), `test-4.3.js` (18/18), `test-4.2.js` (15/15), `test-4.1.js` (5/5), `test-3.5.js` (14/14), `test-3.4.js` (4/4), `test-2.5.js` (6/6), `test-2.4.js` (12/12), `test-2.3.js` (14/14), `test-2.2.js` (11/11), `test-2.1.js` (11/11), `test-1.5.js` (20/20), `test-1.4.js` (28/28): **100% PASS**
    - `cd client && npm run build`: **PASS** (`dist/index.html` `1.35 kB` + `dist/assets/index-7ZwmIzV8.js` `1,589.99 kB`).
- [x] **Hoàn thành Giai đoạn 5 — Hạng mục 5.3 (Stress Test, Soak Test & OBS Performance Optimization):**
  - **File đã tạo mới:**
    - `tests/test-5.3.js`: Bộ công cụ Stress Test (4 mức tải: Light `10/s`, Medium `50/s`, High `100/s`, Spike `500/s`), TikTok Auto-Reconnect dưới tải, Multi-Window Soak Test (6 cửa sổ liên tiếp với `--expose-gc`), Before/After Dirty-Checking Benchmark và kiểm tra Frontend Phaser 3 Object Pools.
  - **File đã chỉnh sửa (Tối ưu hóa có mục tiêu):**
    - `client/src/game/entities/SeatView.js`: Bổ sung dirty-checking (`_lastRenderKey`) trong `updateSeat()` giúp bỏ qua `91.67%` (`1100/1200`) lệnh `Graphics.clear()` và `Text.setText()` thừa khi ghế không đổi trạng thái/độ say.
    - `client/src/game/entities/TableView.js`: Bổ sung dirty-checking (`_lastMugSignature`) trong `updateMugStates()` giúp bỏ qua `100%` (`200/200`) lần vẽ lại `mugsGfx` khi trạng thái 6 ghế và hiệu ứng cụng ly không đổi.
    - `client/src/game/scenes/MainScene.js`: Bổ sung `_setTextIfChanged()` và kiểm tra `_lastBannerBorderColor` để tránh rasterize lại Canvas Text của Phaser khi chuỗi HUD không đổi; chuyển import `isDevPreviewModeRequested` sang `Layout.js`.
    - `client/src/game/ui/Layout.js` & `client/src/game/config.js`: Chuyển định nghĩa `isDevPreviewModeRequested()` sang `Layout.js` và re-export tại `config.js`, xóa bỏ hoàn toàn vòng lặp phụ thuộc (`circular dependency`) giữa `config.js` và `MainScene.js`.
    - `server/services/snapshotStore.js`: Bỏ qua lập lịch timer `scheduleSave()` thừa khi `throttleTimer === null` và `snapshot.stateVersion === lastSavedVersion`.
    - `package.json`: Thêm scripts `test:5.1`, `test:5.2`, `test:5.3`.
  - **Số liệu đo thực tế:**
    - **Before vs After Dirty-Checking (`200` bản vá trạng thái):** `SeatView` giảm từ `1200` lần vẽ xuống `100` lần (`-91.67%`); `TableView.updateMugStates` giảm từ `200` lần vẽ xuống `0` lần (`-100%`).
    - **Backend Ramped Stress Test:**
      - `STAGE_1_LIGHT_10_EV_S`: latency `p50 = 1.049ms`, `p95 = 4.098ms`, CPU `3.08%`, Heap `12.14 MB`, RSS `52.07 MB`.
      - `STAGE_2_MEDIUM_50_EV_S`: latency `p50 = 0.566ms`, `p95 = 1.391ms`, CPU `6.00%`, Heap `10.78 MB`, RSS `52.33 MB`.
      - `STAGE_3_HIGH_100_EV_S`: latency `p50 = 0.496ms`, `p95 = 1.508ms`, CPU `5.42%`, Heap `12.31 MB`, RSS `52.81 MB`.
      - `STAGE_4_SPIKE_500_EV_S` (`624` sự kiện dồn dập): throughput `412.7 ev/s`, latency `p50 = 1.263ms`, `p95 = 3.918ms`, `p99 = 6.702ms`, CPU `30.95%`, Heap `12.35 MB`, RSS `60.88 MB`, `0` lỗi hàng đợi.
    - **Backend Multi-Window Soak Test (`1200` sự kiện qua `6` cửa sổ liên tục kèm `--expose-gc`):** Heap sau làm nóng (Window 2) = `10.39 MB`, Heap cuối (Window 6) = `10.58 MB` (độ lệch `+0.19 MB`, không tăng tuyến tính), RSS ổn định `61.96 MB -> 62.60 MB`, timer giữ ghế sau khi dừng = `0`.
    - **Frontend Phaser 3 Pool & Browser WebGL (`playwright-cli` tại `1080x1920`):** Số lượng GameObject giữ nguyên `77` trước và sau `300` sự kiện burst (`seatFxPool = 6`, `chatBubblePool = 6`, `activeVoices = 0` sau shutdown). Đo thực tế trên trình duyệt Chromium WebGL ở viewport `1080x1920` (logical `360x640` scale `3x`) trong lúc bắn `40` sự kiện HTTP/Socket.io đạt **`95.6–139.6 FPS`** (`>= 60 FPS`), JS Heap `23.09 MB -> 34.65 MB`.
    - **Phân định trạng thái nghiệm thu:**
      - Kiểm thử tự động Backend & Frontend (`tests/test-5.3.js` + toàn bộ regression `1.4–5.2`): **PASS**
      - Kiểm thử trình duyệt thực tế (`playwright-cli` Chromium WebGL `1080x1920`): **PASS**
      - Kiểm thử 60 phút liên tục trực tiếp trong phần mềm **OBS Studio Browser Source**: **PENDING MANUAL VALIDATION** (cần người dùng chạy OBS Studio desktop thực tế).
- [x] **Hoàn thành Giai đoạn 5 — Hạng mục 5.4 (Windows Startup Script `start.bat` & Tài liệu vận hành `README.md`):**
  - **File đã tạo mới:**
    - `start.bat`: Script khởi chạy nhanh trên Windows (`cd /d "%~dp0"`, kiểm tra `node`/`npm`, kiểm tra các file bắt buộc & `node_modules`, không tự chạy `npm install`, giữ mặc định `APP_MODE=MOCK`, không lộ secret từ `.env`, kiểm tra cổng trống bằng `NETSTAT.EXE` chống chạy trùng tiến trình, tự build `client\dist` lần đầu nếu chưa có, không xóa `data/state-snapshot.json`, hướng dẫn dừng an toàn `Ctrl + C`).
    - `README.md`: Tài liệu hướng dẫn vận hành tiếng Việt đầy đủ 10 phần (Giới thiệu, Yêu cầu hệ thống, Cài đặt lần đầu, Khởi chạy nhanh `start.bat`, `MOCK` mode, `LIVE` mode & cảnh báo bảo mật, cấu hình OBS Browser Source `1080x1920` @ `60 FPS` + Custom CSS + Audio, Snapshot & Recovery Policy `KO`/`LEAVING`, Troubleshooting 11 lỗi phổ biến, Checklist 8 bước trước khi lên sóng).
    - `tests/test-5.4.js`: Bộ kiểm thử tự động 4 nhóm kịch bản (Static Check `start.bat`, Static Check `README.md`, Integration Test phục vụ `client/dist` + `/mock` + `/health` + Socket.io + Graceful Shutdown, và Windows Batch Execution Test kiểm chứng chặn xung đột cổng + bảo toàn `data/state-snapshot.json` + không lộ `ADMIN_SECRET_TOKEN`).
  - **File đã chỉnh sửa:**
    - `server/index.js`: Phục vụ trực tiếp bản build Production của Frontend (`client/dist`) tại `GET /` và `GET /index.html` trên cùng cổng Backend (`3000`) để `start.bat` vận hành gọn nhẹ chỉ với 1 tiến trình Node.js duy nhất mà không cần phụ thuộc Vite dev server khi lên sóng chính thức.
    - `package.json`: Thêm script `"test:5.4": "node tests/test-5.4.js"`.
  - **Kết quả kiểm thử & build:**
    - `node tests/test-5.4.js`: **4/4 PASS**
    - Regression `node --expose-gc tests/test-5.3.js` (5/5), `test-5.2.js` (9/9), `test-5.1.js` (8/8), `test-4.6.js` (22/22), `test-4.5.js` (20/20), `test-4.4.js` (18/18), `test-4.3.js` (18/18), `test-4.2.js` (15/15), `test-4.1.js` (5/5), `test-3.5.js` (14/14), `test-3.4.js` (4/4), `test-2.5.js` (6/6), `test-2.4.js` (12/12), `test-2.3.js` (14/14), `test-2.2.js` (11/11), `test-2.1.js` (11/11), `test-1.5.js` (20/20), `test-1.4.js` (28/28): **100% PASS**
    - `cd client && npm run build`: **PASS** (`dist/index.html` `1.35 kB` + `dist/assets/index-9U4qICjf.js` `1,591.07 kB`).

---

## 3. Các Vấn Đề Tồn Tại & Rủi Ro Kỹ Thuật (Open Risks)
1. **Rủi ro Kết nối TikTok Live:** Thư viện `tiktok-live-connector` phụ thuộc giao thức không chính thức của TikTok; có thể gặp giới hạn kết nối hoặc thay đổi cấu trúc gói tin.
   - *Giảm thiểu:* Chuẩn hóa hoàn toàn qua `eventNormalizer.js` và đảm bảo Mock Mode vận hành độc lập 100%.
2. **Xử lý Bão Sự Kiện (Event Burst):** Lượng Like và Gift combo dồn dập có thể gây nghẽn hiển thị.
   - *Giảm thiểu:* Giới hạn kích thước cứng cho Server Event Queue, Deduplicator Cache và Client Animation Queue.
3. **Khôi phục sau sự cố tiến trình:** Nếu tiến trình Node.js gặp lỗi nghiêm trọng giữa buổi live.
   - *Giảm thiểu:* Lưu `state-snapshot.json` định kỳ và khởi động lại sạch sẽ theo Recovery Policy v1.0.

---

## 4. Các Quyết Định Thiết Kế Chính Thức Đã Phê Duyệt (Approved & Locked v1.0)
1. **Sự kiện "Vợ bắt về" ngẫu nhiên & Gift:**
   - Chu kỳ kiểm tra: `60 giây`; xác suất kích hoạt: `10%` mỗi lần kiểm tra hợp lệ; cooldown: `180 giây` giữa các lần kích hoạt ngẫu nhiên.
   - Chỉ kích hoạt khi có người chơi hợp lệ (`SEATED`) trên bàn; không chọn người đã `KO` hoặc `LEAVING`.
   - Người bị chọn chuyển sang trạng thái `LEAVING` theo State Machine (giữ ghế `3000ms`), không xử lý loại người chơi nhiều lần.
   - Gift đặc biệt kích hoạt sự kiện này độc lập với cooldown ngẫu nhiên.
2. **Vòng lặp "1, 2, 3 DÔ!":**
   - Chu kỳ: `30 giây`; mỗi lần kích hoạt tất cả người chơi đang `SEATED` tăng `+5` độ say.
   - Không tác động lên người đã `KO` hoặc `LEAVING`.
   - Thực hiện trên Backend với duy nhất 1 scheduler hợp lệ; Frontend phát animation và âm thanh theo sự kiện Backend.
3. **Tương tác Like:**
   - Cứ mỗi `100` lượt Like mới hợp lệ, toàn bộ người chơi đang `SEATED` tăng `+1` độ say.
   - Chuẩn hóa thành số lượng tăng thêm, không tính trùng Like tích lũy; lượt Like dư cộng dồn cho mốc tiếp theo (ví dụ: `250` Like mới -> kích hoạt `2` mốc, dư `50`).
   - Không áp dụng cho người đã `KO` hoặc `LEAVING`; không tạo animation riêng cho từng lượt Like; khi bàn không có người `SEATED` thì không tích lũy nổ mốc tăng say.
4. **Hàng chờ ưu tiên Gift (VIP Priority Queue):**
   - Tối đa `6` ghế, hàng chờ tối đa `30` người chia thành `VIP Queue` và `Normal Queue` (FIFO trong từng nhóm, ưu tiên VIP khi có ghế trống).
   - Không tự động đuổi người đang ngồi.
   - Khi hàng chờ đã đủ `30` người: nếu có VIP mới đủ điều kiện và `Normal Queue` còn người -> loại người cuối `Normal Queue` để nhường vị trí; nếu toàn bộ hàng chờ đều là VIP -> từ chối VIP mới; không loại người đang ngồi, không loại người đã có VIP để nhận VIP mới, không tạo bản ghi trùng.
   - Nếu người đang trong `Normal Queue` nhận Gift đủ điều kiện -> nâng cấp họ thành VIP theo quy tắc FIFO của nhóm VIP, không chiếm thêm slot.
   - Ngưỡng Gift đủ điều kiện VIP được cấu hình riêng (không mặc định mọi Gift đều có quyền VIP).
5. **Gift tác động lên mục tiêu không hợp lệ:**
   - Kiểm tra tính hợp lệ của mục tiêu tại thời điểm Backend thực thi sự kiện.
   - Nếu mục tiêu đã `KO`, `LEAVING` hoặc không còn ngồi trên bàn: **không thay đổi độ say, không chuyển tác động sang người khác**, chỉ phát hiệu ứng hình ảnh/thông báo phù hợp, ghi nhận sự kiện đã xử lý để tránh phát lại.
   - Không cho phép Gift giải say hồi sinh người đã `KO`.
6. **Độ phân giải, Pixel Art & Assets MVP:**
   - Độ phân giải logic chính thức: `360x640` (9:16), scale `3x` (`nearest-neighbor`) lên `1080x1920`.
   - Giữ bảng màu đêm vỉa hè Việt Nam trong `GAME_DESIGN.md` làm định hướng thiết kế chính thức.
   - Sử dụng placeholder trong MVP, tách hình ảnh khỏi logic game, có thể thay thế bằng Pixel Art hoàn chỉnh ở giai đoạn sau mà không thay đổi Game State.
7. **Các quyết định nền tảng đã chốt:**
   - Backend là Single Source of Truth; định danh bằng `userId`; độ say `0–100`; `KO` đúng 1 lần; giữ ghế `3000ms` sau `KO`; tắt AFK Kick mặc định trong MVP; ưu tiên Mock Mode trước TikTok Live thật; Sequential Event Queue, Gift Deduplication, Animation Queue, Socket.io State Snapshot và `stateVersion`; công nghệ Node.js, Express, Socket.io, Phaser 3, Vite, `tiktok-live-connector`, OBS Browser Source.
8. **Chính sách Recovery cho người chơi `KO`/`LEAVING` (Bản ghi quyết định ngày `2026-11-06`):**
   - **Nội dung:** Khi Backend restart và khôi phục Game State từ snapshot, mọi người chơi đang ở trạng thái `KO` hoặc `LEAVING` phải được hoàn tất việc rời bàn ngay trong quá trình recovery (xóa khỏi ghế, không khởi tạo lại timer `3000ms`, không tạo timer mồ côi, không phát lại hiệu ứng `KO`/`LEAVING` cũ cho frontend). Nếu có người trong hàng chờ, cấp ghế theo thứ tự `VIP Queue` trước, `Normal Queue` sau (FIFO trong từng nhóm), không tạo `userId` trùng và đảm bảo `stateVersion` cùng snapshot nhất quán. Không thay đổi luật `KO`/`LEAVING` `3000ms` trong quá trình chơi bình thường.
   - **Lý do:** Ngăn chặn ghế bị kẹt vĩnh viễn ở trạng thái `KO`/`LEAVING` do mất timer `3000ms` trong RAM sau khi restart và tránh phát lại hoạt ảnh cũ.

---

## 5. Câu Hỏi Mở / Cấu Hình Vận Hành (Open Questions)
- **Không còn quyết định kiến trúc hay luật chơi nào bỏ ngỏ.** Toàn bộ thiết kế Master Plan v1.0 đã được phê duyệt và khóa.
- *Lưu ý cấu hình dữ liệu (Data Config):* Danh sách mã `giftId` cụ thể trên TikTok và giá trị ngưỡng xu `vipGiftThreshold` được tách riêng trong `config/default.json` để chủ phòng live tùy chỉnh linh hoạt mà không ảnh hưởng thiết kế hệ thống.

---

## 6. Công Việc Tiếp Theo (Next Step)
- **Task 5.4 Status:** `COMPLETED — PASS`
- **Phase 5 Status:** `IMPLEMENTATION COMPLETE — PENDING OBS MANUAL VALIDATION`
- **Master Plan v1.0 Status:** `IMPLEMENTATION COMPLETE — PENDING FINAL ACCEPTANCE` (Chờ người dùng nghiệm thu thực tế trên OBS Studio Desktop 60 phút và thử nghiệm phiên TikTok Live thật).
