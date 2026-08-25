import Link from "next/link";

import { hasCurrentRecoverySession } from "@/modules/auth/server";
import { AuthShell, UpdatePasswordForm } from "@/modules/auth/presentation";

export default async function UpdatePasswordPage() {
  const hasRecoverySession = await hasCurrentRecoverySession();

  return (
    <AuthShell
      title="新しいパスワード"
      introduction="今後ログインに使うパスワードを設定します。"
    >
      {hasRecoverySession ? (
        <UpdatePasswordForm />
      ) : (
        <div className="auth-form">
          <p className="form-message error" role="alert">
            再設定リンクが無効または期限切れです。
          </p>
          <Link className="primary-link centered-link" href="/forgot-password">
            再設定メールを送り直す
          </Link>
          <Link className="text-link centered-link" href="/login">
            ログインへ戻る
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
