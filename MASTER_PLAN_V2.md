# MASTER_PLAN_V2.md — KẾ HOẠCH NÂNG CẤP PHiên BẢN v2.0 ("QUÁN NHẬU CHIBI 7 BÀN, 28 GHẾ")

- **Dự án:** 1, 2, 3 DÔ! — Quán Nhậu Vỉa Hè Tương Tác TikTok Live
- **Workspace:** `D:\game`
- **Phiên bản tài liệu:** `v2.0-DRAFT` (Độc lập với bộ 6 tài liệu `v1.0 LOCKED` — **KHÔNG** ghi đè hay sửa đổi tài liệu `v1.0`)
- **Trạng thái:** **CHỜ NGƯỜI DÙNG PHÊ DUYỆT TRƯỚC KHI TRIỂN KHAI CODE**

---

## 1. MỤC TIÊU VÀ PHẠM VI NÂNG CẤP (OBJECTIVES & SCOPE)

### 1.1. Mục tiêu cốt lõi
Nâng cấp trò chơi từ mô hình **1 bàn dài / 6 ghế tĩnh (`v1.0`)** lên mô hình **Quán Nhậu Sân Thượng / Vỉa Hè Chibi 7 Bàn Tròn / 28 Ghế Có Chuyển Động Đi Bộ (`v2.0`)**, lấy cảm hứng bố cục từ mẫu tham chiếu nhưng sử dụng **100% tài nguyên đồ họa gốc không bản quyền (Original Vector/Chibi Assets)** và cho phép **Chủ kênh tự thay ảnh Chủ Quán (Host Avatar)** dễ dàng.

### 1.2. Phạm vi cấu hình đã xác nhận từ người dùng
1. **Khung hình chuẩn TikTok Live dọc (9:16):**
   - Độ phân giải logic Phaser 3 giữ nguyên `360x640`, scale `3x` lên `1080x1920` kết hợp lớp DOM Vector `#crisp-hud-root` sắc nét tuyệt đối ở `1080x1920`.
2. **Sức chứa 7 Bàn Nhậu Tròn — 28 Ghế:**
   - **6 Bàn Thường (`BÀN 1` đến `BÀN 6`):** Mỗi bàn `4 ghế` (`6 x 4 = 24 ghế thường`).
   - **1 Bàn VIP (`BÀN VIP`):** Đặt tại vị trí trung tâm nổi bật, `4 ghế` (`1 x 4 = 4 ghế VIP`).
   - **Tổng cộng:** `28 người chơi` ngồi nhậu cùng lúc trên màn hình.
3. **Nhân vật Chibi động (Animated Chibi Characters):**
   - Đi bộ từ cửa quán vào đúng bàn/ghế được phân bổ.
   - Đi bộ chuyển từ bàn này sang bàn khác khi gõ lệnh đổi bàn.
   - Đứng dậy, loạng choạng rời quán hoặc bị Vợ kéo về khi rời bàn.
   - Cụng ly (`DZO`), uống bia (`BIA`), ăn mồi (khi có Gift thực đơn), biểu cảm say rượu.
4. **Khu vực Quầy Chủ Quán & Bảng Thực Đơn (Top Scene):**
   - **Bảng Thực Đơn Gỗ (Trái):** Hiển thị số ghế trống / số người chờ + danh sách món mồi theo mệnh giá xu TikTok.
   - **Quầy Bar Chủ Quán (Phải):** Nhân vật Chủ Quán đứng sau quầy, bình rót `BIA MÁT`, bình tích lũy Tim (`Like Jar`), thảm chào `"CMT VAO ĐỂ GHÉ QUÁN"`.
   - **2 Bảng Xếp Hạng gắn trước Quầy:** `THẦN CỒN` (tính theo số ly bia) và `THẦN DIỆT MỒI` (tính theo số đĩa mồi).

---

## 2. BỐ CỤC UI CHI TIẾT 9:16 (`360x640` LOGIC -> `1080x1920` RENDER) & SAFE-ZONE TIKTOK LIVE

### 2.1. Phân tích Safe-Zone trên TikTok LIVE Studio (Mobile Preview)
Dựa trên ảnh chụp thực tế từ TikTok LIVE Studio của dự án:
- **Vùng Top (`Y: 0 .. 52` logic / `0 .. 156px` thật):** Bị đè bởi Avatar Chủ Kênh, nút `+Follow`, số người xem và thanh `Gaming Ranking / LIVE Goal`.
- **Vùng Bottom-Left (`X: 0 .. 215`, `Y: 430 .. 600` logic):** Bị đè bởi luồng bình luận trực tiếp (Live Chat) và thông báo người vào xem (`joined`).
- **Vùng Đáy (`Y: 600 .. 640` logic):** Thanh nhập chat `"Type..."`, nút Gift/Rose/Share của TikTok.

### 2.2. Sơ đồ kiến trúc toạ độ `360x640` cho v2.0

```text
+-------------------------------------------------------------------+ Y = 0
| [TikTok Top Safe-Zone: Avatar Host, Follow, Viewer Count]         |
+-------------------------------------------------------------------+ Y = 50
|              🍻 QUÁN NHẬU VỈA HÈ - 1, 2, 3 DÔ! 🍻                 | Y = 52..72
|    [ Đang phát: Nhạc Quán Nhậu Chill • CMT "VAO" ĐỂ GHÉ QUÁN ]    | Y = 74..92
|        CMT "BIA" UỐNG BIA • CMT "DZO" NÂNG LY • "BAN 1-6/VIP"     | Y = 94..112
+----------------------+--------------------------------------------+ Y = 115
|  BẢNG THỰC ĐƠN GỖ    |          MÁI HIÊN QUẦY CHỦ QUÁN            |
|  (X: 8..116)         |          (X: 122..352, Y: 118..210)        |
|  Còn X ghế • Y chờ   |   [Bình Bia]   [CHỦ QUÁN]    [Hũ Tim ♥]    |
|  ------------------  |                (Host Art)    (xxx/1.000)   |
|  🥜 Lạc rang    1xu  +--------------------------------------------+ Y = 210
|  🥩 Nem chua    5xu  |        MẶT TRƯỚC QUẦY: BXH ĐÔI             |
|  🦑 Mực nướng  10xu  |  🏆 THẦN CỒN (ly)   | 🍖 THẦN DIỆT MỒI(món)|
|  🍗 Chân gà    20xu  |  1. User A    230ly | 1. User X      24món |
|  🍖 Cánh gà    30xu  |  2. User B    174ly | 2. User Y      22món |
|  🥩 Bò nướng   99xu  |  3. User C    100ly | 3. User Z      21món |
|  🍲 Mời quán >100xu  +---------------------+----------------------+ Y = 276
|                      |       [Thảm: CMT "VAO" ĐỂ GHÉ QUÁN]        | Y = 278..294
+----------------------+--------------------------------------------+ Y = 298
|                   SÀN GẠCH QUÁN NHẬU (TAVERN FLOOR)               |
|                                                                   |
|          (G1)                                    (G5)             |
|     (G2)[BÀN 1](G3)                         (G6)[BÀN 2](G7)       | Y = 345
|          (G4)                                    (G8)             |
|       [BÀN 1•4/4]                             [BÀN 2•4/4]         |
|                                                                   |
|      (G9)                   (G13)                   (G17)         |
| (G10)[BÀN 3](G11)     (G14)[BÀN VIP](G15)     (G18)[BÀN 4](G19)   | Y = 455
|      (G12)                  (G16)                   (G20)         |
|    [BÀN 3•4/4]           [BÀN VIP•4/4]           [BÀN 4•4/4]      |
|                                                                   |
|          (G21)                                  (G25)             |
|     (G22)[BÀN 5](G23)                       (G26)[BÀN 6](G27)     | Y = 558
|          (G24)                                  (G28)             |
|  🔊   [BÀN 5•4/4]                             [BÀN 6•4/4]    🔊   |
+-------------------------------------------------------------------+ Y = 640
```

