// SQLSTATEやPostgRESTのerror codeとして妥当な形だけを通し、log injectionと値の漏えいを防ぐ
const SAFE_CODE_PATTERN = /^[A-Za-z0-9_.-]{1,32}$/;
const UNKNOWN_CODE = "unknown";

// DB command失敗のlog 1行を組み立てる。操作名とcodeだけを残し、資産額・区分名・個人情報を含めない (NFR-OPS-008)
export function formatAssetCommandFailureLog(
  operation: string,
  code: unknown,
): string {
  const safeCode =
    typeof code === "string" && SAFE_CODE_PATTERN.test(code)
      ? code
      : UNKNOWN_CODE;
  const safeOperation = SAFE_CODE_PATTERN.test(operation)
    ? operation
    : UNKNOWN_CODE;
  return `asset command failed: operation=${safeOperation} code=${safeCode}`;
}
