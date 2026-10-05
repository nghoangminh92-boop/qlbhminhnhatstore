# Frontend: Quản lý cửa hàng điện thoại (React + Vite)

Giao diện chạy riêng, gọi API của backend (dự án `quan-ly-cua-hang` đã gửi trước đó).

## Chạy khi phát triển
Mở hai cửa sổ terminal.

1. Backend: vào thư mục `quan-ly-cua-hang`, chạy `npm install` rồi `npm start` (cổng 3000).
2. Frontend: vào thư mục này, chạy `npm install` rồi `npm run dev`, mở http://localhost:5173.

Vite tự chuyển mọi yêu cầu `/api` sang backend (xem `vite.config.js`). Nếu backend chạy cổng khác, đặt biến `VITE_PROXY`, ví dụ `VITE_PROXY=http://localhost:4000 npm run dev`.

## Đưa lên mạng (khuyên dùng: chung một máy chủ)
Đặt hai thư mục cạnh nhau rồi chạy:

    npm run build:backend

Lệnh này build giao diện và chép thẳng vào `quan-ly-cua-hang/public`. Sau đó chỉ cần triển khai backend, mọi thứ chạy cùng một địa chỉ nên cookie đăng nhập hoạt động bình thường, không cần cấu hình CORS.

Nếu muốn đặt frontend ở tên miền khác với backend, backend cần thêm CORS và cookie `SameSite=None; Secure`. Phần này chưa có sẵn.

## Triển khai frontend lên Vercel
Vercel chỉ chạy giao diện React/Vite; backend và MongoDB vẫn cần được triển khai riêng trên một máy chủ có HTTPS.

1. Import repository frontend vào Vercel. Vercel dùng `vercel.json` để chạy `npm run build` và phát hành thư mục `dist`.
2. Trong **Project Settings → Environment Variables**, tạo `VITE_API_URL` với địa chỉ gốc HTTPS của backend, ví dụ `https://api.example.com` (không thêm `/api` ở cuối), rồi triển khai lại.
3. Cấu hình backend cho phép CORS từ chính xác domain Vercel của ứng dụng, bật credentials, và đặt cookie đăng nhập `SameSite=None; Secure`. Không dùng `*` cho origin khi gửi credentials.
4. Kiểm tra `/api/status`, đăng nhập, tải dữ liệu và lưu một thay đổi trên domain Vercel.

Nếu chưa đặt `VITE_API_URL`, ứng dụng gọi `/api` trên chính domain Vercel; đăng nhập và dữ liệu sẽ không hoạt động nếu chưa có backend tại domain đó. Không đưa thông tin kết nối MongoDB hoặc bí mật máy chủ vào biến `VITE_*`, vì các biến này được đóng gói vào frontend.

## Cấu trúc
- `src/api.js`: hàm gọi API.
- `src/lib.js`: định dạng tiền và tính toán doanh thu/chi phí. Tài khoản mới bắt đầu với dữ liệu trống.
- `src/views/`: từng màn hình được tách riêng theo chức năng (Tổng quan, Bán hàng, Kho, Chi tiêu, Doanh thu, Báo cáo); phần Doanh thu/Chi tiêu hỗ trợ nhập `.xlsx`/`.xlsm`/`.csv` có xem trước, chọn cột ngày, số tiền, ghi chú và khoản mục; báo cáo xuất Excel chi tiết theo tháng đã chọn, gồm ngày bán và thông tin từng dòng máy.
- `src/views/Accounts.jsx`: giao diện quản lý tài khoản dùng `/api/accounts`; owner tạo nhân viên/quản lý và quản lý nhân viên; manager chỉ tạo, khóa/mở khóa nhân viên theo đúng phân quyền backend.
- `src/views/Inventory.jsx`: lọc mặt hàng theo tháng nhập kho; backend `/api/data` cần giữ trường `stockDate` trong document mặt hàng để bộ lọc hoạt động sau khi tải lại.
- `src/App.jsx`: đăng nhập, thanh tiêu đề, tự lưu lên backend sau mỗi thay đổi.
- `src/styles.css`: giao diện (tự đổi sáng/tối theo hệ thống).
