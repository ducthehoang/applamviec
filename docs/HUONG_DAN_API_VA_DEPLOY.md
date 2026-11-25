# Hướng Dẫn Toàn Tập: Kết Nối API Facebook, TikTok, Google Drive & Đưa Lên GitHub + Supabase + Vercel

Tài liệu này hướng dẫn từng bước từ A–Z để 2 bạn đưa **DuoAgency Hub** vào chạy thực tế hoàn toàn miễn phí.

---

## Phần 1: Khởi Tạo Supabase (PostgreSQL + Auth 2 Người + Cron Tự Động)

1. Vào https://supabase.com/dashboard -> Bấm **New Project** -> Lưu lại mật khẩu Database (`YOUR_DB_PASSWORD`).
2. Vào mục **SQL Editor** -> **New Query** -> Mở file [`supabase/migrations/001_init_schema.sql`](../supabase/migrations/001_init_schema.sql), dán toàn bộ nội dung vào và bấm **Run**.
3. **Khai báo đúng 2 Email thành viên được phép vào hệ thống:**
   Chạy tiếp câu lệnh SQL sau trong **SQL Editor** (thay bằng 2 email thật của 2 bạn):
   ```sql
   INSERT INTO public.workspace_members (email, display_name)
   VALUES
     ('email_nguoi_1@gmail.com', 'Thành viên 1'),
     ('email_nguoi_2@gmail.com', 'Thành viên 2')
   ON CONFLICT (email) DO NOTHING;
   ```
4. Vào mục **Authentication -> Users -> Add user -> Create new user**: Tạo tài khoản + mật khẩu cho đúng 2 email trên.
5. Vào mục **Project Settings -> API & Database**:
   - Lấy `Project URL` -> điền vào `NEXT_PUBLIC_SUPABASE_URL`
   - Lấy `anon public key` -> điền vào `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Vào **Database -> Connection string -> Chọn chế độ Transaction Pooler (Port 6543)** -> lấy chuỗi `postgresql://...` điền vào `DATABASE_URL`.

---

## Phần 2: Đẩy Mã Nguồn Lên GitHub & Deploy Lên Vercel

1. Tạo một Repository mới (Private) trên GitHub của bạn, sau đó mở Terminal tại thư mục `d:\applamviec` chạy:
   ```bash
   git init
   git add .
   git commit -m "feat: khoi tao DuoAgency Hub (Rust + Next.js PWA + Supabase)"
   git branch -M main
   git remote add origin https://github.com/<TEN_GITHUB_CUA_BAN>/<TEN_REPO>.git
   git push -u origin main
   ```
2. Vào https://vercel.com/new -> Chọn **Import Git Repository** vừa tạo.
3. Trong mục **Environment Variables** trên Vercel, điền các biến giống mẫu trong [`.env.example`](../.env.example), rồi bấm **Deploy**.
   - Vercel sẽ tự động biên dịch cả **Frontend Next.js** lẫn **Backend Rust (`api/backend.rs` chạy trên `vercel_runtime` v2)** trong cùng 1 lần deploy!
   - Sau khi deploy xong, giả sử bạn nhận được tên miền: `https://ten-app-cua-ban.vercel.app`.

---

## Phần 3: Cấu Hình Google Drive API (Kho Chung 15GB Miễn Phí Lưu Ảnh Gốc & Video Nặng)

1. Truy cập https://console.cloud.google.com/ -> Tạo một Project mới.
2. Vào **APIs & Services -> Library** -> Tìm **Google Drive API** -> Bấm **Enable**.
3. Vào **APIs & Services -> OAuth consent screen**:
   - Chọn **External** -> Điền tên App `DuoAgency Hub` và email của bạn.
   - Ở bước **Test users** (nếu chưa bấm Publish App): Thêm email tài khoản Google có kho 15GB bạn muốn dùng làm kho chung.
4. Vào **APIs & Services -> Credentials -> Create Credentials -> OAuth client ID**:
   - Application type: **Web application**
   - **Authorized JavaScript origins**: `https://ten-app-cua-ban.vercel.app`
   - **Authorized redirect URIs**: `https://ten-app-cua-ban.vercel.app/oauth/google-drive`
