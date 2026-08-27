const calendarSkeletonCellIds = Array.from(
  { length: 42 },
  (_, index) => `calendar-skeleton-cell-${index + 1}`,
);

export default function GroupCalendarLoading() {
  return (
    <main
      className="protected-shell group-home calendar-home-page"
      aria-busy="true"
    >
      <div className="calendar-skeleton calendar-skeleton-header" />
      <section
        className="calendar-card calendar-skeleton"
        aria-label="カレンダーを読み込み中"
      >
        <div className="calendar-skeleton-title" />
        <div className="calendar-skeleton-total" />
        <div className="calendar-skeleton-grid">
          {calendarSkeletonCellIds.map((cellId) => (
            <span key={cellId} />
          ))}
        </div>
      </section>
    </main>
  );
}
