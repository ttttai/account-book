"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { acceptInvitation } from "../application/accept-invitation";
import { changeMemberRole } from "../application/change-member-role";
import { createInvitation } from "../application/create-invitation";
import { createGroup } from "../application/create-group";
import { setDefaultGroup } from "../application/default-group";
import { removeMember } from "../application/remove-member";
import { revokeInvitation } from "../application/revoke-invitation";
import { updateGroupSettings } from "../application/update-group-settings";
import { setDefaultGroupSchema } from "../domain/default-group-input";
import { createGroupSchema } from "../domain/group-input";
import { updateGroupSettingsSchema } from "../domain/group-settings-input";
import {
  acceptInvitationSchema,
  createInvitationSchema,
  revokeInvitationSchema,
} from "../domain/invitation-input";
import {
  changeMemberRoleSchema,
  removeMemberSchema,
} from "../domain/member-administration-input";
import type { GroupActionState } from "./action-state";
import type { DefaultGroupActionState } from "./default-group-action-state";
import type { GroupSettingsActionState } from "./group-settings-action-state";
import type {
  AcceptInvitationActionState,
  CreateInvitationActionState,
  RevokeInvitationActionState,
} from "./invitation-action-state";
import type { MemberAdministrationActionState } from "./member-administration-action-state";

function value(formData: FormData, name: string): string {
  const field = formData.get(name);
  return typeof field === "string" ? field : "";
}

// グループ作成フォームのServer Action。成功時は新グループ画面へredirectする
export async function createGroupAction(
  _previousState: GroupActionState,
  formData: FormData,
): Promise<GroupActionState> {
  const result = createGroupSchema.safeParse({
    name: value(formData, "name"),
    weekStartsOn: value(formData, "weekStartsOn"),
    defaultAllocation: value(formData, "defaultAllocation"),
  });

  if (!result.success) {
    return {
      status: "error",
      message: "入力内容を確認してください。",
      fieldErrors: result.error.flatten().fieldErrors,
    };
  }

  let groupId: string;
  try {
    groupId = await createGroup(result.data);
  } catch {
    return {
      status: "error",
      message: "グループを作成できませんでした。時間をおいてお試しください。",
    };
  }

  redirect(`/groups/${groupId}`);
}

// 招待リンク作成のServer Action。groupIdはbindで固定して受け取る
export async function createInvitationAction(
  groupId: string,
  _previousState: CreateInvitationActionState,
  formData: FormData,
): Promise<CreateInvitationActionState> {
  const result = createInvitationSchema.safeParse({
    groupId,
    role: value(formData, "role"),
  });
  if (!result.success) {
    return {
      status: "error",
      message: "入力内容を確認してください。",
      fieldErrors: result.error.flatten().fieldErrors,
    };
  }

  try {
    const invitation = await createInvitation(result.data);
    revalidatePath(`/groups/${result.data.groupId}/members`);
    return {
      status: "success",
      message: "招待リンクを作成しました。この画面で1度だけ確認できます。",
      shareUrl: invitation.shareUrl,
      expiresAt: invitation.expiresAt,
    };
  } catch {
    return {
      status: "error",
      message:
        "招待リンクを作成できませんでした。権限と接続状態を確認してください。",
    };
  }
}

// 招待受諾が成立しなかった理由ごとの利用者向けメッセージ
const invitationErrorMessages = {
  not_found: "招待リンクが無効です。新しいリンクを作成者へ依頼してください。",
  expired:
    "招待リンクの有効期限が切れています。新しいリンクを依頼してください。",
  revoked: "この招待リンクは取り消されています。",
  used: "この招待リンクはすでに別のユーザーが使用しています。",
} as const;

// 招待受諾のServer Action。参加成立時は関連画面のキャッシュを更新する
export async function acceptInvitationAction(
  _previousState: AcceptInvitationActionState,
  formData: FormData,
): Promise<AcceptInvitationActionState> {
  const result = acceptInvitationSchema.safeParse({
    token: value(formData, "token"),
  });
  if (!result.success) {
    return { status: "error", message: "招待リンクが正しくありません。" };
  }

  try {
    const acceptance = await acceptInvitation(result.data);
    if (
      acceptance.status === "accepted" ||
      acceptance.status === "already_accepted"
    ) {
      revalidatePath("/app");
      revalidatePath(`/groups/${acceptance.groupId}`);
      return {
        status: "success",
        message: "グループへ参加しました。",
        groupId: acceptance.groupId,
      };
    }

    return {
      status: "error",
      message: invitationErrorMessages[acceptance.status],
    };
  } catch {
    return {
      status: "error",
      message: "招待を承認できませんでした。ログイン状態を確認してください。",
    };
  }
}

// 権限変更の結果メッセージで使う役割の表示名
const memberRoleLabels = {
  owner: "オーナー",
  admin: "管理者",
  member: "メンバー",
} as const;

// メンバー権限変更のServer Action。最後のオーナーの降格は拒否される
export async function changeMemberRoleAction(
  groupId: string,
  _previousState: MemberAdministrationActionState,
  formData: FormData,
): Promise<MemberAdministrationActionState> {
  const result = changeMemberRoleSchema.safeParse({
    groupId,
    membershipId: value(formData, "membershipId"),
    role: value(formData, "role"),
  });
  if (!result.success) {
    return { status: "error", message: "変更内容を確認してください。" };
  }

  try {
    const outcome = await changeMemberRole(result.data);
    switch (outcome) {
      case "changed":
      case "unchanged":
        revalidatePath(`/groups/${result.data.groupId}/members`);
        return {
          status: "success",
          message: `権限を${memberRoleLabels[result.data.role]}にしました。`,
        };
      case "last_owner":
        return {
          status: "error",
          message:
            "最後のオーナーの権限は変更できません。先に別のメンバーをオーナーへ昇格してください。",
        };
      case "not_found":
        return {
          status: "error",
          message:
            "対象のメンバーが見つかりません。画面を再読み込みしてください。",
        };
    }
  } catch {
    return {
      status: "error",
      message: "権限を変更できませんでした。権限と接続状態を確認してください。",
    };
  }
}

