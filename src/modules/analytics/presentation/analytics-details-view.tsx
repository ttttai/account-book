"use client";

import Link from "next/link";
import {
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  AnalyticsDetailsReady,
  AnalyticsMember,
} from "../application/analytics-types";
import { analyticsPresetStart } from "../domain/analytics-details-input";
import type { AnalyticsScope } from "../domain/analytics-input";
import {
  formatAnalyticsMonth,
  listAnalyticsMonths,
  MAX_ANALYTICS_MONTHS,
} from "../domain/analytics-month";
import { applyAnalyticsDetailsFilterAction } from "./actions";
import { AnalyticsDetailsSections } from "./analytics-details";

import styles from "./analytics.module.css";

type DetailsSearch = Readonly<Record<string, string>>;

/** 表示条件の下書き。選択欄はサーバー結果を待たずにこの値を表示する */
type DetailsDraft = Readonly<{
  start: string;
  end: string;
  scope: AnalyticsScope;
  member?: string;
}>;

const presetCounts = [3, 6, 12] as const;
const scopes: readonly AnalyticsScope[] = ["group", "self", "member"];
// URLから拾う既知のkeyだけを条件として扱う。値の検証はサーバーで毎回行う (AC-ANA-016-2)
const searchKeys = ["start", "end", "scope", "member"] as const;
const rangeNoticeMessage = `開始月から終了月まで、1〜${MAX_ANALYTICS_MONTHS}か月の範囲で指定してください。表示中の結果はそのまま残しています。`;
const rejectedNoticeMessage =
  "期間または集計対象が正しくありません。表示中の結果はそのまま残しています。";

function draftFromData(data: AnalyticsDetailsReady): DetailsDraft {
  return {
    start: data.startMonth,
    end: data.endMonth,
    scope: data.scope,
    ...(data.scope === "member" && data.selectedMemberId
      ? { member: data.selectedMemberId }
      : {}),
  };
}

// scopeがmember以外のときは`member`を付けず、サーバー検証（invalid_member）に掛からないURL形へ整える
function searchFromDraft(draft: DetailsDraft): DetailsSearch {
  return {
    start: draft.start,
    end: draft.end,
    scope: draft.scope,
    ...(draft.scope === "member" && draft.member
      ? { member: draft.member }
      : {}),
  };
}

function createDetailsUrl(groupId: string, search: DetailsSearch): string {
  const query = new URLSearchParams(search).toString();
  return `/groups/${encodeURIComponent(groupId)}/analytics/details${query ? `?${query}` : ""}`;
}

// ブラウザの戻る・進む時に、URLの既知のkeyだけから条件を復元する
function searchFromLocation(): DetailsSearch {
  const params = new URLSearchParams(window.location.search);
  const search: Record<string, string> = {};
  for (const key of searchKeys) {
    const value = params.get(key);
    if (value) search[key] = value;
  }
  return search;
}

function isAnalyticsScope(value: string): value is AnalyticsScope {
  return (scopes as readonly string[]).includes(value);
}

