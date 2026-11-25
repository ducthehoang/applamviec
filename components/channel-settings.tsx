"use client";

import React, { useState } from "react";
import {
  CheckCircle2,
  HardDrive,
  KeyRound,
  Link2,
  Share2,
  Trash2,
  Video,
} from "lucide-react";
import {
  AppButton,
  AppInput,
  SectionHeader,
} from "@/components/ui-primitives";
import { connectFacebookManual, deleteChannel } from "@/lib/api";
import { isSupabaseConfigured } from "@/lib/supabase";
import { SocialChannelItem } from "@/lib/types";

interface ChannelSettingsProps {
  actorEmail: string;
  channels: SocialChannelItem[];
  onRefreshData: () => Promise<void>;
}

export function ChannelSettings({
  actorEmail,
  channels,
  onRefreshData,
}: ChannelSettingsProps) {
  const [fbPageId, setFbPageId] = useState("");
  const [fbPageName, setFbPageName] = useState("");
  const [fbPageToken, setFbPageToken] = useState("");
  const [savingFb, setSavingFb] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const driveChannel = channels.find((c) => c.provider === "google_drive");
  const fbChannel = channels.find((c) => c.provider === "facebook_page");
  const tiktokChannel = channels.find((c) => c.provider === "tiktok");

  function startGoogleDriveOAuth() {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
    if (!clientId) {
      setError(
        "Chưa điền NEXT_PUBLIC_GOOGLE_CLIENT_ID trên Vercel / .env.local. Xem chi tiết trong file docs/HUONG_DAN_API_VA_DEPLOY.md."
      );
      return;
    }
    const redirectUri = `${window.location.origin}/oauth/google-drive`;
    const scope = encodeURIComponent(
      "https://www.googleapis.com/auth/drive.file email profile"
    );
    const authUrl =
      `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(
        clientId
      )}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code&access_type=offline&prompt=consent&scope=${scope}`;
    window.location.href = authUrl;
  }

  function startFacebookOAuth() {
    const appId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID || "";
    if (!appId) {
      setError(
        "Chưa điền NEXT_PUBLIC_FACEBOOK_APP_ID. Bạn có thể dán trực tiếp Page ID + Page Access Token ở khung bên dưới để chạy ngay không cần chờ duyệt OAuth!"
      );
      return;
    }
    const redirectUri = `${window.location.origin}/oauth/facebook`;
    const scope = encodeURIComponent(
      "pages_show_list,pages_read_engagement,pages_manage_posts,publish_video"
    );
    const authUrl =
      `https://www.facebook.com/v22.0/dialog/oauth?client_id=${encodeURIComponent(
        appId
      )}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code&scope=${scope}`;
    window.location.href = authUrl;
  }

  function startTikTokOAuth() {
    const clientKey = process.env.NEXT_PUBLIC_TIKTOK_CLIENT_KEY || "";
    if (!clientKey) {
      setError(
        "Chưa điền NEXT_PUBLIC_TIKTOK_CLIENT_KEY trên Vercel / .env.local. Xem hướng dẫn lấy Client Key trong docs/HUONG_DAN_API_VA_DEPLOY.md."
      );
      return;
    }
    const redirectUri = `${window.location.origin}/oauth/tiktok`;
    const scope = encodeURIComponent("user.info.basic,video.publish,video.upload");
    const csrfState = Math.random().toString(36).substring(2, 12);
    const authUrl =
      `https://www.tiktok.com/v2/auth/authorize/?client_key=${encodeURIComponent(
        clientKey
      )}` +
      `&scope=${scope}&response_type=code` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}&state=${csrfState}`;
    window.location.href = authUrl;
  }

  async function handleSaveManualFacebook(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!fbPageId.trim() || !fbPageToken.trim()) {
      setError("Vui lòng nhập đủ Page ID và Page Access Token dài hạn.");
      return;
    }
    setSavingFb(true);
    try {
      await connectFacebookManual({
        page_id: fbPageId.trim(),
        page_name: fbPageName.trim(),
        page_access_token: fbPageToken.trim(),
        actorEmail,
      });
      setFbPageToken("");
      setNotice(
        "Đã liên kết Fanpage thành công! Giờ cả 2 tài khoản đều có thể đăng bài và hẹn giờ trực tiếp vào Fanpage này."
      );
      await onRefreshData();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Lỗi kết nối Fanpage Facebook"
      );
    } finally {
      setSavingFb(false);
    }
  }

  async function handleDisconnect(ch: SocialChannelItem) {
    if (
      !window.confirm(`Ngắt kết nối kênh "${ch.account_name}" khỏi hệ thống?`)
    ) {
      return;
    }
    try {
      await deleteChannel(ch.id);
      await onRefreshData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Lỗi ngắt kết nối");
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Kết Nối Kho Google Drive 15GB, Fanpage Facebook & TikTok API"
        subtitle="Chỉ cần 1 người bấm liên kết tại đây — cả 2 thành viên trong Agency sẽ dùng chung kho lưu trữ và đăng bài vào chung 1 Fanpage / TikTok."
      />

      {error && (
        <div className="rounded-xl bg-rose-500/15 border border-rose-500/30 p-3.5 text-xs text-rose-200">
          {error}
        </div>
      )}

      {notice && (
        <div className="rounded-xl bg-emerald-500/15 border border-emerald-500/30 p-3.5 text-xs text-emerald-200">
          {notice}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 1. Google Drive 15GB */}
        <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-5 flex flex-col justify-between gap-5">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <HardDrive className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-white text-sm">
                  1. Kho Google Drive Chung (15GB Miễn phí)
                </h3>
                <p className="text-xs text-slate-400">
                  Lưu ảnh gốc độ phân giải cao &amp; video TikTok nặng
                </p>
              </div>
            </div>

            {driveChannel ? (
              <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3 text-xs text-emerald-200 space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  Đã kết nối: {driveChannel.account_name}
                </div>
                <div className="text-emerald-300/80">
                  Kết nối bởi {driveChannel.connected_by}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400 leading-relaxed">
                Hệ thống tự động tạo thư mục gốc{" "}
                <code className="text-slate-200">DuoAgency_Hub_Media</code>{" "}
                trên Google Drive của bạn và dùng Resumable Upload để tải video
                vài trăm MB không giới hạn bởi Vercel.
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <AppButton
              variant="primary"
              size="md"
              className="flex-1"
              icon={<Link2 className="w-4 h-4" />}
              disabled={!isSupabaseConfigured}
              onClick={startGoogleDriveOAuth}
            >
              {driveChannel
                ? "Đổi tài khoản Google Drive"
                : "Kết nối Google Drive OAuth"}
            </AppButton>
            {driveChannel && (
              <AppButton
                variant="danger"
                size="md"
                icon={<Trash2 className="w-4 h-4" />}
                onClick={() => void handleDisconnect(driveChannel)}
              />
            )}
          </div>
        </div>

        {/* 2. Facebook Fanpage */}
        <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-5 flex flex-col justify-between gap-5">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
                <Share2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-white text-sm">
                  2. Facebook Fanpage Chung (Graph API v22.0)
                </h3>
                <p className="text-xs text-slate-400">
                  2 tài khoản cùng đăng Ảnh, Album ảnh, Video &amp; Reels
                </p>
              </div>
            </div>

            {fbChannel ? (
              <div className="rounded-xl bg-blue-500/10 border border-blue-500/30 p-3 text-xs text-blue-200 space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  Fanpage: {fbChannel.account_name} (ID: {fbChannel.account_id})
                </div>
                <div className="text-blue-300/80">
                  Kết nối bởi {fbChannel.connected_by}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400 leading-relaxed">
                Hỗ trợ kết nối 1 chạm qua Facebook Login OAuth hoặc dán trực tiếp{" "}
                <strong className="text-slate-200">
                  Non-Expiring Page Access Token
                </strong>{" "}
                từ Meta Developer để chạy ngay lập tức.
              </p>
            )}

            <form
              onSubmit={handleSaveManualFacebook}
              className="space-y-2.5 pt-2 border-t border-slate-800"
            >
              <div className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-indigo-400" />
                Cách nhanh nhất: Gắn thẳng Page ID &amp; Page Token vĩnh viễn
              </div>
              <AppInput
                placeholder="Facebook Page ID (VD: 1049283746192)"
                value={fbPageId}
                onChange={(e) => setFbPageId(e.target.value)}
              />
              <AppInput
                placeholder="Tên hiển thị Fanpage (Tùy chọn)"
                value={fbPageName}
                onChange={(e) => setFbPageName(e.target.value)}
              />
              <AppInput
                type="password"
                placeholder="Page Access Token (EAA...)"
                value={fbPageToken}
                onChange={(e) => setFbPageToken(e.target.value)}
              />
              <AppButton
                type="submit"
                variant="secondary"
                size="sm"
                className="w-full"
                disabled={savingFb}
              >
                {savingFb ? "Đang kiểm tra Token..." : "Lưu Token Fanpage"}
              </AppButton>
            </form>
          </div>

          <div className="flex items-center gap-2">
            <AppButton
              variant="primary"
              size="md"
              className="flex-1"
              icon={<Link2 className="w-4 h-4" />}
              disabled={!isSupabaseConfigured}
              onClick={startFacebookOAuth}
            >
              Đăng nhập Facebook OAuth
            </AppButton>
            {fbChannel && (
              <AppButton
                variant="danger"
                size="md"
                icon={<Trash2 className="w-4 h-4" />}
                onClick={() => void handleDisconnect(fbChannel)}
              />
            )}
          </div>
        </div>

        {/* 3. TikTok Content Posting API v2 */}
        <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-5 flex flex-col justify-between gap-5">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-pink-500/15 border border-pink-500/30 flex items-center justify-center text-pink-400">
                <Video className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-white text-sm">
                  3. TikTok Content Posting API v2
                </h3>
                <p className="text-xs text-slate-400">
                  Hỗ trợ cả Direct Post (Tự động đăng) &amp; Đẩy vào Nháp Inbox
                </p>
              </div>
            </div>

            {tiktokChannel ? (
              <div className="rounded-xl bg-pink-500/10 border border-pink-500/30 p-3 text-xs text-pink-200 space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  Đã kết nối kênh: {tiktokChannel.account_name}
                </div>
                <div className="text-pink-300/80">
                  Tự động gia hạn Refresh Token bởi Backend Rust
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-xs text-slate-400 leading-relaxed">
                <p>
                  Backend Rust tự động đọc video từ Google Drive rồi bắn Chunked
                  Upload sang máy chủ TikTok v2, kèm cơ chế tự làm mới{" "}
                  <code className="text-slate-200">refresh_token</code> trước khi
                  hết hạn 24h.
                </p>
                <p className="text-amber-300/90">
                  Lưu ý: Khi TikTok App đang ở chế độ Sandbox/Chưa duyệt Audit,
                  hãy chọn quyền hiển thị <strong>Chỉ mình tôi (SELF_ONLY)</strong>{" "}
                  hoặc chọn <strong>TikTok Nháp</strong> để đẩy video về điện
                  thoại chèn nhạc trend.
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <AppButton
              variant="primary"
              size="md"
              className="flex-1"
              icon={<Link2 className="w-4 h-4" />}
              disabled={!isSupabaseConfigured}
              onClick={startTikTokOAuth}
            >
              {tiktokChannel ? "Kết nối lại TikTok" : "Ủy quyền TikTok OAuth v2"}
            </AppButton>
            {tiktokChannel && (
              <AppButton
                variant="danger"
                size="md"
                icon={<Trash2 className="w-4 h-4" />}
                onClick={() => void handleDisconnect(tiktokChannel)}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
