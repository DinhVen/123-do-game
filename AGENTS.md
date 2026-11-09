# AGENTS.md — QUY TẮC HOẠT ĐỘNG DÀNH CHO AI AGENT

Tài liệu này là quy chuẩn bắt buộc cho mọi AI Agent (bao gồm Google Antigravity và các subagents) khi làm việc trên workspace `D:\game`.

---

## 1. Nguyên Tắc Tiên Quyết (Golden Rules — Master Plan v1.0)
1. **Master Plan v1.0 là tài liệu thiết kế đã được phê duyệt:** Bộ 6 tài liệu (`PROJECT_MASTER_PLAN.md`, `GAME_DESIGN.md`, `TECHNICAL_ARCHITECTURE.md`, `IMPLEMENTATION_PLAN.md`, `PROJECT_STATUS.md`, `AGENTS.md`) là nguồn tham chiếu chuẩn v1.0 đã khóa.
2. **Đọc đúng tài liệu liên quan:** Trước khi thực hiện nhiệm vụ, AI PHẢI đọc `AGENTS.md`, `PROJECT_STATUS.md` và chỉ đọc các phần/file thực sự liên quan đến nhiệm vụ hiện tại để tiết kiệm token.
3. **Bảo vệ quyết định và luật chơi đã chốt:**
   - Tuyệt đối không tự ý thay đổi công nghệ (Node.js, Express, Socket.io, Phaser 3, Vite, `tiktok-live-connector`, OBS Browser Source).
   - Tuyệt đối không tự ý sửa luật chơi chính thức (6 ghế, hàng chờ 30 người có ưu tiên VIP không đuổi ghế đang ngồi, định danh `userId`, độ say `0–100`, giữ ghế `3000ms` khi `KO`/`LEAVING` trong lúc chơi bình thường, khi recovery từ snapshot thì hoàn tất rời bàn ngay cho người `KO`/`LEAVING` và cấp ghế từ hàng chờ VIP/Normal mà không tạo lại timer `3000ms`, vòng lặp DÔ `30s/+5`, Like `100/+1`, Vợ bắt về ngẫu nhiên `60s/10%/CD 180s`, không đổi độ say hay chuyển mục tiêu khi mục tiêu Gift không hợp lệ, tắt AFK Kick mặc định, độ phân giải logic `360x640` scale `3x` lên `1080x1920`, dùng placeholder cho MVP).
4. **Báo cáo khi phát hiện mâu thuẫn:** Nếu phát hiện bất kỳ điểm mâu thuẫn nào trong yêu cầu hoặc quá trình triển khai, phải dừng lại và báo cáo cho người dùng trước khi thay đổi bất kỳ quyết định đã chốt nào.
5. **Không làm ngoài phạm vi & Không tự ý triển khai giai đoạn mới:** Chỉ tập trung vào đúng Giai đoạn đang được giao trong `IMPLEMENTATION_PLAN.md`. Không tự động bắt đầu hoặc chuyển sang giai đoạn tiếp theo khi chưa có lệnh rõ ràng từ người dùng.
6. **Không viết lại module đang chạy tốt:** Nếu một hàm/module đã hoạt động ổn định và vượt qua kiểm thử, chỉ sửa đổi cục bộ khi cần mở rộng hoặc vá lỗi.
7. **Thay đổi nhỏ, dễ kiểm thử & Chất lượng cao:** Chia nhỏ code thành từng bước, xác minh ngay sau khi viết; tiết kiệm token trong giao tiếp nhưng **tuyệt đối không làm giảm chất lượng code hoặc tài liệu**.

---

## 2. Quy Tắc Về File & Thư Viện
1. **Bảo toàn dữ liệu:** Không xóa dữ liệu, không xóa file, không ghi đè nội dung file lớn nếu chỉ cần sửa một vài dòng (sử dụng công cụ sửa đổi cục bộ `edit_file`).
2. **Quản lý Dependencies:**
   - Không tự ý chạy `npm install <package>` khi chưa giải thích lý do và có sự đồng ý.
   - Ưu tiên sử dụng thư viện tiêu chuẩn đã được định nghĩa trong `TECHNICAL_ARCHITECTURE.md`.
3. **Bảo toàn bình luận:** Giữ nguyên các comment giải thích logic và docstrings hiện có trong source code.

---

## 3. Quy Trình Chuyển Giai Đoạn
1. **Không tự động nhảy bước:** AI không được tự ý chuyển từ Giai đoạn N sang Giai đoạn N+1.
2. **Nghiệm thu trước:** Phải chứng minh Giai đoạn hiện tại đạt toàn bộ Tiêu chí nghiệm thu (Acceptance Criteria) và vượt qua kiểm thử trước khi đề xuất chuyển giai đoạn.
3. **Cập nhật tiến độ:** Sau khi hoàn thành và được người dùng xác nhận, AI phải cập nhật ngay trạng thái vào `PROJECT_STATUS.md`.

---

## 4. Quy Chuẩn Giao Tiếp & Phản Hồi (Communication Style)
1. **Áp dụng chế độ `ultracave`:**
   - Phản hồi cực kỳ ngắn gọn, trực diện, không rườm rà.
   - Cắt bỏ mọi lời chào hỏi, mở đầu khách sáo ("Chắc chắn rồi", "Tôi sẽ giúp bạn...", "Hy vọng câu trả lời này...").
   - Không tóm tắt lại những gì người dùng vừa hỏi.
   - Một sự thật/dữ liệu chỉ nói 1 lần.
2. **Ngôn ngữ:** Luôn trả lời bằng **tiếng Việt**.
3. **Độ chính xác kỹ thuật (Payload Verbatim):**
   - Giữ nguyên vẹn 100% các đoạn code, tên lệnh CLI, đường dẫn file, API endpoint và thông báo lỗi.
   - Tuyệt đối không viết tắt các định danh code hoặc lược bỏ các từ mang tính phủ định (`not`, `never`, `không`).
   - Không vì tiết kiệm token mà đánh đổi tính đúng đắn và an toàn của hệ thống.
4. **Quy tắc tối ưu Token & Thực thi (Token Optimization Rules):**
   - Chỉ nén lời thoại trong chat; tuyệt đối không nén source code, tài liệu, comment kỹ thuật, test assertions hoặc thông báo lỗi quan trọng.
   - Chỉ đọc các file và phạm vi dòng cần thiết; không đọc lại toàn bộ tài liệu lớn nếu không cần.
   - Ưu tiên sửa cục bộ bằng `edit_file`, tránh viết lại file hoàn chỉnh.
   - Không xuất tường thuật trung gian không cần thiết giữa các tool calls.
   - Khi kiểm thử PASS, báo cáo ngắn gọn; khi FAIL, giữ đầy đủ thông tin lỗi cần thiết để chẩn đoán.
   - Không bỏ qua kiểm thử, không giảm chất lượng code để tiết kiệm token.
   - Không tạo file, dependency hoặc abstraction không cần thiết.
   - Không tự tuyên bố mức tiết kiệm token nếu chưa đo thực tế.
