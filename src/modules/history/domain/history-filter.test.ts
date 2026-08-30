import { describe, expect, it } from "vitest";

import { encodeHistoryCursor } from "./history-cursor";
import {
  getHistoryMonthRange,
  historyDefaultPageSize,
  historyMaxPageSize,
  parseHistoryFilter,
  type HistoryFilterContext,
} from "./history-filter";

const categoryId = "00000000-0000-4000-8000-000000000011";
const payerId = "00000000-0000-4000-8000-000000000021";
const recipientId = "00000000-0000-4000-8000-000000000022";
const memberId = "00000000-0000-4000-8000-000000000023";
const foreignId = "00000000-0000-4000-8000-0000000000ff";

const context: HistoryFilterContext = {
  categoryIds: new Set([categoryId]),
  membershipIds: new Set([payerId, recipientId, memberId]),
};

describe("parseHistoryFilter", () => {
  it("絞り込みなしでは標準ページサイズだけを適用する", () => {
    const result = parseHistoryFilter({}, context);

    expect(result).toEqual({
      success: true,
      value: { limit: historyDefaultPageSize },
    });
  });

  it("空文字は「すべて」を意味する正規値として受け入れる", () => {
    const result = parseHistoryFilter(
      {
        month: "",
        type: "",
        category: "",
        payer: "",
        recipient: "",
        member: "",
        cursor: "",
        limit: "",
      },
      context,
    );

    expect(result).toEqual({
      success: true,
      value: { limit: historyDefaultPageSize },
    });
  });

  it("すべての絞り込みを組み合わせて検証できる", () => {
    const cursor = {
      transactionDate: "2026-08-15",
      createdAt: "2026-08-15T00:00:00+00:00",
      id: "00000000-0000-4000-8000-000000000031",
    };
    const result = parseHistoryFilter(
      {
        month: "2026-08",
        type: "expense",
        category: categoryId,
        payer: payerId,
        recipient: recipientId,
        member: memberId,
        limit: "100",
        cursor: encodeHistoryCursor(cursor),
      },
      context,
    );

    expect(result).toEqual({
      success: true,
      value: {
        month: "2026-08",
        type: "expense",
        categoryId,
        payerMemberId: payerId,
        recipientMemberId: recipientId,
        memberMemberId: memberId,
        limit: historyMaxPageSize,
        cursor,
      },
    });
  });

  it.each([
    [{ month: "2026-13" }, "invalid_month"],
    [{ month: "abc" }, "invalid_month"],
    [{ month: ["2026-08", "2026-09"] }, "invalid_month"],
    [{ type: "transfer" }, "invalid_type"],
    [{ type: ["expense", "income"] }, "invalid_type"],
    [{ category: "not-a-uuid" }, "invalid_category"],
    [{ category: foreignId }, "invalid_category"],
    [{ payer: foreignId }, "invalid_payer"],
    [{ payer: "x" }, "invalid_payer"],
    [{ recipient: foreignId }, "invalid_recipient"],
    [{ member: foreignId }, "invalid_member"],
    [{ limit: "0" }, "invalid_limit"],
    [{ limit: "101" }, "invalid_limit"],
    [{ limit: "abc" }, "invalid_limit"],
    [{ limit: "30.5" }, "invalid_limit"],
    [{ cursor: "!!broken!!" }, "invalid_cursor"],
    [{ cursor: "AAAA" }, "invalid_cursor"],
  ] as const)("不正値%jを暗黙補正せず拒否する", (input, reason) => {
    expect(parseHistoryFilter(input, context)).toEqual({
      success: false,
      reason,
    });
  });

  it("文字列以外の値を拒否する", () => {
    expect(parseHistoryFilter({ month: 202608 as unknown }, context)).toEqual({
      success: false,
      reason: "invalid_month",
    });
  });
});

describe("getHistoryMonthRange", () => {
  it("月初と翌月初の範囲を返す", () => {
    expect(getHistoryMonthRange("2026-08")).toEqual({
      start: "2026-08-01",
      endExclusive: "2026-09-01",
    });
  });

  it("年末は翌年1月へ繰り上げる", () => {
    expect(getHistoryMonthRange("2026-12")).toEqual({
      start: "2026-12-01",
      endExclusive: "2027-01-01",
    });
  });
});
