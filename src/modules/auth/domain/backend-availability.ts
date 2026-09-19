import { isTransientAuthenticationQueryError } from "./postgrest-auth-error";

export type BackendErrorLike = Readonly<{
  name?: string | null;
  status?: number | null;
  code?: string | null;
  message?: string | null;
}>;

export type QueryResultLike = Readonly<{
  error: unknown;
  /** PostgRESTのHTTP status。fetch自体が失敗した場合は0 */
  status?: number;
}>;

// fetch失敗（status 0）とserver側の失敗（5xx）を応答不能とみなす。4xxはsession・入力の問題であり含めない
function isServerFailureStatus(status: number): boolean {
  return status === 0 || status >= 500;
}

// Auth API（GoTrue）の応答不能（接続失敗・中断・5xx）か。session欠如・無効・期限切れ（4xx）は含めない (NFR-SEC-012)
export function isUnavailableAuthError(
  error: BackendErrorLike | null | undefined,
): boolean {
  if (!error) return false;
  if (error.name === "AuthRetryableFetchError") return true;
  return (
    typeof error.status === "number" && isServerFailureStatus(error.status)
  );
}

// PostgREST応答の応答不能（fetch失敗はstatus 0、HTTP失敗は5xx）か。errorが無ければ応答不能ではない
export function isUnavailableQueryResult(result: QueryResultLike): boolean {
  if (!result.error) return false;
  return (
    typeof result.status === "number" && isServerFailureStatus(result.status)
  );
}

// バックエンド応答不能を表す例外。routeのerror境界が扱い、未認証・存在しないデータへ縮退させない (AC-AUTH-004-4)
export class BackendUnavailableError extends Error {
  readonly operation: string;

  constructor(operation: string) {
    super("バックエンドが応答しないため読み込めませんでした。");
    this.name = "BackendUnavailableError";
    this.operation = operation;
  }
}

function queryErrorCode(error: unknown): string {
  if (typeof error !== "object" || error === null) return "unknown";
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && code !== "" ? code : "unknown";
}

// 読み取りqueryの失敗を例外へ変換する。応答不能とPostgRESTの一過性の時刻検証エラーはBackendUnavailableError、
// それ以外は与えた文言のError。logには操作名・status・codeだけを残し、errorの本文（行の内容を含みうる）を記録しない
// (NFR-SEC-005, NFR-OPS-008, AC-AUTH-004-6)
export function createQueryFailureError(
  operation: string,
  result: QueryResultLike,
  fallbackMessage: string,
): Error {
  console.error(
    "read query failed: operation=%s status=%s code=%s",
    operation,
    result.status ?? "unknown",
    queryErrorCode(result.error),
  );
  if (
    isUnavailableQueryResult(result) ||
    isTransientAuthenticationQueryError(result.error)
  ) {
    return new BackendUnavailableError(operation);
  }
  return new Error(fallbackMessage);
}

// 一過性の時刻検証エラーだけ、同じ読み取りをもう一度だけ実行する。冪等な読み取り専用の処理にだけ使う。
// 再実行した事実は操作名とcodeだけをlogへ残す (AC-AUTH-004-7, NFR-SEC-005)
async function retryReadOnTransientClockError<T>(
  operation: string,
  run: () => PromiseLike<T>,
  transientErrorOf: (value: T) => unknown,
): Promise<T> {
  const first = await run();
  const transientError = transientErrorOf(first);
  if (transientError === undefined) return first;
  console.warn(
    "read query retried after transient clock error: operation=%s code=%s",
    operation,
    queryErrorCode(transientError),
  );
  return run();
}

// 単一の読み取りqueryを、PostgRESTの一過性の時刻検証エラーのときだけ1回再実行する (AC-AUTH-004-7)
export function runReadQueryWithTransientRetry<T extends QueryResultLike>(
  operation: string,
  run: () => PromiseLike<T>,
): Promise<T> {
  return retryReadOnTransientClockError(operation, run, (result) =>
    isTransientAuthenticationQueryError(result.error)
      ? result.error
      : undefined,
  );
}

// 並列に実行する複数の読み取りqueryを、いずれかが一過性の時刻検証エラーのときだけまとめて1回再実行する (AC-AUTH-004-7)
export function runReadQueriesWithTransientRetry<
  T extends readonly QueryResultLike[],
>(operation: string, run: () => PromiseLike<T>): Promise<T> {
  return retryReadOnTransientClockError(
    operation,
    run,
    (results) =>
      results.find((result) =>
        isTransientAuthenticationQueryError(result.error),
      )?.error,
  );
}

// 認証起因の失敗を未認証へ縮退させた事実を、操作名とcodeだけでlogへ残す。黙って空表示になる経路を追跡可能にする (AC-AUTH-004-6)
export function logAuthenticationQueryDegradation(
  operation: string,
  error: unknown,
): void {
  console.warn(
    "read query degraded to unauthenticated: operation=%s code=%s",
    operation,
    queryErrorCode(error),
  );
}
