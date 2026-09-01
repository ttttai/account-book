import { expect, type Page } from "@playwright/test";

export type ExpenseInput = Readonly<{
  groupId: string;
  amount: number;
  categoryName: string;
  /** 負担方法。指定しない場合は画面の初期選択（1人）を使う */
  allocation?: "single" | "equal";
  /** 均等負担で選択するメンバー表示名。未指定なら初期選択を維持する */
  equalMemberNames?: readonly string[];
  transactionDate?: string;
  memo?: string;
}>;

// radio本体は1x1px・不透明度0で隠れているため、fieldset内のlabel文字をクリックして選ぶ
async function chooseInFieldset(
  page: Page,
  legend: string,
  option: string,
): Promise<void> {
  const fieldset = page.getByRole("group", { name: legend });
  await fieldset.getByText(option, { exact: true }).click();
  await expect(
    fieldset.getByRole("radio", { name: option, exact: true }),
  ).toBeChecked();
}

// テンキーで金額を入力する。利用者と同じ操作でTXN-014の入力経路を通す
async function enterAmountWithKeypad(
  page: Page,
  amount: number,
): Promise<void> {
  // 金額欄をタップしてからテンキーを操作する（欄のタップで開く実装にも対応する）
  await page.getByLabel("金額").click();
  for (const digit of String(amount)) {
    await page.getByRole("button", { name: digit, exact: true }).click();
  }
  await expect(page.getByLabel("金額")).toHaveValue(String(amount));
}

// グループを作成し、作成されたグループIDを返す
export async function createGroup(page: Page, name: string): Promise<string> {
  await page.goto("/app");
  await page.getByLabel("グループ名").fill(name);
  await page.getByRole("button", { name: "グループを作成" }).click();
  await page.waitForURL(/\/groups\/[0-9a-f-]{36}(\?|$)/);

  const groupId = new URL(page.url()).pathname.split("/")[2];
  expect(groupId).toMatch(/^[0-9a-f-]{36}$/);
  return groupId;
}

// 取引入力画面から支出を登録し、成功後のホーム遷移まで待つ
export async function registerExpense(
  page: Page,
  input: ExpenseInput,
): Promise<void> {
  await page.goto(`/groups/${input.groupId}/transactions/new`);

  if (input.transactionDate) {
    await page.getByLabel("使った日").fill(input.transactionDate);
  }

  await enterAmountWithKeypad(page, input.amount);

  // モバイル幅は1行表示のため展開してから選ぶ。広い画面は全件表示で展開操作を持たない
  const expandToggle = page.getByRole("button", { name: "すべて" });
  if (await expandToggle.isVisible()) await expandToggle.click();
  await chooseInFieldset(page, "カテゴリ", input.categoryName);

  // 選択済みカテゴリを選び直した場合は展開が残る。テンキーと保存操作へ戻す
  const collapseToggle = page.getByRole("button", { name: "閉じる" });
  if (await collapseToggle.isVisible()) await collapseToggle.click();

  if (input.allocation === "equal") {
    await chooseInFieldset(page, "負担方法", "均等");
    // 均等はアクティブメンバー全員を負担者に選ぶ (TXN-007)
    const allocationFieldset = page.getByRole("group", { name: "負担方法" });
    for (const memberName of input.equalMemberNames ?? []) {
      await expect(
        allocationFieldset.getByRole("checkbox", {
          name: memberName,
          exact: true,
        }),
      ).toBeChecked();
    }
  }

  if (input.memo) {
    await page.getByLabel("メモ（任意）").fill(input.memo);
  }

  await page.getByRole("button", { name: "支出を保存" }).click();
  await page.waitForURL(new RegExp(`/groups/${input.groupId}(\\?|$)`));
}

// owner・admin向けの招待リンクを作成し、共有URLを返す
export async function createInvitationLink(
  page: Page,
  groupId: string,
  role: "管理者" | "メンバー" = "メンバー",
): Promise<string> {
  await page.goto(`/groups/${groupId}/members`);
  await page.getByLabel("参加後の権限").selectOption({ label: role });
  await page.getByRole("button", { name: "招待リンクを作成" }).click();

  const shareLink = page.getByLabel("共有リンク");
  await expect(shareLink).toBeVisible();
  const shareUrl = await shareLink.inputValue();
  expect(shareUrl).toContain("/invitations/accept#token=");
  return shareUrl;
}

// 招待リンクを開いて参加する。参加後は対象グループのホームへ遷移する
export async function acceptInvitation(
  page: Page,
  shareUrl: string,
): Promise<void> {
  await page.goto(shareUrl);
  await page.getByRole("button", { name: "このグループに参加" }).click();
  // 参加成立後の遷移先は招待作成者と同じグループ配下（メンバー一覧）になる
  await page.waitForURL(/\/groups\/[0-9a-f-]{36}/);
}

// 月・集計対象を明示したホームカレンダーを開く（実行日に依存させない）
export async function openCalendar(
  page: Page,
  groupId: string,
  query: Readonly<{
    month: string;
    scope?: string;
    member?: string;
    day?: string;
  }>,
): Promise<void> {
  const search = new URLSearchParams({
    month: query.month,
    scope: query.scope ?? "group",
  });
  if (query.member) search.set("member", query.member);
  if (query.day) search.set("day", query.day);
  await page.goto(`/groups/${groupId}?${search.toString()}`);
}

// グループのタイムゾーン（Asia/Tokyo）における今日の日付
export function todayInGroupTimezone(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// 今日の日付が属する月（YYYY-MM）
export function currentMonthInGroupTimezone(): string {
  return todayInGroupTimezone().slice(0, 7);
}
