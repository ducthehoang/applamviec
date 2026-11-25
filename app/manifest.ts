import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DuoAgency Hub - Quản lý Media & Đăng bài Tự động",
    short_name: "DuoAgency",
    description:
      "Không gian chia sẻ Folder ảnh/video tốc độ cao và hẹn giờ đăng tự động Facebook Fanpage & TikTok cho 2 thành viên.",
    start_url: "/",
    display: "standalone",
    background_color: "#020617",
    theme_color: "#4f46e5",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
