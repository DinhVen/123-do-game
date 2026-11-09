# HƯỚNG DẪN CẤU HÌNH OBS BROWSER SOURCE — "1, 2, 3 DÔ!" (9:16)

Tài liệu hướng dẫn thiết lập và vận hành frontend Phaser 3 (`360×640` scale `3x` lên `1080×1920`) trong **OBS Studio Browser Source**.

---

## 1. Khởi Động Hệ Thống

### Bước 1: Khởi động Backend Server
Mở Terminal 1 tại thư mục gốc `D:\game`:
```powershell
npm start
```
- Mặc định Backend chạy tại `http://127.0.0.1:3000`.
- Kiểm tra trạng thái sống: `http://127.0.0.1:3000/api/health`.

### Bước 2: Khởi động Frontend Phaser 3
Mở Terminal 2 tại thư mục `D:\game\client`:

- **Cách A — Chạy bản Production (Khuyến nghị khi Livestream thật):**
  ```powershell
  cd D:\game\client
  npm run build
  npm run preview -- --host 127.0.0.1 --port 4173
  ```
  URL cho OBS: `http://127.0.0.1:4173`
  *(Bản Production khóa hoàn toàn chế độ `?preview=1` và phím tắt `1, 2, 3` để tránh vô tình bấm nhầm làm hiển thị dữ liệu mẫu trên sóng).*

- **Cách B — Chạy Vite Dev Server (Khi phát triển / thử nghiệm):**
  ```powershell
  cd D:\game\client
  npm run dev
  ```
  URL cho OBS: `http://127.0.0.1:5173`

---

## 2. Cấu Hình OBS Browser Source (`1080×1920`)

1. Trong **OBS Studio**, vào `Settings -> Video`:
   - **Base (Canvas) Resolution:** `1080x1920` (khung dọc 9:16 chuẩn TikTok Live).
   - **Output (Scaled) Resolution:** `1080x1920`.
   - **Common FPS Values:** `30` hoặc `60` FPS.
2. Tại bảng **Sources**, nhấn `+` -> chọn **Browser**:
   - **URL:** `http://127.0.0.1:4173` (nếu chạy `npm run preview`) hoặc `http://127.0.0.1:5173` (nếu chạy `npm run dev`).
   - **Width:** `1080`
   - **Height:** `1920`
   - **Use custom frame rate:** Bật và đặt `60` (hoặc `30` tùy cấu hình máy).
   - **Custom CSS:**
     ```css
     html, body {
       margin: 0 !important;
       padding: 0 !important;
       overflow: hidden !important;
       background-color: #0e0b16;
     }
     ```
   - **Shutdown source when not visible:** Không bật (để giữ kết nối Socket.io liên tục khi chuyển cảnh ngắn).
   - **Refresh browser when scene becomes active:** Không bật.

---

## 3. Kiểm Tra Kết Nối (`CONNECTED` / `OFFLINE`) & Hiển Thị 6 Ghế

1. **Kiểm tra trạng thái kết nối ở góc trên bên trái (`HEADER_BAR`):**
   - `● LIVE` hoặc `● MOCK` + Banner `🟢 Đã đồng bộ Server`: Frontend đã kết nối Socket.io và nhận Snapshot từ Backend.
   - `● SYNC`: Đang bắt tay kết nối.
   - `● OFFLINE` + Banner `🔴 Mất kết nối Backend — Đang tự động kết nối lại...`: Backend chưa bật hoặc sai cổng. Khi Backend bật lại, Frontend sẽ tự động kết nối lại và đồng bộ Snapshot mới nhất mà không cần F5 OBS.
2. **Kiểm tra hiển thị 6 ghế:**
   - Khi mới khởi động chưa có người chơi: Cả 6 ghế (`#1 [Ghế trống]` .. `#6 [Ghế trống]`) hiển thị ghế đẩu trống, không có tên mẫu giả.
   - Mở trình duyệt riêng ngoài OBS vào `http://127.0.0.1:3000/mock`, thử thêm người chơi hoặc bấm `Trigger "1, 2, 3 DÔ!"` để kiểm tra nhân vật, thanh độ say và hiệu ứng cụng ly trên OBS.

---

## 4. Quy Tắc Bảo Mật Khi Livestream (Tránh Lộ Mock Dashboard & Token)

1. **Tuyệt đối KHÔNG thêm URL Mock Dashboard (`http://127.0.0.1:3000/mock`) vào OBS Browser Source** hoặc quay màn hình cửa sổ trình duyệt đang mở Mock Dashboard trên luồng phát sóng.
2. **Không đưa `ADMIN_SECRET_TOKEN` vào mã nguồn Frontend hoặc biến môi trường `VITE_*`:**
   - Frontend Phaser 3 chỉ là màn hình hiển thị (`Stateless View`), kết nối tới Backend qua Socket.io ở chế độ chỉ đọc trạng thái và không chứa bất kỳ khóa bí mật nào.
3. **Khi chuyển sang chế độ `LIVE`:**
   - Đặt `defaultMode: "LIVE"` trong cấu hình Backend để hệ thống tự động chặn mọi request từ `/api/mock/*`.

---

## 5. Cấu Hình Âm Thanh (SFX) & Xử Lý Autoplay Trong OBS Browser Source

1. **Cấu hình âm lượng & bật/tắt qua URL Query (Không cần click chuột):**
   - Mặc định `SoundManager` bật âm thanh với âm lượng vừa phải (`volume = 0.5`).
   - Có thể điều chỉnh trực tiếp qua URL của OBS Browser Source:
     - Đặt âm lượng `40%`: `http://127.0.0.1:4173/?volume=0.4` (hoặc `?volume=40`)
     - Tắt toàn bộ SFX: `http://127.0.0.1:4173/?muted=1` (hoặc `?audio=0`)
   - Khi mở trên trình duyệt thông thường, có thể bấm phím `M` để bật/tắt nhanh âm thanh (`toggleMute()`).
2. **Thiết lập thu âm thanh trong OBS Studio:**
   - Mở **Properties** của Browser Source -> tích chọn **Control audio via OBS** để quản lý thanh âm lượng riêng cho game trong bảng **Audio Mixer** của OBS.
3. **Chính sách Autoplay của trình duyệt / CEF trong OBS:**
   - Game **luôn khởi chạy và render bình thường 100%** ngay cả khi trình duyệt khóa `AudioContext` (`suspended`) hoặc thiết bị không có đầu ra âm thanh (không văng lỗi Promise, không chặn màn hình bằng nút Click-to-Start).
   - Trong OBS Studio bản chuẩn trên Windows, CEF Browser Source mặc định cho phép phát âm thanh tự động; nếu phiên bản OBS hoặc trình duyệt ngoài chặn autoplay lần đầu, chọn chuột phải vào Browser Source trong OBS -> **Interact** và click 1 lần vào khung cửa sổ (hoặc khởi chạy OBS với cờ `--autoplay-policy=no-user-gesture-required`).
4. **Trạng thái Assets âm thanh hiện tại:**
   - Giai đoạn MVP đang sử dụng **Placeholder SFX tổng hợp (Web Audio 8-bit/pixel synth ngắn)** cho 6 hiệu ứng (`CHEERS`, `DRINK`, `KO`, `WIFE_DRAG`, `GIFT`, `VIP`); khi bổ sung file âm thanh chính thức vào `client/public/assets/audio/` và nạp qua Phaser Audio Cache (`sfx_cheers`, `sfx_drink`, `sfx_ko`, `sfx_wife_drag`, `sfx_gift`, `sfx_vip`), `SoundManager` sẽ tự động ưu tiên phát file asset mà không cần sửa logic gameplay.
