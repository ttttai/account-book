import { describe, expect, it } from "vitest";

import { parseBugReportConfig } from "./bug-report-config";

const USER_A = "U0123456789abcdef0123456789abcdef";
const USER_B = "Uffffffffffffffffffffffffffffffff";

const validEnv = {
  LINE_BUG_REPORT_GITHUB_TOKEN: "github_pat_test_value",
  LINE_BUG_REPORT_GITHUB_REPOSITORY: "ttttai/account-book",
  LINE_BUG_REPORT_ALLOWED_USER_IDS: `${USER_A}, ${USER_B}`,
};

describe("parseBugReportConfig", () => {
  it("3つの環境変数が揃っていれば設定を返す", () => {
    expect(parseBugReportConfig(validEnv)).toEqual({
      githubToken: "github_pat_test_value",
      githubRepository: "ttttai/account-book",
      allowedUserIds: [USER_A, USER_B],
    });
  });

  it("いずれかが欠けていればnull（機能無効、AC-LBR-010-1）", () => {
    for (const key of Object.keys(validEnv)) {
      expect(
        parseBugReportConfig({ ...validEnv, [key]: undefined }),
      ).toBeNull();
      expect(parseBugReportConfig({ ...validEnv, [key]: "" })).toBeNull();
    }
  });

  it("リポジトリの形式が不正ならnull", () => {
    for (const repository of [
      "account-book",
      "ttttai/account-book/extra",
      "ttttai/",
      "/account-book",
      "ttttai/../other",
      "ttttai/account book",
    ]) {
      expect(
        parseBugReportConfig({
          ...validEnv,
          LINE_BUG_REPORT_GITHUB_REPOSITORY: repository,
        }),
      ).toBeNull();
    }
  });

  it("許可リストは不正・重複・空値を含むと全体を無効にする", () => {
    for (const list of [
      "not-a-user-id",
      `${USER_A},${USER_A}`,
      `${USER_A},,${USER_B}`,
      `${USER_A},`,
      "U0123456789ABCDEF0123456789ABCDEF",
    ]) {
      expect(
        parseBugReportConfig({
          ...validEnv,
          LINE_BUG_REPORT_ALLOWED_USER_IDS: list,
        }),
      ).toBeNull();
    }
  });
});
