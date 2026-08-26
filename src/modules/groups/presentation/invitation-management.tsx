"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import type { PendingInvitationSummary } from "../application/member-types";
import { createInvitationAction, revokeInvitationAction } from "./actions";
import {
  INITIAL_CREATE_INVITATION_STATE,
  INITIAL_REVOKE_INVITATION_STATE,
} from "./invitation-action-state";

const roleLabels = { admin: "管理者", member: "メンバー" } as const;
const dateTimeFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  dateStyle: "medium",
  timeStyle: "short",
});

function SubmitInvitationButton() {
  const { pending } = useFormStatus();
  return (
    <button className="primary-button" disabled={pending} type="submit">
      {pending ? "作成中…" : "招待リンクを作成"}
    </button>
  );
}

function RevokeInvitationButton({
  groupId,
  invitationId,
}: {
  groupId: string;
  invitationId: string;
}) {
  const action = revokeInvitationAction.bind(null, groupId, invitationId);
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_REVOKE_INVITATION_STATE,
  );

  return (
    <form action={formAction} className="inline-action-form">
      <button
        className="text-button danger-text"
        disabled={pending}
        type="submit"
      >
        {pending ? "取消中…" : "取り消す"}
      </button>
      {state.message && (
        <p
          className={`form-message ${state.status === "error" ? "error" : "success"}`}
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}

export function InvitationManagement({
  groupId,
  invitations,
}: {
  groupId: string;
  invitations: readonly PendingInvitationSummary[];
}) {
  const action = createInvitationAction.bind(null, groupId);
  const [state, formAction] = useActionState(
    action,
    INITIAL_CREATE_INVITATION_STATE,
  );
  const [copyMessage, setCopyMessage] = useState<string>();

  async function copyShareUrl() {
    if (!state.shareUrl) return;
    try {
      await navigator.clipboard.writeText(state.shareUrl);
      setCopyMessage("コピーしました。");
    } catch {
      setCopyMessage(
        "コピーできませんでした。リンクを選択してコピーしてください。",
      );
    }
  }

  return (
    <section className="invitation-panel" aria-labelledby="invitation-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">新しい共有</p>
          <h2 id="invitation-title">メンバーを招待</h2>
        </div>
      </div>
      <p className="panel-description">
        メールは送信しません。作成したリンクを安全な方法で相手へ共有してください。
      </p>
      <form action={formAction} className="invitation-form">
        <label htmlFor="invitationRole">参加後の権限</label>
        <select defaultValue="member" id="invitationRole" name="role">
          <option value="member">メンバー</option>
          <option value="admin">管理者</option>
        </select>
        {state.fieldErrors?.role?.[0] && (
          <p className="field-error">{state.fieldErrors.role[0]}</p>
        )}
        <SubmitInvitationButton />
      </form>

      {state.message && (
        <p
          className={`form-message ${state.status === "error" ? "error" : "success"}`}
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      )}
      {state.status === "success" && state.shareUrl && (
        <div className="share-link-result">
          <label htmlFor="shareLink">共有リンク</label>
          <input id="shareLink" readOnly value={state.shareUrl} />
          <button
            className="secondary-button"
            onClick={copyShareUrl}
            type="button"
          >
            リンクをコピー
          </button>
          <p className="field-hint">
            有効期限:{" "}
            {dateTimeFormatter.format(new Date(state.expiresAt ?? ""))}
          </p>
          {copyMessage && (
            <p className="form-message" role="status">
              {copyMessage}
            </p>
          )}
        </div>
      )}

      <div className="pending-invitations">
        <h3>保留中の招待</h3>
        {invitations.length === 0 ? (
          <p className="field-hint">現在、保留中の招待はありません。</p>
        ) : (
          <ul>
            {invitations.map((invitation) => (
              <li key={invitation.id}>
                <div>
                  <strong>{roleLabels[invitation.role]}として招待</strong>
                  <small>
                    {dateTimeFormatter.format(new Date(invitation.expiresAt))}
                    まで
                  </small>
                </div>
                <RevokeInvitationButton
                  groupId={groupId}
                  invitationId={invitation.id}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
