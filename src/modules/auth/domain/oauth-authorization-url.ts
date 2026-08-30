type OAuthAuthorizationUrlInput = Readonly<{
  authorizationUrl: string;
  internalSupabaseUrl: string;
  publicSupabaseUrl: string;
}>;

// originのみ（パス・クエリ・資格情報なし）のhttp(s) URLだけをベースURLとして許可する
function parseSupabaseBaseUrl(value: string): URL | null {
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

// サーバー内部URLで発行されたOAuth認可URLを、ブラウザから到達できる公開URLへ安全に書き換える
export function resolveBrowserOAuthAuthorizationUrl({
  authorizationUrl,
  internalSupabaseUrl,
  publicSupabaseUrl,
}: OAuthAuthorizationUrlInput): string | null {
  const internalBaseUrl = parseSupabaseBaseUrl(internalSupabaseUrl);
  const publicBaseUrl = parseSupabaseBaseUrl(publicSupabaseUrl);
  if (!internalBaseUrl || !publicBaseUrl) return null;

  try {
    const authorization = new URL(authorizationUrl);
    // 想定したSupabase originの /auth/v1/authorize 以外へは誘導しない（open redirect対策）
    const allowedOrigins = new Set([
      internalBaseUrl.origin,
      publicBaseUrl.origin,
    ]);
    if (
      !["http:", "https:"].includes(authorization.protocol) ||
      !allowedOrigins.has(authorization.origin) ||
      authorization.pathname !== "/auth/v1/authorize" ||
      authorization.username ||
      authorization.password ||
      authorization.hash
    ) {
      return null;
    }

    return new URL(
      `${authorization.pathname}${authorization.search}`,
      publicBaseUrl.origin,
    ).toString();
  } catch {
    return null;
  }
}
