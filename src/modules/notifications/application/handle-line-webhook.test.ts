import { describe, expect, it, vi } from "vitest";

import { handleLineWebhook, type LineLinkGateway } from "./handle-line-webhook";

const GROUP_ID = "10000000-0000-4000-8000-000000000001";
const LINE_GROUP_ID = "Cffffeeeeddddccccbbbbaaaa99998888";

function createGateway() {
  return {
    link: vi.fn(async () => undefined),
    unlink: vi.fn(async () => undefined),
  } satisfies LineLinkGateway;
}

describe("handleLineWebhook", () => {
  it("グループへのjoin eventで連携を登録する (AC-NOTIF-004-1)", async () => {
    const gateway = createGateway();
    await handleLineWebhook(
      GROUP_ID,
      gateway,
      JSON.stringify({
        events: [
          { type: "join", source: { type: "group", groupId: LINE_GROUP_ID } },
        ],
      }),
    );

    expect(gateway.link).toHaveBeenCalledWith(GROUP_ID, LINE_GROUP_ID);
    expect(gateway.unlink).not.toHaveBeenCalled();
  });

  it("leave eventで連携を解除する", async () => {
    const gateway = createGateway();
    await handleLineWebhook(
      GROUP_ID,
      gateway,
      JSON.stringify({
        events: [
          { type: "leave", source: { type: "group", groupId: LINE_GROUP_ID } },
        ],
      }),
    );

    expect(gateway.unlink).toHaveBeenCalledWith(LINE_GROUP_ID);
    expect(gateway.link).not.toHaveBeenCalled();
  });

  it("group以外のsource、他のevent、不正なgroupIdは無視する", async () => {
    const gateway = createGateway();
    await handleLineWebhook(
      GROUP_ID,
      gateway,
      JSON.stringify({
        events: [
          { type: "join", source: { type: "user", userId: "U1" } },
          { type: "join", source: { type: "room", groupId: LINE_GROUP_ID } },
          {
            type: "message",
            source: { type: "group", groupId: LINE_GROUP_ID },
          },
          { type: "join", source: { type: "group", groupId: "bad id!" } },
          { type: "join" },
        ],
      }),
    );

    expect(gateway.link).not.toHaveBeenCalled();
    expect(gateway.unlink).not.toHaveBeenCalled();
  });

  it("JSONとして不正な本文や形式外の本文は処理せずに終わる", async () => {
    const gateway = createGateway();
    await handleLineWebhook(GROUP_ID, gateway, "{not json");
    await handleLineWebhook(GROUP_ID, gateway, JSON.stringify({ foo: 1 }));

    expect(gateway.link).not.toHaveBeenCalled();
    expect(gateway.unlink).not.toHaveBeenCalled();
  });
});