// 「指定メンバー」へ変えたときの初期選択は自分以外の先頭、いなければ先頭のメンバーとする (AC-ANA-016-4)
function defaultMemberId(
  members: readonly AnalyticsMember[],
): string | undefined {
  return (
    members.find((member) => !member.isCurrentUser)?.membershipId ??
    members[0]?.membershipId
  );
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

function monthCountOf(draft: DetailsDraft): number | undefined {
  return listAnalyticsMonths(draft.start, draft.end)?.length;
}

// 詳細分析の表示条件と集計結果を、ページ再取得なしのURL同期（pushState）と薄いServer Actionで組み立てるClient Component (ANA-016)
export function AnalyticsDetails({
  data,
}: Readonly<{ data: AnalyticsDetailsReady }>) {
  const [current, setCurrent] = useState(data);
  const [draft, setDraft] = useState<DetailsDraft>(() => draftFromData(data));
  const [isRangeOpen, setIsRangeOpen] = useState(
    () =>
      !(presetCounts as readonly number[]).includes(
        monthCountOf(draftFromData(data)) ?? 0,
      ),
  );
  const [isApplying, setIsApplying] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState<string | undefined>();
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  // 連続して条件を変えたときに、古い要求の結果で新しい結果を上書きしないための通番
  const requestSeq = useRef(0);
  // 失敗時の「再試行」で同じ条件を送るための直前の要求
  const lastSearch = useRef<DetailsSearch | undefined>(undefined);
  const groupId = data.group.id;

  const request = useCallback(
    async (search: DetailsSearch) => {
      requestSeq.current += 1;
      const seq = requestSeq.current;
      lastSearch.current = search;
      setIsApplying(true);
      setErrorMessage(undefined);
      setNoticeMessage(undefined);
      const result = await applyAnalyticsDetailsFilterAction(groupId, search);
      if (seq !== requestSeq.current) return;
      if (result.status === "ready") {
        setCurrent(result.data);
        setDraft(draftFromData(result.data));
      } else if (result.status === "invalid") {
        setNoticeMessage(rejectedNoticeMessage);
      } else {
        setErrorMessage(result.message);
      }
      setIsApplying(false);
    },
    [groupId],
  );

  useEffect(() => {
    function handlePopState() {
      void request(searchFromLocation());
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [request]);

  // 条件を確定したらURLへ保存し、ページ全体を再読み込みせずに結果だけを取り直す (AC-ANA-016-1, AC-ANA-016-2)
  function applyDraft(nextDraft: DetailsDraft) {
    setDraft(nextDraft);
    const search = searchFromDraft(nextDraft);
    window.history.pushState(null, "", createDetailsUrl(groupId, search));
    void request(search);
  }

  // 開始月・終了月は入力のたびに検証し、1〜24か月の範囲だけを取得する。範囲外は説明を出して結果を残す (AC-ANA-016-3)
  function handleRangeChange(key: "start" | "end", value: string) {
    const nextDraft = { ...draft, [key]: value };
    setDraft(nextDraft);
    if (!nextDraft.start || !nextDraft.end) return;
    if (!listAnalyticsMonths(nextDraft.start, nextDraft.end)) {
      setNoticeMessage(rangeNoticeMessage);
      return;
    }
    applyDraft(nextDraft);
  }

  function handleScopeChange(value: string) {
    if (!isAnalyticsScope(value)) return;
    if (value === "member") {
      const member = defaultMemberId(current.members);
      if (!member) return;
      applyDraft({ ...draft, scope: "member", member });
      return;
    }
    applyDraft({ start: draft.start, end: draft.end, scope: value });
  }

  function handleRetry() {
    if (lastSearch.current) void request(lastSearch.current);
  }

  const draftMonthCount = monthCountOf(draft);
  const overviewParams = new URLSearchParams({
    month: current.endMonth,
    scope: current.scope,
  });
  if (current.scope === "member" && current.selectedMemberId) {
    overviewParams.set("member", current.selectedMemberId);
  }

  return (
    <div className={styles["details-layout"]}>
      <header className={styles["details-heading"]}>
        <div>
          <p className="eyebrow">詳細分析</p>
          <h2>{`${formatAnalyticsMonth(current.startMonth)}〜${formatAnalyticsMonth(current.endMonth)}`}</h2>
        </div>
        <Link
          href={`/groups/${encodeURIComponent(groupId)}/analytics?${overviewParams.toString()}`}
        >
          概要分析へ
        </Link>
      </header>

      <section className={styles["details-filters"]}>
        <form
          aria-label="詳細分析の表示条件"
          className={styles["details-filter-form"]}
          onSubmit={(event) => event.preventDefault()}
        >
          <div className={styles["details-filter-row"]}>
            <nav
              aria-label="期間プリセット"
              className={styles["details-presets"]}
            >
              {presetCounts.map((count) => {
                const presetDraft: DetailsDraft = {
                  ...draft,
                  start: analyticsPresetStart(draft.end, count),
                };
                return (
                  <a
                    aria-current={
                      draftMonthCount === count ? "true" : undefined
                    }
                    href={createDetailsUrl(
                      groupId,
                      searchFromDraft(presetDraft),
                    )}
                    key={count}
                    onClick={(event) => {
                      if (!isPlainPrimaryClick(event)) return;
                      event.preventDefault();
                      applyDraft(presetDraft);
                    }}
                  >
                    {count}か月
                  </a>
                );
              })}
            </nav>
            <button
              aria-controls="analytics-details-range"
              aria-expanded={isRangeOpen}
              className={styles["details-range-toggle"]}
              onClick={() => setIsRangeOpen((open) => !open)}
              type="button"
            >
              期間を指定
            </button>
          </div>
          <div
            className={styles["details-range"]}
            hidden={!isRangeOpen}
            id="analytics-details-range"
          >
            <label>
              開始月
              <input
                name="start"
                onChange={(event) =>
                  handleRangeChange("start", event.target.value)
                }
                required
                type="month"
                value={draft.start}
              />
            </label>
            <label>
              終了月
              <input
                name="end"
                onChange={(event) =>
                  handleRangeChange("end", event.target.value)
                }
                required
                type="month"
                value={draft.end}
              />
            </label>
          </div>
          <div className={styles["details-filter-row"]}>
            <label>
              集計対象
              <select
                name="scope"
                onChange={(event) => handleScopeChange(event.target.value)}
                value={draft.scope}
              >
                <option value="group">グループ全体</option>
                <option value="self">自分</option>
                <option value="member">指定メンバー</option>
              </select>
            </label>
            {draft.scope === "member" ? (
              <label>
                メンバー
                <select
                  name="member"
                  onChange={(event) =>
                    applyDraft({ ...draft, member: event.target.value })
                  }
                  value={draft.member ?? ""}
                >
                  {current.members.map((member) => (
                    <option
                      key={member.membershipId}
                      value={member.membershipId}
                    >
                      {member.displayName}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        </form>
        {noticeMessage ? (
          <p className={styles["details-filter-notice"]} role="alert">
            {noticeMessage}
          </p>
        ) : null}
        {errorMessage ? (
          <p className={styles["details-filter-notice"]} role="alert">
            {errorMessage}
            <button
              className={styles["details-retry-button"]}
              onClick={handleRetry}
              type="button"
            >
              再試行
            </button>
          </p>
        ) : null}
      </section>

      {/* 反映中は結果領域だけを待機表示にし、見出し・表示条件・共通ナビは同じ要素のまま残す (AC-ANA-016-1) */}
      <div
        aria-busy={isApplying ? "true" : undefined}
        className={styles["details-results"]}
        data-details-results
      >
        {isApplying ? (
          <p className={styles["details-applying"]} role="status">
            表示条件を反映中…
          </p>
        ) : null}
        <AnalyticsDetailsSections data={current} />
      </div>
    </div>
  );
}
