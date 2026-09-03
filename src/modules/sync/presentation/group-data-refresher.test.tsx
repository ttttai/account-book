import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GroupDataRefresher } from "./group-data-refresher";

const navigation = vi.hoisted(() => ({
  pathname: "/",
  refresh: vi.fn(),
  replace: vi.fn((href: string) => window.history.replaceState(null, "", href)),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => navigation,
}));

const GROUP_ID = "10000000-0000-4000-8000-000000000001";
const BASE = `/groups/${GROUP_ID}`;
const CHANGES_PATH = `/api/v1/groups/${GROUP_ID}/changes`;

let visibilityState: DocumentVisibilityState = "visible";
let onLine = true;
const fetchMock = vi.fn<typeof fetch>();

function tokenResponse(token: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({ token }),
  } as unknown as Response;
}

function errorResponse(status: number): Response {
  return {
    ok: false,
    status,
    json: async () => ({ code: "ERROR" }),
  } as unknown as Response;
}

function setVisibility(state: DocumentVisibilityState) {
  visibilityState = state;
  document.dispatchEvent(new Event("visibilitychange"));
}

async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  visibilityState = "visible";
  onLine = true;
  navigation.pathname = BASE;
  navigation.refresh.mockReset();
  navigation.replace.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibilityState,
  });
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    get: () => onLine,
  });
  window.history.replaceState(null, "", `${BASE}?month=2026-09&scope=group`);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("GroupDataRefresher", () => {
  it("初回は同期し、その後変更が無い間は再取得しない (AC-SYNC-001-2)", async () => {
    fetchMock.mockResolvedValue(tokenResponse("aaaa"));
    const { container } = render(<GroupDataRefresher groupId={GROUP_ID} />);

    // 何も描画しない
    expect(container.innerHTML).toBe("");
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(CHANGES_PATH);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ cache: "no-store" });
    expect(navigation.refresh).toHaveBeenCalledTimes(1);

    await flush(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(navigation.refresh).toHaveBeenCalledTimes(1);

    await flush(29_999);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("tokenが変わったときだけrouter.refresh()を呼び、基準値を更新する (AC-SYNC-001-1)", async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse("aaaa"))
      .mockResolvedValueOnce(tokenResponse("bbbb"))
      .mockResolvedValue(tokenResponse("bbbb"));
    render(<GroupDataRefresher groupId={GROUP_ID} />);

    await flush();
    await flush(30_000);
    expect(navigation.refresh).toHaveBeenCalledTimes(2);

    await flush(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(navigation.refresh).toHaveBeenCalledTimes(2);
    // URLは変更しない
    expect(window.location.search).toBe("?month=2026-09&scope=group");
  });

  it("取引入力・設定配下では確認要求を送らない (AC-SYNC-005-1)", async () => {
    fetchMock.mockResolvedValue(tokenResponse("aaaa"));
    for (const path of [
      `${BASE}/transactions/new`,
      `${BASE}/transactions/abc/edit`,
      `${BASE}/settings`,
      `${BASE}/categories`,
      `${BASE}/recurring-transactions`,
    ]) {
      navigation.pathname = path;
      const view = render(<GroupDataRefresher groupId={GROUP_ID} />);
      await flush(60_000);
      expect(fetchMock, path).not.toHaveBeenCalled();
      view.unmount();
    }
  });

  it("非表示中は確認を止め、表示へ戻ると直ちに確認する (AC-SYNC-002-1)", async () => {
    fetchMock.mockResolvedValue(tokenResponse("aaaa"));
    render(<GroupDataRefresher groupId={GROUP_ID} />);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    setVisibility("hidden");
    await flush(120_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    setVisibility("visible");
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // 直後（5秒未満）にもう一度表示へ戻っても再確認せず、次の間隔まで待つ
    setVisibility("hidden");
    await flush(1_000);
    setVisibility("visible");
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await flush(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("入力欄へfocus中は再取得を保留し、focusが外れた後の確認で反映する (AC-SYNC-004-3)", async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse("aaaa"))
      .mockResolvedValue(tokenResponse("bbbb"));
    const input = document.createElement("input");
    document.body.append(input);
    render(<GroupDataRefresher groupId={GROUP_ID} />);
    await flush();

    input.focus();
    expect(document.activeElement).toBe(input);
    await flush(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(navigation.refresh).toHaveBeenCalledTimes(1);

    input.blur();
    await flush(30_000);
    expect(navigation.refresh).toHaveBeenCalledTimes(2);
    input.remove();
  });

  it("通信失敗では間隔を2倍にして再試行し、エラーを描画しない (AC-SYNC-006-1)", async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse("aaaa"))
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(errorResponse(500))
      .mockResolvedValue(tokenResponse("aaaa"));
    const { container } = render(<GroupDataRefresher groupId={GROUP_ID} />);
    await flush();
    await flush(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // 1回失敗: 次は60秒後
    await flush(59_999);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await flush(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // 2回失敗: 次は120秒後
    await flush(119_999);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await flush(1);
    expect(fetchMock).toHaveBeenCalledTimes(4);

    // 成功したら30秒へ戻る
    await flush(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(navigation.refresh).toHaveBeenCalledTimes(1);
    expect(container.innerHTML).toBe("");
  });

  it("401・404では確認を停止する (AC-SYNC-006-1)", async () => {
    fetchMock.mockResolvedValue(errorResponse(401));
    render(<GroupDataRefresher groupId={GROUP_ID} />);
    await flush();
    await flush(600_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(navigation.refresh).not.toHaveBeenCalled();
  });

  it("オフライン中は確認要求を送らず、復帰後の間隔で再試行する (AC-SYNC-006-1)", async () => {
    fetchMock.mockResolvedValue(tokenResponse("aaaa"));
    render(<GroupDataRefresher groupId={GROUP_ID} />);
    await flush();
    onLine = false;
    await flush(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    onLine = true;
    await flush(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("履歴でcursorがURLにあれば除いてから再取得し、絞り込み条件は維持する (AC-SYNC-004-2)", async () => {
    navigation.pathname = `${BASE}/history`;
    window.history.replaceState(
      null,
      "",
      `${BASE}/history?month=2026-09&type=expense&cursor=abc`,
    );
    fetchMock
      .mockResolvedValueOnce(tokenResponse("aaaa"))
      .mockResolvedValue(tokenResponse("bbbb"));
    render(<GroupDataRefresher groupId={GROUP_ID} />);
    await flush();
    await flush(30_000);

    expect(navigation.refresh).toHaveBeenCalledTimes(2);
    expect(navigation.replace).toHaveBeenCalledWith(
      `${BASE}/history?month=2026-09&type=expense`,
      { scroll: false },
    );
    expect(window.location.pathname).toBe(`${BASE}/history`);
    expect(window.location.search).toBe("?month=2026-09&type=expense");
  });

  it("pathnameが変わると初回同期で表示を最新化する", async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse("aaaa"))
      .mockResolvedValue(tokenResponse("bbbb"));
    const view = render(<GroupDataRefresher groupId={GROUP_ID} />);
    await flush();

    navigation.pathname = `${BASE}/analytics`;
    view.rerender(<GroupDataRefresher groupId={GROUP_ID} />);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(navigation.refresh).toHaveBeenCalledTimes(2);
  });

  it("unmount後は確認しない", async () => {
    fetchMock.mockResolvedValue(tokenResponse("aaaa"));
    const view = render(<GroupDataRefresher groupId={GROUP_ID} />);
    await flush();
    view.unmount();
    await flush(120_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// 遅延応答はfetch本体だけでなくbodyの読み取り中にも発生する。
describe("変更確認の競合", () => {
  it.each(["navigate", "unmount", "hidden"])(
    "%s後に届いたbodyで画面やURLを更新しない (AC-SYNC-005-1)",
    async (mode) => {
      let resolveBody!: (value: unknown) => void;
      fetchMock.mockResolvedValueOnce(tokenResponse("aaaa")).mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          new Promise((resolve) => {
            resolveBody = resolve;
          }),
      } as unknown as Response);
      const view = render(<GroupDataRefresher groupId={GROUP_ID} />);
      await flush();
      navigation.refresh.mockClear();
      await flush(30_000);
      if (mode === "navigate") {
        navigation.pathname = `${BASE}/transactions/new`;
        window.history.replaceState(
          null,
          "",
          `${navigation.pathname}?cursor=keep`,
        );
        view.rerender(<GroupDataRefresher groupId={GROUP_ID} />);
      } else if (mode === "unmount") {
        view.unmount();
      } else {
        setVisibility("hidden");
      }
      const href = window.location.href;
      resolveBody({ token: "bbbb" });
      await flush();
      expect(navigation.refresh).not.toHaveBeenCalled();
      expect(window.location.href).toBe(href);
      expect(fetchMock.mock.calls[1]?.[1]?.signal?.aborted).toBe(true);
    },
  );

  it("初回確認まで非表示でも復帰時に画面を同期する (AC-SYNC-001-2)", async () => {
    setVisibility("hidden");
    fetchMock.mockResolvedValue(tokenResponse("newer-than-screen"));
    render(<GroupDataRefresher groupId={GROUP_ID} />);
    await flush(60_000);
    expect(fetchMock).not.toHaveBeenCalled();
    setVisibility("visible");
    await flush();
    expect(navigation.refresh).toHaveBeenCalledTimes(1);
  });

  it("15秒で応答bodyを打ち切りbackoff後に再試行する (AC-SYNC-006-1)", async () => {
    let resolveBody!: (value: unknown) => void;
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          new Promise((resolve) => {
            resolveBody = resolve;
          }),
      } as unknown as Response)
      .mockResolvedValue(tokenResponse("aaaa"));
    render(<GroupDataRefresher groupId={GROUP_ID} />);
    await flush(15_000);
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    await flush(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(navigation.refresh).toHaveBeenCalledTimes(1);
    resolveBody({ token: "obsolete" });
    await flush();
    expect(navigation.refresh).toHaveBeenCalledTimes(1);
  });
});

describe("画面再取得中の重複防止", () => {
  it("画面の再取得が完了するまでは次の変更確認を保留する (SYNC-004)", async () => {
    let completeRefresh!: () => void;
    navigation.refresh.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          completeRefresh = resolve;
        }),
    );
    fetchMock.mockResolvedValue(tokenResponse("aaaa"));
    render(<GroupDataRefresher groupId={GROUP_ID} />);
    await flush();
    await flush(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      completeRefresh();
    });
    await flush(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(navigation.refresh).toHaveBeenCalledTimes(1);
  });
});
