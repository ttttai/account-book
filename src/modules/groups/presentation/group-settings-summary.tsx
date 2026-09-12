import {
  defaultAllocationLabels,
  FIXED_LOCALE_NOTE,
  type GroupSettingsView,
  weekStartLabels,
} from "./group-settings-labels";

import styles from "./groups.module.css";

type GroupSettingsSummaryProps = Readonly<{
  settings: GroupSettingsView;
}>;

// memberへ表示する読み取り専用のグループ設定一覧。編集操作を持たない (AC-GRP-013-1)
export function GroupSettingsSummary({ settings }: GroupSettingsSummaryProps) {
  return (
    <div className={styles["group-settings-readonly"]}>
      <dl className="settings-summary">
        <div>
          <dt>グループ名</dt>
          <dd>{settings.name}</dd>
        </div>
        <div>
          <dt>通貨</dt>
          <dd>{settings.currency}</dd>
        </div>
        <div>
          <dt>タイムゾーン</dt>
          <dd>{settings.timezone}</dd>
        </div>
        <div>
          <dt>週の開始</dt>
          <dd>{weekStartLabels[settings.weekStartsOn]}</dd>
        </div>
        <div>
          <dt>標準の分け方</dt>
          <dd>{defaultAllocationLabels[settings.defaultAllocation]}</dd>
        </div>
      </dl>
      <p className="field-hint">
        {FIXED_LOCALE_NOTE}
        グループ設定の変更はオーナーまたは管理者が行えます。
      </p>
    </div>
  );
}
