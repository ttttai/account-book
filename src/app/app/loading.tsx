const groupSkeletonCardIds = Array.from(
  { length: 2 },
  (_, index) => `groups-skeleton-card-${index + 1}`,
);

// ホーム（/app）のroute-level loading。認証済み起動の直後に全面白の状態を作らないよう、
// プロフィール・グループ一覧の取得完了を待たずに確定後と同じ配置のskeletonを返す (AC-AUTH-001-13)
export default function ProtectedAppLoading() {
  return (
    <main className="protected-shell groups-overview" aria-busy="true">
      <header className="app-header groups-skeleton-header">
        <div className="groups-skeleton groups-skeleton-title" />
        <div className="groups-skeleton groups-skeleton-action" />
      </header>
      <section
        className="profile-panel groups-skeleton-panel"
        aria-label="プロフィールを読み込み中"
      >
        <div className="groups-skeleton groups-skeleton-heading" />
        <div className="groups-skeleton groups-skeleton-field" />
      </section>
      <section
        className="groups-skeleton-list"
        aria-label="グループ一覧を読み込み中"
      >
        {groupSkeletonCardIds.map((cardId) => (
          <div key={cardId} className="groups-skeleton groups-skeleton-card" />
        ))}
      </section>
      <section className="empty-panel groups-skeleton-panel">
        <div className="groups-skeleton groups-skeleton-heading" />
        <div className="groups-skeleton groups-skeleton-field" />
      </section>
    </main>
  );
}
