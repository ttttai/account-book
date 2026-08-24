const implementationSteps = [
  "認証と安全なセッション境界",
  "複数グループとメンバー管理",
  "支出登録と負担額の整合性",
  "月間カレンダーとメンバー別集計",
];

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero" aria-labelledby="page-title">
        <p className="eyebrow">共有できる、迷わない家計簿</p>
        <h1 id="page-title">わが家計</h1>
        <p className="lead">
          夫婦やグループで、誰が支払い、誰がどれだけ利用したかを分かりやすく記録します。
        </p>
        <div className="status" role="status">
          <span aria-hidden="true" className="status-dot" />
          開発基盤の準備ができました
        </div>
      </section>

      <section className="roadmap" aria-labelledby="roadmap-title">
        <h2 id="roadmap-title">これから実装する機能</h2>
        <ol>
          {implementationSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>
    </main>
  );
}
