"use client";

import React, { useState } from "react";
import { Lock, Mail, Sparkles, Users } from "lucide-react";
import { AppButton, AppInput } from "@/components/ui-primitives";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";

interface AuthGateProps {
  onAuthenticated: (email: string) => void;
}

export function AuthGate({ onAuthenticated }: AuthGateProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const sb = getSupabaseClient();
    if (!sb) {
      onAuthenticated(email.trim() || "ThanhVien1@agency.vn");
      return;
    }

    if (!email.trim()) {
      setError("Vui lòng nhập email thành viên trong danh sách cho phép.");
      return;
    }

    setLoading(true);
    try {
      if (mode === "magic") {
        const { error: otpErr } = await sb.auth.signInWithOtp({
          email: email.trim(),
          options: {
            emailRedirectTo:
              typeof window !== "undefined" ? window.location.origin : undefined,
          },
        });
        if (otpErr) throw otpErr;
        setNotice(
          "Đã gửi liên kết đăng nhập 1 chạm vào hộp thư email của bạn. Vui lòng mở email để vào hệ thống."
        );
      } else {
        const { data, error: signErr } = await sb.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signErr) throw signErr;
        if (data.user?.email) {
          onAuthenticated(data.user.email);
        }
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Đăng nhập thất bại, vui lòng kiểm tra lại.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-950">
      <div className="w-full max-w-md rounded-2xl bg-slate-900/90 border border-slate-800 p-6 sm:p-8 shadow-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white">DuoAgency Hub</h1>
            <p className="text-xs text-slate-400">
              Không gian nội bộ bảo mật dành riêng cho 2 thành viên
            </p>
          </div>
        </div>

        {!isSupabaseConfigured ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-indigo-500/10 border border-indigo-500/30 p-3.5 text-xs text-indigo-200 leading-relaxed">
              <div className="font-semibold flex items-center gap-1.5 mb-1 text-indigo-300">
                <Sparkles className="w-4 h-4" />
                Đang chạy Chế độ Local Preview (Chưa gắn biến môi trường Supabase)
              </div>
              Bạn có thể trải nghiệm ngay việc tạo Folder, kéo-thả hình ảnh/video, gắn ghi chú
              nhanh và hẹn giờ bài đăng cho 2 tài khoản trước khi kết nối lên Vercel &amp; Supabase.
            </div>

            <div className="grid grid-cols-1 gap-2.5">
              <AppButton
                variant="primary"
                size="lg"
                className="w-full"
                onClick={() => onAuthenticated("ThanhVien1@agency.vn")}
              >
                Vào với tư cách Thành viên 1 (ThanhVien1@agency.vn)
              </AppButton>
              <AppButton
                variant="secondary"
                size="lg"
                className="w-full"
                onClick={() => onAuthenticated("ThanhVien2@agency.vn")}
              >
                Vào với tư cách Thành viên 2 (ThanhVien2@agency.vn)
              </AppButton>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex gap-2 p-1 rounded-xl bg-slate-950 border border-slate-800">
              <AppButton
                type="button"
                size="sm"
                variant={mode === "password" ? "primary" : "ghost"}
                className="flex-1"
                icon={<Lock className="w-3.5 h-3.5" />}
                onClick={() => setMode("password")}
              >
                Email &amp; Mật khẩu
              </AppButton>
              <AppButton
                type="button"
                size="sm"
                variant={mode === "magic" ? "primary" : "ghost"}
                className="flex-1"
                icon={<Mail className="w-3.5 h-3.5" />}
                onClick={() => setMode("magic")}
              >
                Magic Link (Không mật khẩu)
              </AppButton>
            </div>

            <AppInput
              label="Email thành viên (Đã khai báo trong bảng workspace_members)"
              type="email"
              placeholder="thanhvien1@tenmien.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            {mode === "password" && (
              <AppInput
                label="Mật khẩu"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            )}

            {error && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-300">
                {error}
              </div>
            )}

            {notice && (
              <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-300">
                {notice}
              </div>
            )}

            <AppButton
              type="submit"
              variant="primary"
              size="lg"
              className="w-full"
              disabled={loading}
            >
              {loading
                ? "Đang xác thực..."
                : mode === "magic"
                ? "Gửi link đăng nhập vào Email"
                : "Đăng nhập vào không gian chung"}
            </AppButton>
          </form>
        )}
      </div>
    </div>
  );
}
