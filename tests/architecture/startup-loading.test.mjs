import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), "utf8");
}

// AC-AUTH-001-13 認証済み起動で必ず通るホーム（/app）にroute-level loadingを置き、全面白の状態を作らない
test("ホーム（/app）はデータ取得完了を待たずにskeletonを返す (AC-AUTH-001-13)", async () => {
  const loading = await read("src/app/app/loading.tsx");
  const page = await read("src/app/app/page.tsx");
  const styles = await read("src/app/styles.css");

  // 確定後の画面と同じshellを使い、375px・1280pxのカラム構成を保つ
  assert.match(loading, /className="protected-shell groups-overview"/);
  assert.match(page, /className="protected-shell groups-overview"/);
  assert.match(loading, /aria-busy="true"/);
  assert.match(loading, /groups-skeleton/);

  // skeletonへ操作可能な要素と家計データ・認証情報を置かない
  assert.doesNotMatch(loading, /<button|<a |<form|<input|<Link/);
  assert.doesNotMatch(loading, /@\/modules\/|server-only|supabase|cookies/);

  // skeleton styleはroute shellと同じglobal stylesで管理する（NFR-MNT-010）
  assert.match(styles, /\.groups-skeleton\s*\{/);
  assert.match(styles, /\.groups-skeleton-header/);
  assert.match(styles, /\.groups-skeleton-card/);
});

test("仕様・テスト計画に起動直後のskeleton表示を記録する", async () => {
  const useCases = await read("specs/02-use-cases.md");
  const screens = await read("specs/03-screen-specification.md");
  const testPlan = await read("specs/07-acceptance-test-plan.md");
  const review = await read("specs/09-spec-review.md");

  assert.match(useCases, /^- `AC-AUTH-001-13`/m);
  assert.match(screens, /route-level loadingを先に表示/);
  assert.match(testPlan, /AC-AUTH-001-13/);
  assert.match(review, /### R-077/);
});
