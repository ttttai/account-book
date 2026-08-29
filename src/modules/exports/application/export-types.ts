export type TransactionsCsvExport =
  | Readonly<{ kind: "unauthenticated" }>
  | Readonly<{ kind: "not_found" }>
  | Readonly<{ kind: "invalid_month" }>
  | Readonly<{
      kind: "ready";
      csv: string;
      contentDisposition: string;
    }>;
