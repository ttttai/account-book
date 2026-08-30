import { redirect } from "next/navigation";

// アカウント作成は提供しない（Google OAuthのみ）ため、ログイン画面へ転送する
export default function SignupPage() {
  redirect("/login");
}
