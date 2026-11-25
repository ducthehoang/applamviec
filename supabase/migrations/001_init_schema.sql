-- ============================================================================
-- DUOAGENCY HUB - SUPABASE POSTGRESQL SCHEMA & CRON SCHEDULER
-- Dành cho 2 thành viên vận hành Agency (Chia sẻ Folder/Media + Auto-post FB & TikTok)
-- ============================================================================

-- 1. Kích hoạt các Extension cần thiết
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
-- Lưu ý: Bật thêm pg_cron và pg_net trong Supabase Dashboard -> Database -> Extensions
CREATE EXTENSION IF NOT EXISTS "pg_net";

-- ============================================================================
-- 2. BẢNG THÀNH VIÊN (Khóa cứng quyền truy cập cho đúng 2 tài khoản ngang quyền)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.workspace_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    avatar_color TEXT NOT NULL DEFAULT '#6366f1',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Thay 2 email dưới đây bằng email thực tế của bạn và cộng sự khi chạy trên Supabase SQL Editor
INSERT INTO public.workspace_members (email, display_name, avatar_color)
VALUES
    ('member1@example.com', 'Thành viên 1', '#6366f1'),
    ('member2@example.com', 'Thành viên 2', '#ec4899')
ON CONFLICT (email) DO NOTHING;

-- Hàm kiểm tra người đăng nhập hiện tại có nằm trong danh sách 2 thành viên hay không
CREATE OR REPLACE FUNCTION public.is_workspace_member()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.workspace_members wm
        WHERE lower(wm.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    );
$$;

-- ============================================================================
-- 3. BẢNG CÂY THƯ MỤC (FOLDERS)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id UUID REFERENCES public.folders(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#6366f1',
    -- Trạng thái giúp 2 người nhìn vào biết ngay tiến độ mà không cần nhắn hỏi
    stage TEXT NOT NULL DEFAULT 'raw' CHECK (stage IN ('raw', 'editing', 'ready', 'archived')),
    note TEXT NOT NULL DEFAULT '',
    gdrive_folder_id TEXT,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON public.folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_folders_stage ON public.folders(stage);

-- ============================================================================
-- 4. BẢNG FILE HÌNH ẢNH & VIDEO (MEDIA FILES)
-- Thumbnail nhẹ lưu ở Supabase Storage; File gốc nặng lưu ở Google Drive 15GB
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.media_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    folder_id UUID REFERENCES public.folders(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    media_kind TEXT NOT NULL CHECK (media_kind IN ('image', 'video')),
    size_bytes BIGINT NOT NULL DEFAULT 0,
    width INT,
    height INT,
    duration_sec DOUBLE PRECISION,
    thumbnail_url TEXT,
    gdrive_file_id TEXT NOT NULL,
    gdrive_web_link TEXT,
    stage TEXT NOT NULL DEFAULT 'raw' CHECK (stage IN ('raw', 'editing', 'ready', 'used')),
    quick_note TEXT NOT NULL DEFAULT '',
    tags TEXT[] NOT NULL DEFAULT '{}',
    uploaded_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_media_files_folder_id ON public.media_files(folder_id);
CREATE INDEX IF NOT EXISTS idx_media_files_stage ON public.media_files(stage);
CREATE INDEX IF NOT EXISTS idx_media_files_created_at ON public.media_files(created_at DESC);

-- ============================================================================
-- 5. BẢNG KÊNH KẾT NỐI CHUNG (GOOGLE DRIVE, FACEBOOK FANPAGE, TIKTOK)
-- Cả 2 thành viên dùng chung kết nối Fanpage & TikTok đã liên kết tại đây
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.social_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL CHECK (provider IN ('google_drive', 'facebook_page', 'tiktok')),
    account_id TEXT NOT NULL,
    account_name TEXT NOT NULL,
    avatar_url TEXT,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_expires_at TIMESTAMPTZ,
    extra_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    connected_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider, account_id)
);

