"use client";

import { useActionState, useId, useState } from "react";

import { updateGroupSettingsAction } from "./actions";
import { INITIAL_GROUP_SETTINGS_ACTION_STATE } from "./group-settings-action-state";
import {
  defaultAllocationLabels,
  FIXED_LOCALE_NOTE,
  type GroupSettingsView,
  weekStartLabels,
} from "./group-settings-labels";

import styles from "./groups.module.css";

type GroupSettingsFormProps = Readonly<{
  groupId: string;
  settings: GroupSettingsView;
}>;

// owner/admin向けのグループ設定フォーム。名称・週の開始曜日・標準の分け方を楽観的ロック付きで保存する (AC-GRP-013-1, AC-GRP-013-5)
export function GroupSettingsForm({
  groupId,
  settings,
}: GroupSettingsFormProps) {
  const action = updateGroupSettingsAction.bind(null, groupId);
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_GROUP_SETTINGS_ACTION_STATE,
  );
  const fieldId = useId();
  // 入力値はcontrolledで保持し、競合・検証エラー後もformのresetで消さない (AC-GRP-013-5)
  const [name, setName] = useState(settings.name);
  const [weekStartsOn, setWeekStartsOn] = useState<"0" | "1">(
    String(settings.weekStartsOn) as "0" | "1",
  );
  const [defaultAllocation, setDefaultAllocation] = useState<"equal" | "self">(
    settings.defaultAllocation,
  );
  // 保存成功後は返されたversionを次回送信の比較値にする (AC-GRP-013-6)
  const expectedVersion = state.version ?? settings.version;
  const nameError = state.fieldErrors?.name?.[0];

  return (
    <form
      action={formAction}
      aria-label="グループ設定"
      className={styles["group-settings-form"]}
      noValidate
    >
      <input name="expectedVersion" type="hidden" value={expectedVersion} />

      <div className={styles["group-settings-field"]}>
        <label htmlFor={`${fieldId}-name`}>グループ名</label>
        <input
          aria-describedby={nameError ? `${fieldId}-name-error` : undefined}
          aria-invalid={nameError ? true : undefined}
          autoComplete="off"
          id={`${fieldId}-name`}
          maxLength={50}
          name="name"
          onChange={(event) => setName(event.target.value)}
          value={name}
        />
        {nameError ? (
          <p className="field-error" id={`${fieldId}-name-error`}>
            {nameError}
          </p>
        ) : null}
      </div>

      <fieldset className={styles["group-settings-fieldset"]}>
        <legend>週の開始曜日</legend>
        {(["0", "1"] as const).map((option) => (
          <label className={styles["radio-option"]} key={option}>
            <input
              checked={weekStartsOn === option}
              name="weekStartsOn"
              onChange={() => setWeekStartsOn(option)}
              type="radio"
              value={option}
            />
            {weekStartLabels[Number(option) as 0 | 1]}
          </label>
        ))}
      </fieldset>

      <fieldset className={styles["group-settings-fieldset"]}>
        <legend>標準の分け方</legend>
        {(["equal", "self"] as const).map((option) => (
          <label className={styles["radio-option"]} key={option}>
            <input
              checked={defaultAllocation === option}
              name="defaultAllocation"
              onChange={() => setDefaultAllocation(option)}
              type="radio"
              value={option}
            />
            {defaultAllocationLabels[option]}
          </label>
        ))}
        <p className="field-hint">
          新しい支出の初期値だけに影響し、保存済みの取引は変わりません。
        </p>
      </fieldset>

      <dl className={`settings-summary ${styles["group-settings-fixed"]}`}>
        <div>
          <dt>通貨</dt>
          <dd>{settings.currency}</dd>
        </div>
        <div>
          <dt>タイムゾーン</dt>
          <dd>{settings.timezone}</dd>
        </div>
      </dl>
      <p className="field-hint">{FIXED_LOCALE_NOTE}</p>

      {state.message ? (
        <p
          className={`form-message ${state.status}`}
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      ) : null}
      <button className="primary-button" disabled={pending} type="submit">
        {pending ? "保存中…" : "保存する"}
      </button>
    </form>
  );
}
