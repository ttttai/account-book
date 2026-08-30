"use client";

export default function GroupHistoryError({
  reset,
}: Readonly<{ reset: () => void }>) {
  return (
    <main className="protected-shell group-home history-page">
      <section className="history-validation-error" role="alert">
        <p className="eyebrow">読み込みエラー</p>
        <h1>履歴を読み込めませんでした</h1>
        <p>適用中の絞り込みを維持したまま、もう一度取得できます。</p>
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
