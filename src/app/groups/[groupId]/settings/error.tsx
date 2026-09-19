"use client";

export default function SettingsError({ retry }: { retry: () => void }) {
  return (
    <main className="protected-shell settings-page">
      <section className="settings-panel settings-error" role="alert">
        <p className="eyebrow">読み込みエラー</p>
        <h1>設定を表示できませんでした</h1>
        <p>通信状態を確認して、もう一度お試しください。</p>
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
