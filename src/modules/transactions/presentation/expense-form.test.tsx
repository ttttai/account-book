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

describe("ExpenseForm の種別切替 (TXN-013)", () => {
  it("種別は支出と収入の2択だけを表示し、空の選択枠を残さない (AC-TXN-013-7)", () => {
    renderForm();

    const fieldset = screen.getByRole("group", { name: "種別" });
    const radios = fieldset.querySelectorAll('input[type="radio"]');
    expect([...radios].map((radio) => radio.getAttribute("value"))).toEqual([
      "expense",
      "income",
    ]);
    expect(
      (screen.getByRole("radio", { name: "支出" }) as HTMLInputElement).checked,
    ).toBe(true);

    // 切替内の子要素はすべて選択肢のlabelで、空の枠が無い
    const control = radios[0].closest("div");
    expect(control).not.toBeNull();
    const slots = [...(control as HTMLElement).children];
    expect(slots).toHaveLength(2);
    expect(slots.every((slot) => slot.tagName === "LABEL")).toBe(true);
    expect(slots.every((slot) => slot.textContent?.trim() !== "")).toBe(true);
  });

  it("分け方の切替は1人・均等・カスタムの3択のまま維持する", () => {
    renderForm();

    const fieldset = screen.getByRole("group", { name: "分け方" });
    const radios = fieldset.querySelectorAll('input[type="radio"]');
    expect(radios).toHaveLength(3);
  });
});

describe("ExpenseForm の支払者非表示と文言 (TXN-018)", () => {
  it("支払者の入力欄を表示せず、現在のメンバーを隠しfieldで送信する (AC-TXN-018-1)", () => {
    const { container } = renderForm();

    expect(screen.queryByLabelText("支払った人")).toBeNull();
    const hidden = container.querySelector(
      'input[name="payerMemberId"]',
    ) as HTMLInputElement | null;
    expect(hidden?.type).toBe("hidden");
    expect(hidden?.value).toBe(currentMembershipId);
    // 端末へ最後の支払者を記憶しない
    expect(
      window.localStorage.getItem(`account-book:last-payer:${groupId}`),
    ).toBeNull();
  });

  it("編集時は保存済みの支払者を送信し、削除済みなら現在のメンバーへ置き換える (AC-TXN-018-1)", () => {
    const base = {
      id: "00000000-0000-4000-8000-000000000501",
      type: "expense" as const,
      version: 1,
      amountMinor: 6000,
      transactionDate: "2026-08-15",
      categoryId: options.categories[0]?.id ?? "",
      memo: null,
      allocationMethod: "single" as const,
      allocations: [{ memberId: currentMembershipId, amountMinor: 6000 }],
    };
    const { container, unmount } = render(
      <ExpenseForm
        edit={{
          returnTo: `/groups/${groupId}/history`,
          transaction: {
            ...base,
            payerMemberId: "00000000-0000-4000-8000-000000000102",
            payerDisplayName: "佐藤",
            payerIsActive: true,
          },
        }}
        options={options}
      />,
    );
    expect(
      (
        container.querySelector(
          'input[name="payerMemberId"]',
        ) as HTMLInputElement
      ).value,
    ).toBe("00000000-0000-4000-8000-000000000102");
    unmount();

    const removed = render(
      <ExpenseForm
        edit={{
          returnTo: `/groups/${groupId}/history`,
          transaction: {
            ...base,
            payerMemberId: "00000000-0000-4000-8000-000000000199",
            payerDisplayName: "退会者",
            payerIsActive: false,
          },
        }}
        options={options}
      />,
    );
    expect(
      (
        removed.container.querySelector(
          'input[name="payerMemberId"]',
        ) as HTMLInputElement
      ).value,
    ).toBe(currentMembershipId);
    expect(screen.queryByText(/これまでの支払者/)).toBeNull();
  });

  it("支出の文言は「分け方」「支出した人」「内訳の確認」とし、「負担」「支払者」を表示しない (AC-TXN-018-2)", () => {
    const { container } = renderForm();

    expect(screen.getByRole("group", { name: "分け方" })).toBeTruthy();
    expect(screen.getByLabelText("支出した人")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "内訳の確認" })).toBeTruthy();
    expect(container.textContent).not.toContain("負担");
    expect(container.textContent).not.toContain("支払");
  });
});

