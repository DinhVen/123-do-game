# 🍻 1, 2, 3 DÔ! — Quán Nhậu Vỉa Hè (TikTok Live Interactive Pixel Art Game)

**1, 2, 3 DÔ!** là trò chơi tương tác trực tiếp (Interactive Livestream Game) phong cách **Pixel Art Đêm Vỉa Hè Việt Nam** theo tỷ lệ dọc **9:16** (`360x640` scale `3x` lên `1080x1920`), được thiết kế chuyên biệt để phát sóng qua **OBS Browser Source** và **TikTok Live Studio**.

---

## 1. Giới Thiệu Game

- **Tên dự án:** `1, 2, 3 DÔ!` (Master Plan v1.0)
- **Công nghệ cốt lõi:**
  - **Backend (Single Source of Truth):** Node.js, Express, Socket.io, `tiktok-live-connector@2.5.0`.
  - **Frontend (Stateless View):** Phaser 3, Vite, Web Audio API (8-bit/pixel synth SFX).
- **Quy tắc bàn nhậu chính thức:**
  - **6 Ghế ngồi (`seatId: 1..6`):** Khán giả trên livestream bình luận từ khóa **`"nhậu"`** hoặc **`"dô"`** để vào ngồi ghế trống.
  - **Hàng chờ 30 người (`Waiting Queue`):** Khi 6 ghế đã kín, người tham gia tiếp theo được đưa vào hàng chờ tối đa **30 người**, chia làm 2 nhóm: **`VIP Queue`** (ưu tiên vào ghế trước theo thứ tự FIFO) và **`Normal Queue`** (vào ghế sau khi hết VIP, theo thứ tự FIFO). **Không bao giờ đuổi người đang ngồi trên ghế.**
  - **Độ say (`drunkLevel: 0–100%`):**
    - `0–29%` (`SOBER` — Tỉnh táo)
    - `30–69%` (`TIPSY` — Ngà ngà)
    - `70–99%` (`DRUNK` — Say quắc cần câu)
    - `100%` (`KO` — Gục tại bàn, giữ ghế `3000ms` rồi rời bàn nhường chỗ cho hàng chờ)
  - **Vòng lặp tự động `"1, 2, 3 DÔ!"`:** Cứ mỗi **`30 giây`**, cả bàn cùng nâng ly hô vang `"1, 2, 3 DÔ!"`, mỗi người đang ngồi (`SEATED`) tăng **`+5%`** độ say.
  - **Tương tác thả tim (`Like`):** Cứ mỗi **`100 Like`** mới hợp lệ khi bàn đang có người ngồi, tất cả người chơi đang `SEATED` tăng **`+1%`** độ say.
  - **Tương tác quà tặng (`Gift`):**
    - **Gift Ép Uống (`DRUNK_INCREASE`):** Tăng độ say cho 1 ghế hoặc cả bàn.
    - **Gift Giải Say (`DRUNK_DECREASE`):** Giảm độ say (Trà đá / Nước chanh) cho người đang `SEATED` (không hồi sinh người đã `KO`).
    - **Gift Vé VIP (`VIP_ACCESS`):** Đưa người tặng vào `VIP Queue` (hoặc nâng cấp từ `Normal Queue` lên `VIP Queue`).
    - **Gift Vợ Bắt Về (`WIFE_EVENT`) & Sự kiện ngẫu nhiên (`60s / 10% / Cooldown 180s`):** Chuyển người chơi sang trạng thái `LEAVING`, giữ ghế `3000ms` kèm hoạt ảnh bị vợ xách tai kéo về rồi nhường ghế cho hàng chờ.

---

## 2. Yêu Cầu Hệ Thống

- **Hệ điều hành:** Windows 10 hoặc Windows 11 (64-bit).
- **Node.js:** Phiên bản **Node.js LTS `>= 18.x`** (khuyến nghị Node.js `20.x` hoặc `22.x`), đi kèm `npm`.
  - Tải tại: https://nodejs.org/
- **Phần mềm phát sóng:**
  - **OBS Studio** (phiên bản `>= 28.x`, có tích hợp sẵn Browser Source).
  - **TikTok Live Studio** hoặc khóa luồng (Stream Key) kết nối với OBS Studio khi phát trực tiếp.

---

## 3. Cài Đặt Lần Đầu (First-Time Setup)

