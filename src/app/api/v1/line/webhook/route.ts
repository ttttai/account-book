import {
  getNotifierConfig,
  handleLineWebhook,
  verifyLineSignature,
} from "@/modules/notifications/server";

// LINE PlatformからのWebhook。署名検証済みのjoin/leave eventだけを処理する
export async function POST(request: Request): Promise<Response> {
  const config = getNotifierConfig();
  // 未設定時は機能無効(NOTIF-010)。エンドポイントの存在も明かさない
  if (!config) return new Response(null, { status: 404 });

  const rawBody = await request.text();
  const signature = request.headers.get("x-line-signature");
  if (!verifyLineSignature(config.channelSecret, rawBody, signature)) {
    return new Response(null, { status: 403 });
  }

  await handleLineWebhook(config, rawBody);
  return Response.json({ ok: true });
}
