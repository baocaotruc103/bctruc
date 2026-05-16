# Webapp báo cáo trực bệnh viện

Ứng dụng React + Vite + Tailwind để khoa nhập báo cáo trực, lập danh sách bệnh nhân theo `IDBN`, và xem bản tổng hợp cho trực khối/trực chỉ huy.

## Chạy local

```bash
npm install
npm run dev
```

Dev server hiện chạy tại `http://localhost:5173`.

## Cấu hình Supabase

1. Tạo project Supabase.
2. Chạy SQL trong `supabase-schema.sql`.
3. Tạo file `.env` từ `.env.example`:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Nếu chưa cấu hình Supabase, nút lưu sẽ lưu nháp vào `localStorage` để demo giao diện.

## Ghi chú bảo mật

Schema đang bật Row Level Security. Với dữ liệu bệnh nhân thật, nên thêm Supabase Auth và policy theo tài khoản/khoa trước khi cho phép ghi dữ liệu. Không nên mở quyền insert/update ẩn danh cho môi trường bệnh viện.

## Voice và camera OCR

Ô `Diễn biến lâm sàng` và `Cận lâm sàng` hỗ trợ nhập bằng giọng nói và quét chữ bằng camera. Tính năng này cần trình duyệt hỗ trợ Web Speech API, quyền microphone/camera, và chạy trên `localhost` hoặc HTTPS. OCR dùng `tesseract.js`; lần đầu quét có thể cần tải dữ liệu nhận dạng tiếng Việt/tiếng Anh.