Bạn chỉ cần thực hiện bước này **1 lần duy nhất** khi mới tải mã nguồn về máy:

### Bước 3.1: Cài đặt thư viện (Dependencies)
Mở **Command Prompt (cmd)** hoặc **PowerShell** tại thư mục gốc `D:\game` và chạy lần lượt:

```bat
cd /d "D:\game"
npm install
cd client
npm install
```

### Bước 3.2: Build giao diện Frontend (Production Build)
Tại thư mục `D:\game\client`, chạy lệnh đóng gói giao diện tĩnh:

```bat
cd /d "D:\game\client"
npm run build
```
Sau khi hoàn tất, thư mục `D:\game\client\dist` sẽ được tạo ra để Backend phục vụ trực tiếp trên cổng `3000`.

### Bước 3.3: Tạo file cấu hình `.env` (Tùy chọn)
Sao chép file `.env.example` thành `.env` tại thư mục `D:\game`:

```bat
cd /d "D:\game"
copy .env.example .env
```

Nội dung mặc định của `.env`:
```ini
NODE_ENV=development
HOST=127.0.0.1
PORT=3000
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173
ADMIN_SECRET_TOKEN=
APP_MODE=MOCK
TIKTOK_UNIQUE_ID=
```

### Bước 3.4: Kiểm tra cổng `3000`
Đảm bảo không có ứng dụng nào khác đang chiếm cổng `3000`:
```bat
netstat -ano | findstr :3000
```

---

## 4. Khởi Chạy Nhanh Bằng `start.bat`

Sau khi đã cài đặt lần đầu, mỗi lần mở game bạn chỉ cần:

1. Nhấp đúp (double-click) vào file **`start.bat`** trong thư mục `D:\game` (hoặc chạy `start.bat` từ Command Prompt).
2. `start.bat` sẽ tự động:
   - Chuyển về đúng thư mục chứa game (`cd /d "%~dp0"`).
   - Kiểm tra Node.js, npm, các file cấu hình và thư viện `node_modules`.
   - Kiểm tra bản build giao diện `client\dist\index.html` (chỉ tự động build nếu chưa tồn tại).
   - Kiểm tra cổng `3000` có bị chiếm hay không để ngăn chạy trùng nhiều tiến trình.
   - Giữ nguyên `data\state-snapshot.json` để khôi phục bàn nhậu đang dang dở (nếu còn hạn trong 15 phút).
3. **Các địa chỉ URL chính thức khi Server đang chạy:**
   - 🎮 **Giao diện Game (Dùng cho trình duyệt & OBS Browser Source):**
     `http://127.0.0.1:3000/`
   - 🎛️ **Bảng điều khiển giả lập (Mock Dashboard — Chỉ mở ở chế độ `MOCK`):**
     `http://127.0.0.1:3000/mock`
   - 🩺 **Kiểm tra trạng thái Server (Health Check JSON):**
     `http://127.0.0.1:3000/health`
   - 📊 **Xem dữ liệu trạng thái bàn nhậu hiện tại (State API):**
     `http://127.0.0.1:3000/api/state`

### Cách dừng game an toàn (Graceful Shutdown)
- Tại cửa sổ đen đang chạy `start.bat`, nhấn tổ hợp phím **`Ctrl + C`**, sau đó nhấn `Y` (nếu được hỏi).
- Khi nhận tín hiệu dừng, Backend sẽ **tự động ghi ngay trạng thái bàn nhậu mới nhất** ra file `data/state-snapshot.json` rồi mới đóng kết nối.
- ⚠️ **Lưu ý:** Hạn chế bấm nút `[X]` tắt ngang cửa sổ khi bàn nhậu vừa có thay đổi trạng thái trong vòng 3 giây gần nhất.

---

## 5. Hướng Dẫn Sử Dụng Chế Độ Giả Lập (`MOCK` Mode)

Mặc định game luôn khởi chạy ở chế độ **`APP_MODE=MOCK`** để bạn kiểm tra bố cục, âm thanh và hiệu ứng trước khi lên sóng thật.

