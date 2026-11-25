"use client";

import React, { useMemo, useState } from "react";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Clock,
  Film,
  Image as ImageIcon,
  Play,
  Plus,
  Rocket,
  Trash2,
  X,
} from "lucide-react";
import {
  AppButton,
  AppInput,
  AppSelect,
  SectionHeader,
} from "@/components/ui-primitives";
import {
  createOrPublishPost,
  deletePost,
  triggerPublishNow,
} from "@/lib/api";
import {
  MediaFileItem,
  PLATFORM_META,
  PublishPlatform,
  ScheduledPostItem,
  SocialChannelItem,
} from "@/lib/types";

interface PostComposerCalendarProps {
  actorEmail: string;
  files: MediaFileItem[];
  posts: ScheduledPostItem[];
  channels: SocialChannelItem[];
  selectedMediaIds: string[];
  onChangeSelectedMediaIds: (ids: string[]) => void;
  onRefreshData: () => Promise<void>;
}

const ALL_PLATFORMS: PublishPlatform[] = [
  "facebook_feed",
  "facebook_reels",
  "tiktok_direct",
  "tiktok_inbox",
];

const TIKTOK_PRIVACY_OPTIONS = [
  { value: "PUBLIC_TO_EVERYONE", label: "Công khai cho mọi người (Public)" },
  {
    value: "MUTUAL_FOLLOW_FRIENDS",
    label: "Bạn bè theo dõi chéo (Friends)",
  },
  { value: "FOLLOWER_OF_CREATOR", label: "Người theo dõi (Followers)" },
  {
    value: "SELF_ONLY",
    label: "Chỉ mình tôi (Private — Bắt buộc khi App TikTok chưa duyệt)",
  },
];

const STATUS_BADGE_MAP: Record<
  ScheduledPostItem["status"],
  { label: string; className: string }
