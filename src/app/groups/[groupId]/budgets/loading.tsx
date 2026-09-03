export default function BudgetsLoading() {
  return (
    <main aria-busy="true" className="protected-shell budget-page">
      <div className="category-loading-bar" />
      <div className="category-loading-card" />
      <p className="field-hint">予算を準備しています…</p>
    </main>
  );
}