1. Mở giao diện Game tại: `http://127.0.0.1:3000/`
2. Mở tab thứ hai tới **Mock Dashboard** tại: `http://127.0.0.1:3000/mock`
3. Trên **Mock Dashboard**, bạn có thể thử nghiệm toàn bộ tính năng bằng nút bấm trực quan:
   - **Thử vào bàn (`Join`):** Nhập `userId` / `nickname` và bấm gửi bình luận `"nhậu"` hoặc `"dô"` (hoặc dùng nút điền nhanh 6 ghế + hàng chờ).
   - **Thử trò chuyện (`Chat`):** Nhập câu thoại cho người chơi đang ngồi trên ghế -> Bong bóng chat sẽ hiện ngay trên đầu nhân vật đó trong `2.2 giây`.
   - **Thử thả tim (`Like`):** Bấm gửi `+50 Like`, `+100 Like` hoặc `+250 Like` -> Khi đủ mỗi mốc `100 Like`, toàn bộ người đang ngồi tăng `+1%` độ say.
   - **Thử tặng quà (`Gift`):**
     - `MOCK_GIFT_SMALL`: Ly Bia Nhỏ (`+10%` say cho 1 ghế).
     - `MOCK_GIFT_VIP`: Thùng Bia VIP (`+25%` say cho 1 ghế).
     - `MOCK_GIFT_ALL`: Đại Tiệc Cả Bàn (`+15%` say cho tất cả ghế đang ngồi).
     - `MOCK_GIFT_SOBER`: Trà Đá Giải Say (`-20%` say cho 1 ghế đang ngồi).
     - `MOCK_GIFT_VIP_PASS`: Thẻ VIP Ưu Tiên Hàng Chờ (Đưa người tặng vào `VIP Queue`).
     - `MOCK_GIFT_WIFE`: Vợ Bắt Về (Kích hoạt hiệu ứng vợ xách tai kéo người chơi ở ghế mục tiêu rời bàn).
   - **Thử vòng lặp `"1, 2, 3 DÔ!"` & `"Vợ bắt về"` ngẫu nhiên:** Bấm nút kích hoạt tức thời trên Dashboard mà không cần chờ đủ `30s`/`60s`.

### Cách Reset dữ liệu thử nghiệm về bàn trống hoàn toàn
Khi muốn xóa sạch bàn nhậu thử nghiệm để bắt đầu buổi livestream mới:
1. Dừng Server bằng **`Ctrl + C`**.
2. Xóa (hoặc đổi tên) file `D:\game\data\state-snapshot.json`.
3. Chạy lại `start.bat` -> Bàn nhậu sẽ khởi động mới hoàn toàn ở `stateVersion = 0`.

---

## 6. Hướng Dẫn Chuyển Sang Chế Độ Livestream Thật (`LIVE` Mode)

> [!CAUTION]
> **CẢNH BÁO BẢO MẬT QUAN TRỌNG:**
> - Hệ thống kết nối với phòng TikTok Live công khai chỉ thông qua **`TIKTOK_UNIQUE_ID`** (tức `@username` công khai của kênh, ví dụ: `baonhauviahe`).
> - **TUYỆT ĐỐI KHÔNG** nhập mật khẩu TikTok, mã OTP, Cookie, `sessionId` hay `ttwid` vào file `.env` hoặc `config/default.json`.
> - Hệ thống tự động che (redact) mọi trường nhạy cảm trong log để bảo vệ an toàn trên sóng livestream.

### Bước 6.1: Điều kiện bắt buộc trước khi bật `LIVE`
- Tài khoản TikTok của bạn **phải đang phát sóng trực tiếp (LIVE đang bật)** thì `tiktok-live-connector` mới có thể kết nối vào phòng live.

### Bước 6.2: Cấu hình chuyển sang `LIVE`
1. Dừng game (`Ctrl + C`) nếu đang chạy.
2. Mở file `D:\game\.env` bằng Notepad và chỉnh sửa 2 dòng:
   ```ini
   APP_MODE=LIVE
   TIKTOK_UNIQUE_ID=ten_kenh_tiktok_cua_ban
   ```
   *(Lưu ý: Không ghi dấu `@` ở đầu `TIKTOK_UNIQUE_ID`).*
3. *(Tùy chọn)* Cấu hình bảng ánh xạ mã quà tặng TikTok thật (`liveGiftMappings`) và ngưỡng xu VIP (`vipGiftThreshold`) trong `D:\game\config\default.json` tại mục `gameplayV1.liveGiftMappings`.
4. Lưu file `.env` và chạy lại **`start.bat`**.
5. Khi ở chế độ `LIVE`, hệ thống sẽ **tự động khóa hoàn toàn Mock Dashboard** để ngăn dữ liệu giả lập trộn lẫn vào buổi live thật. Nếu mạng chập chờn, hệ thống sẽ tự động kết nối lại (Auto-Reconnect với Exponential Backoff + Jitter) mà không làm mất trạng thái bàn nhậu.

