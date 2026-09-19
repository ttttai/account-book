"use client";

export default function GroupCalendarError({
  retry,
}: Readonly<{ retry: () => void }>) {
  return (
    <main className="protected-shell group-home calendar-home-page">
      <section className="calendar-validation-error" role="alert">
        <p className="eyebrow">読み込みエラー</p>
        <h1>カレンダーを読み込めませんでした</h1>
        <p>選択中の月を維持したまま、もう一度取得できます。</p>
        <button
          className="primary-button"
          type="button"
          onClick={() => retry()}
        >
          再試行
        </button>
      </section>
    </main>
  );
}
