/** 変更確認queryの結果。未認証・非メンバーへはtokenを返さない (SYNC-003) */
export type GroupChangeTokenResult =
  | Readonly<{ kind: "ready"; token: string }>
  | Readonly<{ kind: "unauthenticated" }>
  | Readonly<{ kind: "not_found" }>;
