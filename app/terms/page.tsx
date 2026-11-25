"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { BackButton, SectionHeader } from "@/components/ui-primitives";

export default function TermsOfServicePage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-slate-950 py-10 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto space-y-6 rounded-2xl bg-slate-900/90 border border-slate-800 p-6 sm:p-8">
        <SectionHeader
          title="Điều Khoản Dịch Vụ (Terms of Service)"
          subtitle="Cập nhật lần cuối: 2026 — Điều khoản vận hành DuoAgency Hub"
          actions={<BackButton onClick={() => router.push("/")} />}
        />

        <div className="space-y-4 text-sm text-slate-300 leading-relaxed">
          <h3 className="text-base font-semibold text-white">
            1. Phạm vi sử dụng
          </h3>
          <p>
            <strong>DuoAgency Hub</strong> được thiết kế riêng cho các thành
            viên quản trị được ủy quyền của Agency nhằm lưu trữ hình ảnh, video
            và quản lý lịch xuất bản nội dung lên Facebook Fanpage và TikTok.
          </p>

          <h3 className="text-base font-semibold text-white pt-2">
            2. Trách nhiệm về nội dung xuất bản
          </h3>
          <p>
            Người dùng chịu hoàn toàn trách nhiệm đảm bảo mọi hình ảnh, âm
            thanh, video và văn bản tải lên hoặc hẹn giờ đăng qua hệ thống tuân
            thủ đầy đủ Tiêu chuẩn Cộng đồng và Điều khoản Nền tảng của{" "}
            <strong>Meta (Facebook)</strong>, <strong>TikTok</strong> và{" "}
            <strong>Google</strong>, cũng như quy định về bản quyền sở hữu trí
            tuệ.
          </p>

          <h3 className="text-base font-semibold text-white pt-2">
            3. Quyền kiểm soát của nhà sáng tạo trên TikTok &amp; Facebook
          </h3>
          <p>
            Trước mỗi lần xuất bản hoặc hẹn giờ, người vận hành luôn chủ động
            kiểm tra và lựa chọn rõ ràng kênh đích, chế độ hiển thị quyền riêng
            tư (Công khai, Bạn bè, Người theo dõi hoặc Chỉ mình tôi) và quyền
            tương tác (Bình luận, Duet, Stitch) theo đúng quy chuẩn tích hợp
            TikTok Content Posting API v2 và Meta Graph API.
          </p>
        </div>
      </div>
    </div>
  );
}
