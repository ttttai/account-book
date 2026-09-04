export type HomeDestination =
  Readonly<{ kind: "list" }> | Readonly<{ kind: "group"; href: string }>;

export type HomeDestinationInput = Readonly<{
  /** サーバーが認証済みsessionから取得したアクティブな所属グループID */
  groupIds: readonly string[];
  /** 本人が設定した起動時に開くグループID。未設定はnull */
  defaultGroupId: string | null;
  /** `/app`の`view` search param。`groups`のときだけ一覧表示を強制する */
  view: string | readonly string[] | undefined;
}>;

function groupDestination(groupId: string): HomeDestination {
  return { kind: "group", href: `/groups/${encodeURIComponent(groupId)}` };
}

// ホーム（/app）の遷移先を決める。view=groupsは常に一覧、起動時に開くグループがアクティブ所属に含まれればそこへ、所属が1件だけならそのグループへ直行する (GRP-011, GRP-012)
export function resolveHomeDestination({
  groupIds,
  defaultGroupId,
  view,
}: HomeDestinationInput): HomeDestination {
  // 表示切替は文字列"groups"との完全一致だけを受け付け、配列や他の値は既定の判定に従う (AC-GRP-011-4)
  if (view === "groups") return { kind: "list" };
  // 起動時に開くグループは所属を失っていれば無効として扱い、所属件数の判定へ戻す (AC-GRP-012-3, AC-GRP-012-4)
  if (defaultGroupId !== null && groupIds.includes(defaultGroupId)) {
    return groupDestination(defaultGroupId);
  }
  if (groupIds.length === 1) return groupDestination(groupIds[0]);
  return { kind: "list" };
}
