import { redirect } from "next/navigation";

// パスワード認証は提供しない（Google OAuthのみ）ため、ログイン画面へ転送する
export default function UpdatePasswordPage() {
  redirect("/login");
}
