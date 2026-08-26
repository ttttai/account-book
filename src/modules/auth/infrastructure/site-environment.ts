import "server-only";

const DEFAULT_LOCAL_SITE_ORIGIN = "http://127.0.0.1:3000";

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
