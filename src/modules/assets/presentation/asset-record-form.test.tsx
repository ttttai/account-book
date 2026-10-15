import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AssetRecordFormReady } from "../application/asset-types";
import { AssetRecordScreen } from "./asset-record-form";

vi.mock("./actions", () => ({
  saveAssetSnapshotAction: vi.fn(),
  deleteAssetSnapshotAction: vi.fn(),
}));

const GROUP_ID = "10000000-0000-4000-8000-000000000001";
const CASH = "40000000-0000-4000-8000-000000000001";
const NISA = "40000000-0000-4000-8000-000000000002";
const ME = "50000000-0000-4000-8000-000000000001";
const PARTNER = "50000000-0000-4000-8000-000000000002";

function createView(
  overrides: Partial<AssetRecordFormReady> = {},
): AssetRecordFormReady {
  return {
    kind: "ready",
    group: { id: GROUP_ID, name: "わが家" },
    month: "2026-10",
    previousMonth: "2026-09",
    nextMonth: null,
    currentMonth: "2026-10",
    members: [
      { memberId: ME, displayName: "たいし", isCurrentUser: true },
      { memberId: PARTNER, displayName: "はなこ", isCurrentUser: false },
    ],
    categories: [
      { id: CASH, name: "現金・預金", color: "sky" },
      { id: NISA, name: "NISA", color: "orange" },
    ],
    initialValues: {
      [`${ME}:${CASH}`]: "1200000",
      [`${ME}:${NISA}`]: "",
      [`${PARTNER}:${CASH}`]: "500000",
      [`${PARTNER}:${NISA}`]: "",
    },
    copiedFrom: "2026-09",
    existing: null,
    canManageCategories: true,
    ...overrides,
  };
}

function hiddenValue(name: string): string | null {
  return (
    document.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value ??
    null
  );
}

afterEach(() => cleanup());

