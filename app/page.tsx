"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarRange,
  FolderKanban,
  LogOut,
  RefreshCw,
  Settings2,
  Users,
} from "lucide-react";
import { AuthGate } from "@/components/auth-gate";
import { ChannelSettings } from "@/components/channel-settings";
import { MediaVault } from "@/components/media-vault";
import { PostComposerCalendar } from "@/components/post-composer-calendar";
import { AppButton } from "@/components/ui-primitives";
import {
  fetchChannels,
  fetchFiles,
  fetchFolders,
  fetchPosts,
} from "@/lib/api";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";
import {
  FolderItem,
  MediaFileItem,
  ScheduledPostItem,
  SocialChannelItem,
} from "@/lib/types";

type ActiveTab = "vault" | "composer" | "settings";

export default function HomePage() {
  const [actorEmail, setActorEmail] = useState<string | null>(null);
  const [bootingAuth, setBootingAuth] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>("vault");

  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [files, setFiles] = useState<MediaFileItem[]>([]);
  const [posts, setPosts] = useState<ScheduledPostItem[]>([]);
  const [channels, setChannels] = useState<SocialChannelItem[]>([]);
  const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const sb = getSupabaseClient();
    if (!sb) {
      const savedDemoActor =
        typeof window !== "undefined"
          ? localStorage.getItem("duoagency_demo_actor")
          : null;
      if (savedDemoActor) {
        setActorEmail(savedDemoActor);
      }
      setBootingAuth(false);
      return;
    }

    sb.auth.getSession().then(({ data }) => {
      setActorEmail(data.session?.user?.email ?? null);
      setBootingAuth(false);
    });

    const { data: listener } = sb.auth.onAuthStateChange((_event, session) => {
      setActorEmail(session?.user?.email ?? null);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const loadWorkspaceData = useCallback(async () => {
    if (!actorEmail) return;
    setRefreshing(true);
    try {
      const [fList, mList, pList, cList] = await Promise.all([
        fetchFolders(),
        fetchFiles(),
        fetchPosts(),
        fetchChannels(),
      ]);
      setFolders(fList);
      setFiles(mList);
      setPosts(pList);
      setChannels(cList);
    } catch (err) {
      console.error("Lỗi đồng bộ dữ liệu không gian làm việc:", err);
    } finally {
      setRefreshing(false);
    }
  }, [actorEmail]);

  useEffect(() => {
    if (actorEmail) {
      void loadWorkspaceData();
    }
  }, [actorEmail, loadWorkspaceData]);

  function handleAuthenticated(email: string) {
    if (!isSupabaseConfigured && typeof window !== "undefined") {
      localStorage.setItem("duoagency_demo_actor", email);
    }
    setActorEmail(email);
  }

  async function handleSignOut() {
    const sb = getSupabaseClient();
    if (sb) {
      await sb.auth.signOut();
    } else if (typeof window !== "undefined") {
      localStorage.removeItem("duoagency_demo_actor");
    }
    setActorEmail(null);
  }

  function handleToggleSelectMedia(id: string) {
    setSelectedMediaIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  if (bootingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400 text-sm">
        Đang khởi tạo không gian làm việc DuoAgency Hub...
      </div>
    );
  }

  if (!actorEmail) {
    return <AuthGate onAuthenticated={handleAuthenticated} />;
  }

  const scheduledCount = posts.filter((p) => p.status === "scheduled").length;

  return (
    <div className="min-h-screen flex flex-col bg-slate-950">
      {/* Thanh điều hướng cố định trên cùng */}
      <header className="sticky top-0 z-40 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/90">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-sm">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold text-sm sm:text-base text-white leading-tight">
                DuoAgency Hub
              </div>
              <div className="text-[11px] text-slate-400 truncate max-w-[180px] sm:max-w-xs">
                Đang thao tác:{" "}
                <strong className="text-indigo-300">{actorEmail}</strong>
              </div>
            </div>
          </div>

          {/* 3 Tab chức năng chính */}
          <nav className="hidden md:flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800">
            <AppButton
              variant={activeTab === "vault" ? "primary" : "ghost"}
              size="sm"
              icon={<FolderKanban className="w-4 h-4" />}
              onClick={() => setActiveTab("vault")}
            >
              Kho Folder &amp; Media ({files.length})
            </AppButton>
            <AppButton
              variant={activeTab === "composer" ? "primary" : "ghost"}
              size="sm"
              icon={<CalendarRange className="w-4 h-4" />}
              onClick={() => setActiveTab("composer")}
            >
              Đăng Bài &amp; Hẹn Giờ FB/TikTok
              {scheduledCount > 0 ? ` (${scheduledCount})` : ""}
            </AppButton>
            <AppButton
              variant={activeTab === "settings" ? "primary" : "ghost"}
              size="sm"
              icon={<Settings2 className="w-4 h-4" />}
              onClick={() => setActiveTab("settings")}
            >
              Kết Nối Drive / Fanpage / TikTok
            </AppButton>
          </nav>

          {/* Nút đồng bộ & Chuyển nhanh tài khoản (Local Demo) / Đăng xuất */}
          <div className="flex items-center gap-2">
            {!isSupabaseConfigured && (
              <AppButton
                variant="secondary"
                size="sm"
                onClick={() => {
                  const nextActor =
                    actorEmail === "ThanhVien1@agency.vn"
                      ? "ThanhVien2@agency.vn"
                      : "ThanhVien1@agency.vn";
                  handleAuthenticated(nextActor);
                }}
                title="Đổi nhanh giữa Thành viên 1 và Thành viên 2 để kiểm thử"
              >
                Đổi sang TV{" "}
                {actorEmail === "ThanhVien1@agency.vn" ? "2" : "1"}
              </AppButton>
            )}
            <AppButton
              variant="secondary"
              size="sm"
              icon={
                <RefreshCw
                  className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`}
                />
              }
              onClick={() => void loadWorkspaceData()}
            >
              Làm mới
            </AppButton>
            <AppButton
              variant="ghost"
              size="sm"
              icon={<LogOut className="w-3.5 h-3.5" />}
              onClick={() => void handleSignOut()}
            >
              Thoát
            </AppButton>
          </div>
        </div>

        {/* Thanh điều hướng trên điện thoại */}
        <div className="flex md:hidden px-4 pb-2.5 gap-1.5 overflow-x-auto">
          <AppButton
            variant={activeTab === "vault" ? "primary" : "secondary"}
            size="sm"
            icon={<FolderKanban className="w-3.5 h-3.5" />}
            onClick={() => setActiveTab("vault")}
          >
            Kho Media
          </AppButton>
          <AppButton
            variant={activeTab === "composer" ? "primary" : "secondary"}
            size="sm"
            icon={<CalendarRange className="w-3.5 h-3.5" />}
            onClick={() => setActiveTab("composer")}
          >
            Đăng FB/TikTok
          </AppButton>
          <AppButton
            variant={activeTab === "settings" ? "primary" : "secondary"}
            size="sm"
            icon={<Settings2 className="w-3.5 h-3.5" />}
            onClick={() => setActiveTab("settings")}
          >
            Kết nối API
          </AppButton>
        </div>
      </header>

      {/* Nội dung chính */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {activeTab === "vault" && (
          <MediaVault
            actorEmail={actorEmail}
            folders={folders}
            files={files}
            selectedMediaIds={selectedMediaIds}
            onToggleSelectMedia={handleToggleSelectMedia}
            onClearSelection={() => setSelectedMediaIds([])}
            onPushToComposer={() => setActiveTab("composer")}
            onRefreshData={loadWorkspaceData}
          />
        )}

        {activeTab === "composer" && (
          <PostComposerCalendar
            actorEmail={actorEmail}
            files={files}
            posts={posts}
            channels={channels}
            selectedMediaIds={selectedMediaIds}
            onChangeSelectedMediaIds={setSelectedMediaIds}
            onRefreshData={loadWorkspaceData}
          />
        )}

        {activeTab === "settings" && (
          <ChannelSettings
            actorEmail={actorEmail}
            channels={channels}
            onRefreshData={loadWorkspaceData}
          />
        )}
      </main>

      {/* Chân trang kèm link Pháp lý bắt buộc để nộp xét duyệt TikTok & Meta Developer */}
      <footer className="border-t border-slate-900 py-5 px-4 sm:px-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            DuoAgency Hub — Rust Serverless (Vercel) + Next.js PWA + Supabase
            PostgreSQL + Google Drive API
          </span>
          <div className="flex items-center gap-4">
            <Link
              href="/privacy"
              className="hover:text-slate-300 transition-colors"
            >
              Chính sách bảo mật (Privacy Policy)
            </Link>
            <Link
              href="/terms"
              className="hover:text-slate-300 transition-colors"
            >
              Điều khoản dịch vụ (Terms of Service)
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
