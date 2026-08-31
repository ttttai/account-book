// SQLSTATEやPostgRESTのerror codeとして妥当な形だけを通し、log injectionと値の漏えいを防ぐ
const SAFE_CODE_PATTERN = /^[A-Za-z0-9_.-]{1,32}$/;
const UNKNOWN_CODE = "unknown";

export type CommandFailureLogInput = Readonly<{
  operation: string;
  code: unknown;
}>;

// DB command失敗のlog 1行を組み立てる。操作名とcodeだけを残し、家計データ・個人情報・tokenを含めない
export function formatCommandFailureLog({
  operation,
  code,
}: CommandFailureLogInput): string {
  const safeCode =
    typeof code === "string" && SAFE_CODE_PATTERN.test(code)
      ? code
      : UNKNOWN_CODE;
  const safeOperation = SAFE_CODE_PATTERN.test(operation)
    ? operation
    : UNKNOWN_CODE;
  return `transaction command failed: operation=${safeOperation} code=${safeCode}`;
}
