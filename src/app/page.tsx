import Link from "next/link";

const implementationSteps = [
  "複数グループとメンバー管理",
  "支出登録と負担額の整合性",
  "月間カレンダーとメンバー別集計",
  "履歴の絞り込みとCSV出力",
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
          認証画面と安全なセッション境界を実装しました
        </div>
        <div className="hero-actions">
          <Link className="primary-link" href="/login">
            Googleでログイン
          </Link>
        </div>
      </section>

      <section className="roadmap" aria-labelledby="roadmap-title">
        <h2 id="roadmap-title">次に実装する機能</h2>
        <ol>
          {implementationSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>
    </main>
  );
}
