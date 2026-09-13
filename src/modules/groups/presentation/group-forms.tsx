"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { ChoiceChip, ChoiceChipList } from "@/modules/ui";

import { INITIAL_GROUP_ACTION_STATE } from "./action-state";
import { createGroupAction } from "./actions";

import styles from "./groups.module.css";

function CreateButton() {
  const { pending } = useFormStatus();
  return (
    <button className="primary-button" disabled={pending} type="submit">
      {pending ? "作成中…" : "グループを作成"}
    </button>
  );
}

// グループ作成フォーム。検証エラーはフィールド単位で表示する
export function CreateGroupForm() {
  const [state, action] = useActionState(
    createGroupAction,
    INITIAL_GROUP_ACTION_STATE,
  );

  return (
    <form action={action} className={styles["group-form"]} noValidate>
      <label htmlFor="groupName">グループ名</label>
      <input
        aria-describedby="groupName-error"
        autoComplete="off"
        id="groupName"
        name="name"
      />
      {state.fieldErrors?.name?.[0] && (
        <p className="field-error" id="groupName-error">
          {state.fieldErrors.name[0]}
        </p>
      )}

      {/* 2択はOS標準のradioを出さず選択肢chipで表示する (AC-GRP-001-6) */}
      <fieldset>
        <legend>週の開始曜日</legend>
        <ChoiceChipList>
          <ChoiceChip defaultChecked name="weekStartsOn" type="radio" value="0">
            日曜日
          </ChoiceChip>
          <ChoiceChip name="weekStartsOn" type="radio" value="1">
            月曜日
          </ChoiceChip>
        </ChoiceChipList>
      </fieldset>

      <fieldset>
        <legend>標準の支出負担</legend>
        <ChoiceChipList>
          <ChoiceChip
            defaultChecked
            name="defaultAllocation"
            type="radio"
            value="equal"
          >
            メンバーで均等
          </ChoiceChip>
          <ChoiceChip name="defaultAllocation" type="radio" value="self">
            自分が全額負担
          </ChoiceChip>
        </ChoiceChipList>
      </fieldset>

      {state.message && (
        <p className="form-message error" role="alert">
          {state.message}
        </p>
      )}
      <CreateButton />
    </form>
  );
}
