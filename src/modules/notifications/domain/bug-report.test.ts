import { describe, expect, it } from "vitest";

import {
  BUG_REPORT_EMPTY_REPLY,
  BUG_REPORT_FAILED_REPLY,
  buildBugReportIssue,
  extractMentionedText,
  formatIssueCreatedReply,
  formatUserIdReply,
  isUserIdRequest,
} from "./bug-report";

const RECEIVED_AT = new Date("2026-09-07T12:34:56.000Z");

describe("extractMentionedText", () => {
  it("botへのメンション部分を除いた本文を返す (AC-LBR-001-2)", () => {
    expect(
      extractMentionedText({
        text: "@わが家bot 支出を保存すると画面が固まる",
        mentionees: [{ index: 0, length: 7, isSelf: true }],
      }),
    ).toBe("支出を保存すると画面が固まる");
  });

  it("複数のメンション（@Allを含む）をすべて除去し、前後の空白と改行を整える", () => {
    expect(
      extractMentionedText({
        text: "@All  @わが家bot 1行目\r\n2行目 @太郎 ",
        mentionees: [
          { index: 0, length: 4, isSelf: false },
          { index: 6, length: 7, isSelf: true },
          { index: 23, length: 3, isSelf: false },
        ],
      }),
    ).toBe("1行目\n2行目");
  });

  it("botへのメンションが無ければnullを返す (AC-LBR-001-1)", () => {
    expect(
      extractMentionedText({ text: "メンションなしの雑談", mentionees: [] }),
    ).toBeNull();
    expect(
      extractMentionedText({
        text: "@All 今日の夕飯どうする",
        mentionees: [{ index: 0, length: 4, isSelf: false }],
      }),
    ).toBeNull();
    expect(
      extractMentionedText({
        text: "@太郎 これ見て",
        mentionees: [{ index: 0, length: 3, isSelf: false }],
      }),
    ).toBeNull();
  });

  it("メンションだけの本文は空文字になる", () => {
    expect(
      extractMentionedText({
        text: "@わが家bot",
        mentionees: [{ index: 0, length: 7, isSelf: true }],
      }),
    ).toBe("");
  });

  it("範囲外のメンション位置は無視して本文を壊さない", () => {
    expect(
      extractMentionedText({
        text: "@bot 本文",
        mentionees: [
          { index: 0, length: 4, isSelf: true },
          { index: 100, length: 5, isSelf: false },
          { index: -1, length: 2, isSelf: false },
        ],
      }),
    ).toBe("本文");
  });
});

describe("buildBugReportIssue", () => {
  it("タイトルを最初の空でない行の先頭60文字で作り、ラベル2つを付ける (AC-LBR-005-1)", () => {
    const longLine = "あ".repeat(70);
    const issue = buildBugReportIssue(`\n\n${longLine}\n2行目`, {
      messageId: "468789577898262530",
      receivedAt: RECEIVED_AT,
    });

    expect(issue.title).toBe(`bug(line): ${"あ".repeat(60)}`);
    expect(Array.from(issue.title.slice("bug(line): ".length))).toHaveLength(
      60,
    );
    expect(issue.labels).toEqual(["bug", "source:line"]);
  });

  it("サロゲートペアを含む本文でもコードポイント単位で60文字に切る", () => {
    const emojiLine = "😀".repeat(65);
    const issue = buildBugReportIssue(emojiLine, {
      messageId: "1",
      receivedAt: RECEIVED_AT,
    });
    expect(issue.title).toBe(`bug(line): ${"😀".repeat(60)}`);
  });

  it("本文をコードブロックへ入れ、未記入欄と報告元だけを持つ (AC-LBR-004-1)", () => {
    const issue = buildBugReportIssue(
      "# 見出しに見える行\n@octocat #123 [link](https://example.test)",
      { messageId: "468789577898262530", receivedAt: RECEIVED_AT },
    );

    expect(issue.body).toContain(
      "## 概要\n\n```text\n# 見出しに見える行\n@octocat #123 [link](https://example.test)\n```\n",
    );
    for (const section of [
      "## 再現手順",
      "## 期待する動作",
      "## 実際の動作",
      "## 影響範囲",
      "## 重要度",
    ]) {
      expect(issue.body).toContain(
        `${section}\n\n（LINEからの報告のため未記入。確認後に追記する）`,
      );
    }
    expect(issue.body).toContain("- LINE message.id: `468789577898262530`");
    expect(issue.body).toContain("- 受信日時（UTC）: 2026-09-07T12:34:56.000Z");
    // 本文の外側に見出し以外のMarkdownを生成しない
    const outside = issue.body.replace(/```text\n[\s\S]*?\n```/, "");
    expect(outside).not.toContain("@octocat");
    expect(outside).not.toContain("#123");
  });

  it("本文中のbacktick連続より長いfenceで囲む", () => {
    const issue = buildBugReportIssue("```\ncode\n````\n終わり", {
      messageId: "2",
      receivedAt: RECEIVED_AT,
    });
    expect(issue.body).toContain("`````text\n```\ncode\n````\n終わり\n`````");
    expect(issue.body).not.toContain("``````");
  });
});

describe("返信文", () => {
  it("成功時はIssue番号とURLを返す (AC-LBR-008-1)", () => {
    expect(
      formatIssueCreatedReply(
        123,
        "https://github.com/ttttai/account-book/issues/123",
      ),
    ).toBe(
      "不具合Issueを作成しました。\n#123 https://github.com/ttttai/account-book/issues/123",
    );
  });

  it("失敗時と空本文の案内文を持つ", () => {
    expect(BUG_REPORT_FAILED_REPLY).toBe(
      "起票できませんでした。時間をおいて再度お試しください。",
    );
    expect(BUG_REPORT_EMPTY_REPLY).toBe(
      "報告内容が空です。メンションの後に不具合の内容を書いてください。",
    );
  });

  it("IDの要求は大文字小文字と前後空白を無視して判定する (AC-LBR-011-1)", () => {
    expect(isUserIdRequest("ID")).toBe(true);
    expect(isUserIdRequest(" id\n")).toBe(true);
    expect(isUserIdRequest("Id")).toBe(true);
    expect(isUserIdRequest("IDを教えて")).toBe(false);
    expect(isUserIdRequest("")).toBe(false);
  });

  it("userIdの返信は本人のIDだけを含む", () => {
    const userId = "U0123456789abcdef0123456789abcdef";
    expect(formatUserIdReply(userId)).toBe(
      `あなたのLINE userIdです。起票を許可する場合は管理者へ伝えてください。\n${userId}`,
    );
  });
});
