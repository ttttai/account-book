import Link from "next/link";
import type { ReactNode } from "react";

// 認証系画面共通のレイアウト（ブランド表示と説明文付きのカード枠）
export function AuthShell({
  title,
  introduction,
  children,
}: {
  title: string;
  introduction: string;
  children: ReactNode;
}) {
  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <Link className="brand-link" href="/">
          わが家計
        </Link>
        <p className="eyebrow">共有できる、迷わない家計簿</p>
        <h1 id="auth-title">{title}</h1>
        <p className="auth-introduction">{introduction}</p>
        {children}
      </section>
    </main>
  );
}
