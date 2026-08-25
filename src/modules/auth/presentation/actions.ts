"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { classifyAuthError } from "../application/auth-error";
import { hasCurrentRecoverySession } from "../application/has-current-recovery-session";
import {
  passwordResetRequestSchema,
  signInSchema,
  signUpSchema,
  updatePasswordSchema,
  updateProfileSchema,
} from "../domain/auth-input";
import { resolveSafeNextPath } from "../domain/safe-next-path";
import { isGoogleOAuthEnabled } from "../infrastructure/supabase-environment";
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

function authError(error: {
  status?: number;
  code?: string;
  message?: string;
}): AuthActionState {
  const safeError = classifyAuthError(error);
  return { status: "error", message: safeError.message };
}

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000";
}

export async function signUpAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const result = signUpSchema.safeParse({
    displayName: formValue(formData, "displayName"),
    email: formValue(formData, "email"),
    password: formValue(formData, "password"),
    passwordConfirmation: formValue(formData, "passwordConfirmation"),
  });

  if (!result.success) {
    return validationError(result.error.flatten().fieldErrors);
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    email: result.data.email,
    password: result.data.password,
    options: {
      data: { display_name: result.data.displayName },
      emailRedirectTo: `${siteUrl()}/auth/callback?next=/app`,
    },
  });

  if (error) return authError(error);
  if (data.session) redirect("/app");

  return {
    status: "success",
    message: "確認メールを送信しました。メール内の案内に従ってください。",
  };
}

export async function signInAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const result = signInSchema.safeParse({
    email: formValue(formData, "email"),
    password: formValue(formData, "password"),
  });

  if (!result.success) {
    return validationError(result.error.flatten().fieldErrors);
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword(result.data);
  if (error) return authError(error);

  redirect(resolveSafeNextPath(formValue(formData, "next")));
}

export async function signInWithGoogleAction(formData: FormData) {
  if (!isGoogleOAuthEnabled()) redirect("/login?oauth=disabled");

  const nextPath = resolveSafeNextPath(formValue(formData, "next"));
  const supabase = await createServerSupabaseClient();
  const callbackUrl = new URL("/auth/callback", siteUrl());
  callbackUrl.searchParams.set("next", nextPath);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callbackUrl.toString() },
  });

  if (error || !data.url) redirect("/login?error=oauth");
  redirect(data.url);
}

export async function requestPasswordResetAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const result = passwordResetRequestSchema.safeParse({
    email: formValue(formData, "email"),
  });
  if (!result.success)
    return validationError(result.error.flatten().fieldErrors);

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.resetPasswordForEmail(
    result.data.email,
    {
      redirectTo: `${siteUrl()}/auth/callback?next=/account/update-password`,
    },
  );
  if (error) return authError(error);

  return {
    status: "success",
    message: "登録されている場合は、パスワード再設定の案内を送信しました。",
  };
}

export async function updatePasswordAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  if (!(await hasCurrentRecoverySession())) {
    return {
      status: "error",
      message: "再設定リンクが無効または期限切れです。もう一度お試しください。",
    };
  }

  const result = updatePasswordSchema.safeParse({
    password: formValue(formData, "password"),
    passwordConfirmation: formValue(formData, "passwordConfirmation"),
  });
  if (!result.success)
    return validationError(result.error.flatten().fieldErrors);

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.updateUser({
    password: result.data.password,
  });
  if (error) return authError(error);
  await supabase.auth.signOut({ scope: "others" });
  redirect("/app");
}

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
  const userId = claimsData?.claims?.sub;
  if (claimsError || !userId) redirect("/login");

  const { error } = await supabase
    .from("profiles")
    .update({ display_name: result.data.displayName })
    .eq("user_id", userId);
  if (error) return authError(error);

  revalidatePath("/app");
  return { status: "success", message: "表示名を更新しました。" };
}

export async function signOutAction(
  _previousState: AuthActionState,
  _formData: FormData,
): Promise<AuthActionState> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signOut();
  if (error) return authError(error);
  redirect("/login");
}
