import { describe, expect, it } from "vitest";

import {
  buildSaveFeedbackCookieDeletion,
  decodeSaveFeedbackCookie,
  encodeSaveFeedbackCookie,
  readSaveFeedbackCookie,
  SAVE_FEEDBACK_COOKIE_MAX_AGE_SECONDS,
  SAVE_FEEDBACK_COOKIE_NAME,
} from "./save-feedback-cookie";

const feedback = {
  title: "支出を登録しました",
  description: "9/19 食費 ￥1,200",
};

describe("保存結果cookieの形式 (AC-TXN-019-3)", () => {
  it("Server Actionが書いた値（URIエンコード済み）を通知内容へ戻す", () => {
    const stored = encodeURIComponent(encodeSaveFeedbackCookie(feedback));
    expect(decodeSaveFeedbackCookie(stored)).toEqual(feedback);
  });

  it("見出しだけの通知も往復できる", () => {
    const stored = encodeURIComponent(
      encodeSaveFeedbackCookie({ title: "取引を削除しました" }),
    );
    expect(decodeSaveFeedbackCookie(stored)).toEqual({
      title: "取引を削除しました",
    });
  });

  it("壊れた値・想定外の形・長すぎる文字列は表示しない", () => {
    expect(decodeSaveFeedbackCookie(undefined)).toBeNull();
    expect(decodeSaveFeedbackCookie("")).toBeNull();
    expect(decodeSaveFeedbackCookie("%7B")).toBeNull();
    expect(decodeSaveFeedbackCookie("not-json")).toBeNull();
    expect(
      decodeSaveFeedbackCookie(encodeURIComponent('{"title":""}')),
    ).toBeNull();
    expect(
      decodeSaveFeedbackCookie(encodeURIComponent('{"description":"x"}')),
    ).toBeNull();
    expect(
      decodeSaveFeedbackCookie(
        encodeURIComponent(JSON.stringify({ title: "a".repeat(101) })),
      ),
    ).toBeNull();
    expect(
      decodeSaveFeedbackCookie(
        encodeURIComponent(JSON.stringify({ title: 1, description: 2 })),
      ),
    ).toBeNull();
  });

  it("document.cookieから該当cookieの値だけを取り出す", () => {
    const stored = encodeURIComponent(encodeSaveFeedbackCookie(feedback));
    expect(
      readSaveFeedbackCookie(
        `theme=dark; ${SAVE_FEEDBACK_COOKIE_NAME}=${stored}; other=1`,
      ),
    ).toBe(stored);
    expect(readSaveFeedbackCookie("theme=dark")).toBeUndefined();
    expect(readSaveFeedbackCookie("")).toBeUndefined();
    // 名前の前方一致では取り出さない
    expect(
      readSaveFeedbackCookie(`${SAVE_FEEDBACK_COOKIE_NAME}_x=1`),
    ).toBeUndefined();
  });

  it("削除用の文字列はMax-Age=0でpath /を指す。寿命は30秒", () => {
    expect(buildSaveFeedbackCookieDeletion()).toBe(
      `${SAVE_FEEDBACK_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`,
    );
    expect(SAVE_FEEDBACK_COOKIE_MAX_AGE_SECONDS).toBe(30);
  });
});
