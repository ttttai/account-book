import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RecurringManagementView } from "../application/recurring-types";
import { RecurringManagement } from "./recurring-management";

vi.mock("./actions", () => ({
  createRecurringAction: vi.fn(),
  updateRecurringAction: vi.fn(),
  endRecurringAction: vi.fn(),
}));

const currentMembershipId = "00000000-0000-4000-8000-000000000101";

const view: RecurringManagementView = {
  group: { id: "00000000-0000-4000-8000-000000000001", name: "家計" },
  currentMonth: "2026-09",
  canManage: true,
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
  categories: [
    {
      id: "00000000-0000-4000-8000-000000000201",
      name: "住居",
      type: "expense",
      color: "housing",
    },
    {
      id: "00000000-0000-4000-8000-000000000301",
      name: "給与",
      type: "income",
      color: "income",
    },
  ],
  recurringTransactions: [
    {
      id: "00000000-0000-4000-8000-000000000401",
      type: "expense",
      name: "家賃",
      amountMinor: 120000,
      dayOfMonth: 27,
      startMonth: "2026-04",
      endMonth: null,
      version: 1,
      categoryName: "住居",
      categoryColor: "housing",
      partyDisplayName: "山田",
      partyMembershipId: currentMembershipId,
      memo: null,
      allocations: [
        {
          membershipId: currentMembershipId,
          displayName: "山田",
          amountMinor: 120000,
        },
      ],
      isEnded: false,
    },
  ],
};

const KEYPAD_HINT = "金額欄をタップするとテンキーを開きます。";

function renderManagement() {
  return render(<RecurringManagement view={view} />);
}

function amountInput(): HTMLInputElement {
  return screen.getByLabelText("金額") as HTMLInputElement;
}

// Server Actionが読む送信値。表示用の金額欄とは別のhidden inputで送る (AC-REC-005-5)
function submittedAmount(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>('input[name="amountMinor"]');
}

function pressKey(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
}

function keypadIsOpen(): boolean {
  return screen.queryByRole("button", { name: "1桁削除" }) !== null;
}

afterEach(() => {
  cleanup();
});

