const loadingPanelIds = ["profile", "management", "summary", "session"];

export default function SettingsLoading() {
  return (
    <main className="protected-shell settings-page" aria-busy="true">
      <div className="settings-loading-heading" />
      <div className="settings-grid">
        {loadingPanelIds.map((panelId) => (
          <div className="settings-loading-panel" key={panelId} />
        ))}
      </div>
    </main>
  );
}
