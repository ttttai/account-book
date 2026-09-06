export default function RecurringTransactionsLoading() {
  return (
    <main aria-busy="true" className="protected-shell recurring-page">
      <div className="category-loading-bar" />
      <div className="category-loading-card" />
      <p className="field-hint">固定費を準備しています…</p>
    </main>
  );
}
