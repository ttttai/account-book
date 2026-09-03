import { describe, expect, it } from "vitest";

import {
  BASE_CHECK_INTERVAL_MS,
  changesRequestPath,
  isAutoRefreshPath,
  isEditingElement,
  MAX_CHECK_INTERVAL_MS,
  nextCheckDelayMs,
  shouldCheckOnVisible,
  urlWithoutHistoryCursor,
} from "./sync-policy";

const GROUP_ID = "10000000-0000-4000-8000-000000000001";
const BASE = `/groups/${GROUP_ID}`;

describe("isAutoRefreshPath", () => {
  it("ホーム・履歴・概要分析・詳細分析だけを自動反映画面にする (SYNC-001, SYNC-005)", () => {
    for (const path of [
      BASE,
      `${BASE}/`,
      `${BASE}/history`,
      `${BASE}/analytics`,
      `${BASE}/analytics/details`,
    ]) {
      expect(isAutoRefreshPath(path, GROUP_ID), path).toBe(true);
    }
    for (const path of [
      `${BASE}/transactions/new`,
      `${BASE}/transactions/abc/edit`,
      `${BASE}/settings`,
      `${BASE}/members`,
      `${BASE}/categories`,
      `${BASE}/recurring-transactions`,
      "/app",
      "/groups/other-group",
    ]) {
      expect(isAutoRefreshPath(path, GROUP_ID), path).toBe(false);
    }
  });
});

describe("nextCheckDelayMs", () => {
  it("失敗ごとに2倍へ延ばし、300秒を上限にする (AC-SYNC-006-1)", () => {
    expect(nextCheckDelayMs(0)).toBe(BASE_CHECK_INTERVAL_MS);
    expect(nextCheckDelayMs(1)).toBe(60_000);
    expect(nextCheckDelayMs(2)).toBe(120_000);
    expect(nextCheckDelayMs(3)).toBe(240_000);
    expect(nextCheckDelayMs(4)).toBe(MAX_CHECK_INTERVAL_MS);
    expect(nextCheckDelayMs(50)).toBe(MAX_CHECK_INTERVAL_MS);
    expect(nextCheckDelayMs(-1)).toBe(BASE_CHECK_INTERVAL_MS);
  });
});

describe("shouldCheckOnVisible", () => {
  it("初回と前回から5秒以上経過したときだけ直ちに確認する (AC-SYNC-002-1)", () => {
    expect(shouldCheckOnVisible(undefined, 10_000)).toBe(true);
    expect(shouldCheckOnVisible(1_000, 6_000)).toBe(true);
    expect(shouldCheckOnVisible(1_000, 5_999)).toBe(false);
  });
});

describe("isEditingElement", () => {
  it("input・textarea・select・contenteditableだけを入力中とみなす (AC-SYNC-004-3)", () => {
    const input = document.createElement("input");
    const textarea = document.createElement("textarea");
    const select = document.createElement("select");
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    document.body.append(editable);
    const button = document.createElement("button");
    const link = document.createElement("a");

    expect(isEditingElement(input)).toBe(true);
    expect(isEditingElement(textarea)).toBe(true);
    expect(isEditingElement(select)).toBe(true);
    expect(isEditingElement(editable)).toBe(true);
    expect(isEditingElement(button)).toBe(false);
    expect(isEditingElement(link)).toBe(false);
    expect(isEditingElement(null)).toBe(false);
    expect(isEditingElement(document.body)).toBe(false);
    editable.remove();
  });
});

describe("changesRequestPath", () => {
  it("グループIDをencodeした変更確認URLを返す", () => {
    expect(changesRequestPath(GROUP_ID)).toBe(
      `/api/v1/groups/${GROUP_ID}/changes`,
    );
    expect(changesRequestPath("a/b")).toBe("/api/v1/groups/a%2Fb/changes");
  });
});

describe("urlWithoutHistoryCursor", () => {
  it("cursorだけを除き、他の絞り込み条件を維持する (AC-SYNC-004-2)", () => {
    expect(
      urlWithoutHistoryCursor(
        `https://example.test${BASE}/history?month=2026-08&cursor=abc&type=expense`,
      ),
    ).toBe(`${BASE}/history?month=2026-08&type=expense`);
    expect(
      urlWithoutHistoryCursor(`https://example.test${BASE}/history?cursor=abc`),
    ).toBe(`${BASE}/history`);
  });

  it("cursorが無ければundefinedを返しURLを変えない", () => {
    expect(
      urlWithoutHistoryCursor(
        `https://example.test${BASE}?month=2026-08&scope=group&day=2026-08-15`,
      ),
    ).toBeUndefined();
  });
});
