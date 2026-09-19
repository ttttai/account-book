import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), "utf8");
}

// src/modules配下のTS/TSXファイルを再帰的に列挙する
async function listModuleSources(dir = "src/modules") {
  const entries = await readdir(new URL(`${dir}/`, root), {
    withFileTypes: true,
  });
  const files = [];
  for (const entry of entries) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...(await listModuleSources(path)));
    } else if (/\.tsx?$/.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

test("取引のServer Actionは成功時にredirectせず、遷移先と通知内容を返す (TXN-019, AC-TXN-019-1〜3)", async () => {
  const actions = await read(
    "src/modules/transactions/presentation/actions.ts",
  );
  assert.doesNotMatch(actions, /\bredirect\(/);
  assert.doesNotMatch(actions, /from "next\/navigation"/);
  // 未使用だった?created=を残さない
  assert.doesNotMatch(actions, /created=/);
  assert.match(actions, /loadTransactionSaveFeedback\(/);
  assert.match(actions, /status: "success"/);
  // 削除は削除前に行を読む
  const deleteIndex = actions.indexOf(
    "export async function deleteTransactionAction",
  );
  const deleteBody = actions.slice(deleteIndex);
  assert.ok(
    deleteBody.indexOf("loadTransactionSaveFeedback(") <
      deleteBody.indexOf("deleteTransaction("),
    "削除Actionは行を削除する前に通知内容を読む",
  );

  const state = await read(
    "src/modules/transactions/presentation/action-state.ts",
  );
  assert.match(state, /"idle" \| "error" \| "success"/);
  assert.match(state, /redirectTo: string/);
});

test("通知内容はサーバーが保存済みの行から純関数で組み立てる (AC-TXN-019-3)", async () => {
  const loader = await read(
    "src/modules/transactions/application/load-transaction-save-feedback.ts",
  );
  assert.match(loader, /import "server-only"/);
  assert.match(loader, /\.eq\("group_id", /);
  assert.match(loader, /buildTransactionSaveFeedback\(/);

  const domain = await read("src/modules/transactions/domain/save-feedback.ts");
  assert.doesNotMatch(domain, /server-only|supabase|react/i);
  for (const banned of ["負担", "支払者", "支払額", "内訳"]) {
    assert.ok(!domain.includes(banned), `文面に「${banned}」を含めない`);
  }
});

test("フォームは成功結果を受けて通知を表示してから遷移し、保存を無効に保つ (AC-TXN-019-1, AC-TXN-019-3)", async () => {
  for (const path of [
    "src/modules/transactions/presentation/expense-form.tsx",
    "src/modules/transactions/presentation/delete-transaction-form.tsx",
  ]) {
    const source = await read(path);
    assert.match(source, /import \{ useRouter \} from "next\/navigation"/);
    assert.match(source, /showSaveFeedback/);
    assert.match(source, /from "@\/modules\/ui"/);
    assert.match(source, /router\.push\(/);
    assert.doesNotMatch(source, /from "sonner"/);
  }
});

test("Toasterはルートレイアウトに1つだけ置き、共有部品src/modules/uiから公開する (03 §6 保存結果のトースト)", async () => {
  const layout = await read("src/app/layout.tsx");
  assert.match(
    layout,
    /import \{ SaveFeedbackToaster \} from "@\/modules\/ui"/,
  );
  assert.equal((layout.match(/<SaveFeedbackToaster \/>/g) ?? []).length, 1);

  const index = await read("src/modules/ui/index.ts");
  assert.match(index, /SaveFeedbackToaster/);
  assert.match(index, /showSaveFeedback/);

  const toaster = await read(
    "src/modules/ui/presentation/save-feedback-toast.tsx",
  );
  assert.match(toaster, /^"use client";/);
  assert.match(toaster, /position="top-center"/);
  assert.match(toaster, /visibleToasts=\{1\}/);
  assert.match(toaster, /duration=\{4000\}/);
  assert.match(toaster, /closeButton\b/);
  assert.match(toaster, /customAriaLabel="保存結果の通知"/);
  assert.match(toaster, /closeButtonAriaLabel: "通知を閉じる"/);
  assert.match(toaster, /safe-area-inset-top/);
  assert.match(toaster, /toast\.dismiss\(\)/);

  // sonnerを直接importするのは共有部品だけ
  for (const path of await listModuleSources()) {
    if (path.startsWith("src/modules/ui/")) continue;
    const source = await read(path);
    assert.doesNotMatch(
      source,
      /from "sonner"/,
      `${path} はsonnerを直接importしない`,
    );
  }

  const pkg = JSON.parse(await read("package.json"));
  assert.ok(pkg.dependencies.sonner, "sonnerをdependenciesへ追加する");
});

test("トーストの色・時間・閉じるボタンはCSS Modulesでtokenと44pxへ上書きする (AC-TXN-019-4, AC-TXN-019-5)", async () => {
  const css = await read("src/modules/ui/presentation/ui.module.css");
  assert.match(css, /\.toast-region/);
  assert.match(css, /--normal-bg: var\(--surface\)/);
  assert.match(css, /--normal-text: var\(--text\)/);
  assert.match(css, /--normal-border: var\(--border\)/);
  const closeButton = css.match(/\[data-close-button\]\)\s*\{([^}]*)\}/);
  assert.ok(closeButton, "閉じるボタンの規則がある");
  assert.match(closeButton[1], /width: 44px/);
  assert.match(closeButton[1], /height: 44px/);
  // 出現・消失はmotion tokenで200ms以下にする
  const toastRule = css.match(/:global\(\[data-sonner-toast\]\)\s*\{([^}]*)\}/);
  assert.ok(toastRule, "トースト本体の規則がある");
  assert.match(toastRule[1], /var\(--motion-duration-medium\)/);
  assert.match(toastRule[1], /var\(--motion-ease-out\)/);
});

test("仕様にTXN-019とレビュー記録がある", async () => {
  const requirements = await read("specs/01-product-requirements.md");
  assert.match(requirements, /^- `TXN-019` /m);
  const useCases = await read("specs/02-use-cases.md");
  for (let index = 1; index <= 6; index += 1) {
    assert.match(useCases, new RegExp(`^- \`AC-TXN-019-${index}\` `, "m"));
  }
  const screens = await read("specs/03-screen-specification.md");
  assert.match(screens, /^### 保存結果のトースト/m);
  await read("specs/reviews/2026-09-19-transaction-save-toast.md");
});
