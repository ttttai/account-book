"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { acceptInvitation } from "../application/accept-invitation";
import { changeMemberRole } from "../application/change-member-role";
import { createInvitation } from "../application/create-invitation";
import { createGroup } from "../application/create-group";
import { removeMember } from "../application/remove-member";
import { revokeInvitation } from "../application/revoke-invitation";
import { createGroupSchema } from "../domain/group-input";
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

const invitationErrorMessages = {
  not_found: "招待リンクが無効です。新しいリンクを作成者へ依頼してください。",
  expired:
    "招待リンクの有効期限が切れています。新しいリンクを依頼してください。",
  revoked: "この招待リンクは取り消されています。",
  used: "この招待リンクはすでに別のユーザーが使用しています。",
} as const;

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

const memberRoleLabels = {
  owner: "オーナー",
  admin: "管理者",
  member: "メンバー",
} as const;

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
