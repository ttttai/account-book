const detailSkeletons = ["filter", "summary", "trend", "category"];

export default function AnalyticsDetailsLoading() {
  return (
    <main aria-busy="true" className="protected-shell analytics-page">
      <div className="analytics-skeleton analytics-skeleton-header" />
      <section
        aria-label="詳細分析を読み込み中"
        className="analytics-skeleton-body"
      >
        {detailSkeletons.map((id) => (
          <div className="analytics-skeleton" key={id} />
        ))}
      </section>
      <p className="field-hint">期間の統計を準備しています…</p>
    </main>
  );
}
