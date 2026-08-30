import { createHmac, timingSafeEqual } from "node:crypto";

// LINE WebhookのX-Line-Signatureを検証する (NOTIF-005, AC-NOTIF-005-1)。
// channel secretによるHMAC-SHA256(base64)を定数時間比較で照合する
export function verifyLineSignature(
  channelSecret: string,
  rawBody: string,
  signature: string | null,
): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", channelSecret).update(rawBody).digest();
  let received: Buffer;
  try {
    received = Buffer.from(signature, "base64");
  } catch {
    return false;
  }
  if (received.length !== expected.length) return false;
  return timingSafeEqual(received, expected);
}
