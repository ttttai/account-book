import { resolveSafeNextPath } from "@/modules/auth";
import { AuthShell, LoginForm } from "@/modules/auth/presentation";
import {
  isGoogleOAuthEnabled,
  signInWithGoogleAction,
} from "@/modules/auth/server";

type LoginPageProps = Readonly<{
  searchParams: Promise<{ next?: string; oauth?: string; error?: string }>;
}>;

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const nextPath = resolveSafeNextPath(params.next);
  const googleEnabled = isGoogleOAuthEnabled();

  return (
    <AuthShell
      title="ログイン"
      introduction="家計グループへ安全にアクセスします。"
    >
      <LoginForm nextPath={nextPath} />
      <div className="auth-separator">
        <span>または</span>
      </div>
      <form action={signInWithGoogleAction}>
        <input name="next" type="hidden" value={nextPath} />
        <button
          className="secondary-button"
          disabled={!googleEnabled}
          type="submit"
        >
          Googleでログイン
        </button>
      </form>
      {!googleEnabled && (
        <p className="field-hint">
          この環境ではGoogleログインが設定されていません。
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
