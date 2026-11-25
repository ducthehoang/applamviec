export type WorkStage = "raw" | "editing" | "ready" | "used" | "archived";

export type PublishPlatform =
  | "facebook_feed"
  | "facebook_reels"
  | "tiktok_direct"
  | "tiktok_inbox";

export type PostStatus =
  | "draft"
  | "scheduled"
  | "publishing"
  | "published"
  | "failed";

export interface FolderItem {
  id: string;
  parent_id: string | null;
  name: string;
  color: string;
  stage: "raw" | "editing" | "ready" | "archived";
  note: string;
  gdrive_folder_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface MediaFileItem {
  id: string;
  folder_id: string | null;
  name: string;
  mime_type: string;
  media_kind: "image" | "video";
  size_bytes: number;
  width: number | null;
  height: number | null;
  duration_sec: number | null;
  thumbnail_url: string | null;
  gdrive_file_id: string;
  gdrive_web_link: string | null;
  stage: "raw" | "editing" | "ready" | "used";
  quick_note: string;
  tags: string[];
  uploaded_by: string;
  created_at: string;
  updated_at: string;
}

export interface SocialChannelItem {
  id: string;
  provider: "google_drive" | "facebook_page" | "tiktok";
  account_id: string;
  account_name: string;
  avatar_url: string | null;
  token_expires_at: string | null;
  extra_config: Record<string, unknown>;
  connected_by: string;
  created_at: string;
  updated_at: string;
}

export interface ScheduledPostItem {
  id: string;
  title: string;
  caption: string;
  platforms: PublishPlatform[];
  media_ids: string[];
  status: PostStatus;
  scheduled_at: string | null;
  published_at: string | null;
  tiktok_privacy_level: string;
  tiktok_disable_comment: boolean;
  tiktok_disable_duet: boolean;
  tiktok_disable_stitch: boolean;
  publish_results: Record<string, unknown>;
  error_message: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export const STAGE_META: Record<
  WorkStage,
  { label: string; badgeClass: string; dotClass: string }
> = {
  raw: {
    label: "File thô (Mới tải)",
    badgeClass: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    dotClass: "bg-amber-400",
  },
  editing: {
    label: "Đang hậu kỳ / Dựng",
    badgeClass: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    dotClass: "bg-sky-400",
  },
  ready: {
    label: "Sẵn sàng đăng",
    badgeClass: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    dotClass: "bg-emerald-400",
  },
  used: {
    label: "Đã đăng lên kênh",
    badgeClass: "bg-violet-500/15 text-violet-300 border-violet-500/30",
    dotClass: "bg-violet-400",
  },
  archived: {
    label: "Lưu trữ",
    badgeClass: "bg-slate-500/15 text-slate-300 border-slate-500/30",
    dotClass: "bg-slate-400",
  },
};

export const PLATFORM_META: Record<
  PublishPlatform,
  { label: string; shortLabel: string; badgeClass: string }
> = {
  facebook_feed: {
    label: "Facebook Fanpage (Bài viết / Album / Video)",
    shortLabel: "FB Feed",
    badgeClass: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  },
  facebook_reels: {
    label: "Facebook Fanpage Reels (Video dọc)",
    shortLabel: "FB Reels",
    badgeClass: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  },
  tiktok_direct: {
    label: "TikTok Đăng thẳng tự động (Direct Post)",
    shortLabel: "TikTok Tự động",
    badgeClass: "bg-pink-500/15 text-pink-300 border-pink-500/30",
  },
  tiktok_inbox: {
    label: "TikTok Đẩy vào Nháp điện thoại (Chèn nhạc Trend)",
    shortLabel: "TikTok Nháp",
    badgeClass: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  },
};
