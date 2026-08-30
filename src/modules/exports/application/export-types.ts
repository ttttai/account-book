// CSV出力の結果を未認証・対象なし・月指定不正・生成済みの4状態で表すunion
export type TransactionsCsvExport =
  | Readonly<{ kind: "unauthenticated" }>
  | Readonly<{ kind: "not_found" }>
  | Readonly<{ kind: "invalid_month" }>
  | Readonly<{
      kind: "ready";
      csv: string;
      contentDisposition: string;
    }>;
