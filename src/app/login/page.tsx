import { resolveSafeNextPath } from "@/modules/auth";
import { AuthShell } from "@/modules/auth/presentation";
import { isGoogleOAuthEnabled } from "@/modules/auth/server";

type LoginPageProps = Readonly<{
  searchParams: Promise<{ next?: string; oauth?: string; error?: string }>;
}>;

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const nextPath = resolveSafeNextPath(params.next);
  const googleEnabled = isGoogleOAuthEnabled();
  const googleOAuthStartPath = `/auth/google/start?next=${encodeURIComponent(nextPath)}`;

  return (
    <AuthShell
      title="ログイン"
      introduction="家計グループへ安全にアクセスします。"
    >
      {googleEnabled ? (
        <a
          className="primary-button google-login-button"
          href={googleOAuthStartPath}
        >
          Googleでログイン
        </a>
      ) : (
        <button
          className="primary-button google-login-button"
          disabled
          type="button"
        >
          Googleでログイン
        </button>
      )}
      {!googleEnabled && (
        <p className="field-hint">
          Google OAuthまたは2アカウントの許可設定が完了していません。
        </p>
      )}
      <p className="field-hint">
        現在は、管理者が許可した2つのGoogleアカウントだけ利用できます。
      </p>
      {params.error === "not_allowed" && (
        <p className="form-message error" role="alert">
          このGoogleアカウントは利用を許可されていません。
        </p>
      )}
      {params.error === "oauth" && (
        <p className="form-message error" role="alert">
          Googleログインを完了できませんでした。
        </p>
      )}
    </AuthShell>
  );
}
