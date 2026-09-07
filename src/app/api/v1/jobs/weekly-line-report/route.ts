import {
  createNotifierGateway,
  getNotifierConfig,
  sendWeeklyReport,
  verifySchedulerIdentity,
} from "@/modules/notifications/server";

// Cloud Schedulerが毎週日曜21:00 JSTに呼ぶ週次LINEレポートのジョブ (NOTIF-001)
export async function POST(request: Request): Promise<Response> {
  const config = getNotifierConfig();
  // 未設定時は機能無効 (NOTIF-010)。エンドポイントの存在も明かさない
  if (!config) return new Response(null, { status: 404 });

  const authorized = await verifySchedulerIdentity(
    request.headers.get("authorization"),
    config,
  );
  if (!authorized) return new Response(null, { status: 403 });

  try {
    const result = await sendWeeklyReport(
      config.groupId,
      createNotifierGateway(config),
    );
    return Response.json({ result });
  } catch {
    // 失敗時は5xxを返し、Cloud Schedulerのリトライに委ねる（詳細はログへ出さない）
    return new Response(null, { status: 500 });
  }
}