### 2.3. Tọa độ tâm 7 bàn tròn & 28 ghế (Hệ tọa độ logic `360x640`)
Mỗi bàn tròn có bán kính mặt bàn `rx = 34, ry = 18` (hình elip phối cảnh góc nhìn 3/4 từ trên xuống). 4 ghế quanh mỗi bàn đặt theo 4 hướng **Bắc (Top), Tây (Left), Đông (Right), Nam (Bottom)**:

| Mã Bàn | Nhãn Hiển Thị | Tâm Bàn `(x, y)` | Mã Ghế Cục Bộ (`1..4`) | Mã Ghế Toàn Cục (`1..28`) | Tọa Độ 4 Ghế `(Top, Left, Right, Bottom)` |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `TABLE_1` | `BÀN 1` | `(102, 348)` | `1..4` | `1..4` | `T(102,320)`, `L(62,344)`, `R(142,344)`, `B(102,372)` |
| `TABLE_2` | `BÀN 2` | `(264, 348)` | `1..4` | `5..8` | `T(264,320)`, `L(224,344)`, `R(304,344)`, `B(264,372)` |
| `TABLE_3` | `BÀN 3` | `(66, 456)` | `1..4` | `9..12` | `T(66,428)`, `L(28,452)`, `R(104,452)`, `B(66,480)` |
| `TABLE_VIP` | `BÀN VIP` | `(180, 456)` | `1..4` | `13..16` | `T(180,428)`, `L(140,452)`, `R(220,452)`, `B(180,480)` |
| `TABLE_4` | `BÀN 4` | `(294, 456)` | `1..4` | `17..20` | `T(294,428)`, `L(256,452)`, `R(332,452)`, `B(294,480)` |
| `TABLE_5` | `BÀN 5` | `(102, 558)` | `1..4` | `21..24` | `T(102,530)`, `L(62,554)`, `R(142,554)`, `B(102,582)` |
| `TABLE_6` | `BÀN 6` | `(264, 558)` | `1..4` | `25..28` | `T(264,530)`, `L(224,554)`, `R(304,554)`, `B(264,582)` |

> **Lưu ý tối ưu hiển thị vùng Chat TikTok (Góc dưới trái):**
> - Do vùng `BÀN 3` và `BÀN 5` nằm ở phía trái (nơi TikTok hiển thị dòng chat bình luận trong suốt), hệ thống tự động **ưu tiên xếp người chơi mới vào `BÀN 1`, `BÀN 2`, `BÀN 4`, `BÀN 6` trước** nếu khách không chỉ định bàn, để các bàn phía trên và bên phải luôn rõ nét nhất khi quán chưa đông.
> - Đồng thời cung cấp thanh trượt **"Độ cao sàn bàn nhậu (Compact Mode)"** trên Control Panel nếu Chủ kênh muốn đẩy cụm 7 bàn cao thêm `20px` để né hoàn toàn hộp chat TikTok.

---

## 3. DANH SÁCH TÀI NGUYÊN CẦN THIẾT (ASSETS SPECIFICATION)

### 3.1. Giải đáp câu hỏi của Anh: *"Em cần những tài nguyên gì thì nói anh, có những vấn đề gì không?"*
Em có thể **tự khởi tạo 100% bộ Vector/Canvas Chibi & Nội thất quán nhậu chuẩn HD ngay trong code** (không cần anh phải tự vẽ tay nếu chưa có sẵn), đồng thời thiết kế hệ thống **Asset Loader mở** để anh có thể bỏ bất kỳ file ảnh `.png` nào vào thư mục `client/public/assets/v2/` hoặc bấm nút đổi ảnh ngay trên **Bảng Điều Khiển (`http://127.0.0.1:3000/mock`)**.

Dưới đây là danh mục chi tiết các nhóm tài nguyên:

| STT | Nhóm Tài Nguyên | Quy Cách Kỹ Thuật (Chuẩn `1080x1920`) | Ai Chuẩn Bị? | Ghi Chú Bản Quyền / Tùy Biến |
| :--- | :--- | :--- | :--- | :--- |
| **1** | **Ảnh Chủ Quán (`Host Avatar`)** | Ảnh PNG tách nền (`300x360px`), đứng sau quầy bar | **Anh cung cấp ảnh cá nhân / Mascot của kênh** (hoặc dùng Chibi Chủ Quán mặc định do em vẽ) | Có nút **"Đổi ảnh Chủ Quán"** trực tiếp trên Control Panel. Không dùng ảnh nghệ sĩ/người nổi tiếng có bản quyền. |
| **2** | **Bộ Nhân Vật Chibi (`Chibi Modular Rig`)** | Tách lớp: `Đầu + 8 kiểu Tóc nam/nữ + 6 biểu cảm Mặt + 8 màu Áo + Chân đi bộ + Tay cầm ly bia` (`96x120px` mỗi nhân vật ở độ phân giải 3x) | **Em tự dựng bằng Vector/Canvas Procedural** (hoặc nạp Spritesheet PNG nếu anh muốn thay sau này) | Mỗi `userId` tự động sinh ra 1 ngoại hình Chibi cố định (tóc, màu áo, kính mắt) không trùng lặp nhàm chán, cộng thêm vương miện/hiệu ứng phát sáng nếu ngồi bàn VIP. |
| **3** | **7 Bàn Nhậu Tròn & 28 Ghế Đẩu** | - 6 Bàn gỗ nâu viền trắng (`210x110px` @3x)<br>- 1 Bàn VIP mặt tím viền vàng kim (`220x116px` @3x)<br>- 28 Ghế đẩu nhựa/gỗ xanh & vàng | **Em tự dựng Vector/Canvas HD** | Nhãn dưới chân bàn: `BÀN 1 • 3/4` ... `BÀN VIP • 4/4`. |
| **4** | **Quầy Bar, Bảng Thực Đơn Gỗ, Thảm Chào, 2 Loa Thùng** | - Bảng gỗ thực đơn bên trái<br>- Quầy bar mái hiên + Bình `BIA MÁT` + Hũ `1.000 ♥`<br>- 2 Loa thùng 2 góc dưới | **Em tự dựng Vector + DOM Overlay sắc nét** | Các con số trên Bảng Thực Đơn, Hũ Tim và 2 BXH render bằng lớp `#crisp-hud-root` đảm bảo chữ nhỏ vẫn nét căng trên điện thoại. |
| **5** | **Bộ Icon 7 Món Mồi & Ly Bia** | Icon đĩa mồi đặt lên bàn khi có quà: `Lạc rang`, `Nem chua`, `Mực nướng`, `Chân gà sả tắc`, `Cánh gà chiên`, `Bò nướng`, `Đại tiệc cả quán` (`48x48px` @3x) | **Em tự dựng Vector Icon / Emoji HD** | Mặc định mặt bàn chỉ có **ly bia của người đang ngồi**. Đĩa mồi chỉ xuất hiện khi có người gọi mồi/tặng quà. |
| **6** | **Âm Thanh (`Web Audio Synth` + MP3 tuỳ chọn)** | Tiếng bước chân vào bàn, tiếng cụng ly `"1, 2, 3 DÔ!"`, tiếng rót bia xèo xèo, tiếng gọi món mồi VIP | **Em tích hợp sẵn trên `SoundManager.js`** | Có thể thêm nhạc nền chill nếu anh bật trên OBS/TikTok LIVE Studio. |

