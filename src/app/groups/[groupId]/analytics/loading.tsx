const analyticsSkeletonIds = [
  "analytics-skeleton-metric-1",
  "analytics-skeleton-metric-2",
  "analytics-skeleton-metric-3",
];

export default function AnalyticsLoading() {
  return (
    <main aria-busy="true" className="protected-shell analytics-page">
      <div className="analytics-skeleton analytics-skeleton-header" />
      <section
        aria-label="分析を読み込み中"
        className="analytics-skeleton-body"
      >
        {analyticsSkeletonIds.map((skeletonId) => (
          <div className="analytics-skeleton" key={skeletonId} />
        ))}
      </section>
      <p className="field-hint">この月の集計を準備しています…</p>
    </main>
  );
}
