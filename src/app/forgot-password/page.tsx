import {
  AuthShell,
  PasswordResetRequestForm,
} from "@/modules/auth/presentation";

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="パスワード再設定"
      introduction="登録したメールアドレスへ再設定の案内を送ります。"
    >
      <PasswordResetRequestForm />
    </AuthShell>
  );
}
