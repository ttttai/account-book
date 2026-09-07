import { describe, expect, it, type Mock, vi } from "vitest";

import type { WeeklyReportSource } from "../domain/report-source";
import {
  sendWeeklyReport,
  type WeeklyReportGateway,
  type WeeklyReportTarget,
} from "./send-weekly-report";

type MockGateway = {
  [K in keyof WeeklyReportGateway]: Mock<WeeklyReportGateway[K]>;
};

const GROUP_ID = "10000000-0000-4000-8000-000000000001";
const LINE_GROUP_ID = "Cffffeeeeddddccccbbbbaaaa99998888";
// 2026-09-06(日) 21:00 JST
const NOW = new Date("2026-09-06T12:00:00Z");

const emptySource: WeeklyReportSource = {
  expenses: [],
  incomes: [],
  recurring: [],
  budget: null,
  members: [],
};

function createGateway(
  overrides: Partial<MockGateway> = {},
  target: WeeklyReportTarget | null = {
    lineGroupId: LINE_GROUP_ID,
    groupName: "わが家",
    timezone: "Asia/Tokyo",
  },
): MockGateway {
  return {
    fetchTarget: vi.fn<WeeklyReportGateway["fetchTarget"]>(async () => target),
    fetchSource: vi.fn<WeeklyReportGateway["fetchSource"]>(
      async () => emptySource,
    ),
    claimWeek: vi.fn<WeeklyReportGateway["claimWeek"]>(async () => true),
    releaseWeek: vi.fn<WeeklyReportGateway["releaseWeek"]>(
      async () => undefined,
    ),
    pushText: vi.fn<WeeklyReportGateway["pushText"]>(async () => undefined),
    ...overrides,
  };
}

describe("sendWeeklyReport", () => {
  it("連携先を確認し、集計元を読み、送信枠を確保してからpushする (AC-NOTIF-008-1)", async () => {
    const gateway = createGateway();

    await expect(sendWeeklyReport(GROUP_ID, gateway, NOW)).resolves.toBe(
      "sent",
    );

    expect(gateway.fetchSource).toHaveBeenCalledWith(
      GROUP_ID,
      ["2026-08", "2026-09"],
      "2026-09",
    );
    expect(gateway.claimWeek).toHaveBeenCalledWith(GROUP_ID, "2026-08-31");
    expect(gateway.pushText).toHaveBeenCalledTimes(1);
    const [lineGroupId, text] = gateway.pushText.mock.calls[0] ?? [];
    expect(lineGroupId).toBe(LINE_GROUP_ID);
    expect(text).toContain("【わが家】週次サマリー\n📅 今週（8/31〜9/6）");
    expect(text).toContain("今週の支出登録はありませんでした。");
    expect(text).toContain("📆 9月の累計（6日経過）");
    // 送信枠の確保がpushより先に行われる
    expect(gateway.claimWeek.mock.invocationCallOrder[0]).toBeLessThan(
      gateway.pushText.mock.invocationCallOrder[0] ?? 0,
    );
    expect(gateway.releaseWeek).not.toHaveBeenCalled();
  });

  it("未連携のグループでは集計元を読まず送信しない (AC-NOTIF-010-1)", async () => {
    const gateway = createGateway(
      {},
      { lineGroupId: null, groupName: "わが家", timezone: "Asia/Tokyo" },
    );

    await expect(sendWeeklyReport(GROUP_ID, gateway, NOW)).resolves.toBe(
      "no_line_target",
    );
    expect(gateway.fetchSource).not.toHaveBeenCalled();
    expect(gateway.claimWeek).not.toHaveBeenCalled();
    expect(gateway.pushText).not.toHaveBeenCalled();
  });

  it("存在しないグループでも送信しない", async () => {
    const gateway = createGateway({}, null);

    await expect(sendWeeklyReport(GROUP_ID, gateway, NOW)).resolves.toBe(
      "no_line_target",
    );
    expect(gateway.pushText).not.toHaveBeenCalled();
  });

  it("同一週の2回目は送信枠を確保できず、pushせずに成功で終わる (AC-NOTIF-008-1)", async () => {
    const gateway = createGateway({
      claimWeek: vi.fn<WeeklyReportGateway["claimWeek"]>(async () => false),
    });

    await expect(sendWeeklyReport(GROUP_ID, gateway, NOW)).resolves.toBe(
      "already_sent",
    );
    expect(gateway.pushText).not.toHaveBeenCalled();
    expect(gateway.releaseWeek).not.toHaveBeenCalled();
  });

  it("push失敗時は送信枠を返上して例外を再送出する", async () => {
    const gateway = createGateway({
      pushText: vi.fn<WeeklyReportGateway["pushText"]>(async () => {
        throw new Error("LINE_PUSH_FAILED_500");
      }),
    });

    await expect(sendWeeklyReport(GROUP_ID, gateway, NOW)).rejects.toThrow(
      "LINE_PUSH_FAILED_500",
    );
    expect(gateway.releaseWeek).toHaveBeenCalledWith(GROUP_ID, "2026-08-31");
  });

  it("グループのタイムゾーンで対象週を判定する (AC-NOTIF-001-1)", async () => {
    // UTC 2026-09-06 12:00 は America/Los_Angeles では9/6(日) 05:00
    const gateway = createGateway(
      {},
      {
        lineGroupId: LINE_GROUP_ID,
        groupName: "West",
        timezone: "America/Los_Angeles",
      },
    );

    await sendWeeklyReport(GROUP_ID, gateway, new Date("2026-09-07T02:00:00Z"));

    // UTCでは月曜だが、Los Angelesでは日曜9/6のため同じ週を対象にする
    expect(gateway.claimWeek).toHaveBeenCalledWith(GROUP_ID, "2026-08-31");
  });
});
