"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { acceptInvitation } from "../application/accept-invitation";
import { createInvitation } from "../application/create-invitation";
import { createGroup } from "../application/create-group";
import { revokeInvitation } from "../application/revoke-invitation";
import { createGroupSchema } from "../domain/group-input";
import {
  acceptInvitationSchema,
  createInvitationSchema,
  revokeInvitationSchema,
} from "../domain/invitation-input";
import type { GroupActionState } from "./action-state";
import type {
  AcceptInvitationActionState,
  CreateInvitationActionState,
  RevokeInvitationActionState,
} from "./invitation-action-state";

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
