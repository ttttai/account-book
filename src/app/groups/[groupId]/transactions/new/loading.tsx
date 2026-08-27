export default function NewExpenseLoading() {
  return (
    <main className="protected-shell expense-page" aria-busy="true">
      <div className="expense-loading-bar" />
      <div className="expense-loading-card" />
      <p className="field-hint">支出入力を準備しています…</p>
    </main>
  );
}
