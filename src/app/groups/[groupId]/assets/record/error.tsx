"use client";

export default function AssetRecordError({
  retry,
}: Readonly<{ retry: () => void }>) {
  return (
    <main className="protected-shell asset-page">
      <section className="empty-panel" role="alert">
        <p aria-hidden="true" className="empty-icon">
          !
        </p>
        <h1>資産の記録を開けませんでした</h1>
        <p>接続状態を確認して、もう一度お試しください。</p>
        <button
          className="primary-button"
          onClick={() => retry()}
          type="button"
        >
          再試行
        </button>
      </section>
    </main>
  );
}
