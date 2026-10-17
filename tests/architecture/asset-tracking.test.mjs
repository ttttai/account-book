import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
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

async function listFiles(directory) {
  const entries = await readdir(new URL(directory, root), {
    withFileTypes: true,
  });
  const files = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? listFiles(`${directory}/${entry.name}`)
        : [`${directory}/${entry.name}`],
    ),
  );
  return files.flat();
}

const migrationPath = "supabase/migrations/202610150001_asset_tracking.sql";
const tables = ["asset_categories", "asset_snapshots", "asset_snapshot_values"];

test("資産推移の仕様を正本として承認記録に紐付ける (AST-001〜AST-012)", async () => {
  const specification = await read("specs/17-asset-tracking.md");
  const requirements = await read("specs/01-product-requirements.md");
  const useCases = await read("specs/02-use-cases.md");
  const review = await read("specs/reviews/2026-10-15-asset-tracking-spec.md");
  const readme = await read("specs/README.md");

  assert.match(specification, /状態: (承認済み|実装済み)/);
  assert.match(specification, /buildAssetTrendSeries/);
  assert.match(requirements, /^- `AST-001`/m);
  assert.match(requirements, /^- `AST-012`/m);
  assert.match(useCases, /^- `AC-AST-001-1`/m);
  assert.match(useCases, /^- `AC-AST-012-1`/m);
  assert.match(review, /状態: (承認済み|実装確認済み)/);
  assert.match(readme, /17-asset-tracking\.md/);
});

test("資産テーブルをgroup_id付きRLSテーブルとして保護し、更新はDB関数だけにする (AC-AST-001-2)", async () => {
  const migration = await read(migrationPath);

  for (const table of tables) {
    assert.match(
      migration,
      new RegExp(
        `create table public\\.${table}[\\s\\S]*?group_id uuid not null`,
        "i",
      ),
    );
    assert.match(
      migration,
      new RegExp(
        `alter table public\\.${table} enable row level security`,
        "i",
      ),
    );
    assert.match(
      migration,
      new RegExp(`alter table public\\.${table} force row level security`, "i"),
    );
    assert.match(
      migration,
      new RegExp(
        `revoke all on table public\\.${table}\\s+from public, anon, authenticated`,
        "i",
      ),
    );
    assert.match(
      migration,
      new RegExp(
        `grant select on table public\\.${table} to authenticated`,
        "i",
      ),
    );
    assert.doesNotMatch(
      migration,
      new RegExp(
        `grant (?:insert|update|delete)[^;]*public\\.${table}[^;]*authenticated`,
        "i",
      ),
    );
  }

  // 内訳は複合外部キーで同じグループの資産記録・所属・資産区分へ固定する
  assert.match(
    migration,
    /references public\.asset_snapshots \(id, group_id\) on delete cascade/,
  );
  assert.match(migration, /references public\.group_members \(id, group_id\)/);
  assert.match(
    migration,
    /references public\.asset_categories \(id, group_id\)/,
  );
  // security definer関数はsearch_pathを空文字に固定する
  const definers =
    migration.match(/security definer\s+set search_path = ''/g) ?? [];
  assert.ok(definers.length >= 10);
  // 楽観的ロックの競合は40001で返さない（PostgRESTの自動再試行を避ける）
  assert.doesNotMatch(migration, /serialization_failure/);
});

test("資産moduleはserver-onlyと公開エントリーポイントの境界を守る", async () => {
  assert.equal(await exists("src/modules/assets/index.ts"), true);
  const server = await read("src/modules/assets/server.ts");
  assert.match(server, /^import "server-only";/);

  const applicationFiles = (await listFiles("src/modules/assets/application"))
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
    .filter((file) => !file.endsWith("-types.ts"));
  for (const file of applicationFiles) {
    assert.match(await read(file), /^import "server-only";/m, file);
  }

  // 純関数はClient Componentからも呼ぶため、server-onlyを含めない
  const domain = await read("src/modules/assets/domain/asset-trend.ts");
  assert.doesNotMatch(domain, /server-only/);

  // 他機能のimportは公開エントリーポイント経由にする
  const sources = (await listFiles("src/modules/assets")).filter((file) =>
    /\.(ts|tsx)$/.test(file),
  );
  for (const file of sources) {
    const source = await read(file);
    for (const match of source.matchAll(
      /from "@\/modules\/([a-z-]+)\/([^"]+)"/g,
    )) {
      assert.ok(
        ["server", "presentation"].includes(match[2]),
        `${file}: @/modules/${match[1]}/${match[2]}`,
      );
    }
  }

  // 推移の切替はClient Componentのローカル状態だけで行い、Server Actionを呼ばない (AC-AST-008-1)
  const trendScreen = await read(
    "src/modules/assets/presentation/asset-trend-screen.tsx",
  );
  assert.doesNotMatch(trendScreen, /from "\.\/actions"/);
  assert.match(trendScreen, /buildAssetTrendSeries/);
});

test("資産推移へ分析画面・設定ハブ・共通ナビゲーションから到達できる (§16)", async () => {
  const navigation = await read(
    "src/modules/groups/presentation/group-navigation.tsx",
  );
  const settings = await read("src/app/groups/[groupId]/settings/page.tsx");
  const overview = await read(
    "src/modules/analytics/presentation/analytics-overview.tsx",
  );
  const details = await read(
    "src/modules/analytics/presentation/analytics-details-view.tsx",
  );

  assert.match(
    navigation,
    /`\$\{groupBase\}\/analytics`, `\$\{groupBase\}\/assets`/,
  );
  assert.match(navigation, /`\$\{groupBase\}\/asset-categories`/);
  assert.match(settings, /asset-categories/);
  assert.match(overview, /\/assets`\}>資産推移を見る/);
  assert.match(details, /資産推移を見る/);
  for (const route of ["assets", "assets/record", "asset-categories"]) {
    for (const file of ["page.tsx", "loading.tsx", "error.tsx"]) {
      assert.equal(
        await exists(`src/app/groups/[groupId]/${route}/${file}`),
        true,
        `${route}/${file}`,
      );
    }
  }
});

// CSSの宣言ブロックを取り出す。見つからなければ空文字
function cssBlock(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
}

test("記録画面の見出しをカード内へ収め、月別の選択行に左端の帯を付けない (AC-AST-010-4)", async () => {
  const css = await read("src/modules/assets/presentation/assets.module.css");
  const form = await read(
    "src/modules/assets/presentation/asset-record-form.tsx",
  );
  // legendはWebKitで枠線の上へ描かれるため、見出しを要素で置いてaria-labelledbyで名付ける
  assert.doesNotMatch(form, /<legend/);
  assert.match(
    form,
    /aria-labelledby=\{`\$\{fieldId\}-\$\{member\.memberId\}-heading`\}/,
  );
  const heading = cssBlock(css, ".asset-member-heading");
  assert.match(heading, /border-bottom:/, "見出しと金額欄を区切る");
  const selected = cssBlock(css, '.asset-month-select[aria-pressed="true"]');
  assert.match(selected, /background:/);
  assert.doesNotMatch(selected, /box-shadow/);
});
