export default function AssetCategoriesLoading() {
  return (
    <main aria-busy="true" className="protected-shell asset-page">
      <div className="category-loading-bar" />
      <div className="category-loading-card" />
      <p className="field-hint">資産区分を準備しています…</p>
    </main>
  );
}