---

## 4. THIẾT KẾ GAME STATE v2.0, LUỒNG SỰ KIỆN & SNAPSHOT RECOVERY

### 4.1. Cấu trúc Authoritative Game State v2.0 (`server/services/gameStateManager.js`)
Để vừa hỗ trợ **7 bàn / 28 ghế**, vừa giữ tương thích ngược với các module kiểm thử và bảng điều khiển, cấu trúc State trên Server được mở rộng như sau:

```javascript
{
  version: "2.0",
  sessionStatus: "LIVE", // IDLE | LIVE | PAUSED | ENDED
  likeCounter: 656,      // Tích lũy tim hiện tại (ví dụ: 656 / 1000)
  likeThreshold: 1000,   // Ngưỡng tim nổ sự kiện (cấu hình được)

  // 7 Bàn nhậu: TABLE_1..TABLE_6 (NORMAL) và TABLE_VIP (VIP)
  tables: [
    {
      tableId: "TABLE_1",       // "TABLE_1".."TABLE_6" | "TABLE_VIP"
      tableNumber: 1,           // 1..6 cho bàn thường, 0 hoặc 7 cho bàn VIP
      label: "BÀN 1",
      type: "NORMAL",           // "NORMAL" | "VIP"
      capacity: 4,
      occupiedCount: 3,
      seatIds: [1, 2, 3, 4],    // Tham chiếu tới mảng seats toàn cục (1..28)
      activeSnacks: [           // Các đĩa mồi đang bày trên bàn (tự ẩn sau thời gian cấu hình hoặc giữ theo bàn)
        { dishKey: "NEM_CHUA", label: "Nem chua", expiresAt: 1794029000000 }
      ]
    }
    // ... TABLE_2..TABLE_6, TABLE_VIP
  ],

  // 28 Ghế phẳng (Flat Array 28 phần tử) để đồng bộ O(1) và tương thích code cũ
  seats: [
    {
      seatId: 1,                // 1..28 (Global Seat ID)
      tableId: "TABLE_1",       // Bàn sở hữu ghế này
      localSeatNo: 1,           // 1..4 (Vị trí ghế quanh bàn: 1=Top, 2=Left, 3=Right, 4=Bottom)
      status: "OCCUPIED",       // "EMPTY" | "OCCUPIED"
      occupant: {
        userId: "1001",
        username: "tunglee",
        nickname: "tunglee",
        avatarUrl: "...",
        appearanceSeed: 4821,   // Seed cố định để tạo kiểu tóc/màu áo Chibi
        isVip: false,
        drunkLevel: 35,         // 0..100
        beerCount: 12,          // Tổng số ly bia đã uống (phục vụ BXH Thần Cồn)
        snackCount: 3,          // Tổng số món mồi đã gọi (phục vụ BXH Thần Diệt Mồi)
        state: "SEATED",        // "WALKING_IN" | "SEATED" | "SWITCHING_TABLE" | "DRUNK" | "KO" | "LEAVING"
        fromPoint: { x: 240, y: 290 }, // Điểm bắt đầu di chuyển (dành cho animation đi bộ)
        joinedAt: 1794025000000,
        lastActiveAt: 1794025100000
      }
    }
    // ... ghế 2 đến 28
  ],

  // Hàng chờ vào quán khi cả 28 ghế đã kín
  waitingQueue: {
    vip: [],    // Ưu tiên vào BÀN VIP hoặc ghế trống đầu tiên
    normal: []  // Hàng chờ thường
  },

  // Lưu trữ thống kê tích lũy cả phiên Live cho 2 BXH (kể cả khi người chơi đã rời ghế)
  leaderboardStats: {
    // Map userId -> { userId, nickname, beerCount, snackCount, totalCoins }
  },
  leaderboards: {
    topDrinkers: [ // Top 3 THẦN CỒN (tính theo ly)
      { rank: 1, userId: "u1", nickname: "Hâm và vô tư", beerCount: 230 },
      { rank: 2, userId: "u2", nickname: "Minna-米娜", beerCount: 174 },
      { rank: 3, userId: "u3", nickname: "Trung Phong", beerCount: 100 }
    ],
    topEaters: [   // Top 3 THẦN DIỆT MỒI (tính theo món)
      { rank: 1, userId: "u4", nickname: "min iuiu", snackCount: 24 },
      { rank: 2, userId: "u5", nickname: "Hồ Ngọc Hoài An", snackCount: 22 },
      { rank: 3, userId: "u6", nickname: "Minh Ah Đặng", snackCount: 21 }
    ]
  }
}
```

### 4.2. Hệ thống Waypoints & Hoạt ảnh Nhân vật Di chuyển (Walking System)
Để nhân vật đi bộ mượt mà, không xuyên qua mặt bàn khác mà **không tốn CPU tìm đường (A* Pathfinding)**:
1. **Cửa Quán (Spawn/Exit Gate):** Đặt tại thảm chào trước Quầy Chủ Quán `(X: 235, Y: 292)`.
2. **Trục Hành Lang Dọc (Corridor Waypoints):**
   - Hành lang Trái: `X = 160`
   - Hành lang Phải: `X = 210`
   - Hành lang Ngang Hàng 1 (`Y = 310`), Hàng 2 (`Y = 412`), Hàng 3 (`Y = 515`).
