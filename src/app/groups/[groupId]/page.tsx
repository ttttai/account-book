import Link from "next/link";
import { notFound } from "next/navigation";

import { listMyGroups } from "@/modules/groups/server";

type GroupPageProps = Readonly<{ params: Promise<{ groupId: string }> }>;

export default async function GroupPage({ params }: GroupPageProps) {
  const { groupId } = await params;
  const groups = await listMyGroups();
  const group = groups.find((candidate) => candidate.id === groupId);
  if (!group) notFound();

  return (
    <main className="protected-shell group-home">
      <header className="app-header">
        <div>
          <p className="eyebrow">家計グループ</p>
          <h1 className="group-page-title">{group.name}</h1>
        </div>
        <Link className="text-link" href="/app">
          グループ一覧
        </Link>
      </header>
      <section className="empty-panel" aria-labelledby="calendar-title">
        <p className="empty-icon" aria-hidden="true">
          暦
        </p>
        <h2 id="calendar-title">月間カレンダー</h2>
        <p>
          グループの作成が完了しました。次の段階で支出登録と月間カレンダーを追加します。
        </p>
        <dl className="group-settings-summary">
          <div>
            <dt>通貨</dt>
            <dd>{group.currency}</dd>
          </div>
          <div>
            <dt>タイムゾーン</dt>
            <dd>{group.timezone}</dd>
          </div>
          <div>
            <dt>週の開始</dt>
            <dd>{group.weekStartsOn === 0 ? "日曜日" : "月曜日"}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
