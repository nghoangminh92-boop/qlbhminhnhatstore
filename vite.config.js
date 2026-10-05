import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Khi chạy `npm run dev`, mọi yêu cầu /api được chuyển tới backend (mặc định cổng 3000).
// Nhờ vậy trình duyệt coi frontend và backend cùng một nguồn, cookie đăng nhập hoạt động bình thường.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': process.env.VITE_PROXY || 'http://localhost:3000' } }
});
