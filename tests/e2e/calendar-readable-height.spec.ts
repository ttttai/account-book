import type { Page } from "@playwright/test";

import {
  createGroup,
  enterAmountWithKeypad,
  registerExpense,
  todayInGroupTimezone,
} from "./support/app-actions";
import { expect, test } from "./support/fixtures";

// 6桁の上限。収入の「+」を含めて1行に収まることを測る (AC-CAL-012-5)
const SIX_DIGIT_AMOUNT = 999999;

type CalendarMetrics = Readonly<{
  fontSize: number;
  amountWidth: number;
  cellWidth: number;
  amountLines: number;
  rowHeights: readonly number[];
  gapToNavigation: number;
  horizontalOverflow: number;
  verticalOverflow: number;
}>;

// 取引入力画面から収入を登録し、成功後のホーム遷移まで待つ
async function registerIncome(
  page: Page,
  groupId: string,
  amount: number,
): Promise<void> {
  await page.goto(`/groups/${groupId}/transactions/new`);
  const typeFieldset = page.getByRole("group", { name: "種別" });
  await typeFieldset.getByText("収入", { exact: true }).click();
  await expect(
    typeFieldset.getByRole("radio", { name: "収入", exact: true }),
  ).toBeChecked();

  // 金額欄は入力中も3桁区切りで表示されるため、共通helperで区切り込みの値を確認する (AC-TXN-014-10)
  await enterAmountWithKeypad(page, amount);

  const expandToggle = page.getByRole("button", { name: "すべて" });
  if (await expandToggle.isVisible()) await expandToggle.click();
  const categoryFieldset = page.getByRole("group", { name: "カテゴリ" });
  await categoryFieldset.getByText("給与", { exact: true }).click();
  const collapseToggle = page.getByRole("button", {
    name: "閉じる",
    exact: true,
  });
  if (await collapseToggle.isVisible()) await collapseToggle.click();

  await page.getByRole("button", { name: "収入を保存" }).click();
  await page.waitForURL(new RegExp(`/groups/${groupId}(\\?|$)`));
}

// 実際の描画から金額の文字サイズ・幅、行高、表の下端と下部ナビの間隔を測る
async function measureCalendar(page: Page): Promise<CalendarMetrics> {
  return page.evaluate(
    (incomeText) => {
      const table = document.querySelector("table");
      if (!table) throw new Error("カレンダーの表が必要です");
      const amount = [...table.querySelectorAll("span")].find(
        (span) => span.textContent === incomeText,
      );
      if (!amount) throw new Error("収入の金額表示が必要です");
      const cell = amount.closest("td");
      const navigation = document.querySelector(
        'nav[aria-label="グループ内ナビゲーション"]',
      );
      if (!cell || !navigation) throw new Error("セルと下部ナビが必要です");

      const range = document.createRange();
      range.selectNodeContents(amount);
      const textRect = range.getBoundingClientRect();
      const amountStyle = getComputedStyle(amount);
      const lineHeight = Number.parseFloat(amountStyle.lineHeight);
      const root = document.documentElement;

      return {
        fontSize: Number.parseFloat(amountStyle.fontSize),
        amountWidth: textRect.width,
        cellWidth: cell.getBoundingClientRect().width,
        amountLines: Math.round(textRect.height / lineHeight),
        rowHeights: [...table.querySelectorAll("tbody tr")].map(
          (row) => row.getBoundingClientRect().height,
        ),
        gapToNavigation:
          navigation.getBoundingClientRect().top -
          table.getBoundingClientRect().bottom,
        horizontalOverflow: root.scrollWidth - root.clientWidth,
        verticalOverflow: root.scrollHeight - root.clientHeight,
      };
    },
    `+${SIX_DIGIT_AMOUNT.toLocaleString("en-US")}`,
  );
}

// E2E-012 ホームカレンダーの行高配分と金額サイズ（NAV-002、CAL-002、CAL-012、AC-CAL-001-20）
test("E2E-012 カレンダー6行が残り高さを分け合い、日別金額が表の幅に応じて読める大きさになる", async ({
  memberPage,
}) => {
  const groupId = await createGroup(memberPage, "E2E カレンダー行高");
  const today = todayInGroupTimezone();
  await registerExpense(memberPage, {
    groupId,
    amount: SIX_DIGIT_AMOUNT,
    categoryName: "食費",
    transactionDate: today,
  });
  await registerIncome(memberPage, groupId, SIX_DIGIT_AMOUNT);

  for (const viewport of [
    { width: 375, height: 812 },
    { width: 320, height: 568 },
    { width: 1280, height: 800 },
  ]) {
    await memberPage.setViewportSize(viewport);
    await memberPage.goto(`/groups/${groupId}`);
    await expect(memberPage.getByRole("table")).toBeVisible();
    const metrics = await measureCalendar(memberPage);
    const label = `${viewport.width}x${viewport.height}`;

    // +999,999は全viewportで1行のままセル幅に収まり、横スクロールを出さない (AC-CAL-012-5)
    expect(metrics.horizontalOverflow, `${label}: 横スクロール`).toBe(0);
    expect(metrics.amountLines, `${label}: 金額の行数`).toBe(1);
    expect(metrics.amountWidth, `${label}: 金額の幅`).toBeLessThanOrEqual(
      metrics.cellWidth,
    );
    expect(metrics.rowHeights).toHaveLength(6);
    for (const rowHeight of metrics.rowHeights) {
      expect(rowHeight, `${label}: 行高の下限`).toBeGreaterThanOrEqual(44);
    }

    if (viewport.width === 375) {
      // 375 x 812では余った高さを6行が均等に使い、表の下に大きな空白を残さない (AC-CAL-001-20、AC-NAV-002-2)
      expect(
        metrics.fontSize,
        `${label}: 金額の文字サイズ`,
      ).toBeGreaterThanOrEqual(11);
      expect(metrics.verticalOverflow, `${label}: 縦スクロール`).toBe(0);
      expect(
        metrics.gapToNavigation,
        `${label}: 表と下部ナビの間隔`,
      ).toBeGreaterThanOrEqual(0);
      expect(
        metrics.gapToNavigation,
        `${label}: 表と下部ナビの間隔`,
      ).toBeLessThanOrEqual(32);
      expect(
        Math.max(...metrics.rowHeights) - Math.min(...metrics.rowHeights),
        `${label}: 行高の差`,
      ).toBeLessThanOrEqual(2);
    }

    if (viewport.width === 1280) {
      expect(
        metrics.fontSize,
        `${label}: 金額の文字サイズ`,
      ).toBeGreaterThanOrEqual(16);
    }
  }
});
