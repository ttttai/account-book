import { z } from "zod";

/** 保存結果の通知に表示する見出しと説明 (TXN-019) */
export type SaveFeedback = Readonly<{
  title: string;
  description?: string;
}>;

/** Server Actionがredirectの直前に書き、遷移後の通知領域が読んで削除する短命cookie (AC-TXN-019-3) */
export const SAVE_FEEDBACK_COOKIE_NAME = "save_feedback";

/** 遷移直後に読む前提の寿命。読み取れなかった場合も30秒で自然に失効する */
export const SAVE_FEEDBACK_COOKIE_MAX_AGE_SECONDS = 30;

const saveFeedbackSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().min(1).max(200).optional(),
});

// cookieへ書く値。文字のencodeはcookieを書く側（Server Actionの`cookies().set`）が行う
export function encodeSaveFeedbackCookie(feedback: SaveFeedback): string {
  return JSON.stringify(feedback);
}

// cookieの値を検証して通知内容へ戻す。壊れた値・想定外の形は表示せずnullにする
export function decodeSaveFeedbackCookie(
  rawValue: string | undefined,
): SaveFeedback | null {
  if (!rawValue) return null;
  try {
    const parsed = saveFeedbackSchema.safeParse(
      JSON.parse(decodeURIComponent(rawValue)),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// document.cookie形式の文字列から保存結果cookieの値だけを取り出す
export function readSaveFeedbackCookie(
  cookieHeader: string,
): string | undefined {
  for (const pair of cookieHeader.split(";")) {
    const separator = pair.indexOf("=");
    if (separator === -1) continue;
    if (pair.slice(0, separator).trim() === SAVE_FEEDBACK_COOKIE_NAME) {
      return pair.slice(separator + 1).trim();
    }
  }
  return undefined;
}

// 読み取った直後にdocument.cookieへ代入して削除する文字列
export function buildSaveFeedbackCookieDeletion(): string {
  return `${SAVE_FEEDBACK_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
}
