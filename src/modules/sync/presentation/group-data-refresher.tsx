"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";

import {
  CHANGE_CHECK_TIMEOUT_MS,
  changesRequestPath,
  isAutoRefreshPath,
  isEditingElement,
  nextCheckDelayMs,
  shouldCheckOnVisible,
  urlWithoutHistoryCursor,
} from "../domain/sync-policy";

// 変更確認応答から不透明tokenだけを取り出す。形式が違えば通信失敗と同じ扱いにする
function readChangeToken(body: unknown): string {
  if (
    typeof body === "object" &&
    body !== null &&
    "token" in body &&
    typeof body.token === "string" &&
    body.token.length > 0
  ) {
    return body.token;
  }
  throw new Error("invalid change token");
}

// 自動反映画面で初回同期を行い、以降は他メンバーの変更時だけServer Componentを再取得する。何も描画しない (SYNC-001〜SYNC-006)
export function GroupDataRefresher({ groupId }: Readonly<{ groupId: string }>) {
  const pathname = usePathname();
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  const refreshing = useRef(false);
  useEffect(() => {
    refreshing.current = isRefreshing;
  }, [isRefreshing]);

  useEffect(() => {
    // 取引入力・編集や設定配下では確認要求を送らない (SYNC-005)
    if (!isAutoRefreshPath(pathname, groupId)) return;

    let disposed = false;
    let stopped = false;
    let inFlight = false;
    let requestController: AbortController | undefined;
    let baseline: string | undefined;
    let consecutiveFailures = 0;
    let lastCheckedAt: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const clearTimer = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    };

    // 表示中だけ次回確認を予約する。非表示・停止後は予約しない (SYNC-002)
    const schedule = () => {
      clearTimer();
      if (disposed || stopped || document.visibilityState !== "visible") return;
      timer = setTimeout(() => {
        void check();
      }, nextCheckDelayMs(consecutiveFailures));
    };

    // 履歴のcursorをURLから除いて先頭ページから読み直し、Server Componentだけを再描画する (AC-SYNC-004-1, AC-SYNC-004-2)
    const refresh = () => {
      const href = urlWithoutHistoryCursor(window.location.href);
      startRefresh(() => {
        if (href !== undefined) router.replace(href, { scroll: false });
        return router.refresh();
      });
    };

    const check = async () => {
      if (disposed || stopped || inFlight) return;
      if (document.visibilityState !== "visible") return;
      if (navigator.onLine === false || refreshing.current) {
        schedule();
        return;
      }

      inFlight = true;
      lastCheckedAt = Date.now();
      const controller = new AbortController();
      requestController = controller;
      let timedOut = false;
      let rejectAborted: () => void = () => {};
      const aborted = new Promise<never>((_resolve, reject) => {
        rejectAborted = () => reject(new Error("change check aborted"));
        controller.signal.addEventListener("abort", rejectAborted, {
          once: true,
        });
      });
      const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, CHANGE_CHECK_TIMEOUT_MS);
      try {
        // bodyの読み取りも制限時間へ含め、中断を無視する遅延応答にも副作用を持たせない。
        const { response, body } = await Promise.race([
          (async () => {
            const response = await fetch(changesRequestPath(groupId), {
              cache: "no-store",
              credentials: "same-origin",
              headers: { accept: "application/json" },
              signal: controller.signal,
            });
            const body: unknown = response.ok
              ? await response.json()
              : undefined;
            return { response, body };
          })(),
          aborted,
        ]);
        if (
          disposed ||
          controller.signal.aborted ||
          document.visibilityState !== "visible"
        )
          return;
        // 未認証・非メンバーでは確認を止め、次の画面遷移の認証・所属確認へ委ねる (AC-SYNC-006-1)
        if (response.status === 401 || response.status === 404) {
          stopped = true;
          return;
        }
        if (!response.ok) throw new Error("change check failed");
        const token = readChangeToken(body);
        consecutiveFailures = 0;
        if (token !== baseline && !isEditingElement(document.activeElement)) {
          // 初回tokenと表示データには時点差があるため、初回も同期する。入力中は基準値を更新せず保留する。
          baseline = token;
          refresh();
        }
      } catch {
        if (!disposed && (!controller.signal.aborted || timedOut))
          consecutiveFailures += 1;
      } finally {
        clearTimeout(timeout);
        controller.signal.removeEventListener("abort", rejectAborted);
        requestController = undefined;
        inFlight = false;
        schedule();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        clearTimer();
        if (requestController) {
          requestController.abort();
          lastCheckedAt = undefined;
        }
        return;
      }
      if (shouldCheckOnVisible(lastCheckedAt, Date.now())) {
        void check();
      } else {
        schedule();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    void check();

    return () => {
      disposed = true;
      requestController?.abort();
      clearTimer();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [groupId, pathname, router]);

  return null;
}
