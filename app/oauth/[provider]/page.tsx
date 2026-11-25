"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { AppButton } from "@/components/ui-primitives";
import { exchangeOAuthCode } from "@/lib/api";

function OAuthCallbackInner() {
  const params = useParams<{ provider: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading"
  );
  const [message, setMessage] = useState(
    "Đang xác thực mã ủy quyền với Backend Rust..."
  );

  useEffect(() => {
    const provider = params.provider as
      | "google-drive"
      | "facebook"
      | "tiktok"
      | undefined;
    const code = searchParams.get("code");
    const errParam =
      searchParams.get("error_description") || searchParams.get("error");

    if (errParam) {
      setStatus("error");
      setMessage(`Từ chối hoặc lỗi từ nhà cung cấp OAuth: ${errParam}`);
      return;
    }

    if (
      !provider ||
      !["google-drive", "facebook", "tiktok"].includes(provider)
    ) {
      setStatus("error");
      setMessage("Nhà cung cấp OAuth không hợp lệ.");
      return;
    }

    if (!code) {
      setStatus("error");
      setMessage("Không tìm thấy mã ủy quyền (code) trên đường dẫn callback.");
      return;
    }

    const redirectUri = `${window.location.origin}/oauth/${provider}`;
    exchangeOAuthCode(provider, code, redirectUri)
      .then(() => {
        setStatus("success");
        setMessage(
          "Đã liên kết tài khoản thành công! Đang đưa bạn quay về không gian làm việc..."
        );
        setTimeout(() => {
          router.replace("/");
        }, 1500);
      })
      .catch((err: unknown) => {
        setStatus("error");
        setMessage(
          err instanceof Error
            ? err.message
            : "Lỗi trao đổi OAuth Token với Backend Rust."
        );
      });
  }, [params.provider, router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-950">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 text-center space-y-4">
        {status === "loading" && (
          <Loader2 className="w-10 h-10 text-indigo-400 animate-spin mx-auto" />
        )}
        {status === "success" && (
          <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
        )}
        {status === "error" && (
          <XCircle className="w-10 h-10 text-rose-400 mx-auto" />
        )}

        <h1 className="text-lg font-semibold text-white">
          Kết nối OAuth ({params.provider})
        </h1>
        <p className="text-sm text-slate-300 leading-relaxed">{message}</p>

        <AppButton
          variant="secondary"
          size="md"
          onClick={() => router.replace("/")}
        >
          Quay về Trang chủ ngay
        </AppButton>
      </div>
    </div>
  );
}

export default function OAuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400 text-sm">
          Đang xử lý phản hồi ủy quyền...
        </div>
      }
    >
      <OAuthCallbackInner />
    </Suspense>
  );
}
