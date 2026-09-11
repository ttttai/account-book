"use client";

// ホーム（/app）のerror境界。バックエンド障害でもログイン画面へ遷移せず、loading・確定後と同じshellで再試行を表示する (AC-AUTH-004-4)
export default function ProtectedAppError({
  reset,
}: Readonly<{ reset: () => void }>) {
  return (
    <main className="protected-shell groups-overview">
      <section
        className="load-error-panel"
        role="alert"
        aria-labelledby="app-error-title"
      >
        <p className="eyebrow">読み込みエラー</p>
        <h1 id="app-error-title">ホームを読み込めませんでした</h1>
        <p>
          サーバーに接続できないか、一時的な障害が起きています。ログアウトはされていません。しばらく待ってからもう一度お試しください。
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
