"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { updateProfileSchema } from "../domain/auth-input";
import { resolveBrowserOAuthAuthorizationUrl } from "../domain/oauth-authorization-url";
import { resolveSafeNextPath } from "../domain/safe-next-path";
import {
  getAllowedGoogleUserId,
  isGoogleOAuthEnabled,
} from "../infrastructure/google-auth-access";
import {
  getSupabasePublicEnvironment,
  getSupabaseServerEnvironment,
} from "../infrastructure/supabase-environment";
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

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000";
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
  const browserAuthorizationUrl = resolveBrowserOAuthAuthorizationUrl({
    authorizationUrl: data.url,
    internalSupabaseUrl: getSupabaseServerEnvironment().url,
    publicSupabaseUrl: getSupabasePublicEnvironment().url,
  });
  if (!browserAuthorizationUrl) redirect("/login?error=oauth");
  redirect(browserAuthorizationUrl);
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