3. **Luồng đi bộ (`PathWalker.js` trên Client):**
   - **Khi khách mới vào bàn (`PLAYER_JOINED`):** Nhân vật xuất hiện ở thảm chào `(235, 292)` -> đi dọc hành lang -> rẽ vào ghế đích `(seatX, seatY)` trong `900ms - 1200ms` -> chuyển sang tư thế ngồi cầm ly bia.
   - **Khi khách đổi bàn (`PLAYER_SWITCHED_TABLE`):** Nhân vật đứng dậy từ ghế cũ -> đi bộ sang ghế mới ở bàn đích trong `800ms` -> ngồi xuống ghế mới.
   - **Khi khách say KO hoặc Vợ bắt về (`PLAYER_KO` / `WIFE_DRAG`):** Nhân vật bật hiệu ứng choáng/vợ kéo tại ghế -> đi loạng choạng về phía cửa ra hoặc mép màn hình -> biến mất khi hết `3000ms` giữ ghế.
4. **Tính đúng đắn trên Server (Server-Authoritative Reservation):**
   - Ngay khi Server phân bổ ghế, ghế đó được khoá `status = "OCCUPIED"` ngay lập tức (tránh 2 người cùng giành 1 ghế trong lúc nhân vật đang đi bộ). Hoạt ảnh đi bộ `900ms` là visual interpolation trên Client.

### 4.3. Chính sách Snapshot Recovery v2.0
Kế thừa nguyên tắc bất biến từ `v1.0` và mở rộng cho `28 ghế`:
- Lưu định kỳ mỗi `5000ms` và lưu tức thì (`saveImmediate`) khi có người vào bàn, đổi bàn, nhận Gift, KO hoặc rời quán vào `data/snapshot.json` (tự động migrate nếu đọc snapshot cũ 6 ghế).
- Khi Server khởi động lại từ Snapshot:
  - Mọi ghế đang ở trạng thái quá độ (`KO`, `LEAVING`) sẽ **hoàn tất rời bàn ngay lập tức** (không tạo lại timer `3000ms`) và nhường ghế ngay cho Hàng chờ `VIP -> Normal`.
  - Mọi ghế đang `WALKING_IN` hoặc `SWITCHING_TABLE` sẽ được đặt thẳng vào trạng thái `SEATED` tại ghế đích.
  - Khôi phục nguyên vẹn điểm `beerCount` (`THẦN CỒN`) và `snackCount` (`THẦN DIỆT MỒI`) của toàn bộ phiên Live.

---

## 5. CÁC THAY ĐỔI KIẾN TRÚC BACKEND & FRONTEND

