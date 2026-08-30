import type { MetadataRoute } from "next";

// ホーム画面インストール用Web App Manifest（NFR-PWA-001〜NFR-PWA-004）
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "わが家計",
    short_name: "わが家計",
    description: "家族やグループで共有できる家計簿",
    start_url: "/",
    display: "standalone",
    // theme_color/background_colorはデザイントークン--backgroundと一致させる
    theme_color: "#f7f5ef",
    background_color: "#f7f5ef",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