### Bước 6.3: Cách quay lại chế độ `MOCK`
1. Dừng game (`Ctrl + C`).
2. Đổi lại trong file `.env`:
   ```ini
   APP_MODE=MOCK
   ```
3. Khởi động lại bằng `start.bat`.

---

## 7. Hướng Dẫn Cấu Hình OBS Browser Source (`1080x1920` — 9:16)

### Bước 7.1: Thiết lập khung hình dọc 9:16 trong OBS Studio
1. Mở **OBS Studio** -> Vào **Settings (Cài đặt)** -> **Video**.
2. Thiết lập:
   - **Base (Canvas) Resolution:** `1080x1920`
   - **Output (Scaled) Resolution:** `1080x1920`
   - **Common FPS Values:** `60`
3. Nhấn **Apply** -> **OK**.

### Bước 7.2: Thêm nguồn Browser Source cho Game
1. Tại bảng **Sources (Nguồn)** của OBS, nhấn dấu **`+`** -> Chọn **Browser (Trình duyệt)** -> Đặt tên là `123 DO Game`.
2. Điền đúng các thông số sau:
   - **URL:** `http://127.0.0.1:3000/`
   - **Width:** `1080`
   - **Height:** `1920`
   - **Use custom frame rate (Sử dụng tốc độ khung hình tùy chỉnh):** ✅ Bật -> Đặt **FPS = `60`**
   - **Control audio via OBS (Điều khiển âm thanh qua OBS):** ✅ Bật
   - **Shutdown source when not visible (Tắt nguồn khi không hiển thị):** ❌ **Bỏ chọn (Tắt)** *(để giữ kết nối Socket.io và âm thanh liên tục)*.
   - **Refresh browser when scene becomes active:** ❌ **Bỏ chọn (Tắt)**.
   - **Custom CSS (CSS tùy chỉnh):**
     ```css
     html, body {
       margin: 0 !important;
       padding: 0 !important;
       background-color: #181425 !important;
       overflow: hidden !important;
     }
     canvas {
       image-rendering: pixelated !important;
       image-rendering: crisp-edges !important;
     }
     ```
3. Nhấn **OK**.

### Bước 7.3: Bật và kiểm soát âm thanh trong OBS
- Sau khi bật **Control audio via OBS**, thanh âm lượng **`123 DO Game`** sẽ xuất hiện trong bảng **Audio Mixer** của OBS.
- Nếu muốn nghe âm thanh trực tiếp trên tai nghe của Streamer: Nhấn biểu tượng bánh răng cạnh `123 DO Game` trong **Audio Mixer** -> Chọn **Advanced Audio Properties** -> Tại cột **Audio Monitoring**, chuyển từ `Monitor Off` sang **`Monitor and Output`**.
- Có thể điều chỉnh âm lượng hoặc tắt tiếng trực tiếp qua tham số URL của Browser Source mà không cần tương tác chuột:
  - Chỉnh âm lượng 60%: `http://127.0.0.1:3000/?volume=0.6`
  - Tắt tiếng hoàn toàn: `http://127.0.0.1:3000/?muted=1`
- Khi mở trên trình duyệt hoặc dùng tính năng **Interact (Tương tác)** của OBS:
  - Phím **`M`**: Bật / Tắt tiếng (Mute / Unmute).
  - Phím **`[`** / **`]`**: Giảm / Tăng âm lượng `10%`.

### Bước 7.4: Bố cục vùng an toàn (Safe Zones) trên màn hình dọc TikTok
Giao diện `360x640` (scale `3x` lên `1080x1920`) đã chừa sẵn:
- **Vùng đệm phía trên (`Top Safe Margin`):** Tránh bị biểu tượng hồ sơ kênh và số người xem của TikTok che khuất.
- **Vùng đệm phía dưới (`Bottom Safe Margin`):** Tránh bị khung nhập bình luận và nút tặng quà của ứng dụng TikTok đè lên bảng hướng dẫn.
- Chỉ cần đặt nguồn Browser Source khớp khít toàn màn hình `1080x1920` (nhấn `Ctrl + F` trong OBS để Fit to Screen).

