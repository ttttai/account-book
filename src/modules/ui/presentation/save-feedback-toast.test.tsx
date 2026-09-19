import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const sonnerMocks = vi.hoisted(() => ({
  success: vi.fn(),
  dismiss: vi.fn(),
  toasterProps: [] as Record<string, unknown>[],
}));

const navigationMocks = vi.hoisted(() => ({ pathname: "/groups/g1" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationMocks.pathname,
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: sonnerMocks.success,
    dismiss: sonnerMocks.dismiss,
  }),
  // Toasterはライブラリの描画を模し、受け取ったpropsと通知の骨格だけを出す
  Toaster: (props: Record<string, unknown>) => {
    sonnerMocks.toasterProps.push(props);
    return (
      <section aria-label={String(props.customAriaLabel)} aria-live="polite">
        <ol data-sonner-toaster="">
          <li data-sonner-toast="" data-styled="true">
            <div data-content="">
              <div data-title="">支出を登録しました</div>
            </div>
            <button
              aria-label={String(
                (props.toastOptions as { closeButtonAriaLabel?: string })
                  ?.closeButtonAriaLabel,
              )}
              data-close-button=""
              type="button"
            >
              ×
            </button>
          </li>
        </ol>
      </section>
    );
  },
}));

import { SaveFeedbackToaster, showSaveFeedback } from "./save-feedback-toast";

const feedback = {
  title: "支出を登録しました",
  description: "9/19 食費 ￥1,200",
};

function writeCookie(value: string) {
  // biome-ignore lint/suspicious/noDocumentCookie: Server Actionが書いたcookieを模す
  document.cookie = `save_feedback=${value}; path=/`;
}

function clearCookie() {
  // biome-ignore lint/suspicious/noDocumentCookie: テスト間の後始末
  document.cookie = "save_feedback=; path=/; max-age=0";
}

describe("保存結果のトースト (TXN-019, AC-TXN-019-3, AC-TXN-019-4)", () => {
  afterEach(() => {
    cleanup();
    clearCookie();
    navigationMocks.pathname = "/groups/g1";
    sonnerMocks.toasterProps.length = 0;
    vi.clearAllMocks();
  });

  it("表示関数は既存の通知を消してから成功通知を1件出す（最新1件へ置き換える）", () => {
    showSaveFeedback(feedback);

    expect(sonnerMocks.dismiss).toHaveBeenCalledTimes(1);
    expect(sonnerMocks.success).toHaveBeenCalledWith("支出を登録しました", {
      description: "9/19 食費 ￥1,200",
    });
    expect(sonnerMocks.dismiss.mock.invocationCallOrder[0]).toBeLessThan(
      sonnerMocks.success.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("遷移後にcookieの通知内容を表示し、読んだ直後にcookieを削除する", () => {
    writeCookie(encodeURIComponent(JSON.stringify(feedback)));

    render(<SaveFeedbackToaster />);

    expect(sonnerMocks.success).toHaveBeenCalledWith("支出を登録しました", {
      description: "9/19 食費 ￥1,200",
    });
    expect(document.cookie).not.toContain("save_feedback=");
  });

  it("見出しだけのcookieも表示できる", () => {
    writeCookie(
      encodeURIComponent(JSON.stringify({ title: "取引を削除しました" })),
    );

    render(<SaveFeedbackToaster />);

    expect(sonnerMocks.success).toHaveBeenCalledWith("取引を削除しました", {
      description: undefined,
    });
  });

  it("cookieが無ければ何も表示せず、壊れた値は表示せずに削除する", () => {
    render(<SaveFeedbackToaster />);
    expect(sonnerMocks.success).not.toHaveBeenCalled();
    cleanup();

    writeCookie("%7Bbroken");
    render(<SaveFeedbackToaster />);
    expect(sonnerMocks.success).not.toHaveBeenCalled();
    expect(document.cookie).not.toContain("save_feedback=");
  });

  it("pathが変わるたびにcookieを読み直す", () => {
    const { rerender } = render(<SaveFeedbackToaster />);
    expect(sonnerMocks.success).not.toHaveBeenCalled();

    writeCookie(encodeURIComponent(JSON.stringify(feedback)));
    navigationMocks.pathname = "/groups/g1/history";
    rerender(<SaveFeedbackToaster />);

    expect(sonnerMocks.success).toHaveBeenCalledTimes(1);
  });

  it("Toasterは上部中央・1件・4秒・閉じるボタン付きで、アクセシブル名を持つ", () => {
    render(<SaveFeedbackToaster />);

    const props = sonnerMocks.toasterProps[0];
    expect(props).toMatchObject({
      position: "top-center",
      visibleToasts: 1,
      duration: 4000,
      closeButton: true,
      customAriaLabel: "保存結果の通知",
    });
    expect(props?.toastOptions).toMatchObject({
      closeButtonAriaLabel: "通知を閉じる",
    });
    // 上端はsafe areaの下に置く
    expect(JSON.stringify(props?.offset)).toContain("safe-area-inset-top");
    expect(JSON.stringify(props?.mobileOffset)).toContain(
      "safe-area-inset-top",
    );
    expect(screen.getByRole("region", { name: "保存結果の通知" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "通知を閉じる" })).toBeTruthy();
  });

  it("通知本体のタップで即時に消し、外側のタップでは何もしない", () => {
    render(<SaveFeedbackToaster />);

    fireEvent.click(screen.getByRole("region", { name: "保存結果の通知" }));
    expect(sonnerMocks.dismiss).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("支出を登録しました"));
    expect(sonnerMocks.dismiss).toHaveBeenCalledTimes(1);
  });
});