describe("AssetRecordScreen", () => {
  it("コピー元の月を案内し、メンバーごとに区分の金額欄を3桁区切りで並べる (AC-AST-002-1、AC-AST-003-1)", () => {
    render(<AssetRecordScreen view={createView()} />);
    expect(
      screen.getByText(
        "2026年9月の記録をコピーしました。変わった金額だけ直して保存してください。",
      ),
    ).toBeTruthy();
    const groups = screen.getAllByRole("group");
    expect(
      groups.some((group) => group.textContent?.startsWith("たいし")),
    ).toBe(true);
    const cashInputs = screen.getAllByLabelText("現金・預金");
    expect(cashInputs).toHaveLength(2);
    expect((cashInputs[0] as HTMLInputElement).value).toBe("1,200,000");
    expect(cashInputs[0]?.getAttribute("inputmode")).toBe("none");
    expect(hiddenValue(`asset:${ME}:${CASH}`)).toBe("1200000");
    expect(hiddenValue("expectedVersion")).toBe("");
    expect(screen.getByRole("status").textContent).toContain("￥1,700,000");
  });

  it("空の欄では数字を追加し、小計と合計を即時に更新する (AC-AST-002-5)", () => {
    render(<AssetRecordScreen view={createView()} />);
    const nisa = screen.getAllByLabelText("NISA")[0] as HTMLInputElement;
    fireEvent.focus(nisa);
    fireEvent.click(screen.getByRole("button", { name: "3" }));
    fireEvent.click(screen.getByRole("button", { name: "00" }));
    fireEvent.click(screen.getByRole("button", { name: "00" }));
    fireEvent.click(screen.getByRole("button", { name: "0" }));
    expect(nisa.value).toBe("300,000");
    expect(hiddenValue(`asset:${ME}:${NISA}`)).toBe("300000");
    expect(screen.getByText("小計 ￥1,500,000")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("￥2,000,000");
  });

  it("テンキーは一覧に差し込まず下部のドックへ開き、入力中の欄名と閉じるを示す (AC-AST-002-5)", () => {
    render(<AssetRecordScreen view={createView()} />);
    expect(screen.queryByRole("region", { name: "金額の入力" })).toBeNull();
    const cash = screen.getAllByLabelText("現金・預金")[0] as HTMLInputElement;
    const fieldsBefore = document.querySelectorAll("[data-asset-field]");
    fireEvent.focus(cash);
    const dock = screen.getByRole("region", { name: "金額の入力" });
    expect(dock.textContent).toContain("たいし・現金・預金");
    // ドックは金額欄のまとまりの外にあり、欄の並びへ要素を差し込まない
    expect(dock.closest("[data-asset-field]")).toBeNull();
    expect(document.querySelectorAll("[data-asset-field]")).toHaveLength(
      fieldsBefore.length,
    );
    fireEvent.click(screen.getByRole("button", { name: "テンキーを閉じる" }));
    expect(screen.queryByRole("region", { name: "金額の入力" })).toBeNull();
  });

  it("金額の入っている欄は最初の数字で置き換え、1文字削除では末尾を削除する (AC-AST-002-5)", () => {
    render(<AssetRecordScreen view={createView()} />);
    const cash = screen.getAllByLabelText("現金・預金")[0] as HTMLInputElement;
    fireEvent.focus(cash);
    expect(cash.closest("[data-pending-replace]")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    expect(cash.value).toBe("2");
    expect(cash.closest("[data-pending-replace]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "00" }));
    expect(cash.value).toBe("200");

    const partnerCash = screen.getAllByLabelText(
      "現金・預金",
    )[1] as HTMLInputElement;
    fireEvent.focus(partnerCash);
    fireEvent.click(screen.getByRole("button", { name: "1桁削除" }));
    expect(partnerCash.value).toBe("50,000");
    fireEvent.click(screen.getByRole("button", { name: "1" }));
    expect(partnerCash.value).toBe("500,001");
  });

  it("保存へのfocusではドックを閉じず、押下中にボタンをずらさない (AC-AST-002-5)", () => {
    render(<AssetRecordScreen view={createView()} />);
    fireEvent.focus(screen.getAllByLabelText("NISA")[0] as HTMLInputElement);
    fireEvent.focus(screen.getByRole("button", { name: "保存する" }));
    expect(screen.getByRole("region", { name: "金額の入力" })).toBeTruthy();
  });

  it("「次へ」で表示順の次の欄へ移り、最後の欄では「完了」で閉じる (AC-AST-002-5)", () => {
    render(<AssetRecordScreen view={createView()} />);
    fireEvent.focus(
      screen.getAllByLabelText("現金・預金")[0] as HTMLInputElement,
    );
    fireEvent.click(screen.getByRole("button", { name: "次へ" }));
    const dock = () => screen.getByRole("region", { name: "金額の入力" });
    expect(dock().textContent).toContain("たいし・NISA");
    expect(document.activeElement).toBe(screen.getAllByLabelText("NISA")[0]);
    fireEvent.click(screen.getByRole("button", { name: "次へ" }));
    expect(dock().textContent).toContain("はなこ・現金・預金");
    fireEvent.click(screen.getByRole("button", { name: "次へ" }));
    expect(dock().textContent).toContain("はなこ・NISA");
    fireEvent.click(screen.getByRole("button", { name: "完了" }));
    expect(screen.queryByRole("region", { name: "金額の入力" })).toBeNull();
  });

  it("既存記録は更新者を示し、versionを送って削除には確認を求める (AC-AST-004-1、AC-AST-004-2)", () => {
    render(
      <AssetRecordScreen
        view={createView({
          copiedFrom: null,
          existing: {
            version: 3,
            updatedByName: "はなこ",
            updatedAt: "2026-10-05T01:30:00.000Z",
          },
        })}
      />,
    );
    expect(screen.getByText(/はなこさんが更新した記録です。/)).toBeTruthy();
    expect(hiddenValue("expectedVersion")).toBe("3");
    fireEvent.click(screen.getByRole("button", { name: "この月の記録を削除" }));
    expect(
      screen.getByText("2026年10月の資産記録を削除します。元に戻せません。"),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "削除を確定する" })).toBeTruthy();
  });

  it("翌月操作は当月で無効化し、前月は記録画面へのリンクにする (AC-AST-003-2)", () => {
    render(<AssetRecordScreen view={createView()} />);
    expect(
      (screen.getByRole("button", { name: "翌月" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      screen.getByRole("link", { name: "前月" }).getAttribute("href"),
    ).toBe(`/groups/${GROUP_ID}/assets/record?month=2026-09`);
  });

  it("資産区分がなければ入力欄を出さず、権限に応じた案内を出す", () => {
    const { unmount } = render(
      <AssetRecordScreen view={createView({ categories: [] })} />,
    );
    expect(
      screen.getByRole("link", { name: "資産区分を設定する" }),
    ).toBeTruthy();
    unmount();
    render(
      <AssetRecordScreen
        view={createView({ categories: [], canManageCategories: false })}
      />,
    );
    expect(
      screen.getByText("資産区分はオーナーと管理者が設定します。"),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "保存する" })).toBeNull();
  });
});