---

## 8. Cơ Chế Lưu Trữ & Khôi Phục Trạng Thái (Snapshot & Recovery)

- **Vị trí file lưu trữ:** `D:\game\data\state-snapshot.json`
- **Cơ chế lưu tự động (Periodic & Atomic Save):**
  - Mỗi khi bàn nhậu có thay đổi (`stateVersion` tăng), Backend tự động gom và lưu bản chụp trạng thái định kỳ mỗi **`3 giây`** bằng cơ chế ghi file tạm `.tmp` rồi đổi tên nguyên tử (`atomic rename`), đảm bảo file không bao giờ bị hỏng giữa chừng.
  - Khi tắt Server bằng `Ctrl + C` hoặc khi gặp lỗi nghiêm trọng (`uncaughtException` / `unhandledRejection`), hệ thống lập tức kiểm tra toàn vẹn dữ liệu và lưu bản chụp khẩn cấp đồng bộ trước khi thoát.
- **Tự động khôi phục khi khởi động lại (Auto-Recovery):**
  - Khi mở lại game trong vòng **`15 phút`** kể từ lần lưu cuối, Backend tự động nạp lại toàn bộ người đang ngồi trên 6 ghế (kèm độ say), danh sách `VIP Queue`, `Normal Queue`, số Like tích lũy và `stateVersion`.
  - Nếu bản chụp đã quá `15 phút` hoặc không hợp lệ, hệ thống tự động bỏ qua và khởi tạo bàn mới sạch sẽ.
- **Chính sách khôi phục đối với người chơi `KO` / `LEAVING` (Locked Recovery Policy):**
  - Khi khôi phục từ snapshot sau khi restart, những người chơi đang ở trạng thái chờ rời bàn (`KO` hoặc `LEAVING`) sẽ **được hoàn tất việc rời bàn ngay lập tức** (không tạo lại timer `3000ms` và không phát lại hiệu ứng cũ), đồng thời ghế trống sẽ được cấp ngay cho người đầu hàng chờ (`VIP Queue` trước, `Normal Queue` sau) với `drunkLevel = 0%`.
- **Cách sao lưu thủ công:** Bạn có thể sao chép file `D:\game\data\state-snapshot.json` ra thư mục khác bất cứ lúc nào để lưu trữ.

---

## 9. Xử Lý Sự Cố Thường Gặp (Troubleshooting)

