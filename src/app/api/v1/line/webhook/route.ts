import {
  createBugReportContext,
  createNotifierGateway,
  getNotifierConfig,
  handleLineMessages,
  handleLineWebhook,
  verifyLineSignature,
} from "@/modules/notifications/server";

// LINE PlatformからのWebhook。署名検証済みのjoin/leave eventで連携を登録・解除し (NOTIF-004, NOTIF-005)、
// message eventはメンションからのIssue起票とuserId応答へ回す (LBR-001, LBR-011)
export async function POST(request: Request): Promise<Response> {
  const config = getNotifierConfig();
  // 未設定時は機能無効 (NOTIF-010)。エンドポイントの存在も明かさない
  if (!config) return new Response(null, { status: 404 });

  const rawBody = await request.text();
  const signature = request.headers.get("x-line-signature");
  if (!verifyLineSignature(config.channelSecret, rawBody, signature)) {
    return new Response(null, { status: 403 });
  }

  const gateway = createNotifierGateway(config);
  await handleLineWebhook(config.groupId, gateway, rawBody);

  // 起票用環境変数が揃わなければcontextはnullで、メンションは処理しない (LBR-010)。
  // GitHub・LINEの呼び出しは上限時間付きの同期処理とし、応答後処理へ回さない (LBR-009)
  const outcome = await handleLineMessages(
    rawBody,
    gateway,
    createBugReportContext(config),
  );
  if (outcome.unauthorized > 0 || outcome.failed > 0) {
    // 監査用に件数だけを記録する。userId・本文・groupIdは出さない (LBR-003)
    console.warn(
      `[line-webhook] bug report unauthorized=${outcome.unauthorized} failed=${outcome.failed}`,
    );
  }
  return Response.json({ ok: true });
}
