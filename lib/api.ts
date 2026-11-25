import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";
import { generateMediaThumbnail } from "@/lib/thumbnail";
import {
  FolderItem,
  MediaFileItem,
  PublishPlatform,
  ScheduledPostItem,
  SocialChannelItem,
} from "@/lib/types";

const DEMO_FOLDERS_KEY = "duoagency_demo_folders_v1";
const DEMO_FILES_KEY = "duoagency_demo_files_v1";
const DEMO_POSTS_KEY = "duoagency_demo_posts_v1";
const DEMO_CHANNELS_KEY = "duoagency_demo_channels_v1";

async function getAuthHeaders(): Promise<HeadersInit> {
  const sb = getSupabaseClient();
  if (!sb) return { "Content-Type": "application/json" };
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token || "";
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function rustFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const baseHeaders = await getAuthHeaders();
  const res = await fetch(`/api/rust${path}`, {
    ...init,
    headers: {
      ...baseHeaders,
      ...(init?.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) {
    throw new Error(json.error || `Lỗi gọi Backend Rust (${res.status})`);
  }
  return json.data as T;
}

function seedDemoIfEmpty() {
  if (typeof window === "undefined") return;
  if (!localStorage.getItem(DEMO_FOLDERS_KEY)) {
    const now = new Date().toISOString();
    const demoFolders: FolderItem[] = [
      {
        id: "f-campaign-11",
        parent_id: null,
        name: "Chiến dịch T11 - Bộ ảnh Lookbook",
        color: "#6366f1",
        stage: "ready",
        note: "Đã chỉnh màu xong 100%, cứ lấy đăng dần lên Fanpage nhé",
        gdrive_folder_id: "demo-drive-folder-1",
        created_by: "ThanhVien1@agency.vn",
        created_at: now,
        updated_at: now,
      },
      {
        id: "f-tiktok-raw",
        parent_id: null,
        name: "Video Quay Thô Hậu Trường (Chờ dựng)",
        color: "#ec4899",
        stage: "editing",
        note: "Nhớ cắt 3 giây đầu bị rung máy trước khi hẹn giờ TikTok",
        gdrive_folder_id: "demo-drive-folder-2",
        created_by: "ThanhVien2@agency.vn",
        created_at: now,
        updated_at: now,
      },
    ];
    localStorage.setItem(DEMO_FOLDERS_KEY, JSON.stringify(demoFolders));
  }
  if (!localStorage.getItem(DEMO_FILES_KEY)) {
    localStorage.setItem(DEMO_FILES_KEY, JSON.stringify([]));
  }
  if (!localStorage.getItem(DEMO_POSTS_KEY)) {
    localStorage.setItem(DEMO_POSTS_KEY, JSON.stringify([]));
  }
  if (!localStorage.getItem(DEMO_CHANNELS_KEY)) {
    localStorage.setItem(DEMO_CHANNELS_KEY, JSON.stringify([]));
  }
}

export async function fetchFolders(): Promise<FolderItem[]> {
  if (!isSupabaseConfigured) {
    seedDemoIfEmpty();
    return JSON.parse(localStorage.getItem(DEMO_FOLDERS_KEY) || "[]");
  }
  return rustFetch<FolderItem[]>("/folders");
}

export async function createFolder(input: {
  parent_id: string | null;
  name: string;
  color: string;
  stage: FolderItem["stage"];
  note: string;
  actorEmail: string;
}): Promise<FolderItem> {
  if (!isSupabaseConfigured) {
    seedDemoIfEmpty();
    const list: FolderItem[] = JSON.parse(
      localStorage.getItem(DEMO_FOLDERS_KEY) || "[]"
    );
    const now = new Date().toISOString();
    const item: FolderItem = {
      id: crypto.randomUUID(),
      parent_id: input.parent_id,
      name: input.name,
      color: input.color,
      stage: input.stage,
      note: input.note,
      gdrive_folder_id: null,
      created_by: input.actorEmail,
      created_at: now,
      updated_at: now,
    };
    localStorage.setItem(DEMO_FOLDERS_KEY, JSON.stringify([item, ...list]));
    return item;
  }
  return rustFetch<FolderItem>("/folders", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateFolder(
  id: string,
  patch: Partial<Pick<FolderItem, "name" | "color" | "stage" | "note">>
): Promise<FolderItem> {
  if (!isSupabaseConfigured) {
    const list: FolderItem[] = JSON.parse(
      localStorage.getItem(DEMO_FOLDERS_KEY) || "[]"
    );
    let updatedItem: FolderItem | null = null;
    const next = list.map((f) => {
      if (f.id === id) {
        updatedItem = { ...f, ...patch, updated_at: new Date().toISOString() };
        return updatedItem;
      }
      return f;
    });
    localStorage.setItem(DEMO_FOLDERS_KEY, JSON.stringify(next));
    if (!updatedItem) throw new Error("Không tìm thấy folder");
    return updatedItem;
  }
  return rustFetch<FolderItem>(`/folders/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteFolder(id: string): Promise<void> {
  if (!isSupabaseConfigured) {
    const folders: FolderItem[] = JSON.parse(
      localStorage.getItem(DEMO_FOLDERS_KEY) || "[]"
    );
    localStorage.setItem(
      DEMO_FOLDERS_KEY,
      JSON.stringify(folders.filter((f) => f.id !== id))
    );
    const files: MediaFileItem[] = JSON.parse(
      localStorage.getItem(DEMO_FILES_KEY) || "[]"
    );
    localStorage.setItem(
      DEMO_FILES_KEY,
      JSON.stringify(files.filter((m) => m.folder_id !== id))
    );
    return;
  }
  await rustFetch(`/folders/${id}`, { method: "DELETE" });
}

export async function fetchFiles(folderId?: string | null): Promise<MediaFileItem[]> {
  if (!isSupabaseConfigured) {
    seedDemoIfEmpty();
    const all: MediaFileItem[] = JSON.parse(
      localStorage.getItem(DEMO_FILES_KEY) || "[]"
    );
    if (folderId) return all.filter((f) => f.folder_id === folderId);
    return all;
  }
  const qs = folderId ? `?folder_id=${encodeURIComponent(folderId)}` : "";
  return rustFetch<MediaFileItem[]>(`/files${qs}`);
}

/**
 * Luồng Upload Kép tốc độ cao:
 * 1. Nén ảnh thu nhỏ WebP < 50KB ngay trên trình duyệt -> lưu vào Supabase Storage `thumbnails`
 * 2. Xin Google Drive Resumable Upload URI từ Backend Rust -> bắn thẳng file gốc (vài trăm MB) từ trình duyệt lên Google Drive 15GB!
 * 3. Ghi metadata vào PostgreSQL qua Backend Rust.
 */
export async function uploadMediaFileWithProgress(params: {
  file: File;
  folderId: string | null;
  actorEmail: string;
  onProgress?: (pct: number) => void;
}): Promise<MediaFileItem> {
  const { file, folderId, actorEmail, onProgress } = params;
  onProgress?.(8);

  const meta = await generateMediaThumbnail(file);
  const mediaKind: "image" | "video" = file.type.startsWith("video/")
    ? "video"
    : "image";

  if (!isSupabaseConfigured) {
    onProgress?.(65);
    const all: MediaFileItem[] = JSON.parse(
      localStorage.getItem(DEMO_FILES_KEY) || "[]"
    );
    const now = new Date().toISOString();
    const demoItem: MediaFileItem = {
      id: crypto.randomUUID(),
      folder_id: folderId,
      name: file.name,
      mime_type: file.type || "application/octet-stream",
      media_kind: mediaKind,
      size_bytes: file.size,
      width: meta.width,
      height: meta.height,
      duration_sec: meta.durationSec,
      thumbnail_url: meta.thumbnailDataUrl,
      gdrive_file_id: `local-preview-${Date.now()}`,
      gdrive_web_link: null,
      stage: "raw",
      quick_note: "",
      tags: [],
      uploaded_by: actorEmail,
      created_at: now,
      updated_at: now,
    };
    localStorage.setItem(DEMO_FILES_KEY, JSON.stringify([demoItem, ...all]));
    onProgress?.(100);
    return demoItem;
  }

  // Bước 1: Upload thumbnail nhẹ (< 50KB) lên Supabase Storage
  let publicThumbUrl: string | null = null;
  const sb = getSupabaseClient();
  if (sb && meta.thumbnailBlob) {
    const thumbPath = `${folderId || "root"}/${crypto.randomUUID()}.webp`;
    const { error: upErr } = await sb.storage
      .from("thumbnails")
      .upload(thumbPath, meta.thumbnailBlob, {
        contentType: "image/webp",
        upsert: false,
      });
    if (!upErr) {
      const { data } = sb.storage.from("thumbnails").getPublicUrl(thumbPath);
      publicThumbUrl = data.publicUrl;
    }
  }
  onProgress?.(25);

  // Bước 2: Gọi Rust Backend khởi tạo phiên Google Drive Resumable Upload
  const session = await rustFetch<{ upload_url: string }>("/drive/init-upload", {
    method: "POST",
    body: JSON.stringify({
      file_name: file.name,
      mime_type: file.type || "application/octet-stream",
      size_bytes: file.size,
      folder_id: folderId,
      origin: window.location.origin,
    }),
  });

  // Bước 3: Bắn thẳng file gốc từ trình duyệt lên Google Drive (không qua Vercel nên không bị giới hạn 4.5MB!)
  const driveResult = await putBinaryWithProgress(
    session.upload_url,
    file,
    (ratio) => {
      onProgress?.(Math.round(25 + ratio * 65));
    }
  );

  // Bước 4: Lưu metadata vào PostgreSQL
  const saved = await rustFetch<MediaFileItem>("/files", {
    method: "POST",
    body: JSON.stringify({
      folder_id: folderId,
      name: file.name,
      mime_type: file.type || "application/octet-stream",
      media_kind: mediaKind,
      size_bytes: file.size,
      width: meta.width,
      height: meta.height,
      duration_sec: meta.durationSec,
      thumbnail_url: publicThumbUrl,
      gdrive_file_id: driveResult.id,
      gdrive_web_link: driveResult.webViewLink || null,
      stage: "raw",
      quick_note: "",
    }),
  });

  onProgress?.(100);
  return saved;
}

function putBinaryWithProgress(
  uploadUrl: string,
  file: File,
  onRatio: (ratio: number) => void
): Promise<{ id: string; webViewLink?: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl, true);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable && evt.total > 0) {
        onRatio(evt.loaded / evt.total);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const parsed = JSON.parse(xhr.responseText);
          resolve(parsed);
        } catch {
          reject(new Error("Không đọc được phản hồi file ID từ Google Drive"));
        }
      } else {
        reject(
          new Error(`Lỗi tải file gốc lên Google Drive (HTTP ${xhr.status})`)
        );
      }
    };

    xhr.onerror = () =>
      reject(new Error("Mất kết nối mạng khi tải file lên Google Drive"));
    xhr.send(file);
  });
}

export async function updateMediaFile(
  id: string,
  patch: Partial<Pick<MediaFileItem, "stage" | "quick_note" | "folder_id">>
): Promise<MediaFileItem> {
  if (!isSupabaseConfigured) {
    const list: MediaFileItem[] = JSON.parse(
      localStorage.getItem(DEMO_FILES_KEY) || "[]"
    );
    let updated: MediaFileItem | null = null;
    const next = list.map((m) => {
      if (m.id === id) {
        updated = { ...m, ...patch, updated_at: new Date().toISOString() };
        return updated;
      }
      return m;
    });
    localStorage.setItem(DEMO_FILES_KEY, JSON.stringify(next));
    if (!updated) throw new Error("Không tìm thấy file");
    return updated;
  }
  return rustFetch<MediaFileItem>(`/files/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteMediaFile(id: string): Promise<void> {
  if (!isSupabaseConfigured) {
    const list: MediaFileItem[] = JSON.parse(
      localStorage.getItem(DEMO_FILES_KEY) || "[]"
    );
    localStorage.setItem(
      DEMO_FILES_KEY,
      JSON.stringify(list.filter((m) => m.id !== id))
    );
    return;
  }
  await rustFetch(`/files/${id}`, { method: "DELETE" });
}

export async function fetchChannels(): Promise<SocialChannelItem[]> {
  if (!isSupabaseConfigured) {
    seedDemoIfEmpty();
    return JSON.parse(localStorage.getItem(DEMO_CHANNELS_KEY) || "[]");
  }
  return rustFetch<SocialChannelItem[]>("/channels");
}

export async function connectFacebookManual(input: {
  page_id: string;
  page_name: string;
  page_access_token: string;
  actorEmail: string;
}): Promise<SocialChannelItem> {
  if (!isSupabaseConfigured) {
    const list: SocialChannelItem[] = JSON.parse(
      localStorage.getItem(DEMO_CHANNELS_KEY) || "[]"
    );
    const now = new Date().toISOString();
    const item: SocialChannelItem = {
      id: crypto.randomUUID(),
      provider: "facebook_page",
      account_id: input.page_id,
      account_name: input.page_name || `Fanpage ${input.page_id}`,
      avatar_url: null,
      token_expires_at: null,
      extra_config: { mode: "local_demo" },
      connected_by: input.actorEmail,
      created_at: now,
      updated_at: now,
    };
    const filtered = list.filter((c) => c.provider !== "facebook_page");
    localStorage.setItem(DEMO_CHANNELS_KEY, JSON.stringify([item, ...filtered]));
    return item;
  }
  return rustFetch<SocialChannelItem>("/channels/facebook/manual", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function exchangeOAuthCode(
  provider: "google-drive" | "facebook" | "tiktok",
  code: string,
  redirectUri: string
): Promise<unknown> {
  return rustFetch(`/channels/${provider}/oauth`, {
    method: "POST",
    body: JSON.stringify({ code, redirect_uri: redirectUri }),
  });
}

export async function deleteChannel(id: string): Promise<void> {
  if (!isSupabaseConfigured) {
    const list: SocialChannelItem[] = JSON.parse(
      localStorage.getItem(DEMO_CHANNELS_KEY) || "[]"
    );
    localStorage.setItem(
      DEMO_CHANNELS_KEY,
      JSON.stringify(list.filter((c) => c.id !== id))
    );
    return;
  }
  await rustFetch(`/channels/${id}`, { method: "DELETE" });
}

export async function fetchPosts(): Promise<ScheduledPostItem[]> {
  if (!isSupabaseConfigured) {
    seedDemoIfEmpty();
    return JSON.parse(localStorage.getItem(DEMO_POSTS_KEY) || "[]");
  }
  return rustFetch<ScheduledPostItem[]>("/posts");
}

export async function createOrPublishPost(input: {
  title: string;
  caption: string;
  platforms: PublishPlatform[];
  media_ids: string[];
  scheduled_at: string | null;
  publish_now: boolean;
  tiktok_privacy_level: string;
  tiktok_disable_comment: boolean;
  tiktok_disable_duet: boolean;
  tiktok_disable_stitch: boolean;
  actorEmail: string;
}): Promise<ScheduledPostItem> {
  if (!isSupabaseConfigured) {
    const list: ScheduledPostItem[] = JSON.parse(
      localStorage.getItem(DEMO_POSTS_KEY) || "[]"
    );
    const now = new Date().toISOString();
    const created: ScheduledPostItem = {
      id: crypto.randomUUID(),
      title: input.title,
      caption: input.caption,
      platforms: input.platforms,
      media_ids: input.media_ids,
      status: input.publish_now
        ? "published"
        : input.scheduled_at
        ? "scheduled"
        : "draft",
      scheduled_at: input.scheduled_at,
      published_at: input.publish_now ? now : null,
      tiktok_privacy_level: input.tiktok_privacy_level,
      tiktok_disable_comment: input.tiktok_disable_comment,
      tiktok_disable_duet: input.tiktok_disable_duet,
      tiktok_disable_stitch: input.tiktok_disable_stitch,
      publish_results: input.publish_now
        ? { demo: "Mô phỏng thành công ở chế độ Local Preview" }
        : {},
      error_message: null,
      created_by: input.actorEmail,
      created_at: now,
      updated_at: now,
    };
    localStorage.setItem(DEMO_POSTS_KEY, JSON.stringify([created, ...list]));
    return created;
  }
  return rustFetch<ScheduledPostItem>("/posts", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function triggerPublishNow(id: string): Promise<ScheduledPostItem> {
  if (!isSupabaseConfigured) {
    const list: ScheduledPostItem[] = JSON.parse(
      localStorage.getItem(DEMO_POSTS_KEY) || "[]"
    );
    let target: ScheduledPostItem | null = null;
    const next = list.map((p) => {
      if (p.id === id) {
        target = {
          ...p,
          status: "published",
          published_at: new Date().toISOString(),
        };
        return target;
      }
      return p;
    });
    localStorage.setItem(DEMO_POSTS_KEY, JSON.stringify(next));
    if (!target) throw new Error("Không tìm thấy bài đăng");
    return target;
  }
  return rustFetch<ScheduledPostItem>(`/posts/${id}/publish`, {
    method: "POST",
  });
}

export async function deletePost(id: string): Promise<void> {
  if (!isSupabaseConfigured) {
    const list: ScheduledPostItem[] = JSON.parse(
      localStorage.getItem(DEMO_POSTS_KEY) || "[]"
    );
    localStorage.setItem(
      DEMO_POSTS_KEY,
      JSON.stringify(list.filter((p) => p.id !== id))
    );
    return;
  }
  await rustFetch(`/posts/${id}`, { method: "DELETE" });
}