| STT | Triệu chứng / Lỗi | Nguyên nhân phổ biến | Cách khắc phục nhanh |
| :---: | :--- | :--- | :--- |
| **1** | `start.bat` báo không tìm thấy `node` hoặc `npm` | Máy chưa cài Node.js hoặc chưa khởi động lại sau khi cài Node.js. | Tải và cài đặt **Node.js LTS** tại https://nodejs.org/, sau đó đóng và mở lại cửa sổ chạy `start.bat`. |
| **2** | `start.bat` báo thiếu `node_modules` | Chưa chạy cài đặt thư viện lần đầu. | Mở cmd tại `D:\game`, chạy `npm install`, sau đó chạy `cd client && npm install`. |
| **3** | Báo lỗi cổng `3000` đang bị chiếm (`EADDRINUSE` / Port in use) | Đã có một cửa sổ `start.bat` khác đang chạy ngầm. | Tìm cửa sổ `start.bat` đang mở và nhấn `Ctrl + C`, hoặc tìm PID bằng `netstat -ano \| findstr :3000` rồi tắt bằng `taskkill /PID <so_PID> /F`. |
| **4** | Mở `http://127.0.0.1:3000/` bị trắng trang hoặc `404` | Chưa build giao diện Frontend ra `client/dist`. | Chạy lệnh `cd /d "D:\game\client" && npm run build` hoặc chạy lại `start.bat` để tự động build. |
| **5** | Giao diện hiển thị mất kết nối (`DISCONNECTED`) | Tiến trình Backend Node.js đã bị tắt hoặc đổi cổng. | Kiểm tra cửa sổ `start.bat` xem Server còn chạy không; kiểm tra `http://127.0.0.1:3000/health`. |
| **6** | Bật `APP_MODE=LIVE` nhưng báo `Stream Offline` / không kết nối được | Kênh TikTok trong `TIKTOK_UNIQUE_ID` hiện chưa bật phát trực tiếp hoặc sai tên kênh. | Đảm bảo kênh đã bắt đầu phát LIVE trên TikTok, kiểm tra đúng `TIKTOK_UNIQUE_ID` (không có `@`). |
| **7** | Khán giả tặng Gift trên TikTok Live nhưng bàn nhậu không phản ứng | Mã `giftId` của món quà đó chưa được khai báo trong `config/default.json`. | Mở `config/default.json`, bổ sung ánh xạ `giftId` tương ứng vào mục `gameplayV1.liveGiftMappings` rồi khởi động lại game. |
| **8** | Không nghe thấy âm thanh cụng ly / hiệu ứng trong OBS | Chưa bật `Control audio via OBS` hoặc trình duyệt chặn Autoplay. | Trong OBS Browser Source, bật `Control audio via OBS` và bật `Monitor and Output` trong Advanced Audio Properties; hoặc nhấn chuột 1 lần vào cửa sổ **Interact** của Browser Source. |
| **9** | Hình ảnh trong OBS bị giật / lag (< 60 FPS) | Chưa bật Hardware Acceleration trong OBS hoặc đặt độ phân giải quá cao. | Trong OBS **Settings -> Advanced**, bật **Enable Browser Source Hardware Acceleration**; đảm bảo Browser Source đặt đúng `1080x1920` và `60 FPS`. |
| **10** | Backend bị văng đột ngột giữa buổi live | Lỗi hệ thống hoặc hết tài nguyên ngoài dự kiến. | Backend đã tự động lưu snapshot khẩn cấp trước khi thoát. Chỉ cần chạy lại `start.bat`, bàn nhậu sẽ tự động khôi phục ngay lập tức. |
| **11** | Muốn xóa bàn nhậu cũ bị kẹt hoặc lỗi dữ liệu snapshot | File `data/state-snapshot.json` chứa trạng thái cũ bạn không muốn dùng nữa. | Tắt game (`Ctrl + C`), xóa file `D:\game\data\state-snapshot.json`, sau đó mở lại `start.bat`. |

---

## 10. Checklist Kiểm Tra Trước Khi Lên Sóng Livestream

Trước mỗi buổi phát trực tiếp, hãy điểm qua 8 bước kiểm tra nhanh sau:

- [ ] **1. Backend đang chạy ổn định:** Cửa sổ `start.bat` hiển thị `[OK]` và truy cập `http://127.0.0.1:3000/health` trả về `"status": "ok"`.
- [ ] **2. Giao diện Game hiển thị sắc nét:** Mở `http://127.0.0.1:3000/` thấy đầy đủ 6 ghế, bàn nhậu vỉa hè, bảng hàng chờ và bảng hướng dẫn.
- [ ] **3. OBS đúng tỷ lệ dọc `1080x1920` @ `60 FPS`:** Nguồn Browser Source khớp toàn khung hình dọc, không bị viền đen hay cắt chữ.
- [ ] **4. Âm thanh hoạt động:** Thanh âm lượng trong **OBS Audio Mixer** nhảy sóng khi có sự kiện cụng ly `"1, 2, 3 DÔ!"` hoặc khi thử trong chế độ `MOCK`.
- [ ] **5. Chế độ vận hành đúng mục đích:**
  - Nếu đang thử nghiệm trước giờ G: `APP_MODE=MOCK` (thử bấm Join/Like/Gift trên `http://127.0.0.1:3000/mock`).
  - Khi bắt đầu phát sóng thật: Đã xóa snapshot thử nghiệm (nếu cần), đổi `.env` sang `APP_MODE=LIVE`, điền đúng `TIKTOK_UNIQUE_ID` và khởi động lại `start.bat`.
- [ ] **6. Kết nối TikTok Live thành công:** Log trên cửa sổ `start.bat` báo `Connected to TikTok Live stream` và huy hiệu trên góc phải game hiển thị `● LIVE`.
- [ ] **7. Tương tác Chat / Like / Gift hoạt động:** Thử bình luận `"nhậu"` hoặc thả tim trên phiên live để xác nhận người chơi vào ghế và độ say tăng đúng.
- [ ] **8. Snapshot lưu tự động thành công:** File `D:\game\data\state-snapshot.json` được cập nhật tự động sau khi có người vào bàn và không có thông báo lỗi đỏ trên cửa sổ `start.bat`.
