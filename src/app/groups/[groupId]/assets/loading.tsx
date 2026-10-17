export default function AssetsLoading() {
  return (
    <main aria-busy="true" className="protected-shell asset-page">
      <div className="category-loading-bar" />
      <div className="category-loading-card" />
      <p className="field-hint">資産推移を準備しています…</p>
    </main>
  );
}
