import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ExpenseFormOptions } from "../application/expense-types";
import { ExpenseForm } from "./expense-form";

vi.mock("./actions", () => ({
  createTransactionAction: vi.fn(),
  updateExpenseAction: vi.fn(),
  updateIncomeAction: vi.fn(),
}));

const groupId = "00000000-0000-4000-8000-000000000001";
const currentMembershipId = "00000000-0000-4000-8000-000000000101";

const categoryNames = [
  "食費",
  "日用品",
  "交通",
  "娯楽",
  "医療",
  "教育",
  "通信",
  "住居",
];

const options: ExpenseFormOptions = {
  group: {
    id: groupId,
    name: "家計",
    timezone: "Asia/Tokyo",
    defaultAllocation: "equal",
    currentMembershipId,
  },
  today: "2026-09-01",
  members: [
    {
      membershipId: currentMembershipId,
      displayName: "山田",
      isCurrentUser: true,
    },
    {
      membershipId: "00000000-0000-4000-8000-000000000102",
      displayName: "佐藤",
      isCurrentUser: false,
    },
  ],
  categories: categoryNames.map((name, index) => ({
    id: `00000000-0000-4000-8000-00000000020${index}`,
    name,
    color: "food",
    icon: "utensils",
  })),
  incomeCategories: [
    {
      id: "00000000-0000-4000-8000-000000000301",
      name: "給与",
      color: "income",
      icon: "wallet",
    },
  ],
};

function renderForm() {
  return render(<ExpenseForm clientRequestId="req-1" options={options} />);
}

function amountInput(): HTMLInputElement {
  return screen.getByLabelText("金額") as HTMLInputElement;
}

function pressKey(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
}

afterEach(() => cleanup());

describe("ExpenseForm の金額テンキー (TXN-014)", () => {
  it("OSの仮想キーボードを開かず、テンキーで金額を組み立てる (AC-TXN-014-1)", () => {
    renderForm();

    // inputmode=noneでOSの仮想キーボードを抑止する
    expect(amountInput().getAttribute("inputmode")).toBe("none");

    pressKey("1");
    pressKey("2");
    pressKey("00");

    expect(amountInput().value).toBe("1200");
  });

  it("1文字削除で末尾の桁だけを取り消す (AC-TXN-014-1)", () => {
    renderForm();

    pressKey("3");
    pressKey("5");
    pressKey("1桁削除");

    expect(amountInput().value).toBe("3");
  });

  it("物理キーボードからの入力を受け付ける (AC-TXN-014-2)", () => {
    renderForm();

    fireEvent.change(amountInput(), { target: { value: "2480" } });

    expect(amountInput().value).toBe("2480");
  });

  it("先頭に0を作らず、安全な整数の上限を超える桁を無視する (AC-TXN-014-4)", () => {
    renderForm();

    pressKey("0");
    pressKey("00");
    expect(amountInput().value).toBe("");

    pressKey("9");
    pressKey("0");
    expect(amountInput().value).toBe("90");

    fireEvent.change(amountInput(), { target: { value: "9007199254740991" } });
    pressKey("1");

    // 上限を超える桁は追加せず、入力済みの値を壊さない
    expect(amountInput().value).toBe("9007199254740991");
  });

  it("テンキーのキーはフォームを送信しない (AC-TXN-014-1)", () => {
    renderForm();

    for (const name of ["1", "00", "1桁削除", "すべて"]) {
      expect(screen.getByRole("button", { name }).getAttribute("type")).toBe(
        "button",
      );
    }
    expect(
      screen.getByRole("button", { name: "支出を保存" }).getAttribute("type"),
    ).toBe("submit");
  });
});

describe("ExpenseForm のカテゴリ展開 (TXN-015)", () => {
  it("既定は折りたたみ、「すべて」でボタン操作から展開できる (AC-TXN-015-2)", () => {
    renderForm();

    const toggle = screen.getByRole("button", { name: "すべて" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(toggle);

    const closeToggle = screen.getByRole("button", { name: "閉じる" });
    expect(closeToggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("折りたたんだ状態でも全カテゴリをradioとして選択できる (AC-TXN-015-1)", () => {
    renderForm();

    for (const name of categoryNames) {
      expect(screen.getByRole("radio", { name })).toBeTruthy();
    }
    // 既定の選択は先頭カテゴリ
    expect(
      (screen.getByRole("radio", { name: "食費" }) as HTMLInputElement).checked,
    ).toBe(true);
  });

  it("展開中にカテゴリを選ぶと折りたたみ、選択を保持する (AC-TXN-015-3)", () => {
    renderForm();

    fireEvent.click(screen.getByRole("button", { name: "すべて" }));
    fireEvent.click(screen.getByRole("radio", { name: "教育" }));

    expect(
      (screen.getByRole("radio", { name: "教育" }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      screen
        .getByRole("button", { name: "すべて" })
        .getAttribute("aria-expanded"),
    ).toBe("false");
  });

  it("展開・折りたたみで他の入力値を失わない (AC-TXN-015-4)", () => {
    renderForm();

    pressKey("1");
    pressKey("2");
    pressKey("00");
    const memo = screen.getByLabelText("メモ（任意）") as HTMLTextAreaElement;
    fireEvent.change(memo, { target: { value: "ランチ" } });

    fireEvent.click(screen.getByRole("button", { name: "すべて" }));
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));

    expect(amountInput().value).toBe("1200");
    expect(
      (screen.getByLabelText("メモ（任意）") as HTMLTextAreaElement).value,
    ).toBe("ランチ");
  });

  it("展開中はテンキーを隠し、閉じると戻る (AC-TXN-014-3)", () => {
    renderForm();

    fireEvent.click(screen.getByRole("button", { name: "すべて" }));
    expect(screen.queryByRole("button", { name: "1" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(screen.getByRole("button", { name: "1" })).toBeTruthy();
  });
});