describe("RecurringManagement の金額テンキー (REC-010)", () => {
  it("金額欄はOSの仮想キーボードを開かず、既定ではテンキーを閉じて再開手段を示す (AC-REC-005-1, AC-REC-005-2)", () => {
    renderManagement();

    expect(amountInput().getAttribute("inputmode")).toBe("none");
    // Server Actionが読む送信名は従来のままhidden inputで維持し、表示用の金額欄はnameを持たない (AC-REC-005-5)
    expect(amountInput().getAttribute("name")).toBeNull();
    expect(submittedAmount()?.type).toBe("hidden");
    expect(submittedAmount()?.value).toBe("");
    expect(keypadIsOpen()).toBe(false);
    expect(screen.getByText(KEYPAD_HINT)).toBeTruthy();
  });

  it("固定費のテンキーは取引入力向けの閉じるキーを持たない (AC-TXN-014-9)", () => {
    renderManagement();
    fireEvent.focus(amountInput());

    expect(keypadIsOpen()).toBe(true);
    expect(
      screen.queryByRole("button", { name: "テンキーを閉じる" }),
    ).toBeNull();
  });

  it("金額欄へfocusするとテンキーが開き、数字・00・1文字削除で値を組み立てる (AC-REC-005-1)", () => {
    renderManagement();

    fireEvent.focus(amountInput());
    expect(keypadIsOpen()).toBe(true);
    expect(screen.queryByText(KEYPAD_HINT)).toBeNull();

    pressKey("1");
    pressKey("2");
    pressKey("00");
    expect(amountInput().value).toBe("1,200");
    expect(submittedAmount()?.value).toBe("1200");

    pressKey("1桁削除");
    expect(amountInput().value).toBe("120");
    expect(submittedAmount()?.value).toBe("120");
  });

  it("入力中は3桁区切りで表示し、送信値は区切りなしの整数のまま保つ (AC-REC-005-5)", () => {
    renderManagement();
    fireEvent.focus(amountInput());

    for (const key of ["1", "2", "8", "0", "00"]) pressKey(key);
    expect(amountInput().value).toBe("128,000");
    expect(submittedAmount()?.value).toBe("128000");

    // 物理キーボードや貼り付けで入った,は無視し、区切りの位置に関係なく数字だけを状態へ反映する
    fireEvent.change(amountInput(), { target: { value: "1,2,34,567" } });
    expect(amountInput().value).toBe("1,234,567");
    expect(submittedAmount()?.value).toBe("1234567");
  });

  it("先頭に0を作らず、安全な整数の上限を超える桁を無視する (AC-REC-005-1)", () => {
    renderManagement();
    fireEvent.focus(amountInput());

    pressKey("0");
    pressKey("00");
    expect(amountInput().value).toBe("");

    fireEvent.change(amountInput(), { target: { value: "9007199254740991" } });
    pressKey("1");
    expect(amountInput().value).toBe("9,007,199,254,740,991");
    expect(submittedAmount()?.value).toBe("9007199254740991");
  });

  it("金額欄以外の入力欄へfocusするとテンキーを閉じ、金額を保持する (AC-REC-005-2)", () => {
    renderManagement();

    fireEvent.focus(amountInput());
    pressKey("5");
    fireEvent.focus(screen.getByLabelText("名称"));

    expect(keypadIsOpen()).toBe(false);
    expect(amountInput().value).toBe("5");
    expect(screen.getByText(KEYPAD_HINT)).toBeTruthy();

    // 金額欄を選び直すと再び開く
    fireEvent.focus(amountInput());
    expect(keypadIsOpen()).toBe(true);
    expect(amountInput().value).toBe("5");
  });

  it("テンキー自体の操作では開閉状態を変えず、キーはフォームを送信しない (AC-REC-005-2, AC-REC-005-3)", () => {
    renderManagement();
    fireEvent.focus(amountInput());

    fireEvent.focus(screen.getByRole("button", { name: "1" }));
    expect(keypadIsOpen()).toBe(true);

    for (const name of ["1", "0", "00", "1桁削除"]) {
      expect(screen.getByRole("button", { name }).getAttribute("type")).toBe(
        "button",
      );
    }
    expect(
      screen.getByRole("button", { name: "固定費を保存" }).getAttribute("type"),
    ).toBe("submit");
  });

  it("物理キーボードからの入力を開閉状態にかかわらず受け付ける (AC-REC-005-3)", () => {
    renderManagement();

    fireEvent.change(amountInput(), { target: { value: "2480" } });
    expect(amountInput().value).toBe("2,480");
    expect(submittedAmount()?.value).toBe("2480");

    fireEvent.focus(amountInput());
    fireEvent.change(amountInput(), { target: { value: "3000" } });
    expect(amountInput().value).toBe("3,000");
    expect(submittedAmount()?.value).toBe("3000");
  });

  it("支出の固定費では支払者を表示せず現在のメンバーを隠しfieldで送信し、収入では「受け取る人」を選べる (AC-TXN-018-1, AC-TXN-018-3)", () => {
    const { container } = renderManagement();

    // 一覧のカードにも支払者を出さない
    const card = screen.getByRole("listitem");
    expect(card.textContent).not.toContain("支払者");
    expect(card.textContent).not.toContain("負担");
    expect(card.textContent).toContain("住居");

    const form = screen
      .getByRole("heading", { name: "固定費を追加" })
      .closest("form") as HTMLFormElement;
    expect(screen.queryByLabelText("支払う人")).toBeNull();
    const hidden = form.querySelector(
      'input[name="partyMemberId"]',
    ) as HTMLInputElement | null;
    expect(hidden?.type).toBe("hidden");
    expect(hidden?.value).toBe(currentMembershipId);
    expect(form.textContent).not.toContain("負担");
    expect(form.textContent).toContain("分け方");

    fireEvent.click(screen.getByRole("radio", { name: "収入" }));
    expect(screen.getByLabelText("受け取る人")).toBeTruthy();
    expect(form.querySelector('input[name="partyMemberId"]')).toBeNull();
    expect(container.textContent).not.toContain("支払者");
  });

  it("編集フォームでは保存済みの支払者を隠しfieldで送信する (AC-TXN-018-1)", () => {
    renderManagement();

    fireEvent.click(screen.getByRole("button", { name: "編集" }));

    const form = screen
      .getByRole("heading", { name: "家賃を編集" })
      .closest("form") as HTMLFormElement;
    const hidden = form.querySelector(
      'input[name="partyMemberId"]',
    ) as HTMLInputElement | null;
    expect(hidden?.type).toBe("hidden");
    expect(hidden?.value).toBe(currentMembershipId);
    expect(screen.queryByLabelText("支払う人")).toBeNull();
  });

  it("編集フォームでは保存済みの金額を初期値として表示する (AC-REC-005-3)", () => {
    renderManagement();

    fireEvent.click(screen.getByRole("button", { name: "編集" }));

    expect(screen.getByRole("heading", { name: "家賃を編集" })).toBeTruthy();
    // 初期値も区切って表示し、送信値は保存済みの整数のまま (AC-REC-005-5)
    expect(amountInput().value).toBe("120,000");
    expect(submittedAmount()?.value).toBe("120000");
    expect(amountInput().getAttribute("inputmode")).toBe("none");
    expect(keypadIsOpen()).toBe(false);
  });

  it("テンキーを開いたとき、キーが下部ナビゲーションへ隠れない位置へ移動する (AC-REC-005-4)", async () => {
    // jsdomはscrollIntoViewを実装しないため、呼び出しの有無だけを検証する
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    renderManagement();
    fireEvent.focus(amountInput());

    await vi.waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
  });
});