describe("ExpenseForm の金額テンキー (TXN-014)", () => {
  it("OSの仮想キーボードを開かず、テンキーで金額を組み立てる (AC-TXN-014-1)", () => {
    renderForm();

    // inputmode=noneでOSの仮想キーボードを抑止する
    expect(amountInput().getAttribute("inputmode")).toBe("none");

    pressKey("1");
    pressKey("2");
    pressKey("00");

    expect(amountInput().value).toBe("1,200");
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

    expect(amountInput().value).toBe("2,480");
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
    expect(amountInput().value).toBe("9,007,199,254,740,991");
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

    expect(amountInput().value).toBe("1,200");
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

    expect(amountInput().value).toBe("2,500");
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

    expect(amountInput().value).toBe("3,400");
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

describe("ExpenseForm のテンキーの閉じるキー (AC-TXN-014-8, AC-TXN-014-9)", () => {
  const closeKey = () =>
    screen.getByRole("button", { name: "テンキーを閉じる" });

  it("閉じるキーを押すとテンキーを閉じ、再開の説明を表示する (AC-TXN-014-8)", () => {
    renderForm();

    expect(closeKey().textContent).toBe("閉じる");
    fireEvent.click(closeKey());

    expect(screen.queryByRole("button", { name: "1" })).toBeNull();
    expect(screen.queryByRole("button", { name: "1桁削除" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "テンキーを閉じる" }),
    ).toBeNull();
    expect(screen.getByText(/金額欄をタップ/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "支出を保存" })).toBeTruthy();
  });

  it("閉じるキーはフォームを送信せず、金額と式を失わない (AC-TXN-014-8)", () => {
    renderForm();

    pressKey("1");
    pressKey("2");
    pressKey("00");
    fireEvent.click(screen.getByRole("button", { name: "足す" }));
    pressKey("3");
    expect(closeKey().getAttribute("type")).toBe("button");

    fireEvent.click(closeKey());

    expect(amountInput().value).toBe("1,200+3");
    const hidden = document.querySelector(
      'input[name="amountMinor"]',
    ) as HTMLInputElement;
    expect(hidden.value).toBe("1203");
  });

  it("閉じた直後のfocusは金額欄へ移り、その移動ではテンキーを開かない (AC-TXN-014-8)", () => {
    renderForm();

    fireEvent.click(closeKey());

    expect(document.activeElement).toBe(amountInput());
    expect(screen.queryByRole("button", { name: "1" })).toBeNull();
  });

  it("閉じたあと金額欄を再びタップまたはfocusすると開く (AC-TXN-014-8)", () => {
    renderForm();

    fireEvent.click(closeKey());
    fireEvent.click(amountInput());
    expect(screen.getByRole("button", { name: "1" })).toBeTruthy();

    fireEvent.click(closeKey());
    fireEvent.blur(amountInput());
    fireEvent.focus(amountInput());
    expect(screen.getByRole("button", { name: "1" })).toBeTruthy();
  });

  it("閉じるは入力ドック直下の先頭に置き、カテゴリのgroup名やテンキーの配列に混ぜない (AC-TXN-014-9)", () => {
    renderForm();

    const dock = closeKey().parentElement;
    expect(dock?.getAttribute("data-keypad-open")).toBe("true");
    expect(dock?.firstElementChild).toBe(closeKey());
    expect(closeKey().closest("fieldset")).toBeNull();
    expect(screen.getByRole("group", { name: "カテゴリ" })).toBeTruthy();
    // 数字の最下行は従来どおり00・0（2列幅）のまま
    const zero = screen.getByRole("button", { name: "0" });
    expect(zero.getAttribute("data-key")).toBe("0");
    expect(closeKey().closest("[class*='keypad-digits']")).toBeNull();
  });

  it("カテゴリ展開中はテンキーと一緒に閉じるも隠す (AC-TXN-014-9)", () => {
    renderForm();

    fireEvent.click(screen.getByRole("button", { name: "すべて" }));
    expect(
      screen.queryByRole("button", { name: "テンキーを閉じる" }),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(closeKey()).toBeTruthy();
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

    // 式の計算結果の行が現れたときも、金額欄ごと隠れない位置へ移動する (AC-TXN-017-3)
    scrollBy.mockClear();
    pressKey("5");
    pressKey("足す");
    pressKey("5");
    await vi.waitFor(() => expect(scrollBy).toHaveBeenCalled());
  });
});

describe("ExpenseForm の電卓 (TXN-017)", () => {
  function submittedAmount(): HTMLInputElement {
    return document.querySelector(
      'input[name="amountMinor"]',
    ) as HTMLInputElement;
  }

  it("演算子で式を組み立て、計算結果を表示し、送信する金額は計算結果にする (AC-TXN-017-1, AC-TXN-017-3)", () => {
    renderForm();

    pressKey("1");
    pressKey("2");
    pressKey("00");
    pressKey("足す");
    pressKey("3");
    pressKey("00");

    expect(amountInput().value).toBe("1,200+300");
    const result = screen.getByText("= ¥1,500");
    expect(amountInput().getAttribute("aria-describedby")).toContain(result.id);
    // 表示用の金額欄はFormDataへ含めず、hidden inputだけが計算結果を送信する
    expect(amountInput().hasAttribute("name")).toBe(false);
    expect(submittedAmount().type).toBe("hidden");
    expect(submittedAmount().value).toBe("1500");
  });

  it("右辺がある状態で別の演算子を押すと計算して新しい左辺にする (AC-TXN-017-1)", () => {
    renderForm();

    pressKey("1");
    pressKey("0");
    pressKey("足す");
    pressKey("5");
    pressKey("掛ける");

    expect(amountInput().value).toBe("15×");
    expect(submittedAmount().value).toBe("15");
  });

  it("空の金額欄では演算子を無視し、右辺が空の間は演算子を置き換える (AC-TXN-017-1)", () => {
    renderForm();

    pressKey("足す");
    expect(amountInput().value).toBe("");

    pressKey("5");
    pressKey("足す");
    pressKey("引く");
    expect(amountInput().value).toBe("5−");
    // 右辺が空の式は左辺を送信する
    expect(submittedAmount().value).toBe("5");
    expect(screen.queryByText(/^= ¥/)).toBeNull();
  });

  it("=で式を計算結果だけの表示へ戻し、0円は空欄へ戻す (AC-TXN-017-2)", () => {
    renderForm();

    pressKey("1");
    pressKey("2");
    pressKey("00");
    pressKey("足す");
    pressKey("3");
    pressKey("00");
    pressKey("計算する");
    expect(amountInput().value).toBe("1,500");
    expect(screen.queryByText(/^= ¥/)).toBeNull();

    pressKey("引く");
    pressKey("1");
    pressKey("5");
    pressKey("00");
    pressKey("計算する");
    expect(amountInput().value).toBe("");
  });

  it("÷の端数は四捨五入する (AC-TXN-017-4)", () => {
    renderForm();

    pressKey("2");
    pressKey("00");
    pressKey("0");
    pressKey("割る");
    pressKey("3");

    expect(screen.getByText("= ¥667")).toBeTruthy();
    expect(submittedAmount().value).toBe("667");
  });

  it("0円未満・上限超過の式は計算せず理由を示し、送信する金額を空にする (AC-TXN-017-4)", () => {
    renderForm();

    pressKey("3");
    pressKey("引く");
    pressKey("5");
    const reason = screen.getByText("0円未満にはできません");
    expect(amountInput().getAttribute("aria-describedby")).toContain(reason.id);
    expect(submittedAmount().value).toBe("");

    // =や演算子を押しても式を壊さない
    pressKey("計算する");
    pressKey("足す");
    expect(amountInput().value).toBe("3−5");

    fireEvent.change(amountInput(), {
      target: { value: "9007199254740991+1" },
    });
    expect(screen.getByText("金額が上限を超えます")).toBeTruthy();
    expect(submittedAmount().value).toBe("");
  });

  it("右辺に0だけを置けないため、0で割る式は組み立てられない (AC-TXN-017-4, AC-TXN-017-5)", () => {
    renderForm();

    pressKey("3");
    pressKey("割る");
    pressKey("0");
    pressKey("00");
    expect(amountInput().value).toBe("3÷");
    fireEvent.change(amountInput(), { target: { value: "3÷0" } });
    expect(amountInput().value).toBe("3÷");
    expect(submittedAmount().value).toBe("3");
  });

  it("右辺にも先頭0を作らず、1文字削除は演算子も取り消す (AC-TXN-017-5)", () => {
    renderForm();

    pressKey("5");
    pressKey("足す");
    pressKey("0");
    pressKey("00");
    expect(amountInput().value).toBe("5+");

    pressKey("1桁削除");
    expect(amountInput().value).toBe("5");
  });

  it("物理キーボードの+、-、*、/を演算子として受け付ける (AC-TXN-017-1)", () => {
    renderForm();

    fireEvent.change(amountInput(), { target: { value: "1000*3" } });
    expect(amountInput().value).toBe("1,000×3");
    expect(submittedAmount().value).toBe("3000");

    fireEvent.change(amountInput(), { target: { value: "50/2" } });
    expect(amountInput().value).toBe("50÷2");

    fireEvent.change(amountInput(), { target: { value: "9-4" } });
    expect(amountInput().value).toBe("9−4");
  });

  it("演算子と=はフォームを送信せず、テンキーを閉じると数字キーと一緒に消える (AC-TXN-017-6)", () => {
    renderForm();

    for (const name of ["割る", "掛ける", "引く", "足す", "計算する"]) {
      expect(screen.getByRole("button", { name }).getAttribute("type")).toBe(
        "button",
      );
    }

    fireEvent.focus(screen.getByLabelText("メモ（任意）"));
    expect(screen.queryByRole("button", { name: "足す" })).toBeNull();
    expect(screen.queryByRole("button", { name: "計算する" })).toBeNull();
    expect(screen.getByRole("button", { name: "支出を保存" })).toBeTruthy();
  });

  it("桁区切りを含めて8文字以上の式では金額欄の文字を小さくする指標を付ける (TXN-017, AC-TXN-014-10)", () => {
    renderForm();

    // 「1,200+3」は7文字なので縮小しない
    fireEvent.change(amountInput(), { target: { value: "1200+3" } });
    expect(amountInput().value).toBe("1,200+3");
    expect(amountInput().parentElement?.getAttribute("data-long")).toBeNull();

    // 「1,200+30」は区切り込みで8文字になるため縮小する
    fireEvent.change(amountInput(), { target: { value: "1200+30" } });
    expect(amountInput().value).toBe("1,200+30");
    expect(amountInput().parentElement?.getAttribute("data-long")).toBe("true");

    // 区切りなしでは7桁でも、「1,234,567」は9文字になるため縮小する
    fireEvent.change(amountInput(), { target: { value: "1234567" } });
    expect(amountInput().value).toBe("1,234,567");
    expect(amountInput().parentElement?.getAttribute("data-long")).toBe("true");
  });

  it("入力中の金額を3桁区切りで表示し、送信する金額は区切りなしの整数にする (AC-TXN-014-10)", () => {
    renderForm();

    for (const key of ["1", "2", "8", "0", "00"]) pressKey(key);

    expect(amountInput().value).toBe("128,000");
    expect(submittedAmount().value).toBe("128000");
    // 式の各項も区切り、結果表示「= ¥」と表記をそろえる
    pressKey("足す");
    pressKey("1");
    pressKey("5");
    pressKey("00");
    expect(amountInput().value).toBe("128,000+1,500");
    expect(screen.getByText("= ¥129,500")).toBeTruthy();
    expect(submittedAmount().value).toBe("129500");
  });

  it("物理キーボードから区切り記号を含む値が入っても式を壊さない (AC-TXN-014-2, AC-TXN-014-10)", () => {
    renderForm();

    fireEvent.change(amountInput(), { target: { value: "1,280" } });
    expect(amountInput().value).toBe("1,280");
    expect(submittedAmount().value).toBe("1280");

    // 表示中の値の末尾へ1桁打つと、区切りを無視して桁が増える
    fireEvent.change(amountInput(), { target: { value: "1,2805" } });
    expect(amountInput().value).toBe("12,805");
    expect(submittedAmount().value).toBe("12805");

    // 1桁削除は表示ではなく式の末尾1文字を取り消す
    pressKey("1桁削除");
    expect(amountInput().value).toBe("1,280");
    expect(submittedAmount().value).toBe("1280");
  });

  it("編集時は保存済みの金額を式なしで表示し、送信値も一致する (AC-TXN-017-3)", () => {
    render(
      <ExpenseForm
        clientRequestId="req-1"
        edit={{
          transaction: {
            id: "00000000-0000-4000-8000-000000000901",
            type: "expense",
            amountMinor: 3200,
            transactionDate: "2026-09-01",
            categoryId: options.categories[0].id,
            memo: "",
            version: 1,
            payerMemberId: currentMembershipId,
            payerIsActive: true,
            payerDisplayName: "山田",
            allocationMethod: "single",
            allocations: [{ memberId: currentMembershipId, amountMinor: 3200 }],
          },
          returnTo: "/app",
        }}
        options={options}
      />,
    );

    expect(amountInput().value).toBe("3,200");
    expect(submittedAmount().value).toBe("3200");
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
