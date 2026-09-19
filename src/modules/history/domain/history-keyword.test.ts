import { describe, expect, it } from "vitest";

import {
  buildHistoryKeywordCondition,
  buildHistoryKeywordOrCondition,
  escapeHistoryLikePattern,
  historyKeywordMaxLength,
  normalizeHistoryKeyword,
  parseHistoryKeywordAmount,
  quotePostgrestFilterValue,
} from "./history-keyword";

describe("normalizeHistoryKeyword (AC-HIS-009-1)", () => {
  it("前後の空白を除き、空白だけは未指定にする", () => {
    expect(normalizeHistoryKeyword("  炊飯器 ")).toBe("炊飯器");
    expect(normalizeHistoryKeyword("")).toBeUndefined();
    expect(normalizeHistoryKeyword(" \t　")).toBeUndefined();
  });

  it("100文字までを受け付け、101文字以上はnullで拒否する", () => {
    expect(historyKeywordMaxLength).toBe(100);
    const limit = "あ".repeat(100);
    expect(normalizeHistoryKeyword(limit)).toBe(limit);
    expect(normalizeHistoryKeyword(`${limit}い`)).toBeNull();
    // 前後の空白は文字数に数えない
    expect(normalizeHistoryKeyword(` ${limit} `)).toBe(limit);
  });
});

describe("escapeHistoryLikePattern (AC-HIS-009-2)", () => {
  it("LIKEのメタ文字を文字そのものとして照合できるようエスケープする", () => {
    expect(escapeHistoryLikePattern("100%")).toBe("100\\%");
    expect(escapeHistoryLikePattern("a_b")).toBe("a\\_b");
    expect(escapeHistoryLikePattern("c:\\dir")).toBe("c:\\\\dir");
    expect(escapeHistoryLikePattern("炊飯器")).toBe("炊飯器");
  });
});

describe("parseHistoryKeywordAmount (AC-HIS-009-2)", () => {
  it("通貨記号・桁区切り・空白・全角数字を正規化して金額にする", () => {
    expect(parseHistoryKeywordAmount("3980")).toBe(3980);
    expect(parseHistoryKeywordAmount("¥3,980")).toBe(3980);
    expect(parseHistoryKeywordAmount("￥3，980")).toBe(3980);
    expect(parseHistoryKeywordAmount("３９８０")).toBe(3980);
    expect(parseHistoryKeywordAmount("1 000")).toBe(1000);
  });

  it("数字だけにならないキーワードと16桁以上は金額として扱わない", () => {
    expect(parseHistoryKeywordAmount("3980円")).toBeUndefined();
    expect(parseHistoryKeywordAmount("コストコ")).toBeUndefined();
    expect(parseHistoryKeywordAmount("12.5")).toBeUndefined();
    expect(parseHistoryKeywordAmount("-100")).toBeUndefined();
    expect(parseHistoryKeywordAmount("1".repeat(15))).toBe(111111111111111);
    expect(parseHistoryKeywordAmount("1".repeat(16))).toBeUndefined();
  });
});

describe("buildHistoryKeywordCondition (AC-HIS-009-2)", () => {
  it("メモの部分一致パターンを作り、数字のキーワードには金額の完全一致を加える", () => {
    expect(buildHistoryKeywordCondition("炊飯器")).toEqual({
      memoPattern: "%炊飯器%",
    });
    expect(buildHistoryKeywordCondition("¥3,980")).toEqual({
      memoPattern: "%¥3,980%",
      amountMinor: 3980,
    });
    expect(buildHistoryKeywordCondition("50%off")).toEqual({
      memoPattern: "%50\\%off%",
    });
  });
});

describe("quotePostgrestFilterValue", () => {
  it("PostgRESTのfilter値を二重引用符で囲み、内側の引用符とバックスラッシュをエスケープする", () => {
    expect(quotePostgrestFilterValue("a,b(c).d")).toBe('"a,b(c).d"');
    expect(quotePostgrestFilterValue('say "hi"')).toBe('"say \\"hi\\""');
    expect(quotePostgrestFilterValue("%\\%%")).toBe('"%\\\\%%"');
  });
});

describe("buildHistoryKeywordOrCondition (AC-HIS-009-2)", () => {
  it("メモの部分一致と金額の完全一致を「または」で結ぶfilter文字列を作る", () => {
    expect(
      buildHistoryKeywordOrCondition({
        memoPattern: "%3,980%",
        amountMinor: 3980,
      }),
    ).toBe('memo.ilike."%3,980%",amount_minor.eq.3980');
  });

  it("金額候補が無いときはメモの条件だけになる", () => {
    expect(buildHistoryKeywordOrCondition({ memoPattern: '%"炊飯器"%' })).toBe(
      'memo.ilike."%\\"炊飯器\\"%"',
    );
  });
});
