import type { NextRequest } from "next/server";

import { updateSession } from "@/modules/auth/infrastructure/update-session";

// 全リクエストでSupabaseセッション更新と認証リダイレクトを行うProxyのエントリーポイント
export function proxy(request: NextRequest) {
  return updateSession(request);
}

// 静的アセットと画像ファイルを除くすべてのパスを対象にする
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|auth/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
