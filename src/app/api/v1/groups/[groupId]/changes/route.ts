import type { NextRequest } from "next/server";

import { getGroupChangeToken } from "@/modules/sync/server";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate, max-age=0",
} as const;

function json(body: Readonly<Record<string, string>>, status: number) {
  return Response.json(body, { status, headers: { ...NO_STORE_HEADERS } });
}

type RouteContext = Readonly<{
  params: Promise<{ groupId: string }>;
}>;

// 他メンバーの変更を検出するための不透明な変更tokenを返す。fetch前提のためredirectせずJSONのerror codeで応答する (SYNC-003)
export async function GET(
  _request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  const { groupId } = await context.params;

  try {
    const result = await getGroupChangeToken(groupId);
    switch (result.kind) {
      case "unauthenticated":
        return json({ code: "UNAUTHENTICATED" }, 401);
      case "not_found":
        return json({ code: "NOT_FOUND" }, 404);
      case "ready":
        return json({ token: result.token }, 200);
    }
  } catch {
    return json({ code: "INTERNAL_ERROR" }, 500);
  }
}
