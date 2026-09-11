"use client";

import {
  type MouseEvent as ReactMouseEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  HistoryAppliedFilter,
  HistoryMemberOption,
  HistoryReadyData,
} from "../application/history-types";
import { historyDefaultPageSize } from "../domain/history-filter";
import {
  formatHistoryMonthLabel,
  historyMonthOfDate,
  shiftHistoryMonth,
} from "../domain/history-month";
import { HistoryList } from "./history-list";

import styles from "./history.module.css";

type HistoryParams = Readonly<Record<string, string>>;

// URLから拾う既知のkeyだけを条件として扱う。値の検証はサーバーで毎回行う (AC-HIS-008-2)
const historyParamKeys = [
  "month",
  "type",
  "category",
  "payer",
  "recipient",
  "member",
  "limit",
  "cursor",
] as const;

// 「絞り込み」の件数に数える条件。支払者は画面へ出さないため数えない (TXN-018)
const sheetConditionKeys = [
  "month",
  "type",
  "category",
  "recipient",
  "member",
] as const;

function filterToParams(filter: HistoryAppliedFilter): HistoryParams {
  const params: Record<string, string> = {};
  if (filter.month) params.month = filter.month;
  if (filter.type) params.type = filter.type;
  if (filter.categoryId) params.category = filter.categoryId;
  if (filter.payerMemberId) params.payer = filter.payerMemberId;
  if (filter.recipientMemberId) params.recipient = filter.recipientMemberId;
  if (filter.memberMemberId) params.member = filter.memberMemberId;
  if (filter.limit !== historyDefaultPageSize) {
    params.limit = String(filter.limit);
  }
  return params;
}

function createHistoryUrl(groupId: string, params: HistoryParams): string {
  const search = new URLSearchParams(params).toString();
  return `/groups/${encodeURIComponent(groupId)}/history${search ? `?${search}` : ""}`;
}

function withoutParam(params: HistoryParams, key: string): HistoryParams {
  return Object.fromEntries(
    Object.entries(params).filter(([paramKey]) => paramKey !== key),
  );
}

// 空文字は「すべて」として条件を外す
function withParam(
  params: HistoryParams,
  key: string,
  value: string,
): HistoryParams {
  return value ? { ...params, [key]: value } : withoutParam(params, key);
}

// 同じ値なら解除、違えば設定する（chipの切り替え規則） (AC-HIS-003-5)
function toggleParam(
  params: HistoryParams,
  key: string,
  value: string,
): HistoryParams {
  return params[key] === value
    ? withoutParam(params, key)
    : { ...params, [key]: value };
}

// ブラウザの戻る・進む時に、URLの既知のkeyだけから条件を復元する
function paramsFromLocation(): HistoryParams {
  const search = new URLSearchParams(window.location.search);
  const params: Record<string, string> = {};
  for (const key of historyParamKeys) {
    const value = search.get(key);
    if (value) params[key] = value;
  }
  return params;
}

// 修飾キーなしの左クリックだけをアプリ内の切り替えに置き換える（新規タブ等はブラウザに任せる）
function isPlainPrimaryClick(
  event: ReactMouseEvent<HTMLAnchorElement>,
): boolean {
  return (
    event.button === 0 &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
  );
}

function memberOptionLabel(member: HistoryMemberOption): string {
  return `${member.displayName}${member.isActive ? "" : "（削除済み）"}${member.isCurrentUser ? "（自分）" : ""}`;
}

type FilterChangeHandler = (next: HistoryParams) => void;

type ShortcutChip = Readonly<{
  key: string;
  label: string;
  isActive: boolean;
  next: HistoryParams;
}>;

// 「今月」「支出」「収入」「自分の支出」を横1行に置き、タップで即時に切り替える (HIS-003, AC-HIS-003-5)
function ShortcutChips({
  groupId,
  params,
  todayMonth,
  currentMembershipId,
  onChange,
}: Readonly<{
  groupId: string;
  params: HistoryParams;
  todayMonth: string;
  currentMembershipId: string;
  onChange: FilterChangeHandler;
}>) {
  const chips: readonly ShortcutChip[] = [
    {
      key: "this-month",
      label: "今月",
      isActive: params.month === todayMonth,
      next: toggleParam(params, "month", todayMonth),
    },
    {
      key: "expense",
      label: "支出",
      isActive: params.type === "expense",
      next: toggleParam(params, "type", "expense"),
    },
    {
      key: "income",
      label: "収入",
      isActive: params.type === "income",
      next: toggleParam(params, "type", "income"),
    },
    {
      key: "mine",
      label: "自分の支出",
      isActive: params.member === currentMembershipId,
      next: toggleParam(params, "member", currentMembershipId),
    },
  ];

  return (
    <nav className={styles["history-shortcuts"]} aria-label="よく使う絞り込み">
      {chips.map((chip) => (
        <a
          key={chip.key}
          className={
            chip.isActive
              ? `${styles["history-chip"]} is-active`
              : styles["history-chip"]
          }
          aria-current={chip.isActive ? "true" : undefined}
          href={createHistoryUrl(groupId, chip.next)}
          onClick={(event) => {
            if (!isPlainPrimaryClick(event)) return;
            event.preventDefault();
            onChange(chip.next);
          }}
        >
          {chip.label}
        </a>
      ))}
    </nav>
  );
}