5. Copy `Client ID` và `Client Secret` điền vào biến môi trường trên Vercel (`NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`), Redeploy lại rồi mở Web App -> Tab **Kết nối API** -> Bấm **Kết nối Google Drive OAuth**.

---

## Phần 4: Hướng Dẫn Sử Dụng API Công Khai Của Facebook Developer (2 Tài Khoản Cùng Đăng 1 Fanpage)

Meta cung cấp **Graph API v22.0** công khai. Để cả 2 bạn cùng đăng Ảnh, Album nhiều ảnh, Video và Reels vào **1 Fanpage duy nhất** mà không bị hết hạn token sau 1 tiếng, làm theo 1 trong 2 cách sau:

### Cách A (Khuyên dùng — Nhanh nhất 3 phút, chạy ngay lập tức không cần chờ Meta xét duyệt App Review!)

Khi bạn là Quản trị viên của Fanpage và là Admin của Meta App ở chế độ **Development / Live**, bạn lấy được **Page Access Token không bao giờ hết hạn (Non-Expiring Page Token)** để cả 2 bạn dùng chung trên Web App:

1. Truy cập https://developers.facebook.com/apps/ -> Bấm **Create App**:
   - Chọn Use case: **Other** -> Loại App: **Business** -> Đặt tên App -> Tạo App.
