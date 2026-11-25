# DuoAgency Hub — Không Gian Chia Sẻ Folder & Tự Động Đăng Bài FB / TikTok Cho 2 Người

Ứng dụng Web PWA nội bộ giúp 2 thành viên vận hành Agency chia sẻ Folder hình ảnh/video dung lượng lớn, gắn ghi chú tiến độ trực tiếp trên file (không cần nhắn tin qua lại) và hẹn giờ đăng bài tự động lên **1 Fanpage Facebook chung** cùng **kênh TikTok**.

## Kiến Trúc Công Nghệ
- **Backend:** **Rust** (`axum` + `sqlx` + `reqwest` + `vercel_runtime` v2) gom gọn trong 1 Vercel Serverless Function duy nhất (`api/backend.rs`).
- **Frontend:** **Next.js 15 PWA** (React 19 + TypeScript + Tailwind CSS v4) cài đặt được ra màn hình chính điện thoại/máy tính.
- **Cơ sở dữ liệu & Lịch tự động:** **Supabase PostgreSQL** (RLS khóa bảo mật đúng 2 email thành viên + `pg_cron` quét lịch đăng mỗi 1 phút).
- **Lưu trữ thông minh 0đ:** Ảnh thu nhỏ WebP (< 50KB) trên **Supabase Storage** để mở folder tức thì + File ảnh gốc/video nặng bắn thẳng lên **Google Drive API (15GB)** qua Resumable Upload (vượt qua giới hạn 4.5MB của Vercel).
- **Mạng xã hội:** **Facebook Graph API v22.0** (Feed, Album nhiều ảnh, Video, Reels) & **TikTok Content Posting API v2** (Direct Post tự động & Upload vào Nháp điện thoại).

## Chạy Thử Ngay Trên Máy Tính (Local Preview)

```bash
npm install
npm run dev
```

Mở `http://localhost:3000` — khi chưa điền `.env.local`, hệ thống tự bật **Chế độ Local Preview** cho phép bạn chuyển đổi qua lại giữa **Thành viên 1** và **Thành viên 2** để kiểm thử tạo Folder, kéo-thả ảnh/video, gắn ghi chú và lên lịch đăng bài ngay lập tức.

## Hướng Dẫn Lấy API Công Khai FB, TikTok, Google Drive & Deploy Lên Vercel

Xem chi tiết từng bước tại: [`docs/HUONG_DAN_API_VA_DEPLOY.md`](./docs/HUONG_DAN_API_VA_DEPLOY.md).
