import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BudgetViewReady } from "../application/budget-types";
import { BudgetEditor } from "./budget-editor";

vi.mock("./actions", () => ({
  saveBudgetAction: vi.fn(),
  disableBudgetAction: vi.fn(),
}));

const GROUP_ID = "10000000-0000-4000-8000-000000000001";
const FOOD = "30000000-0000-4000-8000-000000000001";
const HOME = "30000000-0000-4000-8000-000000000002";

function createView(overrides: Partial<BudgetViewReady> = {}): BudgetViewReady {
  return {
    kind: "ready",
    group: { id: GROUP_ID, name: "わが家" },
    month: "2026-09",
    previousMonth: "2026-08",
    nextMonth: "2026-10",
    currentMonth: "2026-09",
    canManage: true,
    canEditMonth: true,
    appliedRevision: null,
    revisionAtMonth: null,
    progress: null,
    history: [],
    expenseCategories: [
      { id: FOOD, name: "食費", color: "food" },
      { id: HOME, name: "住居", color: "home" },
    ],
    ...overrides,
  };
}

const activeProgress: NonNullable<BudgetViewReady["progress"]> = {
  effectiveMonth: "2026-06",
  version: 2,
  limitMinor: 300000,
  usedMinor: 250000,
  remainingMinor: 50000,
  usedPercent: 83,
  status: "warn",
  unallocatedMinor: 240000,
  categories: [
    {
      categoryId: FOOD,
      name: "食費",
      color: "food",
      limitMinor: 60000,
      usedMinor: 50000,
      remainingMinor: 10000,
      usedPercent: 83,
      status: "warn",
    },
  ],
};

const KEYPAD_HINT = "金額欄をタップするとテンキーを開きます。";

function pressKey(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
}

function keypadIsOpen(): boolean {
  return screen.queryByRole("button", { name: "1桁削除" }) !== null;
}

function hiddenValue(name: string): string | null {
  return (
    document.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value ??
    null
  );
}

afterEach(() => cleanup());