> = {
  draft: {
    label: "Bản nháp",
    className: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  },
  scheduled: {
    label: "Đã hẹn giờ tự động",
    className: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  },
  publishing: {
    label: "Đang đẩy lên kênh...",
    className: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  },
  published: {
    label: "Đã đăng thành công",
    className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
  failed: {
    label: "Lỗi khi đăng (Xem chi tiết)",
    className: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  },
};

export function PostComposerCalendar({
  actorEmail,
  files,
  posts,
  channels,
  selectedMediaIds,
  onChangeSelectedMediaIds,
  onRefreshData,
}: PostComposerCalendarProps) {
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [platforms, setPlatforms] = useState<PublishPlatform[]>([
    "facebook_feed",
  ]);
  const [scheduleMode, setScheduleMode] = useState<"now" | "later" | "draft">(
    "later"
  );
  const [scheduledLocal, setScheduledLocal] = useState("");

  // Cài đặt bắt buộc chuẩn Guideline TikTok Content Posting API v2
  const [tiktokPrivacy, setTiktokPrivacy] = useState("PUBLIC_TO_EVERYONE");
  const [disableComment, setDisableComment] = useState(false);
  const [disableDuet, setDisableDuet] = useState(false);
  const [disableStitch, setDisableStitch] = useState(false);

  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [publishingPostId, setPublishingPostId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const selectedMediaItems = useMemo(() => {
    const map = new Map(files.map((f) => [f.id, f]));
    return selectedMediaIds
      .map((id) => map.get(id))
      .filter((x): x is MediaFileItem => Boolean(x));
  }, [files, selectedMediaIds]);

  const fbConnected = useMemo(
    () => channels.find((c) => c.provider === "facebook_page"),
    [channels]
  );
  const tiktokConnected = useMemo(
    () => channels.find((c) => c.provider === "tiktok"),
    [channels]
  );

  const hasTikTokSelected =
    platforms.includes("tiktok_direct") || platforms.includes("tiktok_inbox");

  function togglePlatform(p: PublishPlatform) {
    setPlatforms((prev) =>
      prev.includes(p) ? prev.filter((item) => item !== p) : [...prev, p]
    );
  }

  function removeSelectedMedia(id: string) {
    onChangeSelectedMediaIds(selectedMediaIds.filter((x) => x !== id));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);

    if (platforms.length === 0) {
      setFeedback({
        type: "error",
        text: "Vui lòng chọn ít nhất 1 kênh xuất bản (Facebook Fanpage hoặc TikTok).",
      });
      return;
    }

    if (
      (platforms.includes("facebook_reels") || hasTikTokSelected) &&
      !selectedMediaItems.some((m) => m.media_kind === "video")
    ) {
      setFeedback({
        type: "error",
        text: "Kênh TikTok và Facebook Reels yêu cầu đính kèm ít nhất 1 file Video.",
      });
      return;
    }

    let isoSchedule: string | null = null;
    if (scheduleMode === "later") {
      if (!scheduledLocal) {
        setFeedback({
          type: "error",
          text: "Vui lòng chọn ngày và giờ hẹn tự động đăng bài.",
        });
        return;
      }
      isoSchedule = new Date(scheduledLocal).toISOString();
    }

    setSubmitting(true);
    try {
      await createOrPublishPost({
        title: title.trim() || "Bài đăng chiến dịch",
        caption: caption.trim(),
        platforms,
        media_ids: selectedMediaIds,
        scheduled_at: isoSchedule,
        publish_now: scheduleMode === "now",
        tiktok_privacy_level: tiktokPrivacy,
        tiktok_disable_comment: disableComment,
        tiktok_disable_duet: disableDuet,
        tiktok_disable_stitch: disableStitch,
        actorEmail,
      });

      setTitle("");
      setCaption("");
      onChangeSelectedMediaIds([]);
      setFeedback({
        type: "success",
        text:
          scheduleMode === "now"
            ? "Đã kích hoạt xuất bản bài đăng ngay lập tức!"
            : scheduleMode === "later"
            ? "Đã lưu vào Lịch hẹn giờ tự động (hệ thống quét mỗi 1 phút để tự đăng)!"
            : "Đã lưu bản nháp chung cho cả 2 thành viên!",
      });
      await onRefreshData();
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Không thể tạo bài đăng",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePublishNowClick(postId: string) {
    setPublishingPostId(postId);
    setFeedback(null);
    try {
      await triggerPublishNow(postId);
      setFeedback({
        type: "success",
        text: "Đã thực thi đăng bài thành công!",
      });
      await onRefreshData();
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Lỗi khi xuất bản ngay",
      });
    } finally {
      setPublishingPostId(null);
    }
  }

  async function handleDeletePostClick(postId: string) {
    if (!window.confirm("Xóa bài đăng / lịch hẹn này khỏi danh sách chung?")) {
      return;
    }
    try {
      await deletePost(postId);
      await onRefreshData();
    } catch (err: unknown) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Lỗi xóa bài đăng",
      });
    }
  }

  return (
    <div className="space-y-8">
      <SectionHeader
        title="Soạn Bài & Lịch Tự Động Đăng (Facebook Fanpage + TikTok)"
        subtitle="Cả 2 tài khoản đều có quyền đăng thẳng hoặc hẹn giờ vào cùng 1 Fanpage & kênh TikTok chung — ghi nhận rõ người lên lịch."
        actions={
          <div className="flex items-center gap-2 text-xs">
            <span
              className={`px-2.5 py-1 rounded-lg border ${
                fbConnected
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                  : "bg-slate-800 border-slate-700 text-slate-400"
              }`}
            >
              FB Page:{" "}
              {fbConnected ? fbConnected.account_name : "Chưa liên kết"}
            </span>
            <span
              className={`px-2.5 py-1 rounded-lg border ${
                tiktokConnected
                  ? "bg-pink-500/10 border-pink-500/30 text-pink-300"
                  : "bg-slate-800 border-slate-700 text-slate-400"
              }`}
            >
              TikTok:{" "}
              {tiktokConnected ? tiktokConnected.account_name : "Chưa liên kết"}
            </span>
          </div>
        }
      />

      {feedback && (
        <div
          className={`rounded-xl p-3.5 text-xs flex items-center justify-between gap-3 border ${
            feedback.type === "success"
              ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-200"
              : "bg-rose-500/15 border-rose-500/30 text-rose-200"
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          <AppButton
            variant="ghost"
            size="sm"
            onClick={() => setFeedback(null)}
          >
            Đóng
          </AppButton>
        </div>
      )}

      {/* Bố cục 2 cột: Khung Soạn Bài & Lịch Xuất Bản */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Cột trái: Form soạn bài & Hẹn giờ */}
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-6 rounded-2xl bg-slate-900/90 border border-slate-800 p-5 space-y-5"
        >
          <h3 className="text-base font-semibold text-white">
            1. Tạo bài đăng mới / Lên lịch tự động
          </h3>

          <AppInput
            label="Tiêu đề quản lý nội bộ (2 thành viên nhìn lịch cho dễ phân biệt)"
            placeholder="VD: Bài tối T4 - Ra mắt BST Thu Đông"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          {/* Chọn kênh xuất bản */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-300">
              Chọn kênh đăng bài (Có thể chọn đăng chéo cùng lúc FB + TikTok)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {ALL_PLATFORMS.map((p) => {
                const active = platforms.includes(p);
                const meta = PLATFORM_META[p];
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => togglePlatform(p)}
                    className={`p-3 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                      active
                        ? "bg-indigo-600/20 border-indigo-500 text-white"
                        : "bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700"
                    }`}
                  >
                    <div className="font-semibold">{meta.shortLabel}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {meta.label}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Nội dung Caption */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-300">
              Nội dung bài viết (Caption &amp; Hashtag dùng cho Fanpage / Mô tả
              video TikTok)
            </label>
            <textarea
              rows={5}
              placeholder="Nhập nội dung bài đăng, kêu gọi hành động và #hashtag..."
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="p-3.5 rounded-xl bg-slate-950 border border-slate-700/90 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* File Media đính kèm */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-300">
                Hình ảnh / Video đính kèm từ Kho chung ({selectedMediaItems.length})
              </label>
              <AppButton
                type="button"
                variant="secondary"
                size="sm"
                icon={<Plus className="w-3.5 h-3.5" />}
                onClick={() => setShowMediaPicker((v) => !v)}
              >
                Chọn từ Kho Media
              </AppButton>
            </div>

            {selectedMediaItems.length === 0 ? (
              <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-3.5 text-xs text-slate-400">
                Chưa đính kèm ảnh/video (nếu chỉ đăng chữ lên Facebook Feed thì có
                thể để trống; nếu đăng Album ảnh / Video / TikTok hãy bấm{" "}
                <strong className="text-slate-200">Chọn từ Kho Media</strong>).
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {selectedMediaItems.map((m) => (
                  <div
                    key={m.id}
                    className="relative rounded-xl bg-slate-950 border border-slate-800 overflow-hidden"
                  >
                    <div className="aspect-video flex items-center justify-center bg-slate-900">
                      {m.thumbnail_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={m.thumbnail_url}
                          alt={m.name}
                          className="w-full h-full object-cover"
                        />
                      ) : m.media_kind === "video" ? (
                        <Film className="w-6 h-6 text-pink-400" />
                      ) : (
                        <ImageIcon className="w-6 h-6 text-indigo-400" />
                      )}
                    </div>
                    <div className="p-2 text-[11px] truncate text-slate-200">
                      {m.name}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeSelectedMedia(m.id)}
                      className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-slate-950/85 text-slate-200 flex items-center justify-center hover:bg-rose-600 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Ngăn chọn nhanh file ngay tại đây */}
            {showMediaPicker && (
              <div className="rounded-xl bg-slate-950 border border-slate-800 p-3 space-y-2 max-h-60 overflow-y-auto">
                <div className="text-xs font-medium text-slate-300">
                  Bấm để bật/tắt đính kèm file từ Kho chung:
                </div>
                {files.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    Kho Media hiện chưa có file nào. Hãy qua tab Kho Media để tải
                    ảnh/video lên trước.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {files.map((f) => {
                      const picked = selectedMediaIds.includes(f.id);
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => {
                            if (picked) {
                              removeSelectedMedia(f.id);
                            } else {
                              onChangeSelectedMediaIds([
                                ...selectedMediaIds,
                                f.id,
                              ]);
                            }
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs border cursor-pointer ${
                            picked
                              ? "bg-indigo-600/20 border-indigo-500 text-white"
                              : "bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700"
                          }`}
                        >
                          <span className="truncate">
                            [{f.media_kind.toUpperCase()}] {f.name}
                          </span>
                          <span className="text-[11px] shrink-0 ml-2">
                            {picked ? "✓ Đã chọn" : "+ Chọn"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Tùy chọn riêng chuẩn TikTok API v2 */}
          {hasTikTokSelected && (
            <div className="rounded-xl bg-pink-500/5 border border-pink-500/25 p-4 space-y-3">
              <div className="text-xs font-semibold text-pink-300">
                Cấu hình xuất bản TikTok Content Posting API v2
              </div>
              <AppSelect
                label="Chế độ hiển thị video trên TikTok"
                value={tiktokPrivacy}
                onChange={setTiktokPrivacy}
                options={TIKTOK_PRIVACY_OPTIONS}
              />
              <div className="flex flex-wrap gap-4 pt-1 text-xs text-slate-300">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={disableComment}
                    onChange={(e) => setDisableComment(e.target.checked)}
                    className="rounded border-slate-700"
                  />
                  Tắt bình luận
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={disableDuet}
                    onChange={(e) => setDisableDuet(e.target.checked)}
                    className="rounded border-slate-700"
                  />
                  Tắt Duet
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={disableStitch}
                    onChange={(e) => setDisableStitch(e.target.checked)}
                    className="rounded border-slate-700"
                  />
                  Tắt Stitch
                </label>
              </div>
            </div>
          )}

          {/* Chế độ thời gian đăng */}
          <div className="space-y-3 pt-1">
            <label className="text-xs font-medium text-slate-300">
              Chế độ xuất bản
            </label>
            <div className="grid grid-cols-3 gap-2">
              <AppButton
                type="button"
                size="sm"
                variant={scheduleMode === "later" ? "primary" : "secondary"}
                icon={<CalendarClock className="w-3.5 h-3.5" />}
                onClick={() => setScheduleMode("later")}
              >
                Hẹn giờ tự động
              </AppButton>
              <AppButton
                type="button"
                size="sm"
                variant={scheduleMode === "now" ? "success" : "secondary"}
                icon={<Rocket className="w-3.5 h-3.5" />}
                onClick={() => setScheduleMode("now")}
              >
                Đăng ngay
              </AppButton>
              <AppButton
                type="button"
                size="sm"
                variant={scheduleMode === "draft" ? "primary" : "secondary"}
                icon={<Clock className="w-3.5 h-3.5" />}
                onClick={() => setScheduleMode("draft")}
              >
                Lưu nháp chung
              </AppButton>
            </div>

            {scheduleMode === "later" && (
              <AppInput
                label="Chọn ngày & giờ hệ thống tự động đăng bài"
                type="datetime-local"
                value={scheduledLocal}
                onChange={(e) => setScheduledLocal(e.target.value)}
                required
              />
            )}
          </div>

          <AppButton
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            disabled={submitting}
          >
            {submitting
              ? "Đang xử lý..."
              : scheduleMode === "now"
              ? "Đăng thẳng lên Kênh đã chọn ngay bây giờ"
              : scheduleMode === "later"
              ? "Xác nhận Hẹn Giờ Tự Động Đăng"
              : "Lưu Bản Nháp vào Không gian chung"}
          </AppButton>
        </form>

        {/* Cột phải: Hàng đợi Lịch tự động & Lịch sử bài đăng */}
        <div className="lg:col-span-6 rounded-2xl bg-slate-900/90 border border-slate-800 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-white">
              2. Lịch Hẹn Giờ &amp; Trạng Thái Bài Đăng ({posts.length})
            </h3>
            <span className="text-xs text-slate-400">
              Tự động quét mỗi 1 phút
            </span>
          </div>

          {posts.length === 0 ? (
            <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-8 text-center text-sm text-slate-400">
              Chưa có bài đăng nào trong lịch. Bài do bất kỳ ai trong 2 bạn lên
              lịch sẽ hiển thị đồng bộ tại đây.
            </div>
          ) : (
            <div className="space-y-3 max-h-[720px] overflow-y-auto pr-1">
              {posts.map((post) => {
                const st = STATUS_BADGE_MAP[post.status] ?? STATUS_BADGE_MAP.draft;
                const isBusy = publishingPostId === post.id;

                return (
                  <div
                    key={post.id}
                    className="rounded-xl bg-slate-950/80 border border-slate-800 p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-sm text-white">
                          {post.title || "Bài đăng không tiêu đề"}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          Lên bài bởi{" "}
                          <strong className="text-slate-300">
                            {post.created_by}
                          </strong>
                          {post.scheduled_at && (
                            <>
                              {" "}
                              • Hẹn lúc:{" "}
                              <strong className="text-amber-300">
                                {new Date(post.scheduled_at).toLocaleString(
                                  "vi-VN"
                                )}
                              </strong>
                            </>
                          )}
                        </div>
                      </div>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-medium border shrink-0 ${st.className}`}
                      >
                        {st.label}
                      </span>
                    </div>

                    {post.caption && (
                      <p className="text-xs text-slate-300 whitespace-pre-line line-clamp-3">
                        {post.caption}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-1.5">
                      {post.platforms.map((pl) => {
                        const pm = PLATFORM_META[pl];
                        return (
                          <span
                            key={pl}
                            className={`px-2 py-0.5 rounded-md text-[11px] border ${
                              pm?.badgeClass ||
                              "bg-slate-800 border-slate-700 text-slate-300"
                            }`}
                          >
                            {pm?.shortLabel || pl}
                          </span>
                        );
                      })}
                      <span className="px-2 py-0.5 rounded-md text-[11px] bg-slate-900 border border-slate-800 text-slate-400">
                        {post.media_ids.length} file media
                      </span>
                    </div>

                    {post.error_message && (
                      <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
                        Chi tiết lỗi: {post.error_message}
                      </div>
                    )}

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800/80">
                      {post.status !== "published" && (
                        <AppButton
                          variant="success"
                          size="sm"
                          disabled={isBusy}
                          icon={<Play className="w-3.5 h-3.5" />}
                          onClick={() => void handlePublishNowClick(post.id)}
                        >
                          {isBusy ? "Đang đăng..." : "Đăng ngay bây giờ"}
                        </AppButton>
                      )}
                      <AppButton
                        variant="danger"
                        size="sm"
                        icon={<Trash2 className="w-3.5 h-3.5" />}
                        onClick={() => void handleDeletePostClick(post.id)}
                      >
                        Xóa
                      </AppButton>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
