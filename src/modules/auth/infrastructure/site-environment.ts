import "server-only";

const DEFAULT_LOCAL_SITE_ORIGIN = "http://127.0.0.1:3000";

// 環境変数からサイトのoriginを検証付きで取得する。origin以外を含む不正な設定はnull
export function getConfiguredSiteOrigin(): URL | null {
  try {
    const siteUrl = new URL(
      process.env.NEXT_PUBLIC_SITE_URL ?? DEFAULT_LOCAL_SITE_ORIGIN,
    );
    if (
      !["http:", "https:"].includes(siteUrl.protocol) ||
      siteUrl.username ||
      siteUrl.password ||
      siteUrl.pathname !== "/" ||
      siteUrl.search ||
      siteUrl.hash
    ) {
      return null;
    }
    return siteUrl;
  } catch {
    return null;
  }
}
