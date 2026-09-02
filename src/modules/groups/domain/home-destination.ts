export type HomeDestination =
  Readonly<{ kind: "list" }> | Readonly<{ kind: "group"; href: string }>;

export type HomeDestinationInput = Readonly<{
  /** サーバーが認証済みsessionから取得したアクティブな所属グループID */
  groupIds: readonly string[];
  /** `/app`の`view` search param。`groups`のときだけ一覧表示を強制する */
  view: string | readonly string[] | undefined;
}>;

// ホーム（/app）の遷移先を決める。所属が1件だけならカレンダーへ直行し、view=groupsでは常に一覧を表示する (GRP-011)
export function resolveHomeDestination({
  groupIds,
  view,
}: HomeDestinationInput): HomeDestination {
  // 表示切替は文字列"groups"との完全一致だけを受け付け、配列や他の値は既定の判定に従う (AC-GRP-011-4)
  if (view === "groups") return { kind: "list" };
  if (groupIds.length === 1) {
    return {
      kind: "group",
      href: `/groups/${encodeURIComponent(groupIds[0])}`,
    };
  }
  return { kind: "list" };
}
