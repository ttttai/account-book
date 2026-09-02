import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), "utf8");
}

test("取引と負担行をgroup_id付きRLSテーブルとして保護する", async () => {
  const migration = await read(
    "supabase/migrations/202608270001_expense_transactions.sql",
  );

  for (const table of ["transactions", "transaction_allocations"]) {
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
      new RegExp(`revoke all on table public\\.${table}`, "i"),
    );
  }

  assert.match(
    migration,
    /transaction_allocations[\s\S]+group_id uuid not null/i,
  );
  assert.match(migration, /create_expense_transaction/i);
  assert.match(migration, /security definer/i);
  assert.match(migration, /is_allowed_google_identity/i);
  assert.match(migration, /is_active_group_member/i);
  assert.match(migration, /allocation_total <> p_amount_minor/i);
  assert.match(migration, /client_request_id/i);
  assert.doesNotMatch(migration, /grant insert on table public\.transactions/i);
});

test("支出queryとcommandをserver-only境界へ隔離する", async () => {
  const query = await read(
    "src/modules/transactions/application/get-expense-form-options.ts",
  );
  const command = await read(
    "src/modules/transactions/application/create-expense.ts",
  );

  for (const source of [query, command]) {
    assert.match(source, /import "server-only"/);
    assert.match(source, /auth\.getClaims\(\)/);
    assert.doesNotMatch(source, /SERVICE_ROLE/);
  }
  assert.match(command, /create_expense_transaction/);
});

