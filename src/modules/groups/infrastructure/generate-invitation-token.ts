import "server-only";

import { randomBytes } from "node:crypto";

// 招待用の推測不能なトークン（32byte乱数のbase64url）を生成する
export function generateInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}
