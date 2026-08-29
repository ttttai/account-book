import type { NextRequest } from "next/server";

import { getTransactionsCsvExport } from "@/modules/exports/server";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate, max-age=0",
} as const;

function jsonError(code: string, status: number): Response {
  return Response.json({ code }, { status, headers: { ...NO_STORE_HEADERS } });
}

type RouteContext = Readonly<{
  params: Promise<{ groupId: string }>;
}>;

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  const { groupId } = await context.params;
  const month = new URL(request.url).searchParams.get("month");
  const result = await getTransactionsCsvExport(groupId, month);

  switch (result.kind) {
    case "unauthenticated": {
      const nextPath = `/groups/${encodeURIComponent(groupId)}`;
      return new Response(null, {
        status: 303,
        headers: {
          ...NO_STORE_HEADERS,
          Location: `/login?next=${encodeURIComponent(nextPath)}`,
        },
      });
    }
    case "not_found":
      return jsonError("NOT_FOUND", 404);
    case "invalid_month":
      return jsonError("VALIDATION_ERROR", 422);
    case "ready":
      return new Response(result.csv, {
        status: 200,
        headers: {
          ...NO_STORE_HEADERS,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": result.contentDisposition,
          "X-Content-Type-Options": "nosniff",
        },
      });
  }
}