function MemberSelect({
  name,
  label,
  members,
  value,
  onChange,
}: Readonly<{
  name: string;
  label: string;
  members: readonly HistoryMemberOption[];
  value: string;
  onChange: (value: string) => void;
}>) {
  return (
    <label>
      {label}
      <select
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">すべて</option>
        {members.map((member) => (
          <option key={member.membershipId} value={member.membershipId}>
            {memberOptionLabel(member)}
          </option>
        ))}
      </select>
    </label>
  );
}

// 月は前後移動と解除で指定し、OS依存の月入力欄を使わない (AC-HIS-008-4)
function MonthField({
  month,
  todayMonth,
  onChange,
}: Readonly<{
  month?: string;
  todayMonth: string;
  onChange: (month: string) => void;
}>) {
  // 未指定からの前後移動は今月を基準に始める
  const baseMonth = month ?? todayMonth;
  return (
    <fieldset className={styles["history-month-field"]}>
      <legend>月</legend>
      <div className={styles["history-month-controls"]}>
        <button
          className={styles["history-month-step"]}
          type="button"
          onClick={() => onChange(shiftHistoryMonth(baseMonth, -1))}
        >
          前の月
        </button>
        <span className={styles["history-month-label"]} aria-live="polite">
          {month ? formatHistoryMonthLabel(month) : "すべての月"}
        </span>
        <button
          className={styles["history-month-step"]}
          type="button"
          onClick={() => onChange(shiftHistoryMonth(baseMonth, 1))}
        >
          次の月
        </button>
        <button
          className={styles["history-month-clear"]}
          type="button"
          aria-label="月の指定を解除"
          disabled={!month}
          onClick={() => onChange("")}
        >
          解除
        </button>
      </div>
    </fieldset>
  );
}

