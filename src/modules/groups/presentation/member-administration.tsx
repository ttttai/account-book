"use client";

import { useActionState, useState } from "react";

import type { MemberAdministrationTarget } from "../domain/member-administration-policy";
import { changeMemberRoleAction, removeMemberAction } from "./actions";
import { INITIAL_MEMBER_ADMINISTRATION_STATE } from "./member-administration-action-state";

type GroupRole = MemberAdministrationTarget["role"];

const roleLabels = {
  owner: "オーナー",
  admin: "管理者",
  member: "メンバー",
} as const;

function ActionMessage({
  status,
  message,
}: {
  status: "idle" | "error" | "success";
  message?: string;
}) {
  if (!message) return null;
  return (
    <p
      className={`form-message ${status === "error" ? "error" : "success"}`}
      role={status === "error" ? "alert" : "status"}
    >
      {message}
    </p>
  );
}

function RoleChangePanel({
  groupId,
  target,
  assignableRoles,
  onClose,
}: {
  groupId: string;
  target: MemberAdministrationTarget;
  assignableRoles: readonly GroupRole[];
  onClose: () => void;
}) {
  const action = changeMemberRoleAction.bind(null, groupId);
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_MEMBER_ADMINISTRATION_STATE,
  );
  const [selectedRole, setSelectedRole] = useState<GroupRole>(
    assignableRoles[0] ?? target.role,
  );
  const selectId = `member-role-${target.membershipId}`;

  return (
    <form action={formAction} className="member-admin-panel">
      <input name="membershipId" type="hidden" value={target.membershipId} />
      <label htmlFor={selectId}>新しい権限</label>
      <select
        id={selectId}
        name="role"
        onChange={(event) => setSelectedRole(event.target.value as GroupRole)}
        value={selectedRole}
      >
        {assignableRoles.map((role) => (
          <option key={role} value={role}>
            {roleLabels[role]}
          </option>
        ))}
      </select>
      <p className="member-admin-confirm-text">
        「{target.displayName}」（現在: {roleLabels[target.role]}）の権限を「
        {roleLabels[selectedRole]}」へ変更します。よろしいですか？
      </p>
      <div className="member-admin-panel-actions">
        <button className="primary-button" disabled={pending} type="submit">
          {pending ? "変更中…" : "この内容で変更する"}
        </button>
        <button
          className="secondary-button"
          disabled={pending}
          onClick={onClose}
          type="button"
        >
          キャンセル
        </button>
      </div>
      <ActionMessage message={state.message} status={state.status} />
    </form>
  );
}

function RemovePanel({
  groupId,
  target,
  onClose,
}: {
  groupId: string;
  target: MemberAdministrationTarget;
  onClose: () => void;
}) {
  const action = removeMemberAction.bind(null, groupId);
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_MEMBER_ADMINISTRATION_STATE,
  );

  return (
    <form action={formAction} className="member-admin-panel">
      <input name="membershipId" type="hidden" value={target.membershipId} />
      <p className="member-admin-confirm-text">
        「{target.displayName}」をこのグループから外します。
        今後の取引には参加できなくなりますが、過去の取引の表示は残ります。
        よろしいですか？
      </p>
      <div className="member-admin-panel-actions">
        <button
          className="primary-button danger-button"
          disabled={pending}
          type="submit"
        >
          {pending ? "処理中…" : "グループから外す"}
        </button>
        <button
          className="secondary-button"
          disabled={pending}
          onClick={onClose}
          type="button"
        >
          キャンセル
        </button>
      </div>
      <ActionMessage message={state.message} status={state.status} />
    </form>
  );
}

export function MemberAdministration({
  groupId,
  target,
  assignableRoles,
  canRemove,
}: {
  groupId: string;
  target: MemberAdministrationTarget;
  assignableRoles: readonly GroupRole[];
  canRemove: boolean;
}) {
  const [openPanel, setOpenPanel] = useState<"role" | "remove" | null>(null);

  return (
    <div className="member-administration">
      <div className="member-admin-triggers">
        {assignableRoles.length > 0 && (
          <button
            aria-expanded={openPanel === "role"}
            className="member-admin-trigger"
            onClick={() => setOpenPanel(openPanel === "role" ? null : "role")}
            type="button"
          >
            権限を変更
          </button>
        )}
        {canRemove && (
          <button
            aria-expanded={openPanel === "remove"}
            className="member-admin-trigger danger-text"
            onClick={() =>
              setOpenPanel(openPanel === "remove" ? null : "remove")
            }
            type="button"
          >
            グループから外す
          </button>
        )}
      </div>
      {openPanel === "role" && (
        <RoleChangePanel
          assignableRoles={assignableRoles}
          groupId={groupId}
          onClose={() => setOpenPanel(null)}
          target={target}
        />
      )}
      {openPanel === "remove" && (
        <RemovePanel
          groupId={groupId}
          onClose={() => setOpenPanel(null)}
          target={target}
        />
      )}
    </div>
  );
}
