import "server-only";

import { createRemoteJWKSet, jwtVerify } from "jose";

import type { NotifierConfig } from "./notifier-config";

const googleJwks = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);

// Cloud SchedulerのOIDCトークンを検証する (NOTIF-006, AC-NOTIF-006-1)。
// Google署名・audience・呼び出しservice accountのemailをすべて確認する
export async function verifySchedulerIdentity(
  authorizationHeader: string | null,
  config: Pick<NotifierConfig, "jobAudience" | "jobInvoker">,
): Promise<boolean> {
  const token = authorizationHeader?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, googleJwks, {
      issuer: "https://accounts.google.com",
      audience: config.jobAudience,
    });
    return (
      payload.email === config.jobInvoker && payload.email_verified === true
    );
  } catch {
    return false;
  }
}