// メンバーをグループから外すServer Action。最後のオーナーは外せない
export async function removeMemberAction(
  groupId: string,
  _previousState: MemberAdministrationActionState,
  formData: FormData,
): Promise<MemberAdministrationActionState> {
  const result = removeMemberSchema.safeParse({
    groupId,
    membershipId: value(formData, "membershipId"),
  });
  if (!result.success) {
    return { status: "error", message: "対象のメンバーを確認してください。" };
  }

  try {
    const outcome = await removeMember(result.data);
    switch (outcome) {
      case "removed":
        revalidatePath(`/groups/${result.data.groupId}/members`);
        return {
          status: "success",
          message:
            "メンバーをグループから外しました。過去の取引の表示は残ります。",
        };
      case "owner_not_removable":
        return {
          status: "error",
          message:
            "オーナーはグループから外せません。先に権限を変更してください。",
        };
      case "not_found":
        return {
          status: "error",
          message:
            "対象のメンバーが見つかりません。画面を再読み込みしてください。",
        };
    }
  } catch {
    return {
      status: "error",
      message:
        "メンバーをグループから外せませんでした。権限と接続状態を確認してください。",
    };
  }
}

// 招待取り消しのServer Action。対象は引数bindで特定する
export async function revokeInvitationAction(
  groupId: string,
  invitationId: string,
  _previousState: RevokeInvitationActionState,
  _formData: FormData,
): Promise<RevokeInvitationActionState> {
  const result = revokeInvitationSchema.safeParse({ groupId, invitationId });
  if (!result.success) {
    return { status: "error", message: "招待を確認できませんでした。" };
  }

  try {
    const revoked = await revokeInvitation(result.data);
    if (!revoked) {
      return {
        status: "error",
        message: "招待が見つからないか、すでに利用されています。",
      };
    }
    revalidatePath(`/groups/${groupId}/members`);
    return { status: "success", message: "招待を取り消しました。" };
  } catch {
    return {
      status: "error",
      message: "招待を取り消せませんでした。権限を確認してください。",
    };
  }
}

// 起動時に開くグループの設定・解除Server Action。groupIdはbindで受け取り再検証し、成功時はホームと設定画面を更新する (AC-GRP-012-1, AC-GRP-012-2)
export async function setDefaultGroupAction(
  groupId: string,
  _previousState: DefaultGroupActionState,
  formData: FormData,
): Promise<DefaultGroupActionState> {
  const result = setDefaultGroupSchema.safeParse({
    groupId,
    mode: value(formData, "mode"),
  });
  if (!result.success) {
    return {
      status: "error",
      message: "操作内容を確認できませんでした。画面を再読み込みしてください。",
    };
  }

  try {
    await setDefaultGroup(
      result.data.mode === "set" ? result.data.groupId : null,
    );
  } catch {
    return {
      status: "error",
      message:
        "起動時に開くグループを変更できませんでした。もう一度お試しください。",
    };
  }

  revalidatePath("/app");
  revalidatePath(`/groups/${result.data.groupId}/settings`);
  return {
    status: "success",
    message:
      result.data.mode === "set"
        ? "このグループを起動時に開くように設定しました。"
        : "起動時に開くグループの設定を解除しました。",
  };
}

// グループ設定の保存結果を利用者向けメッセージへ変換する
const groupSettingsErrorMessages = {
  conflict:
    "他のメンバーが先にグループ設定を変更しました。画面を再読み込みして最新の内容を確認してください。",
  forbidden: "グループ設定を変更する権限がありません。",
  invalid: "入力内容を確認してください。",
  error:
    "グループ設定を保存できませんでした。接続状態を確認して、もう一度お試しください。",
} as const;

// グループ名・週の開始曜日・標準の分け方を保存するServer Action。groupIdはbindで受け取り再検証し、成功時はグループ配下と一覧を更新する (AC-GRP-013-3, AC-GRP-013-6)
export async function updateGroupSettingsAction(
  groupId: string,
  _previousState: GroupSettingsActionState,
  formData: FormData,
): Promise<GroupSettingsActionState> {
  const result = updateGroupSettingsSchema.safeParse({
    groupId,
    name: value(formData, "name"),
    weekStartsOn: value(formData, "weekStartsOn"),
    defaultAllocation: value(formData, "defaultAllocation"),
    expectedVersion: value(formData, "expectedVersion"),
  });
  if (!result.success) {
    const { fieldErrors } = result.error.flatten();
    return {
      status: "error",
      message: "入力内容を確認してください。",
      fieldErrors: {
        name: fieldErrors.name,
        weekStartsOn: fieldErrors.weekStartsOn,
        defaultAllocation: fieldErrors.defaultAllocation,
      },
    };
  }

  let outcome: Awaited<ReturnType<typeof updateGroupSettings>>;
  try {
    outcome = await updateGroupSettings(result.data);
  } catch {
    return { status: "error", message: groupSettingsErrorMessages.error };
  }

  if (outcome.kind !== "ok") {
    return {
      status: "error",
      message: groupSettingsErrorMessages[outcome.kind],
    };
  }

  // グループ名は見出し・ナビ・一覧に表示されるため、グループ配下のlayout全体と一覧を再検証する
  revalidatePath(`/groups/${result.data.groupId}`, "layout");
  revalidatePath("/app");
  return {
    status: "success",
    message: "グループ設定を保存しました。",
    version: outcome.version,
  };
}
