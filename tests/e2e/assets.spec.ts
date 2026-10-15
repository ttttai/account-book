import {
  createGroup,
  currentMonthInGroupTimezone,
} from "./support/app-actions";
import { expect, test } from "./support/fixtures";

// 前月（YYYY-MM）
function previousMonth(month: string): string {
  const [year = 0, monthNumber = 1] = month.split("-").map(Number);
  return monthNumber === 1
    ? `${year - 1}-12`
    : `${year}-${String(monthNumber - 1).padStart(2, "0")}`;
}

function monthLabel(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return `${year}年${monthNumber}月`;
}

// E2E-016 資産の記録・前月コピー・推移表示・削除
// （AST-001〜AST-010、AC-AST-002-1、AC-AST-003-1、AC-AST-004-2、AC-AST-004-3、AC-AST-008-1）
test("E2E-016 前月の記録をコピーして資産を記録し、推移と内訳に反映される", async ({
  memberPage,
}) => {
  const groupId = await createGroup(memberPage, "E2E 資産");
  const month = currentMonthInGroupTimezone();
  const lastMonth = previousMonth(month);

  // 記録が無い間は説明と記録の導線だけを表示する (AC-AST-010-2)
  await memberPage.goto(`/groups/${groupId}/assets`);
  await expect(
    memberPage.getByText(
      "資産の推移を記録すると、ここにグラフが表示されます。",
    ),
  ).toBeVisible();

  // 前月を最初に記録する (AC-AST-002-1)
  await memberPage.goto(`/groups/${groupId}/assets/record?month=${lastMonth}`);
  await expect(
    memberPage.getByText(
      "最初の記録です。各メンバーの資産額を入力してください。",
    ),
  ).toBeVisible();
  await memberPage.getByLabel("現金・預金").fill("1000000");
  await memberPage.getByLabel("NISA", { exact: true }).fill("300000");
  await expect(
    memberPage.getByRole("status").filter({ hasText: "合計資産額" }),
  ).toContainText("￥1,300,000");
  await memberPage.getByRole("button", { name: "保存する" }).click();
  await memberPage.waitForURL(new RegExp(`/groups/${groupId}/assets$`));
  await expect(
    memberPage.getByText(`${monthLabel(lastMonth)}の資産を保存しました`),
  ).toBeVisible();

  // 当月を開くと前月の値がコピーされている (AC-AST-003-1)
  await memberPage.goto(`/groups/${groupId}/assets/record`);
  await expect(
    memberPage.getByText(`${monthLabel(lastMonth)}の記録をコピーしました。`, {
      exact: false,
    }),
  ).toBeVisible();
  await expect(memberPage.getByLabel("現金・預金")).toHaveValue("1,000,000");
  await memberPage.getByLabel("NISA", { exact: true }).fill("400000");
  await memberPage.getByRole("button", { name: "保存する" }).click();
  await memberPage.waitForURL(new RegExp(`/groups/${groupId}/assets$`));

  const summary = memberPage.getByRole("region", {
    name: "選択中の月の合計資産額",
  });
  await expect(summary).toContainText("￥1,400,000");
  await expect(summary).toContainText("前回比 ＋￥100,000");
  await expect(
    memberPage.getByRole("heading", { name: `${monthLabel(month)}の内訳` }),
  ).toBeVisible();

  // 表示条件の切替はサーバーへ要求しない (AC-AST-008-1)
  const requests: string[] = [];
  memberPage.on("request", (request) => {
    if (
      request.resourceType() === "fetch" ||
      request.resourceType() === "document"
    ) {
      requests.push(request.url());
    }
  });
  await memberPage
    .getByRole("group", { name: "表示期間" })
    .getByRole("button", { name: "全期間" })
    .click();
  await memberPage.getByRole("button", { name: "メンバー別" }).click();
  await memberPage
    .getByRole("button", { name: new RegExp(monthLabel(lastMonth)) })
    .click();
  await expect(summary).toContainText("￥1,300,000");
  expect(requests).toEqual([]);

  // 当月の記録を確認操作を経て削除すると、前月だけが残る (AC-AST-004-2)
  await memberPage.goto(`/groups/${groupId}/assets/record?month=${month}`);
  await memberPage.getByRole("button", { name: "この月の記録を削除" }).click();
  await memberPage.getByRole("button", { name: "削除を確定する" }).click();
  await memberPage.waitForURL(new RegExp(`/groups/${groupId}/assets$`));
  await expect(
    memberPage.getByText(`${monthLabel(month)}の資産記録を削除しました`),
  ).toBeVisible();
  await expect(summary).toContainText(monthLabel(lastMonth));
  await expect(summary).toContainText("￥1,300,000");
});
