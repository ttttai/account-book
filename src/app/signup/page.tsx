import { AuthShell, SignupForm } from "@/modules/auth/presentation";

export default function SignupPage() {
  return (
    <AuthShell
      title="新規登録"
      introduction="まずはあなたのプロフィールを作成します。"
    >
      <SignupForm />
    </AuthShell>
  );
}
