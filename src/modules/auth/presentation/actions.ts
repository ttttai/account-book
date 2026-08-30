"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { updateProfileSchema } from "../domain/auth-input";
import { getAllowedGoogleUserId } from "../infrastructure/google-auth-access";
import { createServerSupabaseClient } from "../infrastructure/supabase-server";
import type { AuthActionState, AuthFieldName } from "./action-state";

type FieldErrors = Partial<Record<AuthFieldName, string[]>>;

function formValue(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function validationError(fieldErrors: FieldErrors): AuthActionState {
  return {
    status: "error",
    message: "入力内容を確認してください。",
    fieldErrors,
  };
}

// 表示名を検証して更新するServer Action。未認証ならログインへリダイレクトする
export async function updateProfileAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const result = updateProfileSchema.safeParse({
    displayName: formValue(formData, "displayName"),
  });
  if (!result.success)
    return validationError(result.error.flatten().fieldErrors);

  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  // クレームを再検証し、許可ユーザー以外には更新させない
  const userId = getAllowedGoogleUserId(claimsData?.claims);
  if (claimsError || !userId) redirect("/login");

  const { error } = await supabase
    .from("profiles")
    .update({ display_name: result.data.displayName })
    .eq("user_id", userId);
  if (error) {
    return {
      status: "error",
      message: "表示名を更新できませんでした。もう一度お試しください。",
    };
  }

  revalidatePath("/app");
  return { status: "success", message: "表示名を更新しました。" };
}

// ログアウトしてログイン画面へ遷移するServer Action
export async function signOutAction(
  _previousState: AuthActionState,
  _formData: FormData,
): Promise<AuthActionState> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    return {
      status: "error",
      message: "ログアウトできませんでした。もう一度お試しください。",
    };
  }
  redirect("/login");
}
