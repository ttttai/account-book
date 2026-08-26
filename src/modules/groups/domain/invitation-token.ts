import { acceptInvitationSchema } from "./invitation-input";

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

export async function hashInvitationToken(rawToken: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(rawToken),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

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
  shareUrl.hash = new URLSearchParams({ token: rawToken }).toString();
  return shareUrl.toString();
}
