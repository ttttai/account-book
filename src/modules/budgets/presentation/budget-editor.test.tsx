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

  it("金額欄はOSの数字キーボードを使い、入力中に合計と未配分額を表示する (AC-BUD-010-3)", () => {
    render(<BudgetEditor view={createView()} />);

    const total = screen.getByLabelText("グループ予算") as HTMLInputElement;
    expect(total.getAttribute("inputmode")).toBe("numeric");
    expect(total.getAttribute("pattern")).toBe("[0-9]*");
    const food = screen.getByLabelText("食費") as HTMLInputElement;
    expect(food.getAttribute("inputmode")).toBe("numeric");
    expect(food.getAttribute("name")).toBe(`categoryLimit:${FOOD}`);

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