describe("BudgetEditor", () => {
  it("memberには操作を表示しない (AC-BUD-001-1)", () => {
    render(<BudgetEditor view={createView({ canManage: false })} />);

    expect(
      screen.getByText("予算の設定はオーナーと管理者が行います。"),
    ).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(document.querySelector("form")).toBeNull();
  });

  it("過去月では操作を表示しない (AC-BUD-001-3)", () => {
    render(
      <BudgetEditor
        view={createView({ month: "2026-08", canEditMonth: false })}
      />,
    );

    expect(screen.getByText("過去月の予算は変更できません。")).toBeTruthy();
    expect(document.querySelector("form")).toBeNull();
  });

  it("予算のテンキーは取引入力向けの閉じるキーを持たない (AC-TXN-014-9)", () => {
    render(<BudgetEditor view={createView()} />);
    fireEvent.focus(screen.getByLabelText("グループ予算"));

    expect(keypadIsOpen()).toBe(true);
    expect(
      screen.queryByRole("button", { name: "テンキーを閉じる" }),
    ).toBeNull();
  });

  it("金額欄はOSの仮想キーボードを開かず、選んだ欄の直下のテンキーで入力する (AC-BUD-010-4)", () => {
    render(<BudgetEditor view={createView()} />);

    const total = screen.getByLabelText("グループ予算") as HTMLInputElement;
    const food = screen.getByLabelText("食費") as HTMLInputElement;
    expect(total.getAttribute("inputmode")).toBe("none");
    expect(food.getAttribute("inputmode")).toBe("none");
    expect(food.getAttribute("name")).toBe(`categoryLimit:${FOOD}`);
    expect(keypadIsOpen()).toBe(false);
    expect(screen.getByText(KEYPAD_HINT)).toBeTruthy();

    // グループ予算欄へfocusするとその直下に開き、キーは選択中の欄だけへ反映する
    fireEvent.focus(total);
    expect(keypadIsOpen()).toBe(true);
    expect(screen.queryByText(KEYPAD_HINT)).toBeNull();
    pressKey("3");
    pressKey("0");
    pressKey("00");
    pressKey("00");
    expect(total.value).toBe("300000");
    pressKey("1桁削除");
    expect(total.value).toBe("30000");
    pressKey("0");
    expect(total.value).toBe("300000");
    expect(
      total
        .closest("[data-budget-field]")
        ?.querySelector("[data-budget-keypad]"),
    ).toBeTruthy();

    // 別の金額欄を選ぶとテンキーが移動し、前の欄の値は変わらない
    fireEvent.focus(food);
    pressKey("6");
    pressKey("00");
    pressKey("00");
    expect(food.value).toBe("60000");
    expect(total.value).toBe("300000");
    expect(
      food
        .closest("[data-budget-field]")
        ?.querySelector("[data-budget-keypad]"),
    ).toBeTruthy();
    expect(
      total
        .closest("[data-budget-field]")
        ?.querySelector("[data-budget-keypad]"),
    ).toBeNull();
    expect(screen.getByText(/カテゴリ予算の合計 ￥60,000/)).toBeTruthy();
    expect(screen.getByText(/未配分 ￥240,000/)).toBeTruthy();
  });

  it("金額欄以外へfocusが移るとテンキーを閉じ、物理キーボードからの入力は維持する (AC-BUD-010-4)", () => {
    render(<BudgetEditor view={createView()} />);

    const total = screen.getByLabelText("グループ予算") as HTMLInputElement;
    fireEvent.focus(total);
    expect(keypadIsOpen()).toBe(true);

    fireEvent.focus(screen.getByRole("button", { name: "予算を設定" }));
    expect(keypadIsOpen()).toBe(false);
    expect(screen.getByText(KEYPAD_HINT)).toBeTruthy();

    fireEvent.change(total, { target: { value: "12345" } });
    expect(total.value).toBe("12345");
  });

  it("入力中に合計と未配分額を表示する (AC-BUD-010-3)", () => {
    render(<BudgetEditor view={createView()} />);

    const total = screen.getByLabelText("グループ予算") as HTMLInputElement;
    const food = screen.getByLabelText("食費") as HTMLInputElement;

    fireEvent.change(total, { target: { value: "300000" } });
    fireEvent.change(food, { target: { value: "60000" } });
    fireEvent.change(screen.getByLabelText("住居"), {
      target: { value: "100000" },
    });

    expect(screen.getByText(/カテゴリ予算の合計 ￥160,000/)).toBeTruthy();
    expect(screen.getByText(/未配分 ￥140,000/)).toBeTruthy();
    const submit = screen.getByRole("button", { name: "予算を設定" });
    expect(submit.hasAttribute("disabled")).toBe(false);
  });

  it("カテゴリ予算の合計がグループ予算を超えると送信を無効化する (AC-BUD-002-2)", () => {
    render(<BudgetEditor view={createView()} />);

    fireEvent.change(screen.getByLabelText("グループ予算"), {
      target: { value: "100000" },
    });
    fireEvent.change(screen.getByLabelText("食費"), {
      target: { value: "60000" },
    });
    fireEvent.change(screen.getByLabelText("住居"), {
      target: { value: "50000" },
    });

    expect(screen.getByText(/￥10,000 超えています/)).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "予算を設定" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("予算未設定の月は新規設定として送信する", () => {
    render(<BudgetEditor view={createView()} />);

    expect(screen.getByRole("button", { name: "予算を設定" })).toBeTruthy();
    expect(hiddenValue("effectiveMonth")).toBe("2026-09");
    expect(hiddenValue("expectedVersion")).toBe("");
    expect(
      screen.queryByRole("button", { name: "この月から停止する" }),
    ).toBeNull();
  });

  it("適用改定が別の月なら新しい改定として送信し、初期値に適用中の金額を入れる (AC-BUD-005-1)", () => {
    render(
      <BudgetEditor
        view={createView({
          appliedRevision: {
            effectiveMonth: "2026-06",
            status: "active",
            version: 2,
          },
          progress: activeProgress,
        })}
      />,
    );

    expect(screen.getByRole("button", { name: "この月から変更" })).toBeTruthy();
    expect(hiddenValue("expectedVersion")).toBe("");
    expect(
      (screen.getByLabelText("グループ予算") as HTMLInputElement).value,
    ).toBe("300000");
    expect((screen.getByLabelText("食費") as HTMLInputElement).value).toBe(
      "60000",
    );
    expect((screen.getByLabelText("住居") as HTMLInputElement).value).toBe("");
  });

  it("選択月に既存改定がある場合はversionを添えて更新する (AC-BUD-009-1)", () => {
    render(
      <BudgetEditor
        view={createView({
          appliedRevision: {
            effectiveMonth: "2026-09",
            status: "active",
            version: 4,
          },
          revisionAtMonth: { version: 4, status: "active" },
          progress: {
            ...activeProgress,
            effectiveMonth: "2026-09",
            version: 4,
          },
        })}
      />,
    );

    expect(screen.getByRole("button", { name: "予算を保存" })).toBeTruthy();
    expect(hiddenValue("expectedVersion")).toBe("4");
  });

  it("月切替で入力・送信先・停止確認を遷移先にそろえる (AC-BUD-010-3)", () => {
    const view = createView({ progress: activeProgress });
    const { rerender } = render(<BudgetEditor view={view} />);
    fireEvent.change(screen.getByLabelText("グループ予算"), {
      target: { value: "999999" },
    });
    fireEvent.click(screen.getByRole("button", { name: "この月から停止する" }));

    rerender(
      <BudgetEditor
        view={{
          ...view,
          month: "2026-10",
          progress: {
            ...activeProgress,
            effectiveMonth: "2026-10",
            limitMinor: 400000,
            categories: [],
          },
          revisionAtMonth: { version: 1, status: "active" },
        }}
      />,
    );

    expect(
      (screen.getByLabelText("グループ予算") as HTMLInputElement).value,
    ).toBe("400000");
    expect((screen.getByLabelText("食費") as HTMLInputElement).value).toBe("");
    expect(hiddenValue("effectiveMonth")).toBe("2026-10");
    expect(hiddenValue("expectedVersion")).toBe("1");
    expect(screen.queryByRole("button", { name: "停止を確定する" })).toBeNull();

    rerender(<BudgetEditor view={view} />);
    expect(
      (screen.getByLabelText("グループ予算") as HTMLInputElement).value,
    ).toBe("300000");
    expect((screen.getByLabelText("食費") as HTMLInputElement).value).toBe(
      "60000",
    );
  });

  it("同月の改定更新で古い入力と新しいversionを組み合わせない (AC-BUD-009-1)", () => {
    const view = createView({
      progress: activeProgress,
      revisionAtMonth: { version: 2, status: "active" },
    });
    const { rerender } = render(<BudgetEditor view={view} />);
    const input = screen.getByLabelText("グループ予算") as HTMLInputElement;
    input.focus();
    fireEvent.change(input, { target: { value: "999999" } });
    rerender(
      <BudgetEditor
        view={{
          ...view,
          progress: {
            ...activeProgress,
            version: 3,
            limitMinor: 450000,
            categories: [],
          },
          revisionAtMonth: { version: 3, status: "active" },
        }}
      />,
    );
    expect(input.value).toBe("450000");
    expect((screen.getByLabelText("食費") as HTMLInputElement).value).toBe("");
    expect(hiddenValue("expectedVersion")).toBe("3");
    expect(document.activeElement).toBe(input);
  });

  it("実績だけの更新では未保存入力とfocusを維持する (AC-BUD-010-3)", () => {
    const view = createView({ progress: activeProgress });
    const { rerender } = render(<BudgetEditor view={view} />);
    const input = screen.getByLabelText("グループ予算") as HTMLInputElement;
    input.focus();
    fireEvent.change(input, { target: { value: "350000" } });
    rerender(
      <BudgetEditor
        view={{
          ...view,
          progress: {
            ...activeProgress,
            usedMinor: 260000,
          },
        }}
      />,
    );
    expect(input.value).toBe("350000");
    expect(document.activeElement).toBe(input);
  });

  it("同じ月・同じversionの別グループに入力を持ち越さない", () => {
    const view = createView({ progress: activeProgress });
    const { rerender } = render(<BudgetEditor view={view} />);
    rerender(
      <BudgetEditor
        view={{
          ...view,
          group: {
            id: "10000000-0000-4000-8000-000000000002",
            name: "別グループ",
          },
          progress: { ...activeProgress, limitMinor: 500000 },
        }}
      />,
    );
    expect(
      (screen.getByLabelText("グループ予算") as HTMLInputElement).value,
    ).toBe("500000");
  });

  it("停止後の同月再表示では停止前の金額を新規設定へ持ち越さない (AC-BUD-006-1)", () => {
    const view = createView({ progress: activeProgress });
    const { rerender } = render(<BudgetEditor view={view} />);
    rerender(
      <BudgetEditor
        view={{
          ...view,
          progress: null,
          appliedRevision: {
            effectiveMonth: "2026-09",
            version: 3,
            status: "disabled",
          },
          revisionAtMonth: { version: 3, status: "disabled" },
        }}
      />,
    );
    expect(
      (screen.getByLabelText("グループ予算") as HTMLInputElement).value,
    ).toBe("");
    expect((screen.getByLabelText("食費") as HTMLInputElement).value).toBe("");
    expect(hiddenValue("expectedVersion")).toBe("3");
  });

  it("停止は確認操作を経て確定する (AC-BUD-006-1)", () => {
    render(
      <BudgetEditor
        view={createView({
          appliedRevision: {
            effectiveMonth: "2026-06",
            status: "active",
            version: 2,
          },
          progress: activeProgress,
        })}
      />,
    );

    expect(screen.queryByRole("button", { name: "停止を確定する" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "この月から停止する" }));
    expect(screen.getByRole("button", { name: "停止を確定する" })).toBeTruthy();
    expect(screen.getByText(/2026年9月以降は予算未設定/)).toBeTruthy();
  });
});
