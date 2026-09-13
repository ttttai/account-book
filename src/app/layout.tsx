import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import {
  getThemePreference,
  resolveDocumentTheme,
  resolveThemeColor,
} from "@/modules/theme/server";

import "./styles.css";

export const metadata: Metadata = {
  title: "わが家計",
  description: "家族やグループで共有できる家計簿",
};

// ブラウザUIの色を配色の選択に追従させる (NFR-UI-010, NFR-PWA-002)。
// OSに従うときは両テーマのmeta 2件、明示選択ではその--backgroundの1件。ライトはmanifestのtheme_colorと同じ値
export async function generateViewport(): Promise<Viewport> {
  const preference = await getThemePreference();
  return {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    themeColor: resolveThemeColor(preference),
  };
}

type RootLayoutProps = Readonly<{ children: ReactNode }>;

// 全画面共通のルートレイアウト（日本語設定、共通スタイル、cookieの配色選択をdata-themeへ反映）
export default async function RootLayout({ children }: RootLayoutProps) {
  const preference = await getThemePreference();
  return (
    <html data-theme={resolveDocumentTheme(preference)} lang="ja">
      <body>{children}</body>
    </html>
  );
}
