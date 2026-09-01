import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export type E2eEnvironment = Readonly<{
  baseUrl: string;
  supabaseUrl: string;
  anonKey: string;
  jwtSecret: string;
}>;

const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

// KEY=VALUE形式のstack設定ファイルを読む。値の引用符とコメント行だけを扱う
function parseEnvironmentFile(contents: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    const value = rawValue.replace(/^(['"])(.*)\1$/, "$2");
    values.set(key, value);
  }
  return values;
}

// loopback以外のstackへ接続しようとした場合は実行を中止する (NFR-E2E-002)
function assertLoopbackUrl(label: string, value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`E2Eの${label}がURLとして不正です。`);
  }
  if (!LOOPBACK_HOSTNAMES.has(url.hostname)) {
    throw new Error(
      `E2Eはloopbackの使い捨てstackだけを対象とします。${label}のhostが${url.hostname}のため実行を中止しました。`,
    );
  }
}

function requireValue(
  values: Map<string, string>,
  key: string,
  environmentName: string,
): string {
  const value = process.env[key] ?? values.get(key);
  if (!value) {
    throw new Error(
      `${key}が見つかりません。${environmentName}を生成してからE2Eを実行してください（npm run test:e2e）。`,
    );
  }
  return value;
}

let cachedEnvironment: E2eEnvironment | undefined;

// 同一processで繰り返し読まないようにした接続情報の取得口
export function getE2eEnvironment(): E2eEnvironment {
  cachedEnvironment ??= loadE2eEnvironment();
  return cachedEnvironment;
}

// E2E stackの接続情報を読み込み、loopback以外を拒否する
export function loadE2eEnvironment(): E2eEnvironment {
  const environmentName = process.env.E2E_ENV_FILE ?? ".env.e2e";
  const environmentPath = resolve(process.cwd(), environmentName);
  let values = new Map<string, string>();
  try {
    values = parseEnvironmentFile(readFileSync(environmentPath, "utf8"));
  } catch {
    // CIが環境変数だけを渡す場合もあるため、ファイル欠如は個別のkey検証へ委ねる
  }

  const baseUrl =
    process.env.E2E_BASE_URL ??
    requireValue(values, "NEXT_PUBLIC_SITE_URL", environmentName);
  const supabaseUrl = requireValue(
    values,
    "NEXT_PUBLIC_SUPABASE_URL",
    environmentName,
  );

  assertLoopbackUrl("base URL", baseUrl);
  assertLoopbackUrl("Supabase URL", supabaseUrl);

  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    supabaseUrl: supabaseUrl.replace(/\/$/, ""),
    anonKey: requireValue(
      values,
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      environmentName,
    ),
    jwtSecret: requireValue(values, "SUPABASE_JWT_SECRET", environmentName),
  };
}
