import { describe, expect, it } from "vitest";

import {
  buildHistoryCursorCondition,
  decodeHistoryCursor,
  encodeHistoryCursor,
  type HistoryCursor,
} from "./history-cursor";

const cursor: HistoryCursor = {
  transactionDate: "2026-08-29",
  createdAt: "2026-08-29T01:02:03.123456+00:00",
  id: "00000000-0000-4000-8000-000000000001",
};

describe("history cursor", () => {
  it("encodeとdecodeで往復できる", () => {
    expect(decodeHistoryCursor(encodeHistoryCursor(cursor))).toEqual(cursor);
  });

  it("URLで安全な文字だけを出力する", () => {
    expect(encodeHistoryCursor(cursor)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("Z終端のタイムスタンプも受け入れる", () => {
    const zuluCursor = { ...cursor, createdAt: "2026-08-29T01:02:03Z" };
    expect(decodeHistoryCursor(encodeHistoryCursor(zuluCursor))).toEqual(
      zuluCursor,
    );
  });

  it("改ざん・不正なcursorを信用せずnullを返す", () => {
    const encode = (value: unknown) =>
      Buffer.from(JSON.stringify(value), "utf8").toString("base64url");

    expect(decodeHistoryCursor("")).toBeNull();
    expect(decodeHistoryCursor("not base64!!")).toBeNull();
    expect(decodeHistoryCursor("a".repeat(1000))).toBeNull();
    expect(decodeHistoryCursor(encode([1, 2]))).toBeNull();
    expect(decodeHistoryCursor(encode({ foo: "bar" }))).toBeNull();
    expect(
      decodeHistoryCursor(encode(["2026-02-30", cursor.createdAt, cursor.id])),
    ).toBeNull();
    expect(
      decodeHistoryCursor(
        encode(["2026-08-29", "29 Aug 2026 01:02:03", cursor.id]),
      ),
    ).toBeNull();
    expect(
      decodeHistoryCursor(
        encode(["2026-08-29", cursor.createdAt, "not-a-uuid"]),
      ),
    ).toBeNull();
    expect(
      decodeHistoryCursor(
        encode([
          "2026-08-29",
          `${cursor.createdAt}",id.gt.0),or(id.not.is.null`,
          cursor.id,
        ]),
      ),
    ).toBeNull();
  });

  it("並び順と一致するkeyset条件を組み立てる", () => {
    const condition = buildHistoryCursorCondition(cursor);

    expect(condition).toBe(
      "transaction_date.lt.2026-08-29," +
        'and(transaction_date.eq.2026-08-29,created_at.lt."2026-08-29T01:02:03.123456+00:00"),' +
        'and(transaction_date.eq.2026-08-29,created_at.eq."2026-08-29T01:02:03.123456+00:00",' +
        "id.lt.00000000-0000-4000-8000-000000000001)",
    );
  });
});
