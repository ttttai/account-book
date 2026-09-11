"use client";

// ルートのerror境界。固有のerror境界を持たない画面（招待の承認など）の読み込み失敗を、認証画面と同じカードで表示する (AC-AUTH-004-4)
export default function RootError({ reset }: Readonly<{ reset: () => void }>) {
  return (
    <main className="auth-page">
      <section
        className="auth-card"
        role="alert"
        aria-labelledby="root-error-title"
      >
        <p className="eyebrow">読み込みエラー</p>
        <h1 id="root-error-title">読み込めませんでした</h1>
        <p className="auth-introduction">
          サーバーに接続できないか、一時的な障害が起きています。しばらく待ってからもう一度お試しください。
        </p>
        <button
          className="primary-button"
          type="button"
          onClick={() => reset()}
        >
          再試行
        </button>
      </section>
    </main>
  );
}
