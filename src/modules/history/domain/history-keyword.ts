export const historyKeywordMaxLength = 100;

export type HistoryKeywordCondition = Readonly<{
  /** メモへの部分一致に使うLIKEパターン（`%`で囲み、メタ文字はエスケープ済み） */
  memoPattern: string;
  /** 数字だけのキーワードから求めた取引金額の完全一致候補 */
  amountMinor?: number;
}>;

// 前後の空白を除いたキーワードを返す。空は未指定（undefined）、上限超過はnullで拒否する (AC-HIS-009-1)
export function normalizeHistoryKeyword(
  raw: string,
): string | undefined | null {
  const keyword = raw.trim();
  if (keyword.length === 0) return undefined;
  return keyword.length > historyKeywordMaxLength ? null : keyword;
}

// LIKEのメタ文字（`\`・`%`・`_`）を文字そのものとして照合できるようエスケープする (AC-HIS-009-2)
export function escapeHistoryLikePattern(keyword: string): string {
  return keyword.replace(/[\\%_]/g, (character) => `\\${character}`);
}

// 通貨記号・桁区切り・空白を除き全角数字を半角へそろえ、1〜15桁の数字だけなら金額として返す (AC-HIS-009-2)
export function parseHistoryKeywordAmount(keyword: string): number | undefined {
  const digits = keyword.normalize("NFKC").replace(/[¥￥,，\s]/g, "");
  if (!/^\d{1,15}$/.test(digits)) return undefined;
  return Number(digits);
}

// キーワードからメモの部分一致パターンと金額の完全一致候補を組み立てる
export function buildHistoryKeywordCondition(
  keyword: string,
): HistoryKeywordCondition {
  const amountMinor = parseHistoryKeywordAmount(keyword);
  return {
    memoPattern: `%${escapeHistoryLikePattern(keyword)}%`,
    ...(amountMinor === undefined ? {} : { amountMinor }),
  };
}

// PostgRESTの`or`filterで予約文字（`,`・`(`・`)`・`.`）を含む値を渡すための二重引用符つき表現
export function quotePostgrestFilterValue(value: string): string {
  return `"${value.replace(/[\\"]/g, (character) => `\\${character}`)}"`;
}

// メモの部分一致と金額の完全一致を「または」で結ぶ、supabase-jsの`.or()`向けfilter文字列
export function buildHistoryKeywordOrCondition(
  condition: HistoryKeywordCondition,
): string {
  const memo = `memo.ilike.${quotePostgrestFilterValue(condition.memoPattern)}`;
  return condition.amountMinor === undefined
    ? memo
    : `${memo},amount_minor.eq.${condition.amountMinor}`;
}
