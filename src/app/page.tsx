import Link from "next/link";

const implementationSteps = [
  "Googleアカウントでの安全なログイン",
  "複数グループとメンバー招待",
  "支払者と負担額を分けた支出登録",
  "次は月間カレンダーとメンバー別集計",
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
          グループ共有と支出登録を利用できます
        </div>
        <div className="hero-actions">
          <Link className="primary-link" href="/login">
            Googleでログイン
          </Link>
        </div>
      </section>

      <section className="roadmap" aria-labelledby="roadmap-title">
        <h2 id="roadmap-title">MVPの現在地</h2>
        <ol>
          {implementationSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>
    </main>
  );
}