### 5.1. Thay đổi phía Backend (`server/`)
1. **[server/config.js](file:///d:/game/server/config.js):**
   - Thêm cấu hình `layoutVersion: 2`, `tableCount: 7`, `seatsPerTable: 4`, `maxSeats: 28`.
   - Thêm danh mục từ khóa chat mới cho v2.0:
     - Lệnh vào quán: `["vao", "vào", "nhậu", "nhau", "dô", "do", "zo", "join", "123"]`
     - Lệnh uống bia: `["bia", "beer", "uong", "uống", "100%"]`
     - Lệnh cụng ly: `["dzo", "dô", "do", "zo", "cạn", "can"]`
     - Lệnh chuyển bàn: Regex nhận diện `BAN 1..6`, `BÀN 1..6`, `VIP`, `BAN VIP`, `BÀN VIP`.
   - Thêm bảng `menuCatalogV2` ánh xạ 7 mức xu thực đơn (`1, 5, 10, 20, 30, 99, >100 xu`).
2. **[server/engines/inputValidator.js](file:///d:/game/server/engines/inputValidator.js) & [server/engines/eventNormalizer.js](file:///d:/game/server/engines/eventNormalizer.js):**
   - Phân loại rõ 4 nhóm hành động Chat từ người xem:
     - `JOIN_TAVERN` (`"vao"`, `"nhậu"`...)
     - `DRINK_BEER` (`"bia"`)
     - `CHEER_TOAST` (`"dzo"`, `"dô"`)
     - `SWITCH_TABLE` (`"ban 1"` .. `"ban 6"`, `"vip"`)
3. **[server/services/gameStateManager.js](file:///d:/game/server/services/gameStateManager.js):**
   - Mở rộng quản lý `7 bàn x 4 ghế = 28 ghế`.
   - Thêm hàm `handleTableSwitchCommand(userId, targetTableKey)` có kiểm tra chỗ trống, quyền VIP và Cooldown chống spam đổi bàn liên tục.
   - Thêm bộ đếm `beerCount`, `snackCount` và hàm `_recomputeDualLeaderboards()` cập nhật Top 3 `THẦN CỒN` & Top 3 `THẦN DIỆT MỒI`.
   - Cập nhật `_autoSelectLiveGiftTarget` và xử lý món `"MỜI CẢ QUÁN (>100 xu)"` (tặng mỗi bàn đang có khách 1 đĩa Bò Nướng).
4. **[server/services/snapshotStore.js](file:///d:/game/server/services/snapshotStore.js):**
   - Hỗ trợ lưu/đọc `tables`, `seats` (28 ghế) và `leaderboardStats`. Nếu gặp file snapshot cũ `6 ghế` của v1.0, tự động ánh xạ 6 ghế cũ vào `BÀN 1` (ghế 1..4) và `BÀN 2` (ghế 5..6) mà không gây crash.

### 5.2. Thay đổi phía Frontend (`client/` & `mock-dashboard/`)
1. **[client/src/game/ui/Layout.js](file:///d:/game/client/src/game/ui/Layout.js):**
   - Định nghĩa tọa độ chuẩn `360x640` cho: Header Banner, Bảng Thực Đơn Gỗ (Trái), Quầy Chủ Quán + Hũ Tim + BXH Đôi (Phải), Sàn gạch 7 Bàn Tròn / 28 Ghế, và danh sách Waypoints đi bộ.
2. **Module mới `client/src/game/entities/TavernCounterView.js` & `MenuBoardView.js`:**
   - Vẽ Quầy Chủ Quán có mái hiên, bình `BIA MÁT`, Hũ Tim `xxx / 1.000 ♥`, ảnh Chủ Quán (hỗ trợ thay ảnh PNG động), và Bảng Thực Đơn 7 món bên trái.
3. **Module mới `client/src/game/entities/RoundTableView.js` (7 instances) & nâng cấp [SeatView.js](file:///d:/game/client/src/game/entities/SeatView.js) (28 instances):**
   - Vẽ bàn tròn phối cảnh (6 bàn nâu + 1 bàn VIP tím vàng), nhãn `BÀN X • Y/4`, các đĩa mồi trên mặt bàn.
   - Vẽ nhân vật Chibi theo `appearanceSeed` (kiểu tóc, áo, biểu cảm, ly bia trên tay), thanh tên người chơi và badge số ly/độ say gọn đẹp.
4. **Module mới `client/src/game/fx/PathWalker.js`:**
   - Quản lý hoạt ảnh nhân vật Chibi đi bộ từ cửa vào ghế, đi bộ đổi bàn, nhún nhảy khi đi, và rời bàn.
5. **Lớp DOM Vector Sắc Nét (`#crisp-hud-root` trong [MainScene.js](file:///d:/game/client/src/game/scenes/MainScene.js)):**
   - Render chữ siêu nét ở độ phân giải thật `1080x1920` cho: Bảng Thực Đơn, BXH `THẦN CỒN` & `THẦN DIỆT MỒI`, Nhãn 7 Bàn và Tên của 28 người chơi.
6. **[mock-dashboard/index.html](file:///d:/game/mock-dashboard/index.html):**
   - Nâng cấp Sơ đồ Trực quan lên **7 Bàn / 28 Ghế** (nhấn vào bất kỳ ghế/bàn nào để nạp nhanh mục tiêu).
   - Thêm nút test nhanh: `Gõ "VAO"`, `Gõ "BIA"`, `Gõ "DZO"`, `Đổi sang BÀN 1..6 / VIP`, `Gọi 7 món trong Thực Đơn`, và nút **Upload/Đổi Ảnh Chủ Quán**.

---

## 6. CÁC CƠ CHẾ GAMEPLAY CHƯA CHỐT — ĐỀ XUẤT PHƯƠNG ÁN & PHÂN TÍCH ƯU / NHƯỢC ĐIỂM

Theo đúng quy tắc không tự ý áp đặt luật chơi mới khi chưa được phê duyệt, dưới đây là phân tích các phương án cho **7 vấn đề thiết kế mở** để anh chọn:

### 6.1. Quy tắc Chọn Bàn khi vào quán & Chuyển Bàn (`BAN 1..6`, `VIP`)
- **Phương án A1 (Khuyến nghị):**
  - **Vào quán:** Gõ `"VAO"` (hoặc `"nhậu"`, `"dô"`) -> Tự động xếp vào bàn thường có sẵn người đang ngồi (để gom bàn nhậu cho xôm tụ) hoặc bàn trống theo thứ tự ưu tiên né vùng chat (`Bàn 2 -> Bàn 1 -> Bàn 4 -> Bàn 6 -> Bàn 3 -> Bàn 5`). Ngoài ra người xem có thể gõ thẳng `"BAN 3"` ngay từ đầu để vào thẳng Bàn 3 nếu còn ghế.
  - **Chuyển bàn:** Người đang ngồi gõ `"BAN 1"`..`"BAN 6"` hoặc `"VIP"`. Nếu bàn đích còn ghế trống và thoả điều kiện -> Nhân vật đứng dậy đi bộ sang bàn mới (Cooldown đổi bàn: `10 giây/lần` để chống spam chạy loạn xạ). Nếu bàn đích đã đầy (`4/4`) -> Hiện thông báo nhỏ `"Bàn X đã đủ 4/4 người!"` và giữ nguyên ghế hiện tại.
  - *Ưu điểm:* Quán nhìn đông vui tự nhiên, người xem rủ bạn bè ngồi chung bàn dễ dàng, chống spam gây rối mắt.
- **Phương án A2:** Xếp ngẫu nhiên hoàn toàn vào bất kỳ ghế trống nào trong 24 ghế thường; cho phép đổi bàn không giới hạn cooldown.
  - *Nhược điểm:* Các bàn bị rải rác mỗi bàn 1 người nhìn vắng vẻ; dễ bị khán giả spam lệnh chạy qua lại liên tục.

### 6.2. Điều kiện được ngồi vào `BÀN VIP` (4 ghế trung tâm)
- **Phương án B1 (Khuyến nghị — Kích cầu Gift vừa phải, dễ hiểu):**
  - Người chơi được vào `BÀN VIP` khi thoả **1 trong 2 điều kiện**:
    1. Đã tặng bất kỳ Gift nào từ **`10 xu` trở lên** trong phiên Live (tự động cấp quyền VIP cho `userId` đó suốt buổi Live).
    2. Hoặc đang nằm trong **Top 3 `THẦN CỒN` / Top 3 `THẦN DIỆT MỒI`**.
  - **Quy tắc không đuổi ghế:** Giữ nguyên luật vàng v1.0 — khi `BÀN VIP` đã đủ `4/4` người VIP, người VIP thứ 5 gõ `"VIP"` sẽ nhận thông báo `"Bàn VIP đã đầy (4/4)"`, **không cưỡng chế đá người đang ngồi**.
- **Phương án B2 (Mở tự do hoàn toàn):** Ai gõ `"VIP"` trước thì ngồi trước, không cần tặng quà.
  - *Nhược điểm:* Mất giá trị đặc quyền của Bàn VIP ở chính giữa màn hình, giảm động lực tặng quà.
- **Phương án B3 (Chỉ dành cho Gift >= 30 xu và cho phép đá người thường ra khỏi Bàn VIP):**
  - *Nhược điểm:* Thay đổi luật "không đuổi ghế đang ngồi" của v1.0.

### 6.3. Giới hạn Hàng Chờ (`Waiting Queue Capacity`) khi 28 ghế đã đầy
- **Phương án C1 (Khuyến nghị):** Giữ nguyên giới hạn **`30 người chờ`** của v1.0 (tổng cộng `28 người ngồi + 30 người chờ = 58 người`).
  - *Ưu điểm:* Tuân thủ tuyệt đối thông số v1.0 đã khóa, không làm phình bộ nhớ Snapshot.
- **Phương án C2:** Nâng hàng chờ lên **`50 người`** để tương xứng với quy mô 28 ghế.

### 6.4. Cách tính điểm số Ly Bia (`THẦN CỒN`) và số Đĩa Mồi (`THẦN DIỆT MỒI`)
- **Phương án D1 (Khuyến nghị — Bám sát giao diện tham chiếu):**
  - **Số ly bia (`THẦN CỒN` - đơn vị: `ly`):**
    - Người đang ngồi trên ghế gõ `"BIA"` hoặc `"DZO"` (có cooldown `3 giây/lần` mỗi người): **`+1 ly bia`**.
    - Sự kiện `"1, 2, 3 DÔ!"` định kỳ mỗi `30 giây` (hoặc khi đầy Hũ Tim): Tất cả người đang ngồi trên 7 bàn cùng nâng ly và được **`+1 ly bia`**.
    - Tặng quà mời bia / tấn công bia: Người tặng được cộng thêm số ly tương ứng với giá trị quà (`+2` đến `+10 ly`).
  - **Số đĩa mồi (`THẦN DIỆT MỒI` - đơn vị: `món`):**
    - Tính cho **người gọi món (người tặng Gift)** theo bảng Thực Đơn:
      - `Lạc rang (1 xu)`: **`+1 món`**
      - `Nem chua (5 xu)`: **`+2 món`**
      - `Mực nướng (10 xu)`: **`+3 món`**
      - `Chân gà sả tắc (20 xu)`: **`+5 món`**
      - `Cánh gà chiên (30 xu)`: **`+8 món`**
      - `Bò nướng (99 xu)`: **`+15 món`**
      - `Mời cả quán (>100 xu)`: **`+25 món`** (và bày 1 đĩa Bò nướng lên tất cả 7 bàn!)
- **Phương án D2:** Mỗi lần tặng Gift bất kỳ (dù 1 xu hay 99 xu) đều chỉ tính `+1 món` nhân với `repeatCount`.
  - *Nhược điểm:* Người tặng 20 bông hồng (20 xu) sẽ vượt mặt người tặng Bò nướng (99 xu), kém hấp dẫn về doanh thu quà lớn.

### 6.5. Ánh xạ TikTok Gift thực tế với Bảng Thực Đơn 7 Món
Trên TikTok Live, người xem gửi các quà có sẵn của TikTok (Hoa hồng 1 xu, Kem/Tạ tay 5 xu, Nước hoa/Mũ 10-20 xu, Donut 30 xu, Hạc giấy 99 xu, Corgi/Xe hơi >100 xu).
- **Phương án E1 (Khuyến nghị — Ánh xạ tự động theo mệnh giá `diamondCount` của Gift):**
  - `1 - 4 xu` (VD: Hoa hồng): **Lạc rang** (`1 xu`)
  - `5 - 9 xu` (VD: Kem ốc quế, Tạ tay): **Nem chua** (`5 xu`)
  - `10 - 19 xu` (VD: Rosa, Nước hoa): **Mực nướng** (`10 xu`)
  - `20 - 29 xu` (VD: Kính râm, Mũ): **Chân gà sả tắc** (`20 xu`)
  - `30 - 98 xu` (VD: Donut, Bó hoa): **Cánh gà chiên** (`30 xu`)
  - `99 - 100 xu` (VD: Hạc giấy, Vương miện nhỏ): **Bò nướng** (`99 xu`)
  - `> 100 xu` (VD: Pháo hoa, Xe hơi, Sư tử): **Mời cả quán — Mỗi bàn 1 đĩa Bò nướng** (`>100 xu`)
  - *Ưu điểm:* Dù người xem tặng bất kỳ món quà nào trên TikTok, hệ thống đều tự động quy đổi chuẩn xác 100% sang món mồi tương ứng trên Bảng Thực Đơn mà không sợ thiếu tên quà.

### 6.6. Cách kết hợp 2 BXH mới (`THẦN CỒN` & `THẦN DIỆT MỒI`) với hệ thống `Độ Say (0-100)`, `KO` và `Vợ Bắt Về` hiện tại
Đây là điểm quan trọng nhất cần anh quyết định:
- **Phương án F1 (Khuyến nghị — Kết hợp hài hòa cả Độ Say v1.0 và BXH Tích Lũy v2.0):**
  - Giữ nguyên cơ chế **Độ Say (`0 - 100%`)**, **Gục tại bàn (`KO` giữ ghế `3000ms`)** và **Vợ Bắt Về (`WIFE_DRAG`)** của v1.0 để trò chơi có tính đào thải ghế (người ở hàng chờ có cơ hội vào bàn).
  - Khi người chơi uống bia (`CMT "BIA"` / `"DZO"` / vòng lặp `30s`): Tăng `+1 ly bia` vào BXH `THẦN CỒN`, đồng thời tăng nhẹ độ say (`+3%` đến `+5%`).
  - Khi người chơi gọi **Mồi nhậu (Gift 1..99 xu)**: Cộng điểm vào BXH `THẦN DIỆT MỒI`, bày đĩa mồi lên bàn của người đó, và **giúp cả bàn đó tỉnh rượu (`-5%` đến `-35%` độ say tuỳ món mồi)** để ngồi nhậu lâu hơn! (Riêng nếu muốn chơi khăm gọi Vợ bắt về hoặc chuốc say vẫn có thể bật tuỳ chọn trên Control Panel).
  - Điểm trên 2 BXH `THẦN CỒN` và `THẦN DIỆT MỒI` được **cộng dồn xuyên suốt cả buổi Live** (nếu say gục rời bàn rồi gõ `"VAO"` vào lại vẫn giữ nguyên tổng số ly và số món đã tích lũy).
- **Phương án F2 (Chuyển sang chế độ Quán Nhậu Chill giống hệt ảnh mẫu — Tắt KO do say thường):**
  - Ngồi uống bia và ăn mồi thoải mái để đua Top `THẦN CỒN` & `THẦN DIỆT MỒI`, chỉ rời bàn khi bị `Vợ Bắt Về` hoặc tự gõ `"VE"` / `"ROI"`.
  - *Nhược điểm:* Khi 28 ghế đã đầy, những người đến sau rất khó có ghế trống nếu không ai bị say KO rời bàn.

### 6.7. Tạo và thay hình Chủ Quán (`Host Avatar`)
- **Phương án G1 (Khuyến nghị):**
  - Mặc định em tạo sẵn **1 nhân vật Chủ Quán Chibi/Anime chất lượng cao** đứng sau quầy bar (cầm khay bia/vẫy tay động).
  - Đồng thời trên **Bảng Điều Khiển (`http://127.0.0.1:3000/mock`)**, thêm mục **"Ảnh Chủ Quán (Host Avatar)"** cho phép anh chọn file ảnh `.png` tách nền của chính anh (hoặc logo/mascot kênh) từ máy tính -> cập nhật ngay lập tức lên Quầy Chủ Quán trên màn hình Live mà không cần sửa code.

---

## 7. PHÂN CHIA PHASE VÀ TASK TRIỂN KHAI TUẦN TỰ (IMPLEMENTATION ROADMAP v2.0)

Quá trình nâng cấp được chia thành **5 Phase tuần tự**, đảm bảo kiểm thử từng bước:

### Phase V2-1: Nâng cấp Core Engine Backend (7 Bàn, 28 Ghế, Đổi Bàn, BXH Đôi & Snapshot v2.0) — [DONE]
- **Task V2-1.1 [DONE]:** Cập nhật `server/config.js` (cấu hình 7 bàn, 28 ghế, từ khóa `VAO`, `BIA`, `DZO`, `BAN 1..6`, `VIP`, bảng thực đơn 7 món).
- **Task V2-1.2 [DONE]:** Nâng cấp `inputValidator.js` và `eventNormalizer.js` nhận diện lệnh uống bia, nâng ly và chuyển bàn.
- **Task V2-1.3 [DONE]:** Nâng cấp `gameStateManager.js` quản lý mảng `tables[0..6]`, `seats[0..27]`, logic chọn bàn/đổi bàn, tích lũy `beerCount` / `snackCount`, BXH Đôi (`topDrinkers`, `topEaters`) và ánh xạ Gift Thực Đơn.
- **Task V2-1.4 [DONE]:** Nâng cấp `snapshotStore.js` hỗ trợ lưu/khôi phục 28 ghế + BXH Đôi + `data/snapshot.v2.json`.
- **Task V2-1.5 [DONE]:** Viết và chạy PASS 100% bộ kiểm thử tự động `tests/test-v2-backend.js`.

### Phase V2-2: Xây dựng Giao diện Quầy Chủ Quán, Bảng Thực Đơn, Hũ Tim & BXH Đôi — [DONE]
- **Task V2-2.1 [DONE]:** Thiết kế toạ độ `Layout.js` cho v2.0 (Quầy Chủ Quán, Bảng Thực Đơn, BXH Đôi, 7 Bàn Tròn, 28 Ghế, Waypoints).
- **Task V2-2.2 [DONE]:** Xây dựng Bảng thực đơn gỗ bên trái (`V2_MENU_ITEMS` + bộ đếm số ghế trống/người chờ trong `TavernV2Overlay.js`).
- **Task V2-2.3 [DONE]:** Xây dựng Quầy Chủ Quán, Bình Bia Mát, Hũ Tim, Ảnh Chủ Quán tuỳ chỉnh, BXH `THẦN CỒN` & `THẦN DIỆT MỒI`, Thảm chào trong `TavernV2Overlay.js`.

### Phase V2-3: Xây dựng Sàn Quán Nhậu 7 Bàn Tròn, 28 Ghế & Nhân Vật Chibi Đi Bộ — [DONE]
- **Task V2-3.1 [DONE]:** Xây dựng 7 bàn tròn (`TABLE_1..6` và `TABLE_VIP`), hỗ trợ hiển thị ly bia + đĩa mồi theo thực đơn và nhãn `BÀN X • Y/4`.
- **Task V2-3.2 [DONE]:** Xây dựng hệ thống vẽ Nhân vật Chibi SVG đa dạng (tóc, áo, kính, vương miện VIP, biểu cảm theo độ say, cầm ly bia) cho 28 ghế.
- **Task V2-3.3 [DONE]:** Xây dựng `PathWalker.js` và tích hợp vào `TavernV2Overlay.js` để diễn hoạt nhân vật Chibi **đi bộ từ cửa vào ghế**, **đi bộ chuyển bàn**, **nâng ly cụng cả bàn**, và **rời quán**.

### Phase V2-4: Tối ưu Lớp chữ sắc nét `#crisp-hud-root` & Nâng cấp Control Panel 28 Ghế — [DONE]
- **Task V2-4.1 [DONE]:** Đồng bộ lớp DOM `#crisp-hud-root` (`TavernV2Overlay.js`) cho toàn bộ 7 bàn, 28 ghế, Bảng Thực Đơn và 2 BXH để không bị mờ khi scale trên TikTok LIVE Studio.
- **Task V2-4.2 [DONE]:** Nâng cấp `mock-dashboard/index.html` hiển thị sơ đồ 7 Bàn / 28 Ghế, bộ nút test lệnh `VAO / BIA / DZO / BAN 1..6 / VIP`, nút test 7 món Thực Đơn và nút **Đổi Ảnh Chủ Quán**.

### Phase V2-5: Kiểm thử Hiệu năng 28 Người Chơi, Kiểm thử Visual & Nghiệm thu tổng thể
- **Task V2-5.1:** Chạy giả lập tải cao (28 ghế đầy + 30 người chờ + spam chat `BIA/DZO/BAN` + bão Gift) đo FPS và số lượng GameObjects.
- **Task V2-5.2:** Chụp ảnh nghiệm thu trên trình duyệt `1080x1920` và đối chiếu Safe-Zone TikTok LIVE Studio.

---

## 8. TIÊU CHÍ NGHIỆM THU TỪNG TASK & KIỂM SOÁT HIỆU NĂNG (PERFORMANCE BUDGET)

### 8.1. Ngân sách Hiệu năng (GameObject & Render Budget cho 28 ghế)
Với sự gia tăng từ `6 ghế` lên `28 ghế` (gấp `4.6 lần`), nếu tạo quá nhiều Phaser Text/Graphics con cho mỗi ghế sẽ gây sụt FPS trên OBS. Kế hoạch kiểm soát hiệu năng bắt buộc:
1. **Gộp lớp nền tĩnh (Baked Static Floor & Tables Texture):**
   - Sàn gạch quán nhậu, 2 loa thùng, khung gỗ thực đơn, khung quầy bar và mặt bàn của 7 bàn tròn được vẽ **1 lần duy nhất** vào `RenderTexture` tĩnh khi khởi tạo Scene -> Tốn **0 chi phí vẽ lại mỗi frame**.
2. **Giới hạn GameObjects cho mỗi ghế Chibi:**
   - Mỗi ghế trong 28 ghế chỉ dùng **1 `Phaser.GameObjects.Container`** chứa tối đa **3 đối tượng Canvas** (Ghế đẩu + Sprite/Graphics Nhân vật Chibi + Đĩa mồi/Ly bia).
   - Toàn bộ phần chữ (Tên người chơi, Số ly, Nhãn bàn) được render bằng **DOM CSS Layer (`#crisp-hud-root`)** sử dụng `transform: translate3d(...)` tăng tốc phần cứng GPU và chỉ cập nhật DOM khi dữ liệu của ghế đó thực sự thay đổi (Dirty-check diffing).
3. **Giới hạn Tween đồng thời:**
   - Tối đa `8 nhân vật` đi bộ cùng lúc trên hành lang; nếu có 20 người vào cùng 1 giây, các nhân vật xuất hiện nối đuôi nhau cách `120ms` vừa đẹp mắt vừa giữ ổn định **60 FPS**.

### 8.2. Bảng Tiêu chí Nghiệm thu (Acceptance Criteria)
| Phase | Tiêu chí nghiệm thu bắt buộc (PASS/FAIL) |
| :--- | :--- |
| **Phase V2-1** | - Khởi tạo đúng 7 bàn (`TABLE_1..6`, `TABLE_VIP`) và 28 ghế (`seatId 1..28`).<br>- Lệnh `VAO`, `BIA`, `DZO`, `BAN 1..6`, `VIP` hoạt động đúng 100%.<br>- BXH `THẦN CỒN` và `THẦN DIỆT MỒI` sắp xếp chính xác Top 3.<br>- Snapshot lưu và khôi phục đúng 28 ghế, không tạo lại timer `3000ms` cho ghế `KO/LEAVING`.<br>- Toàn bộ unit tests cũ và mới đạt `PASS`. |
| **Phase V2-2** | - Hiển thị đầy đủ Bảng Thực Đơn 7 món bên trái, Quầy Chủ Quán bên phải, Bình Bia, Hũ Tim và 2 BXH trước quầy.<br>- Thay đổi được ảnh Chủ Quán mà không lỗi bố cục. |
| **Phase V2-3** | - Hiển thị 7 bàn tròn x 4 ghế đúng phối cảnh.<br>- Nhân vật Chibi đi bộ từ cửa vào đúng ghế khi `JOIN`, đi bộ từ bàn cũ sang bàn mới khi `SWITCH_TABLE`, nâng ly khi `DZO/BIA`, và rời bàn khi `KO/WIFE_DRAG`. |
| **Phase V2-4** | - Chữ trên 28 ghế, nhãn 7 bàn, Bảng Thực Đơn và 2 BXH sắc nét ở `1080x1920`.<br>- Control Panel điều khiển được toàn bộ 28 ghế, 7 bàn và 7 món thực đơn. |
| **Phase V2-5** | - Khi cả 28 ghế đều có người ngồi và cụng ly cùng lúc, FPS duy trì `>= 55-60 FPS`, không rò rỉ bộ nhớ hay nhân bản Tween. |

---

## 9. RỦI RO KỸ THUẬT VÀ PHƯƠNG ÁN ROLLBACK VỀ v1.0

### 9.1. Nhận diện rủi ro & Giải pháp giảm thiểu
1. **Rủi ro 1 — Chữ và nhân vật ở 28 ghế bị nhỏ hoặc chồng chéo nhau trên màn hình dọc `360x640`:**
   - *Giải pháp:* Bố trí 3 hàng bàn xen kẽ (`2 bàn - 3 bàn - 2 bàn`), đặt nhãn tên người chơi bằng pill bán trong suốt ngay trên đầu và dùng DOM Vector `#crisp-hud-root` ở độ phân giải thật `1080x1920`.
2. **Rủi ro 2 — Xung đột dữ liệu Snapshot cũ (`6 ghế`) với bản mới (`28 ghế`):**
   - *Giải pháp:* Tách file snapshot v2.0 thành `data/snapshot.v2.json` (giữ nguyên `data/snapshot.json` của v1.0 không đụng chạm).
3. **Rủi ro 3 — Rối loạn khi nhiều người cùng gõ lệnh đổi bàn vào 1 ghế cuối cùng:**
   - *Giải pháp:* Mọi lệnh chọn/đổi bàn được xử lý tuần tự nguyên tử (atomic single-threaded) trên `GameStateManager` của Server; ghế được khóa ngay tại thời điểm duyệt lệnh.

### 9.2. Phương án Rollback tức thì về v1.0
1. **Bảo toàn toàn bộ tài liệu v1.0:** Bộ 6 file (`PROJECT_MASTER_PLAN.md`, `GAME_DESIGN.md`, `TECHNICAL_ARCHITECTURE.md`, `IMPLEMENTATION_PLAN.md`, `PROJECT_STATUS.md`, `AGENTS.md`) được giữ nguyên 100%.
2. **Cờ cấu hình & Snapshot độc lập:**
   - Lưu trữ snapshot v1.0 tại `data/snapshot.json` và snapshot v2.0 tại `data/snapshot.v2.json`.
   - Trước khi bắt đầu code Phase V2-1, tạo bản sao lưu nhánh/thư mục hoặc tag Git mốc `v1.0-stable` để có thể khôi phục lại giao diện 1 bàn / 6 ghế của v1.0 chỉ bằng 1 lệnh trong vòng 5 giây nếu cần.

---

## 10. DANH SÁCH QUYẾT ĐỊNH CẦN NGƯỜI DÙNG XÁC NHẬN (DECISION CHECKLIST)

Trước khi em bắt đầu viết code **Phase V2-1**, anh vui lòng xác nhận (hoặc chọn phương án anh muốn) cho **7 mục dưới đây** (nếu anh đồng ý toàn bộ các phương án Khuyến nghị của em thì chỉ cần nhắn **"Chốt theo khuyến nghị, làm Phase V2-1"**):

1. **Chọn bàn & Đổi bàn (Mục 6.1):** Đồng ý **Phương án A1** (Gõ `"VAO"` tự xếp bàn thông minh; gõ `"BAN 1..6"` hoặc `"VIP"` để chọn/đổi bàn với cooldown `10s`, nhân vật đi bộ sang bàn mới)?
2. **Điều kiện vào Bàn VIP (Mục 6.2):** Đồng ý **Phương án B1** (Đã tặng quà từ `10 xu` trở lên HOẶC đang ở Top 3 BXH thì được vào `BÀN VIP`; khi Bàn VIP đã đủ `4/4` người thì không đá người đang ngồi)? Hay anh muốn ai gõ `"VIP"` cũng vào được (**Phương án B2**)?
3. **Giới hạn Hàng Chờ (Mục 6.3):** Giữ nguyên **`30 người chờ`** (**Phương án C1**) hay nâng lên **`50 người chờ`** (**Phương án C2**)?
4. **Cách tính điểm 2 BXH (Mục 6.4):** Đồng ý **Phương án D1** (`THẦN CỒN` tính số ly khi gõ `"BIA"` / `"DZO"` / sự kiện nâng ly; `THẦN DIỆT MỒI` tính số món mồi theo giá trị Gift)?
5. **Ánh xạ Gift vào Thực Đơn 7 món (Mục 6.5):** Đồng ý **Phương án E1** (`1xu Lạc rang`, `5xu Nem chua`, `10xu Mực nướng`, `20xu Chân gà`, `30xu Cánh gà`, `99xu Bò nướng`, `>100xu Mời cả quán mỗi bàn 1 đĩa Bò nướng`)?
6. **Kết hợp Độ Say / KO với BXH mới (Mục 6.6):** Chọn **Phương án F1** (Giữ thanh Độ Say, say 100% bị KO rời bàn sau 3s để xoay vòng ghế cho người mới, gọi mồi giúp giải rượu giảm say) HAY **Phương án F2** (Bỏ KO khi uống bia, ngồi cố định đua Top ly bia và chỉ rời bàn khi bị Vợ bắt về)?
7. **Hình Chủ Quán (Mục 6.7):** Đồng ý **Phương án G1** (Tạo sẵn Chủ Quán Chibi mặc định + thêm nút **Đổi ảnh Chủ Quán PNG** ngay trên Control Panel để anh tự thay ảnh bất cứ lúc nào)?
