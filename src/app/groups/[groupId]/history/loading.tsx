const historySkeletonRowIds = Array.from(
  { length: 6 },
  (_, index) => `history-skeleton-row-${index + 1}`,
);

export default function GroupHistoryLoading() {
  return (
    <main className="protected-shell group-home history-page" aria-busy="true">
      <div className="history-skeleton history-skeleton-header" />
      <section className="history-skeleton-list" aria-label="履歴を読み込み中">
        <div className="history-skeleton history-skeleton-controls" />
        {historySkeletonRowIds.map((rowId) => (
          <div key={rowId} className="history-skeleton history-skeleton-row" />
        ))}
      </section>
    </main>
  );
}
