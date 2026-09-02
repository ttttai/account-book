"use client";

export default function AnalyticsDetailsError({
  reset,
}: Readonly<{ reset: () => void }>) {
  return (
    <main className="protected-shell analytics-page">
      <section className="empty-panel" role="alert">
        <p aria-hidden="true" className="empty-icon">
          !
        </p>
        <h1>詳細分析を読み込めませんでした</h1>
        <p>
          古い統計を表示しないため、結果は空にしています。選択条件のまま再取得できます。
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
