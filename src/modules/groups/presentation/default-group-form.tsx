"use client";

import { useActionState } from "react";

import { setDefaultGroupAction } from "./actions";
import { INITIAL_DEFAULT_GROUP_ACTION_STATE } from "./default-group-action-state";

import styles from "./groups.module.css";

type DefaultGroupFormProps = Readonly<{
  groupId: string;
  /** 表示中のグループが現在の起動時に開くグループか（サーバーが判定した値） */
  isDefault: boolean;
}>;

// 設定画面の「起動時に開くグループ」項目。現在の設定に応じて設定・解除の操作を切り替える (AC-GRP-012-1)
export function DefaultGroupForm({
  groupId,
  isDefault,
}: DefaultGroupFormProps) {
  const action = setDefaultGroupAction.bind(null, groupId);
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_DEFAULT_GROUP_ACTION_STATE,
  );

  return (
    <form
      action={formAction}
      aria-labelledby="default-group-title"
      className={styles["default-group-form"]}
    >
      <input name="mode" type="hidden" value={isDefault ? "clear" : "set"} />
      <div className={styles["default-group-text"]}>
        <strong id="default-group-title">起動時に開くグループ</strong>
        <small>
          {isDefault
            ? "このグループを起動時に開きます。ログイン後はグループ一覧を経由せず、このグループのカレンダーが表示されます。"
            : "ログイン後にこのグループのカレンダーを直接開きます。自分だけの設定で、他のメンバーには影響しません。"}
        </small>
      </div>
      <button
        className={isDefault ? "secondary-button" : "primary-button"}
        disabled={pending}
        type="submit"
      >
        {pending
          ? "変更中…"
          : isDefault
            ? "解除する"
            : "このグループを起動時に開く"}
      </button>
      {state.message ? (
        <p
          className={`form-message ${state.status}`}
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
