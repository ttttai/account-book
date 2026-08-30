// 招待リンク作成の状態。shareUrlは成功直後の1度だけ画面に表示される
export type CreateInvitationActionState = Readonly<{
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Readonly<{ role?: readonly string[] }>;
  shareUrl?: string;
  expiresAt?: string;
}>;

export type AcceptInvitationActionState = Readonly<{
  status: "idle" | "error" | "success";
  message?: string;
  groupId?: string;
}>;

export type RevokeInvitationActionState = Readonly<{
  status: "idle" | "error" | "success";
  message?: string;
}>;

export const INITIAL_CREATE_INVITATION_STATE: CreateInvitationActionState = {
  status: "idle",
};

export const INITIAL_ACCEPT_INVITATION_STATE: AcceptInvitationActionState = {
  status: "idle",
};

export const INITIAL_REVOKE_INVITATION_STATE: RevokeInvitationActionState = {
  status: "idle",
};
