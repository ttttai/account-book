"use client";

export default function NewExpenseError({ reset }: { reset: () => void }) {
  return (
    <main className="protected-shell expense-page">
      <section className="empty-panel">
        <p className="empty-icon" aria-hidden="true">
          !
        </p>
        <h1>支出入力を開けませんでした</h1>
        <p>接続状態を確認して、もう一度お試しください。</p>
        <button className="primary-button" onClick={reset} type="button">
          再試行
        </button>
      </section>
    </main>
  );
}
