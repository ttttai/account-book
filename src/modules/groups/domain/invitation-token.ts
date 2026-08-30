import { acceptInvitationSchema } from "./invitation-input";

// origin以外（path・query・認証情報付きなど）のURLを共有基点として拒否する
function parseSiteOrigin(value: string): URL | null {
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

// 招待トークンのSHA-256ハッシュ（hex）を計算する。DBには生トークンを保存しない
export async function hashInvitationToken(rawToken: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(rawToken),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

// 招待受諾ページへの共有URLを組み立てる。不正な基点やトークンならnull
export function buildInvitationShareUrl(
  siteUrl: string,
  rawToken: string,
): string | null {
  const siteOrigin = parseSiteOrigin(siteUrl);
  if (
    !siteOrigin ||
    !acceptInvitationSchema.safeParse({ token: rawToken }).success
  ) {
    return null;
  }

  const shareUrl = new URL("/invitations/accept", siteOrigin.origin);
  // トークンはURLフラグメントに載せ、サーバーログやRefererへ漏れないようにする
  shareUrl.hash = new URLSearchParams({ token: rawToken }).toString();
  return shareUrl.toString();
}
