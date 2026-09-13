import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./styles.css";

export const metadata: Metadata = {
  title: "わが家計",
  description: "家族やグループで共有できる家計簿",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // ブラウザUIの色を両テーマの--backgroundへ追従させる (NFR-UI-010, NFR-PWA-002)。
  // ライトはmanifestのtheme_colorと同じ値にする
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f5ef" },
    { media: "(prefers-color-scheme: dark)", color: "#151a17" },
  ],
};

type RootLayoutProps = Readonly<{ children: ReactNode }>;

// 全画面共通のルートレイアウト（日本語設定と共通スタイルの適用）
export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