-- ============================================================================
-- 6. BẢNG BÀI ĐĂNG & LỊCH ĐĂNG TỰ ĐỘNG (SCHEDULED POSTS)
-- 2 thành viên ngang quyền: không cần bước duyệt bắt buộc, ai lên lịch cũng tự chạy
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.scheduled_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL DEFAULT '',
    caption TEXT NOT NULL DEFAULT '',
    -- Hỗ trợ: 'facebook_feed', 'facebook_reels', 'tiktok_direct', 'tiktok_inbox'
    platforms TEXT[] NOT NULL DEFAULT '{}',
    media_ids UUID[] NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'publishing', 'published', 'failed')),
    scheduled_at TIMESTAMPTZ,
    published_at TIMESTAMPTZ,
    -- Tham số bắt buộc theo chuẩn TikTok Content Posting API v2
    tiktok_privacy_level TEXT NOT NULL DEFAULT 'PUBLIC_TO_EVERYONE',
    tiktok_disable_comment BOOLEAN NOT NULL DEFAULT false,
    tiktok_disable_duet BOOLEAN NOT NULL DEFAULT false,
    tiktok_disable_stitch BOOLEAN NOT NULL DEFAULT false,
    publish_results JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_message TEXT,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_posts_due
    ON public.scheduled_posts(status, scheduled_at)
    WHERE status = 'scheduled';

-- ============================================================================
-- 7. BẢNG GHI CHÚ NHANH TRỰC TIẾP TRÊN FOLDER / FILE / BÀI ĐĂNG
-- Giúp 2 người trao đổi ngữ cảnh ngay tại file/bài mà không cần nhắn tin rời rạc
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.activity_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_type TEXT NOT NULL CHECK (target_type IN ('folder', 'file', 'post')),
    target_id UUID NOT NULL,
    author_email TEXT NOT NULL,
    author_name TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_notes_target ON public.activity_notes(target_type, target_id, created_at DESC);

-- ============================================================================
-- 8. TỰ ĐỘNG CẬP NHẬT CỘT updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_folders_updated_at ON public.folders;
CREATE TRIGGER trg_folders_updated_at
    BEFORE UPDATE ON public.folders
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_media_files_updated_at ON public.media_files;
CREATE TRIGGER trg_media_files_updated_at
    BEFORE UPDATE ON public.media_files
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_social_channels_updated_at ON public.social_channels;
CREATE TRIGGER trg_social_channels_updated_at
    BEFORE UPDATE ON public.social_channels
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_scheduled_posts_updated_at ON public.scheduled_posts;
CREATE TRIGGER trg_scheduled_posts_updated_at
    BEFORE UPDATE ON public.scheduled_posts
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================================
-- 9. BẢO MẬT ROW LEVEL SECURITY (RLS) - CHỈ 2 THÀNH VIÊN MỚI XEM/GHI ĐƯỢC
-- ============================================================================
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members full access workspace_members" ON public.workspace_members;
CREATE POLICY "Members full access workspace_members" ON public.workspace_members
    FOR ALL USING (public.is_workspace_member()) WITH CHECK (public.is_workspace_member());

DROP POLICY IF EXISTS "Members full access folders" ON public.folders;
CREATE POLICY "Members full access folders" ON public.folders
    FOR ALL USING (public.is_workspace_member()) WITH CHECK (public.is_workspace_member());

DROP POLICY IF EXISTS "Members full access media_files" ON public.media_files;
CREATE POLICY "Members full access media_files" ON public.media_files
    FOR ALL USING (public.is_workspace_member()) WITH CHECK (public.is_workspace_member());

DROP POLICY IF EXISTS "Members full access social_channels" ON public.social_channels;
CREATE POLICY "Members full access social_channels" ON public.social_channels
    FOR ALL USING (public.is_workspace_member()) WITH CHECK (public.is_workspace_member());

