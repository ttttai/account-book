export default function AssetRecordLoading() {
  return (
    <main aria-busy="true" className="protected-shell asset-page">
      <div className="category-loading-bar" />
      <div className="category-loading-card" />
      <p className="field-hint">記録画面を準備しています…</p>
    </main>
  );
}
