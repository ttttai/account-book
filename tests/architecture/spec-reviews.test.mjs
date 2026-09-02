import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const reviewsDirectory = "specs/reviews";
const fileNamePattern = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const requiredHeaders = [
  "状態: ",
  "レビュー日: ",
  "ブランチ: ",
  "対象仕様: ",
  "関連ID: ",
];
const requiredSections = [
  "## 指摘",
  "## 対応",
  "## 安全性確認",
  "## 実装可能性確認",
  "## MVP範囲確認",
  "## 判定",
  "## 実装確認",
];
const allowedStates = ["下書き", "承認済み", "実装確認済み"];
const lastLegacyReviewNumber = 77;

// README以外のレビューファイル一覧を返す
async function listReviewFiles() {
  const entries = await readdir(reviewsDirectory);
  return entries.filter((entry) => entry !== "README.md");
}

test("仕様レビューは1レビュー1ファイルで日付付きの名前を持つ", async () => {
  const files = await listReviewFiles();
  assert.ok(files.length > 0, "specs/reviews/にレビューファイルが必要です");
  for (const file of files) {
    assert.match(
      file,
      fileNamePattern,
      `${file}は YYYY-MM-DD-<slug>.md の形式にする`,
    );
  }
});

test("各仕様レビューは必須項目と見出しをそろえる", async () => {
  for (const file of await listReviewFiles()) {
    const content = await readFile(`${reviewsDirectory}/${file}`, "utf8");
    for (const header of requiredHeaders) {
      assert.ok(
        content.includes(`\n${header}`),
        `${file}に「${header}」が必要です`,
      );
    }
    for (const section of requiredSections) {
      assert.ok(
        content.includes(`\n${section}\n`),
        `${file}に「${section}」が必要です`,
      );
    }
    const state = content.match(/^状態: (.+)$/m)?.[1]?.trim();
    assert.ok(
      state && allowedStates.includes(state),
      `${file}の状態は ${allowedStates.join(" / ")} のいずれかにする`,
    );
    const reviewDate = content.match(/^レビュー日: (\d{4}-\d{2}-\d{2})$/m)?.[1];
    assert.equal(
      reviewDate,
      file.slice(0, 10),
      `${file}のレビュー日はファイル名の日付と一致させる`,
    );
  }
});

test("09-spec-review.mdへ新しい連番レビューを追記しない", async () => {
  const legacy = await readFile("specs/09-spec-review.md", "utf8");
  const numbers = [...legacy.matchAll(/^### R-(\d{3})/gm)].map((match) =>
    Number(match[1]),
  );
  assert.ok(numbers.length > 0);
  assert.equal(
    Math.max(...numbers),
    lastLegacyReviewNumber,
    "R-078以降はspecs/reviews/へ1レビュー1ファイルで記録する",
  );
  assert.match(
    legacy,
    /specs\/reviews\//,
    "09-spec-review.mdの冒頭にspecs/reviews/への案内が必要です",
  );
});