DROP POLICY IF EXISTS "Members full access scheduled_posts" ON public.scheduled_posts;
CREATE POLICY "Members full access scheduled_posts" ON public.scheduled_posts
    FOR ALL USING (public.is_workspace_member()) WITH CHECK (public.is_workspace_member());

DROP POLICY IF EXISTS "Members full access activity_notes" ON public.activity_notes;
CREATE POLICY "Members full access activity_notes" ON public.activity_notes
    FOR ALL USING (public.is_workspace_member()) WITH CHECK (public.is_workspace_member());

-- ============================================================================
-- 10. SUPABASE STORAGE BUCKET CHO THUMBNAIL SIÊU NHẸ (<50KB/ảnh)
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'thumbnails',
    'thumbnails',
    true,
    2097152, -- Giới hạn tối đa 2MB cho thumbnail
    ARRAY['image/webp', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read thumbnails" ON storage.objects;
CREATE POLICY "Public read thumbnails" ON storage.objects
    FOR SELECT USING (bucket_id = 'thumbnails');

DROP POLICY IF EXISTS "Members upload thumbnails" ON storage.objects;
CREATE POLICY "Members upload thumbnails" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'thumbnails' AND public.is_workspace_member());

DROP POLICY IF EXISTS "Members delete thumbnails" ON storage.objects;
CREATE POLICY "Members delete thumbnails" ON storage.objects
    FOR DELETE USING (bucket_id = 'thumbnails' AND public.is_workspace_member());

-- ============================================================================
-- 11. BỘ LẬP LỊCH TỰ ĐỘNG ĐĂNG BÀI MỖI PHÚT (BẰNG PG_CRON + PG_NET TRÊN SUPABASE)
-- Giải quyết triệt để giới hạn Cron 1 lần/ngày của Vercel gói miễn phí!
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.app_runtime_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
ALTER TABLE public.app_runtime_config ENABLE ROW LEVEL SECURITY;

-- Sau khi có domain Vercel, bạn chỉ cần cập nhật 2 dòng dưới đây:
INSERT INTO public.app_runtime_config (key, value) VALUES
    ('vercel_cron_endpoint', 'https://TEN-APP-CUA-BAN.vercel.app/api/rust/cron/publish'),
    ('cron_secret', 'THAY_BANG_CHUOI_BI_MAT_CRON_SECRET')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.trigger_due_scheduled_posts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_endpoint TEXT;
    v_secret TEXT;
    v_has_due BOOLEAN;
BEGIN
    -- Chỉ bắn HTTP sang Vercel khi thực sự có bài đăng đã tới giờ hẹn (tiết kiệm tối đa tài nguyên Vercel!)
    SELECT EXISTS (
        SELECT 1
        FROM public.scheduled_posts
        WHERE status = 'scheduled'
          AND scheduled_at IS NOT NULL
          AND scheduled_at <= now()
    ) INTO v_has_due;

    IF NOT v_has_due THEN
        RETURN;
    END IF;

    SELECT value INTO v_endpoint FROM public.app_runtime_config WHERE key = 'vercel_cron_endpoint';
    SELECT value INTO v_secret FROM public.app_runtime_config WHERE key = 'cron_secret';

    IF v_endpoint IS NOT NULL AND v_endpoint NOT LIKE '%TEN-APP-CUA-BAN%' THEN
        PERFORM net.http_post(
            url := v_endpoint,
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || coalesce(v_secret, '')
            ),
            body := jsonb_build_object('source', 'supabase_pg_cron')
        );
    END IF;
END;
$$;

-- Sau khi bật Extension `pg_cron` trong Supabase Dashboard, bỏ comment lệnh dưới để kích hoạt quét mỗi 1 phút:
-- SELECT cron.schedule('duoagency-auto-publish', '* * * * *', $$SELECT public.trigger_due_scheduled_posts();$$);
