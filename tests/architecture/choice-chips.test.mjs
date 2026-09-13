import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), "utf8");
}

test("選択肢chipはsrc/modules/uiの共有部品として公開し、semanticsとタップ領域を維持する (AC-GRP-001-6, AC-TXN-001-11)", async () => {
  const index = await read("src/modules/ui/index.ts");
  assert.match(
    index,
    /export \{ ChoiceChip, ChoiceChipList \} from ".\/presentation\/choice-chip"/,
  );

  const chip = await read("src/modules/ui/presentation/choice-chip.tsx");
  // HTMLのradio/checkboxをそのまま使い、name・value・checkedを送信と状態管理に使う
  assert.match(chip, /type: "radio" \| "checkbox"/);
  assert.match(chip, /type=\{type\}/);
  assert.match(chip, /name=\{name\}/);
  assert.match(chip, /value=\{value\}/);
  assert.match(chip, /checked=\{checked\}/);
  assert.match(chip, /defaultChecked=\{defaultChecked\}/);
  // 選択記号はアクセシブル名へ含めない
  assert.match(
    chip,
    /aria-hidden="true"[^>]*className=\{styles\["choice-chip-mark"\]\}/s,
  );
  assert.match(chip, /import styles from ".\/ui\.module\.css"/);

  const css = await read("src/modules/ui/presentation/ui.module.css");
  // chip全体を44 x 44 CSS pixel以上のタップ領域にする
  assert.match(
    css,
    /\.choice-chip-content\s*\{[^}]*min-height:\s*(?:44|4[5-9]|[5-9]\d)px/s,
  );
  // inputはdisplay: noneにせず視覚的に隠し、キーボードとfocus-visibleを維持する
  assert.match(css, /\.choice-chip-input\s*\{[^}]*opacity:\s*0/s);
  assert.doesNotMatch(css, /\.choice-chip-input\s*\{[^}]*display:\s*none/s);
  assert.match(
    css,
    /\.choice-chip-input:focus-visible \+ \.choice-chip-content\s*\{[^}]*outline/s,
  );
  // 選択状態は枠・背景・選択記号で示す（色だけに依存しない）
  assert.match(
    css,
    /\.choice-chip-input:checked \+ \.choice-chip-content\s*\{[^}]*border-color/s,
  );
  assert.match(
    css,
    /\.choice-chip-input:checked \+ \.choice-chip-content \.choice-chip-mark/,
  );
  // 複数選択の記号は角丸の四角にする
  assert.match(
    css,
    /\[type="checkbox"\][^{]*\.choice-chip-mark\s*\{[^}]*border-radius/s,
  );
  // 幅に収まらない分は折り返し、320pxで横scrollを出さない
  assert.match(css, /\.choice-chip-list\s*\{[^}]*flex-wrap:\s*wrap/s);
});

test("取引入力・固定費・グループ作成・グループ設定はOS標準のcheckbox/radioを表示せず選択肢chipを使う (AC-TXN-001-11, AC-REC-003-3, AC-GRP-001-6, AC-GRP-013-8)", async () => {
  const expenseForm = await read(
    "src/modules/transactions/presentation/expense-form.tsx",
  );
  const recurring = await read(
    "src/modules/recurring/presentation/recurring-management.tsx",
  );
  const groupForms = await read(
    "src/modules/groups/presentation/group-forms.tsx",
  );
  const groupSettings = await read(
    "src/modules/groups/presentation/group-settings-form.tsx",
  );

  for (const source of [expenseForm, recurring, groupForms, groupSettings]) {
    // 公開エントリーポイント経由で共有部品を使う
    assert.match(
      source,
      /import \{ ChoiceChip, ChoiceChipList \} from "@\/modules\/ui"/,
    );
    assert.doesNotMatch(source, /@\/modules\/ui\/presentation/);
  }

  // メンバー選択は同じname・valueのcheckboxのまま
  assert.match(
    expenseForm,
    /<ChoiceChip\s[\s\S]*?name="selectedMemberIds"[\s\S]*?type="checkbox"/,
  );
  assert.doesNotMatch(expenseForm, /<input[^>]*type="checkbox"/s);
  assert.match(
    recurring,
    /<ChoiceChip\s[\s\S]*?name="selectedMemberIds"[\s\S]*?type="checkbox"/,
  );
  assert.doesNotMatch(recurring, /<input[^>]*type="checkbox"/s);

  // 週の開始曜日・標準の分け方はradioのまま
  for (const source of [groupForms, groupSettings]) {
    assert.match(
      source,
      /<ChoiceChip\s[\s\S]*?name="weekStartsOn"[\s\S]*?type="radio"/,
    );
    assert.match(
      source,
      /<ChoiceChip\s[\s\S]*?name="defaultAllocation"[\s\S]*?type="radio"/,
    );
    assert.doesNotMatch(source, /<input[^>]*type="radio"/s);
  }

  // OS標準部品を露出していた旧セレクタを残さない (§14)
  const transactionsCss = await read(
    "src/modules/transactions/presentation/transactions.module.css",
  );
  const recurringCss = await read(
    "src/modules/recurring/presentation/recurring.module.css",
  );
  const groupsCss = await read(
    "src/modules/groups/presentation/groups.module.css",
  );
  assert.doesNotMatch(transactionsCss, /\.check-option/);
  assert.doesNotMatch(recurringCss, /\.recurring-check\b/);
  assert.doesNotMatch(groupsCss, /\.radio-option/);
});

test("選択肢chipの規則を画面仕様と受け入れ条件へ記録している", async () => {
  const screenSpec = await read("specs/03-screen-specification.md");
  assert.match(screenSpec, /### 選択肢chip/);
  assert.match(screenSpec, /src\/modules\/ui/);

  const useCases = await read("specs/02-use-cases.md");
  for (const id of [
    "AC-GRP-001-6",
    "AC-TXN-001-11",
    "AC-REC-003-3",
    "AC-GRP-013-8",
  ]) {
    assert.match(useCases, new RegExp(`\`${id}\``));
  }

  const testPlan = await read("specs/07-acceptance-test-plan.md");
  assert.match(testPlan, /chip型の選択肢が320px・375pxで欠けず/);
});
