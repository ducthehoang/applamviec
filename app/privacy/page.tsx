"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { BackButton, SectionHeader } from "@/components/ui-primitives";

export default function PrivacyPolicyPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-slate-950 py-10 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto space-y-6 rounded-2xl bg-slate-900/90 border border-slate-800 p-6 sm:p-8">
        <SectionHeader
          title="Chính Sách Bảo Mật (Privacy Policy)"
          subtitle="Cập nhật lần cuối: 2026 — Áp dụng cho công cụ quản lý nội bộ DuoAgency Hub"
          actions={<BackButton onClick={() => router.push("/")} />}
        />

        <div className="space-y-4 text-sm text-slate-300 leading-relaxed">
          <p>
            <strong>DuoAgency Hub</strong> là ứng dụng web nội bộ phục vụ lưu
            trữ tư liệu hình ảnh/video và lên lịch xuất bản nội dung chính thức
            lên các trang mạng xã hội thuộc quyền quản trị của đội ngũ vận hành
            (bao gồm Google Drive API, Meta/Facebook Graph API và TikTok Content
            Posting API).
          </p>

          <h3 className="text-base font-semibold text-white pt-2">
            1. Dữ liệu chúng tôi thu thập và xử lý
          </h3>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              Địa chỉ email xác thực của các thành viên nội bộ được cấp quyền
              trong danh sách cho phép (Whitelist).
            </li>
            <li>
              Mã thông báo ủy quyền OAuth 2.0 (Access Token &amp; Refresh Token)
              của Google Drive, Facebook Fanpage và TikTok do chính quản trị
              viên kết nối chủ động để thực hiện tải tệp và xuất bản bài đăng
              theo lịch hẹn.
            </li>
            <li>
              Siêu dữ liệu tệp hình ảnh/video (tên tệp, dung lượng, ảnh thu nhỏ)
              và nội dung bài viết do thành viên tự khởi tạo.
            </li>
          </ul>

          <h3 className="text-base font-semibold text-white pt-2">
            2. Mục đích sử dụng và bảo vệ dữ liệu
          </h3>
          <p>
            Toàn bộ dữ liệu và mã thông báo kết nối chỉ được dùng duy nhất cho
            mục đích đồng bộ thư mục tư liệu và đăng tải nội dung theo lệnh của
            quản trị viên. Chúng tôi tuyệt đối không bán, không chia sẻ hay cung
            cấp bất kỳ dữ liệu nào cho bên thứ ba ngoài các API chính thức của
            Google, Meta và TikTok khi thực hiện lệnh xuất bản.
          </p>

          <h3 className="text-base font-semibold text-white pt-2">
            3. Quyền thu hồi kết nối và xóa dữ liệu
          </h3>
          <p>
            Quản trị viên có thể ngắt kết nối và xóa ngay lập tức toàn bộ OAuth
            Token khỏi cơ sở dữ liệu bất cứ lúc nào ngay trong mục{" "}
            <strong>Kết nối API</strong> của ứng dụng, hoặc thu hồi quyền truy
            cập trực tiếp trong phần Cài đặt Bảo mật của tài khoản Google,
            Facebook và TikTok.
          </p>
        </div>
      </div>
    </div>
  );
}
