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

describe("ExpenseForm のテンキー開閉と保存の常設 (TXN-014, TXN-016)", () => {
  it("既定はテンキーを開き、すぐに金額を入力できる", () => {
    renderForm();

    expect(screen.getByRole("button", { name: "1" })).toBeTruthy();
  });

  it("金額欄以外の入力欄へfocusするとテンキーを閉じる (AC-TXN-014-5)", () => {
    renderForm();

    fireEvent.focus(screen.getByLabelText("メモ（任意）"));

    expect(screen.queryByRole("button", { name: "1" })).toBeNull();
  });

  it("閉じたあと金額欄へfocusするとテンキーを開く (AC-TXN-014-5)", () => {
    renderForm();

    fireEvent.focus(screen.getByLabelText("メモ（任意）"));
    expect(screen.queryByRole("button", { name: "1" })).toBeNull();

    fireEvent.focus(amountInput());

    expect(screen.getByRole("button", { name: "1" })).toBeTruthy();
  });

  it("入力ドック内（カテゴリ・キー・保存）の操作では開閉状態を変えない (AC-TXN-014-5)", () => {
    renderForm();

    fireEvent.focus(screen.getByRole("radio", { name: "日用品" }));
    expect(screen.getByRole("button", { name: "1" })).toBeTruthy();

    fireEvent.focus(screen.getByRole("button", { name: "支出を保存" }));
    expect(screen.getByRole("button", { name: "1" })).toBeTruthy();
  });

  it("テンキーの開閉で金額を失わない (AC-TXN-014-5)", () => {
    renderForm();

    pressKey("2");
    pressKey("5");
    pressKey("00");
    fireEvent.focus(screen.getByLabelText("メモ（任意）"));
    fireEvent.focus(amountInput());

    expect(amountInput().value).toBe("2500");
  });

  it("閉じている間も金額欄から再び開けることを画面上で示す (AC-TXN-014-6)", () => {
    renderForm();

    fireEvent.focus(screen.getByLabelText("メモ（任意）"));

    const hint = screen.getByText(/金額欄をタップ/);
    expect(hint).toBeTruthy();
    // 案内は金額欄と関連付け、スクリーンリーダーからも辿れる
    expect(amountInput().getAttribute("aria-describedby")).toContain(hint.id);
  });

  it("閉じている間も物理キーボードから金額を入力できる (AC-TXN-014-6)", () => {
    renderForm();

    fireEvent.focus(screen.getByLabelText("メモ（任意）"));
    fireEvent.change(amountInput(), { target: { value: "3400" } });

    expect(amountInput().value).toBe("3400");
  });

  it("テンキーの開閉とカテゴリ展開のどの状態でも保存操作が消えない (AC-TXN-016-1)", () => {
    renderForm();

    const saveName = "支出を保存";
    expect(screen.getByRole("button", { name: saveName })).toBeTruthy();

    // テンキーを閉じた状態
    fireEvent.focus(screen.getByLabelText("メモ（任意）"));
    expect(screen.queryByRole("button", { name: "1" })).toBeNull();
    expect(screen.getByRole("button", { name: saveName })).toBeTruthy();

    // カテゴリを展開した状態
    fireEvent.click(screen.getByRole("button", { name: "すべて" }));
    expect(screen.getByRole("button", { name: saveName })).toBeTruthy();
  });

  it("保存はテンキーを閉じても入力ドック内に残り、数字キーだけが消える (AC-TXN-016-1)", () => {
    renderForm();
    fireEvent.focus(screen.getByLabelText("メモ（任意）"));

    expect(screen.queryByRole("button", { name: "1" })).toBeNull();
    expect(screen.queryByRole("button", { name: "1桁削除" })).toBeNull();
    const save = screen.getByRole("button", { name: "支出を保存" });
    expect(save.closest("[class*='input-dock']")).toBeTruthy();
  });
});

describe("ExpenseForm のテンキー開閉時のスクロール (AC-TXN-014-7)", () => {
  it("テンキーを開いたとき、金額欄をドックへ隠れない位置へ移動する", async () => {
    const scrollBy = vi.fn();
    // jsdomはscrollByを実装しないため、呼び出しの有無だけを検証する
    window.scrollBy = scrollBy;

    renderForm();

    // 既定でテンキーが開いているため、初回描画でも金額欄を見える位置へ移動する
    await vi.waitFor(() => expect(scrollBy).toHaveBeenCalled());

    scrollBy.mockClear();
    fireEvent.focus(screen.getByLabelText("メモ（任意）"));
    fireEvent.focus(amountInput());

    // 閉じてから開き直したときも移動する
    await vi.waitFor(() => expect(scrollBy).toHaveBeenCalled());
  });
});

describe("ExpenseForm の外枠と footer (AC-TXN-009-5)", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("footer をフォーム直後に描画し、同じ外枠へ含める", () => {
    render(
      <ExpenseForm
        clientRequestId="req-1"
        footer={<section aria-label="取引の削除">削除操作</section>}
        options={options}
      />,
    );

    const form = amountInput().closest("form");
    const footer = screen.getByRole("region", { name: "取引の削除" });
    expect(form?.nextElementSibling).toBe(footer);
    // 外枠は form と footer の共通の親で、ドック高さぶんの余白を受け持つ
    expect(form?.parentElement).toBe(footer.parentElement);
    expect(form?.parentElement?.className).toContain("expense-form-shell");
  });

  it("入力ドックの実高を外枠へ CSS 変数として反映し、footer も余白の内側へ入れる", () => {
    let trigger: (() => void) | undefined;
    class FakeResizeObserver {
      constructor(callback: () => void) {
        trigger = callback;
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);

    render(
      <ExpenseForm
        clientRequestId="req-1"
        footer={<section aria-label="取引の削除">削除操作</section>}
        options={options}
      />,
    );
    trigger?.();

    const shell = amountInput().closest("form")?.parentElement;
    expect(shell?.style.getPropertyValue("--input-dock-height")).toMatch(/px$/);
    expect(shell?.style.getPropertyValue("--input-dock-total-height")).toMatch(
      /px$/,
    );
  });
});
