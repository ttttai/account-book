// SQLSTATEやPostgRESTのerror codeとして妥当な形だけを通し、log injectionと値の漏えいを防ぐ
const SAFE_CODE_PATTERN = /^[A-Za-z0-9_.-]{1,32}$/;
const UNKNOWN_CODE = "unknown";

export type BudgetCommandFailureLogInput = Readonly<{
  operation: string;
  code: unknown;
}>;

// DB command失敗のlog 1行を組み立てる。操作名とcodeだけを残し、金額・カテゴリ名・個人情報を含めない (NFR-OPS-008)
export function formatBudgetCommandFailureLog({
  operation,
  code,
}: BudgetCommandFailureLogInput): string {
  const safeCode =
    typeof code === "string" && SAFE_CODE_PATTERN.test(code)
      ? code
      : UNKNOWN_CODE;
  const safeOperation = SAFE_CODE_PATTERN.test(operation)
    ? operation
    : UNKNOWN_CODE;
  return `budget command failed: operation=${safeOperation} code=${safeCode}`;
}
