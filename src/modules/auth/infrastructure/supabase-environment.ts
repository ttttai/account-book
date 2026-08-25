const MISSING_ENVIRONMENT_MESSAGE =
  "Supabase接続設定がありません。.envの公開接続情報を確認してください。";

export type SupabasePublicEnvironment = Readonly<{
  url: string;
  publishableKey: string;
}>;

export type SupabaseServerEnvironment = SupabasePublicEnvironment;

export function getSupabasePublicEnvironment(): SupabasePublicEnvironment {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !publishableKey) {
    throw new Error(MISSING_ENVIRONMENT_MESSAGE);
  }

  return { url, publishableKey };
}

export function getSupabaseServerEnvironment(): SupabaseServerEnvironment {
  const publicEnvironment = getSupabasePublicEnvironment();

  return {
    ...publicEnvironment,
    url: process.env.SUPABASE_INTERNAL_URL || publicEnvironment.url,
  };
}