describe("RecurringManagement の0件時の空状態 (AC-REC-004-2)", () => {
  const EMPTY_TITLE = "固定費はまだありません";
  const ADD_LINK = "固定費を追加する";
  const emptyView: RecurringManagementView = {
    ...view,
    recurringTransactions: [],
  };

  it("owner/adminには空状態の見出し・1文の説明と、作成フォームへ移動するリンクを表示する", () => {
    render(<RecurringManagement view={emptyView} />);

    expect(screen.getByText(EMPTY_TITLE)).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
    // 説明は1文だけにし、長い重複説明を置かない
    const description = screen.getByText(/家賃や給与など/);
    expect(description.textContent?.split("。").filter(Boolean)).toHaveLength(
      1,
    );

    const link = screen.getByRole("link", { name: ADD_LINK });
    expect(link.getAttribute("href")).toBe("#recurring-create-form");
    const form = screen
      .getByRole("heading", { name: "固定費を追加" })
      .closest("section");
    expect(form?.id).toBe("recurring-create-form");
  });

  it("memberには空状態の見出しだけを表示し、作成フォームへのリンクを出さない", () => {
    render(<RecurringManagement view={{ ...emptyView, canManage: false }} />);

    expect(screen.getByText(EMPTY_TITLE)).toBeTruthy();
    expect(screen.queryByRole("link", { name: ADD_LINK })).toBeNull();
    expect(screen.queryByRole("heading", { name: "固定費を追加" })).toBeNull();
    expect(
      screen.getByText("固定費の設定はオーナーと管理者が行います。"),
    ).toBeTruthy();
  });

  it("1件以上あるときは空状態を表示せず一覧を先頭に置く", () => {
    renderManagement();

    expect(screen.queryByText(EMPTY_TITLE)).toBeNull();
    expect(screen.queryByRole("link", { name: ADD_LINK })).toBeNull();
    expect(screen.getByRole("list")).toBeTruthy();
  });
});

describe("RecurringManagement のメンバー選択chip (AC-REC-003-3)", () => {
  function formOf(headingName: string): HTMLFormElement {
    return screen
      .getByRole("heading", { name: headingName })
      .closest("form") as HTMLFormElement;
  }

  function memberChip(form: HTMLFormElement, name: string): HTMLInputElement {
    return within(form).getByRole<HTMLInputElement>("checkbox", { name });
  }

  it("作成フォームではメンバーをchip型のcheckboxとして表示し、自分だけを初期選択する", () => {
    renderManagement();
    const createForm = formOf("固定費を追加");

    const self = memberChip(createForm, "山田（自分）");
    const other = memberChip(createForm, "佐藤");
    expect(self.checked).toBe(true);
    expect(other.checked).toBe(false);
    // 送信するname・valueは従来のまま
    expect(self.name).toBe("selectedMemberIds");
    expect(self.value).toBe(currentMembershipId);
    expect(self.closest("label")?.classList.contains("choice-chip")).toBe(true);
    expect(document.querySelector(".recurring-check")).toBeNull();

    fireEvent.click(other);
    expect(other.checked).toBe(true);
  });

  it("編集フォームでは保存済みの内訳に含まれるメンバーを選択状態で初期表示する", () => {
    renderManagement();
    fireEvent.click(screen.getByRole("button", { name: "編集" }));
    const editForm = formOf("家賃を編集");

    expect(memberChip(editForm, "山田（自分）").checked).toBe(true);
    expect(memberChip(editForm, "佐藤").checked).toBe(false);
  });
});
