"use client";

export default function AnalyticsError({
  reset,
}: Readonly<{ reset: () => void }>) {
  return (
    <main className="protected-shell analytics-page">
      <section className="empty-panel" role="alert">
        <p aria-hidden="true" className="empty-icon">
          !
        </p>
        <h1>分析を読み込めませんでした</h1>
        <p>
          古い集計結果を表示しないため、値は空にしています。選択中の月のまま、もう一度取得できます。
        </p>
        <button
          className="primary-button"
          onClick={() => reset()}
          type="button"
        >
          再試行
        </button>
      </section>
    </main>
  );
}
