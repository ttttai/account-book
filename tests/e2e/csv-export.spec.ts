import { readFileSync } from "node:fs";

import {
  createGroup,
  registerExpense,
  todayInGroupTimezone,
} from "./support/app-actions";
import { expect, test } from "./support/fixtures";

const CSV_HEADER = "取引日,種別,金額,カテゴリ,支払者または受取者,負担内訳,メモ";

// E2E-007 CSV出力（EXP-001、EXP-002）
test("E2E-007 設定からCSVを出力し、列と内容を確認する", async ({
  memberPage,
}) => {
  const groupId = await createGroup(memberPage, "E2E CSV出力");
  const day = todayInGroupTimezone();

  await registerExpense(memberPage, {
    groupId,
    amount: 4200,
    categoryName: "日用品",
    transactionDate: day,
    memo: "E2E CSV",
  });

  await memberPage.goto(`/groups/${groupId}/settings`);
  const downloadPromise = memberPage.waitForEvent("download");
  await memberPage.getByRole("link", { name: /CSV出力/ }).click();
  const download = await downloadPromise;

  const downloadPath = await download.path();
  const csv = readFileSync(downloadPath, "utf8");
  const [header, ...rows] = csv.trim().split("\n");

  expect(header.replace(/\r$/, "")).toBe(CSV_HEADER);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toContain(day);
  expect(rows[0]).toContain("支出");
  expect(rows[0]).toContain("4200");
  expect(rows[0]).toContain("日用品");
  expect(rows[0]).toContain("E2E CSV");

  // 招待情報や内部IDを含めない (EXP-002)
  expect(csv).not.toContain("token");
  expect(csv).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/);
});
