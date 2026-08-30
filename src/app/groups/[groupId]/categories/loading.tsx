export default function CategoriesLoading() {
  return (
    <main aria-busy="true" className="protected-shell category-page">
      <div className="category-loading-bar" />
      <div className="category-loading-card" />
      <div className="category-loading-card" />
      <p className="field-hint">カテゴリ管理を準備しています…</p>
    </main>
  );
}
