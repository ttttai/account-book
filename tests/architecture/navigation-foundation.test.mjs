import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), "utf8");
}

async function exists(path) {
  try {
    await stat(new URL(path, root));
    return true;
  } catch {
    return false;
  }
}

test("グループ配下を共通layoutと5項目ナビゲーションで包む", async () => {
  assert.equal(await exists("src/app/groups/[groupId]/layout.tsx"), true);

  const layout = await read("src/app/groups/[groupId]/layout.tsx");
  const navigation = await read(
    "src/modules/groups/presentation/group-navigation.tsx",
  );

  assert.match(layout, /params: Promise<\{ groupId: string \}>/);
  assert.match(layout, /<GroupNavigation groupId=\{groupId\}/);
  assert.match(layout, /@\/modules\/groups\/presentation/);
  assert.doesNotMatch(layout, /getGroup|supabase|fetch\(/);

  assert.match(navigation, /^"use client";/m);
  assert.match(navigation, /usePathname\(\)/);
  assert.match(navigation, /aria-label="グループ内ナビゲーション"/);
  assert.match(navigation, /aria-current=\{isActive \? "page"/);
  for (const label of ["ホーム", "履歴", "入力", "分析", "設定"]) {
    assert.match(navigation, new RegExp(`label: "${label}"`));
  }
  assert.doesNotMatch(navigation, /label: "メンバー"/);
});

test("設定配下の画面を設定項目の現在地として扱う", async () => {
  const navigation = await read(
    "src/modules/groups/presentation/group-navigation.tsx",
  );

  assert.match(navigation, /\/settings/);
  assert.match(navigation, /\/members/);
  assert.match(navigation, /\/categories/);
  assert.match(navigation, /\/recurring-transactions/);
});

test("分析項目から概要分析へ1タップで移動する (NAV-001)", async () => {
  const navigation = await read(
    "src/modules/groups/presentation/group-navigation.tsx",
  );

  assert.match(navigation, /label: "分析"/);
  assert.match(navigation, /\$\{groupBase\}\/analytics/);
});

test("設定ハブへ管理機能の入口を集約する", async () => {
  assert.equal(
    await exists("src/app/groups/[groupId]/settings/page.tsx"),
    true,
  );

  const settings = await read("src/app/groups/[groupId]/settings/page.tsx");

  assert.match(settings, /getCurrentProfile\(\)/);
  assert.match(settings, /getGroupMembership\(groupId\)/);
  assert.match(settings, /<ProfileForm/);
  assert.match(settings, /<LogoutForm/);
  assert.match(settings, /\/members/);
  assert.match(settings, /\/categories/);
  assert.match(settings, /\/exports\/transactions\.csv/);
  // 所属1件でも一覧・作成へ到達できるよう、明示的な導線は一覧表示を指定する (AC-GRP-011-3)
  assert.match(settings, /href="\/app\?view=groups"/);
  assert.doesNotMatch(
    settings,
    /SERVICE_ROLE|@\/modules\/.+\/(?:application|infrastructure)\//,
  );
});

test("モバイル下部配置とdesktopサイド配置をsafe area付きで定義する", async () => {
  const styles = await read("src/app/styles.css");
  const groupsStyles = await read(
    "src/modules/groups/presentation/groups.module.css",
  );

  assert.match(
    groupsStyles,
    /\.group-navigation\s*\{[^}]*position:\s*fixed;[^}]*bottom:\s*0;/s,
  );
  assert.match(
    groupsStyles,
    /\.group-navigation\s*\{[^}]*env\(safe-area-inset-bottom\)/s,
  );
  assert.match(
    groupsStyles,
    /\.group-navigation-link\s*\{[^}]*min-height:\s*44px;/s,
  );
  assert.match(
    groupsStyles,
    /@media \(min-width: 900px\)[\s\S]*\.group-navigation\s*\{[^}]*position:\s*sticky;/s,
  );
  assert.match(styles, /\.group-route-layout\s*\{[^}]*min-height:\s*100dvh;/s);
});

test("375pxホームでカレンダーを初期viewportへ優先配置する", async () => {
  const page = await read("src/app/groups/[groupId]/page.tsx");
  const styles = await read("src/app/styles.css");
  const calendarStyles = await read(
    "src/modules/calendar/presentation/calendar.module.css",
  );

  assert.doesNotMatch(page, /header-links|group-primary-actions/);
  assert.match(page, /calendar-home-header/);
  assert.match(styles, /\.calendar-home-page\s*\{[^}]*min-height:\s*100dvh;/s);
  assert.match(
    calendarStyles,
    /\.calendar-cell\s*\{[^}]*calc\(\(100dvh[^}]*\/ 6\)/s,
  );
  assert.match(calendarStyles, /@media \(max-height: 700px\)/);
});

test("並行実装画面では共通ナビゲーションと重複するheader導線だけを隠す", async () => {
  const styles = await read("src/app/styles.css");

  assert.match(
    styles,
    /\.group-route-layout \.history-page > \.app-header \.header-links,/,
  );
  assert.match(
    styles,
    /\.group-route-layout \.member-page > \.app-header > \.text-link,/,
  );
  assert.match(
    styles,
    /\.group-route-layout \.category-page > \.app-header > \.text-link\s*\{[^}]*display:\s*none;/s,
  );
  assert.doesNotMatch(
    styles,
    /\.group-route-layout[^{}]*(history-controls|member-administration|category-manager)[^{}]*\{[^}]*display:\s*none;/s,
  );
});