2. Trên thanh menu trên cùng của Meta Developer, mở công cụ **Tools -> Graph API Explorer** (https://developers.facebook.com/tools/explorer/):
   - Ô **Meta App**: Chọn App vừa tạo.
   - Ô **User or Page**: Chọn **Get User Access Token**.
   - Ở mục **Permissions (Quyền)**, tìm và tích chọn đủ 4 quyền công khai sau:
     1. `pages_show_list`
     2. `pages_read_engagement`
     3. `pages_manage_posts` *(quyền đăng bài viết, ảnh, album)*
     4. `publish_video` *(quyền đăng video & Reels lên Fanpage)*
   - Bấm **Generate Access Token** và chọn đúng Fanpage bạn muốn liên kết.
3. Đổi sang **Token vĩnh viễn không hết hạn**:
   - Bấm vào biểu tượng chữ **(i)** màu xanh cạnh chuỗi Token vừa tạo -> Bấm **Open in Access Token Tool**.
   - Kéo xuống dưới bấm nút **Extend Access Token** -> Bạn nhận được *Long-Lived User Token (60 ngày)*.
   - Quay lại Graph API Explorer, dán *Long-Lived User Token* đó vào ô Access Token, gõ truy vấn `GET /v22.0/me/accounts?fields=id,name,access_token` rồi bấm **Submit**.
   - Kết quả JSON trả về chứa **`id` (Page ID)** và **`access_token` của riêng Fanpage đó** — đây chính là **Page Access Token không hết hạn**!
4. Mở Web App DuoAgency Hub -> Vào tab **Kết Nối Drive / Fanpage / TikTok** -> Dán `Page ID` và `Page Access Token` vào khung số 2 -> Bấm **Lưu Token Fanpage**.
   - Từ giây phút này, cả **Thành viên 1** và **Thành viên 2** đăng nhập vào Web App đều đăng và hẹn giờ tự động trực tiếp vào Fanpage đó!

### Cách B (Kết nối bằng nút Đăng nhập Facebook OAuth 1 chạm)
1. Trong Meta App Dashboard -> Thêm sản phẩm **Facebook Login for Business**.
2. Trong **Facebook Login -> Settings -> Valid OAuth Redirect URIs**, điền:
   `https://ten-app-cua-ban.vercel.app/oauth/facebook`
3. Lấy `App ID` và `App Secret` trong **App Settings -> Basic** điền vào Vercel (`NEXT_PUBLIC_FACEBOOK_APP_ID`, `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`).

---

## Phần 5: Hướng Dẫn Sử Dụng API Công Khai Của TikTok Developer (Content Posting API v2)

TikTok cung cấp chính thức **Content Posting API v2** với 2 chế độ mà Backend Rust đã tích hợp sẵn:
- **TikTok Tự động (`video.publish` - Direct Post):** Tới giờ hẹn tự động đăng thẳng lên kênh TikTok.
- **TikTok Nháp (`video.upload` - Upload to Draft/Inbox):** Đẩy video đã dựng vào sẵn mục Thông báo/Nháp trong app TikTok điện thoại để mở lên ghép nhạc bản quyền/trending rồi bấm đăng 1 chạm.

### Các bước tạo TikTok Developer App:
1. Truy cập https://developers.tiktok.com/ -> Đăng nhập và vào **Manage Apps -> Connect an app**.
2. Điền thông tin cơ bản của ứng dụng:
   - **Platform:** Chọn **Web**
   - **Terms of Service URL:** `https://ten-app-cua-ban.vercel.app/terms` *(Đã code sẵn trong dự án!)*
   - **Privacy Policy URL:** `https://ten-app-cua-ban.vercel.app/privacy` *(Đã code sẵn trong dự án!)*
3. Kéo xuống mục **Products -> Add products**:
   - Thêm **Login Kit** và **Content Posting API**.
   - Trong phần **Login Kit -> Redirect URI**, điền chính xác:
     `https://ten-app-cua-ban.vercel.app/oauth/tiktok`
   - Trong phần **Content Posting API**, bật tích chọn **Direct Post**.
   - Trong phần **Scopes**, bật đủ 3 quyền: `user.info.basic`, `video.publish`, `video.upload`.
4. Copy `Client Key` và `Client Secret` điền vào biến môi trường trên Vercel (`NEXT_PUBLIC_TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`).

### Lưu ý cực kỳ quan trọng khi chạy TikTok API (Chế độ Sandbox vs Đã Duyệt):
- **Ngay khi mới tạo App (chưa cần đợi TikTok duyệt Audit):** Bạn vào mục **Sandbox** trên TikTok Developer, thêm tài khoản TikTok của Agency vào danh sách **Target Users**. Bạn có thể test kết nối và đăng tự động ngay lập tức với chế độ hiển thị **`Chỉ mình tôi (SELF_ONLY)`** hoặc đẩy vào **`TikTok Nháp`**.
- **Để mở khóa đăng Công khai (`PUBLIC_TO_EVERYONE`) hoàn toàn tự động:** Quay màn hình 1 video ngắn (~1 phút) thao tác trên chính giao diện DuoAgency Hub (chọn video -> chọn chế độ hiển thị/bình luận/duet/stitch -> bấm đăng) và gửi **Submit for Review** ngay trong trang TikTok Developer (miễn phí 100%, thường duyệt trong 2–5 ngày làm việc vì giao diện trong code đã thiết kế chuẩn UX Guideline của TikTok!).

---

## Phần 6: Kích Hoạt Lịch Hẹn Giờ Tự Động Đăng Bài (Mỗi 1 Phút)

Sau khi đã có link Vercel (`https://ten-app-cua-ban.vercel.app`) và chuỗi `CRON_SECRET` bạn tự đặt trên Vercel:

1. Mở **Supabase Dashboard -> SQL Editor**, chạy đoạn lệnh cuối file [`001_init_schema.sql`](../supabase/migrations/001_init_schema.sql) (đã bỏ dấu comment `--`):
   ```sql
   CREATE EXTENSION IF NOT EXISTS pg_cron;
   CREATE EXTENSION IF NOT EXISTS pg_net;

   SELECT cron.schedule(
     'duoagency-auto-publish-every-minute',
     '* * * * *',
     $$
     SELECT net.http_post(
       url := 'https://ten-app-cua-ban.vercel.app/api/rust/cron/publish',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'Authorization', 'Bearer CHUOI_CRON_SECRET_CUA_BAN'
       ),
       body := '{"source":"supabase_pg_cron"}'::jsonb
     );
     $$
   );
   ```
2. *(Tùy chọn dự phòng kép)* Trên GitHub Repository -> **Settings -> Secrets and variables -> Actions**, thêm 2 Repository Secrets:
   - `VERCEL_APP_URL`: `https://ten-app-cua-ban.vercel.app`
   - `CRON_SECRET`: Chuỗi giống hệt trên Vercel.
   File [`.github/workflows/auto-publish-cron.yml`](../.github/workflows/auto-publish-cron.yml) sẽ tự động chạy song song để đảm bảo không bao giờ sót bài hẹn giờ!