test("支出Server ActionはFormDataを検証して認可済みcommandだけを呼ぶ", async () => {
  const action = await read("src/modules/transactions/presentation/actions.ts");

  assert.match(action, /"use server"/);
  assert.match(action, /createExpenseInputSchema\.safeParse/);
  assert.match(action, /calculateExpenseAllocations/);
  assert.match(action, /createExpense\(/);
  assert.doesNotMatch(action, /formData\.get\(["'](?:userId|createdBy|total)/);
});

test("App Routerはtransactionsモジュールの公開境界だけを使う", async () => {
  const page = await read("src/app/groups/[groupId]/transactions/new/page.tsx");

  assert.match(page, /@\/modules\/transactions\/server/);
  assert.match(page, /@\/modules\/transactions\/presentation/);
  assert.doesNotMatch(
    page,
    /@\/modules\/transactions\/(?:application|domain|infrastructure)\//,
  );
  assert.match(page, /getCurrentProfile\(\)/);
  assert.match(page, /redirect\([^)]+login/);
  assert.match(page, /notFound\(\)/);
});

test("支出カテゴリはモバイルで比較しやすいradio cardとして表示する", async () => {
  const form = await read(
    "src/modules/transactions/presentation/expense-form.tsx",
  );
  const styles = await read(
    "src/modules/transactions/presentation/transactions.module.css",
  );

  assert.match(
    form,
    /<fieldset\s+[\s\S]*?className=\{styles\["category-fieldset"\]\}[\s\S]*?>/,
  );
  assert.match(form, /name="categoryId"/);
  assert.match(form, /type="radio"/);
  assert.match(form, /className=\{styles\["category-option"\]\}/);
  // カテゴリをselectへ戻さない（同一タグ内にname="categoryId"を持つselectが無いこと）
  assert.doesNotMatch(form, /<select[^>]*\sname="categoryId"/);
  // 既定は1行の横scroll、「すべて」で展開したときだけ2列grid (TXN-015)
  assert.match(styles, /\.category-options\s*\{[^}]*overflow-x:\s*auto/s);
  assert.match(
    styles,
    /\[data-category-expanded="true"\][^{]*\.category-options\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s,
  );
  assert.match(
    styles,
    /\.category-option-content\s*{[\s\S]*min-height:\s*(?:44|4[5-9]|[5-9]\d)px/,
  );
  assert.match(
    styles,
    /\.category-option input:focus-visible \+ \.category-option-content/,
  );

  // iOS Safariのdate inputがカードからはみ出さないよう、UA appearanceを無効化する
  assert.match(
    styles,
    /\.expense-field input\[type="date"\]\s*\{[^}]*appearance:\s*none/s,
  );
});

test("負担方法は1人を先頭にして初期選択にする (AC-TXN-001-10)", async () => {
  const form = await read(
    "src/modules/transactions/presentation/expense-form.tsx",
  );

  // 表示順: 1人、均等、カスタム
  assert.match(
    form,
    /\["single", "1人"\],\s*\["equal", "均等"\],\s*\["custom", "カスタム"\]/s,
  );
  // 登録時の初期選択は常に1人で、グループの標準負担方法へ依存しない（編集時は保存済み負担から復元する）
  assert.match(
    form,
    /useState<\s*"equal" \| "single" \| "custom"\s*>\(expenseEdit\?\.allocationMethod \?\? "single"\)/s,
  );
  assert.doesNotMatch(
    form,
    /defaultAllocation === "equal"\s*\?\s*"equal"\s*:\s*"single"/,
  );
});

test("入力ドックと画面下部ナビの間に隙間を作らない (R-055, R-063)", async () => {
  const form = await read(
    "src/modules/transactions/presentation/expense-form.tsx",
  );
  const styles = await read(
    "src/modules/transactions/presentation/transactions.module.css",
  );

  // カテゴリ・テンキー・保存を1つの入力ドックへまとめ、画面下部へ固定する。
  assert.match(form, /className=\{styles\["input-dock"\]\}/);

  const dock = styles.slice(
    styles.indexOf(".input-dock {"),
    styles.indexOf("@media (min-width: 900px)"),
  );

  assert.match(dock, /position:\s*fixed/);
  // 下端を画面下端に合わせ、ナビゲーションの高さぶんを自身の不透明な背景で塗る。
  // ナビゲーションの実高に依存しないため、文字サイズが変わっても隙間が生まれない。
  assert.match(dock, /bottom:\s*0/);
  assert.match(
    dock,
    /padding-bottom:\s*calc\(4\.25rem \+ env\(safe-area-inset-bottom\)\)/,
  );
  assert.match(dock, /background:\s*var\(--surface\)/);
  // 画面下部ナビゲーション（z-index: 30）より下に重ね、ナビを隠さない。
  assert.match(dock, /z-index:\s*20/);

  // PCでは固定を解除し、既存の2カラム配置へ子要素を流し込む。
  const desktop = styles.slice(styles.indexOf("@media (min-width: 900px)"));
  assert.match(desktop, /\.input-dock\s*\{[^}]*display:\s*contents/s);
});

test("金額はOSの仮想キーボードを開かず画面内テンキーで入力する (TXN-014)", async () => {
  const form = await read(
    "src/modules/transactions/presentation/expense-form.tsx",
  );
  const keypad = await read(
    "src/modules/transactions/presentation/amount-keypad.tsx",
  );
  const keypadRules = await read(
    "src/modules/transactions/domain/amount-keypad.ts",
  );
  const styles = await read(
    "src/modules/transactions/presentation/transactions.module.css",
  );

  // OSの仮想キーボードを抑止しつつ、物理キーボードからの入力は維持する。
  assert.match(form, /inputMode="none"/);
  assert.doesNotMatch(form, /id="amountMinor"[\s\S]{0,400}readOnly/);
  // テンキーは共有部品を使い、キーは送信ボタンにしない (REC-010で定期取引と共有)。
  assert.match(form, /<AmountKeypad/);
  assert.match(
    keypad,
    /className=\{styles\["keypad-key"\]\}\s*\n?\s*[\s\S]{0,200}type="button"/,
  );
  // 桁あふれを安全な整数で判定する。
  assert.match(keypadRules, /Number\.isSafeInteger/);
  // キーは44 x 44 CSS pixel以上のタップ領域を持つ。
  assert.match(
    styles,
    /\.keypad-key\s*\{[^}]*min-height:\s*(?:44|4[5-9]|[5-9]\d)px/s,
  );
});
