import "server-only";

import { z } from "zod";

import {
  createServerSupabaseClient,
  getAllowedGoogleUserId,
} from "@/modules/auth/server";

import {
  type UpdateGroupSettingsInput,
  updateGroupSettingsCommandSchema,
} from "../domain/group-settings-input";

// グループ設定更新の結果。成功時は更新後のversionを返す
export type UpdateGroupSettingsResult =
  | Readonly<{ kind: "ok"; version: number }>
  | Readonly<{ kind: "conflict" }>
  | Readonly<{ kind: "forbidden" }>
  | Readonly<{ kind: "invalid" }>
  | Readonly<{ kind: "error" }>;

// DB関数は結果種別と現在のversionを1行で返す
const outcomeRowSchema = z
  .array(
    z.object({
      outcome: z.enum(["updated", "unchanged", "conflict"]),
      group_version: z.number().int().min(1),
    }),
  )
  .length(1);

// DB関数が返すSQLSTATEを、画面が区別して扱う結果種別へ変換する
// 42501: 権限不足（member・非メンバー・存在しないグループ）、22023: 入力不正。競合は結果行で返るためここには来ない
function mapUpdateError(
  code: unknown,
): Exclude<UpdateGroupSettingsResult, Readonly<{ kind: "ok" }>> {
  if (code === "42501") return { kind: "forbidden" };
  if (code === "22023") return { kind: "invalid" };
  return { kind: "error" };
}

// グループ名・週の開始曜日・標準負担方法を楽観的ロック付きでDB関数経由で更新する (AC-GRP-013-4, AC-GRP-013-5)
export async function updateGroupSettings(
  input: UpdateGroupSettingsInput,
): Promise<UpdateGroupSettingsResult> {
  const validatedInput = updateGroupSettingsCommandSchema.parse(input);
  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  if (claimsError || !getAllowedGoogleUserId(claimsData?.claims)) {
    throw new Error("UNAUTHENTICATED");
  }

  const { data, error } = await supabase.rpc("update_group_settings", {
    p_group_id: validatedInput.groupId,
    p_name: validatedInput.name,
    p_week_starts_on: validatedInput.weekStartsOn,
    p_default_allocation: validatedInput.defaultAllocation,
    p_expected_version: validatedInput.expectedVersion,
  });
  if (error) {
    // 原因を切り分けられる最小情報だけをサーバーlogへ残す。家計データや識別子は含めない
    console.error(
      `groups.updateGroupSettings failed: code=${String(error.code ?? "unknown")}`,
    );
    return mapUpdateError(error.code);
  }

  const rows = outcomeRowSchema.safeParse(data);
  if (!rows.success) return { kind: "error" };
  const [row] = rows.data;
  // 競合は上書きせず画面へ再読み込みを促す。同じ値の再送は成功として扱う (AC-GRP-013-5)
  if (row.outcome === "conflict") return { kind: "conflict" };
  return { kind: "ok", version: row.group_version };
}