// 詳細条件のsheet。各条件は選択と同時に反映し、「適用」操作を置かない (HIS-002, AC-HIS-002-1)
function FilterSheetFields({
  data,
  params,
  todayMonth,
  onChange,
}: Readonly<{
  data: HistoryReadyData;
  params: HistoryParams;
  todayMonth: string;
  onChange: FilterChangeHandler;
}>) {
  const expenseCategories = data.categories.filter(
    (category) => category.type === "expense",
  );
  const incomeCategories = data.categories.filter(
    (category) => category.type === "income",
  );
  const setParam = (key: string) => (value: string) =>
    onChange(withParam(params, key, value));

  return (
    <div className={styles["history-filter-form"]}>
      <MonthField
        month={params.month}
        todayMonth={todayMonth}
        onChange={setParam("month")}
      />
      <label>
        種別
        <select
          name="type"
          value={params.type ?? ""}
          onChange={(event) => setParam("type")(event.target.value)}
        >
          <option value="">すべて</option>
          <option value="expense">支出</option>
          <option value="income">収入</option>
        </select>
      </label>
      <label>
        カテゴリ
        <select
          name="category"
          value={params.category ?? ""}
          onChange={(event) => setParam("category")(event.target.value)}
        >
          <option value="">すべて</option>
          <optgroup label="支出">
            {expenseCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="収入">
            {incomeCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      {/* 支払者(payer)の選択肢は画面へ出さない。URLで渡された条件の検証・適用・引き継ぎは維持する (AC-HIS-002-1, TXN-018) */}
      <MemberSelect
        name="recipient"
        label="受取者"
        members={data.members}
        value={params.recipient ?? ""}
        onChange={setParam("recipient")}
      />
      <MemberSelect
        name="member"
        label="支出した人"
        members={data.members}
        value={params.member ?? ""}
        onChange={setParam("member")}
      />
    </div>
  );
}

function AppliedFilters({
  data,
  params,
  onChange,
}: Readonly<{
  data: HistoryReadyData;
  params: HistoryParams;
  onChange: FilterChangeHandler;
}>) {
  const memberNameById = new Map(
    data.members.map((member) => [
      member.membershipId,
      `${member.displayName}${member.isActive ? "" : "（削除済み）"}`,
    ]),
  );
  const categoryNameById = new Map(
    data.categories.map((category) => [category.id, category.name]),
  );
  const chips: { key: string; label: string }[] = [];
  if (params.month) {
    chips.push({ key: "month", label: formatHistoryMonthLabel(params.month) });
  }
  if (params.type) {
    chips.push({
      key: "type",
      label: params.type === "expense" ? "支出" : "収入",
    });
  }
  if (params.category) {
    chips.push({
      key: "category",
      label: `カテゴリ ${categoryNameById.get(params.category) ?? ""}`,
    });
  }
  // 支払者条件は適用中でも表示しない (TXN-018)
  if (params.recipient) {
    chips.push({
      key: "recipient",
      label: `受取者 ${memberNameById.get(params.recipient) ?? ""}`,
    });
  }
  if (params.member) {
    chips.push({
      key: "member",
      label: `支出した人 ${memberNameById.get(params.member) ?? ""}`,
    });
  }
  if (chips.length === 0) return null;

  return (
    <ul
      className={styles["history-applied-filters"]}
      aria-label="適用中の絞り込み"
    >
      {chips.map((chip) => {
        const next = withoutParam(params, chip.key);
        return (
          <li key={chip.key}>
            <span>{chip.label}</span>
            <a
              href={createHistoryUrl(data.group.id, next)}
              aria-label={`${chip.label}の絞り込みを解除`}
              onClick={(event) => {
                if (!isPlainPrimaryClick(event)) return;
                event.preventDefault();
                onChange(next);
              }}
            >
              解除
            </a>
          </li>
        );
      })}
    </ul>
  );
}

// 履歴の絞り込み（chip・sheet・適用中条件）と一覧を、ページ再取得なしのURL同期（pushState）で組み立てるClient Component (HIS-008)
export function HistoryView({ data }: Readonly<{ data: HistoryReadyData }>) {
  const [params, setParams] = useState<HistoryParams>(() =>
    filterToParams(data.filter),
  );
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const sheetRef = useRef<HTMLDialogElement>(null);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const todayMonth = historyMonthOfDate(data.todayDate);
  const conditionCount = sheetConditionKeys.filter((key) =>
    Boolean(params[key]),
  ).length;

  useEffect(() => {
    function handlePopState() {
      setParams(paramsFromLocation());
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // 条件を変えたらcursorを外し、ページ全体を再読み込みせずURLへ保存する (AC-HIS-008-2)
  function handleFilterChange(next: HistoryParams) {
    const nextParams = withoutParam(next, "cursor");
    setParams(nextParams);
    window.history.pushState(
      null,
      "",
      createHistoryUrl(data.group.id, nextParams),
    );
  }

  function openSheet() {
    sheetRef.current?.showModal();
    setIsSheetOpen(true);
  }

  function closeSheet() {
    sheetRef.current?.close();
  }

  // 閉じた後は開いた操作へfocusを戻す (AC-HIS-008-5)
  function handleSheetClose() {
    setIsSheetOpen(false);
    openButtonRef.current?.focus();
  }

  const targetMemberName = params.member
    ? data.members.find((member) => member.membershipId === params.member)
        ?.displayName
    : undefined;

  return (
    <div className={styles["history-layout"]}>
      <section
        className={styles["history-controls"]}
        aria-label="履歴の絞り込み"
      >
        <div className={styles["history-toolbar"]}>
          <ShortcutChips
            groupId={data.group.id}
            params={params}
            todayMonth={todayMonth}
            currentMembershipId={data.currentMembershipId}
            onChange={handleFilterChange}
          />
          <button
            ref={openButtonRef}
            className={
              conditionCount > 0
                ? `${styles["history-filter-open"]} is-active`
                : styles["history-filter-open"]
            }
            type="button"
            aria-haspopup="dialog"
            aria-expanded={isSheetOpen}
            aria-label={
              conditionCount > 0
                ? `絞り込み（${conditionCount}件適用中）`
                : "絞り込み"
            }
            onClick={openSheet}
          >
            絞り込み
            {conditionCount > 0 ? (
              <span className={styles["history-filter-count"]} aria-hidden>
                {conditionCount}
              </span>
            ) : null}
          </button>
        </div>
        <AppliedFilters
          data={data}
          params={params}
          onChange={handleFilterChange}
        />
        {/* 900px未満はbottom sheet、900px以上はCSSで常設パネルとして表示する (AC-HIS-008-5) */}
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: 背景タップは補助操作で、キーボードはdialog標準のEscapeで閉じる */}
        <dialog
          ref={sheetRef}
          className={styles["history-filter-sheet"]}
          aria-labelledby="history-filter-title"
          onClose={handleSheetClose}
          onClick={(event) => {
            // 背景（dialog自身）のタップで閉じる。内側のbodyをタップしても閉じない
            if (event.target === event.currentTarget) closeSheet();
          }}
        >
          <div className={styles["history-filter-sheet-body"]}>
            <div className={styles["history-filter-sheet-header"]}>
              <h2 id="history-filter-title">絞り込み</h2>
              <button
                className={styles["history-filter-close"]}
                type="button"
                aria-label="絞り込みを閉じる"
                onClick={closeSheet}
              >
                閉じる
              </button>
            </div>
            <FilterSheetFields
              data={data}
              params={params}
              todayMonth={todayMonth}
              onChange={handleFilterChange}
            />
          </div>
        </dialog>
      </section>
      <HistoryList
        groupId={data.group.id}
        filterParams={params}
        initialRows={data.rows}
        initialNextCursor={data.nextCursor}
        todayDate={data.todayDate}
        targetMemberName={targetMemberName}
      />
    </div>
  );
}
