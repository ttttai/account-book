import Form from "next/form";
import Link from "next/link";

import type {
  HistoryAppliedFilter,
  HistoryInvalidData,
  HistoryMemberOption,
  HistoryReadyData,
} from "../application/history-types";
import { historyDefaultPageSize } from "../domain/history-filter";
import { HistoryList } from "./history-list";

import styles from "./history.module.css";

function filterToParams(filter: HistoryAppliedFilter): Record<string, string> {
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

function createHistoryUrl(
  groupId: string,
  params: Readonly<Record<string, string>>,
): string {
  const search = new URLSearchParams(params).toString();
  return `/groups/${encodeURIComponent(groupId)}/history${search ? `?${search}` : ""}`;
}

function withoutParam(
  params: Readonly<Record<string, string>>,
  key: string,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(params).filter(([paramKey]) => paramKey !== key),
  );
}

function formatHistoryMonthLabel(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return `${year}年${monthNumber}月`;
}

function memberOptionLabel(member: HistoryMemberOption): string {
  return `${member.displayName}${member.isActive ? "" : "（削除済み）"}${member.isCurrentUser ? "（自分）" : ""}`;
}

export function HistoryValidationError({
  data,
}: Readonly<{ data: HistoryInvalidData }>) {
  return (
    <section className="history-validation-error" role="alert">
      <p className="eyebrow">絞り込み条件を確認してください</p>
      <h2>履歴を表示できません</h2>
      <p>
        月、種別、カテゴリ、メンバー、件数またはページ位置の指定が正しくありません。取引データは読み込んでいません。
      </p>
      <Link
        className="primary-link"
        href={`/groups/${encodeURIComponent(data.groupId)}/history`}
      >
        絞り込みを解除して履歴へ戻る
      </Link>
    </section>
  );
}

// shortcut chipは「自分が支払った」だけを表示する。負担額での絞り込みは絞り込みsheetの負担メンバー指定で行う (HIS-003)
function ShortcutChips({ data }: Readonly<{ data: HistoryReadyData }>) {
  const params = filterToParams(data.filter);
  const isMyPaymentActive =
    data.filter.payerMemberId === data.currentMembershipId;

  return (
    <nav className={styles["history-shortcuts"]} aria-label="よく使う絞り込み">
      <Link
        className={
          isMyPaymentActive
            ? `${styles["history-chip"]} is-active`
            : styles["history-chip"]
        }
        aria-current={isMyPaymentActive ? "true" : undefined}
        href={createHistoryUrl(
          data.group.id,
          isMyPaymentActive
            ? withoutParam(params, "payer")
            : { ...params, payer: data.currentMembershipId },
        )}
      >
        自分が支払った
      </Link>
    </nav>
  );
}

function MemberSelect({
  name,
  label,
  members,
  selectedMemberId,
}: Readonly<{
  name: string;
  label: string;
  members: readonly HistoryMemberOption[];
  selectedMemberId?: string;
}>) {
  return (
    <label>
      {label}
      <select name={name} defaultValue={selectedMemberId ?? ""}>
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

function FilterSheet({ data }: Readonly<{ data: HistoryReadyData }>) {
  const filter = data.filter;
  const hasSheetFilter = Boolean(
    filter.month ||
    filter.type ||
    filter.categoryId ||
    filter.payerMemberId ||
    filter.recipientMemberId ||
    filter.memberMemberId,
  );
  const expenseCategories = data.categories.filter(
    (category) => category.type === "expense",
  );
  const incomeCategories = data.categories.filter(
    (category) => category.type === "income",
  );

  return (
    <details className={styles["history-filter-sheet"]} open={hasSheetFilter}>
      <summary>絞り込み</summary>
      <Form
        action={`/groups/${encodeURIComponent(data.group.id)}/history`}
        className={styles["history-filter-form"]}
      >
        {filter.limit !== historyDefaultPageSize ? (
          <input type="hidden" name="limit" value={filter.limit} />
        ) : null}
        <label>
          月
          <input type="month" name="month" defaultValue={filter.month ?? ""} />
        </label>
        <label>
          種別
          <select name="type" defaultValue={filter.type ?? ""}>
            <option value="">すべて</option>
            <option value="expense">支出</option>
            <option value="income">収入</option>
          </select>
        </label>
        <label>
          カテゴリ
          <select name="category" defaultValue={filter.categoryId ?? ""}>
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
        <MemberSelect
          name="payer"
          label="支払者"
          members={data.members}
          selectedMemberId={filter.payerMemberId}
        />
        <MemberSelect
          name="recipient"
          label="受取者"
          members={data.members}
          selectedMemberId={filter.recipientMemberId}
        />
        <MemberSelect
          name="member"
          label="負担メンバー"
          members={data.members}
          selectedMemberId={filter.memberMemberId}
        />
        <button className="primary-button" type="submit">
          絞り込みを適用
        </button>
      </Form>
    </details>
  );
}

function AppliedFilters({ data }: Readonly<{ data: HistoryReadyData }>) {
  const params = filterToParams(data.filter);
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
  if (data.filter.month) {
    chips.push({
      key: "month",
      label: formatHistoryMonthLabel(data.filter.month),
    });
  }
  if (data.filter.type) {
    chips.push({
      key: "type",
      label: data.filter.type === "expense" ? "支出" : "収入",
    });
  }
  if (data.filter.categoryId) {
    chips.push({
      key: "category",
      label: `カテゴリ ${categoryNameById.get(data.filter.categoryId) ?? ""}`,
    });
  }
  if (data.filter.payerMemberId) {
    chips.push({
      key: "payer",
      label: `支払者 ${memberNameById.get(data.filter.payerMemberId) ?? ""}`,
    });
  }
  if (data.filter.recipientMemberId) {
    chips.push({
      key: "recipient",
      label: `受取者 ${memberNameById.get(data.filter.recipientMemberId) ?? ""}`,
    });
  }
  if (data.filter.memberMemberId) {
    chips.push({
      key: "member",
      label: `負担 ${memberNameById.get(data.filter.memberMemberId) ?? ""}`,
    });
  }
  if (chips.length === 0) return null;

  return (
    <ul
      className={styles["history-applied-filters"]}
      aria-label="適用中の絞り込み"
    >
      {chips.map((chip) => (
        <li key={chip.key}>
          <span>{chip.label}</span>
          <Link
            href={createHistoryUrl(
              data.group.id,
              withoutParam(params, chip.key),
            )}
            aria-label={`${chip.label}の絞り込みを解除`}
          >
            解除
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function HistoryView({ data }: Readonly<{ data: HistoryReadyData }>) {
  const params = filterToParams(data.filter);
  const listKey = `${new URLSearchParams(params).toString()}|${data.appliedCursor ?? ""}`;

  return (
    <div className={styles["history-layout"]}>
      <section
        className={styles["history-controls"]}
        aria-label="履歴の絞り込み"
      >
        <ShortcutChips data={data} />
        <FilterSheet data={data} />
        <AppliedFilters data={data} />
      </section>
      <HistoryList
        key={listKey}
        groupId={data.group.id}
        filterParams={params}
        initialRows={data.rows}
        initialNextCursor={data.nextCursor}
      />
    </div>
  );
}
