import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  getAllowedGoogleUserId: vi.fn(),
}));

vi.mock("@/modules/auth/server", () => authMocks);

import { addCategory } from "./add-category";
import { archiveCategory } from "./archive-category";
import {
  CategoryCommandError,
  toCategoryCommandError,
} from "./category-command-error";
import { repositionCategory } from "./reposition-category";
import { updateCategory } from "./update-category";

const GROUP_ID = "10000000-0000-4000-8000-000000000001";
const CATEGORY_ID = "20000000-0000-4000-8000-000000000001";
const SECOND_CATEGORY_ID = "20000000-0000-4000-8000-000000000002";
const THIRD_CATEGORY_ID = "20000000-0000-4000-8000-000000000003";
const USER_ID = "30000000-0000-4000-8000-000000000001";

function setupSupabase() {
  const getClaims = vi.fn().mockResolvedValue({
    data: { claims: { sub: USER_ID } },
    error: null,
  });
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
  const from = vi.fn();
  authMocks.createServerSupabaseClient.mockResolvedValue({
    auth: { getClaims },
    rpc,
    from,
  });
  authMocks.getAllowedGoogleUserId.mockReturnValue(USER_ID);
  return { getClaims, rpc, from };
}

function targetCategoryQuery(
  result: Readonly<{ data: unknown; error: unknown }>,
) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.is.mockReturnValue(query);
  return query;
}

function categoryOrderQuery(
  result: Readonly<{ data: unknown; error: unknown }>,
) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    order: vi.fn().mockResolvedValue(result),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.is.mockReturnValue(query);
  return query;
}

describe("category application commands", () => {
  beforeEach(() => {
    authMocks.createServerSupabaseClient.mockReset();
    authMocks.getAllowedGoogleUserId.mockReset();
  });

  it("追加入力を正規化してRPCへ渡す", async () => {
    const { rpc } = setupSupabase();

    await addCategory({
      groupId: GROUP_ID,
      type: "expense",
      name: "  食費  ",
    });

    expect(rpc).toHaveBeenCalledExactlyOnceWith("add_group_category", {
      p_group_id: GROUP_ID,
      p_type: "expense",
      p_name: "食費",
    });
  });

  it("認証できなければ追加RPCを呼ばない", async () => {
    const { rpc } = setupSupabase();
    authMocks.getAllowedGoogleUserId.mockReturnValue(null);

    await expect(
      addCategory({ groupId: GROUP_ID, type: "expense", name: "食費" }),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("名称と色の更新を1回のRPCへ渡す", async () => {
    const { rpc } = setupSupabase();

    await updateCategory({
      groupId: GROUP_ID,
      categoryId: CATEGORY_ID,
      name: "外食",
      color: "food",
    });

    expect(rpc).toHaveBeenCalledExactlyOnceWith("update_group_category", {
      p_group_id: GROUP_ID,
      p_category_id: CATEGORY_ID,
      p_name: "外食",
      p_color: "food",
    });
  });

  it.each(["archived", "already_archived"] as const)(
    "アーカイブ結果%sをそのまま返す",
    async (result) => {
      const { rpc } = setupSupabase();
      rpc.mockResolvedValue({ data: result, error: null });

      await expect(
        archiveCategory({ groupId: GROUP_ID, categoryId: CATEGORY_ID }),
      ).resolves.toBe(result);
      expect(rpc).toHaveBeenCalledExactlyOnceWith("archive_group_category", {
        p_group_id: GROUP_ID,
        p_category_id: CATEGORY_ID,
      });
    },
  );

  it.each([
    ["42501", "FORBIDDEN"],
    ["28000", "UNAUTHENTICATED"],
    ["23505", "DUPLICATE_NAME"],
    ["22023", "INVALID_INPUT"],
    ["other", "UNKNOWN"],
    [null, "UNKNOWN"],
  ] as const)("DB code %sを%sへ分類する", (code, expected) => {
    expect(toCategoryCommandError({ code })).toMatchObject({
      name: "CategoryCommandError",
      code: expected,
    });
  });

  it("現在順序から移動後の全IDを組み立ててRPCへ渡す", async () => {
    const { from, rpc } = setupSupabase();
    from
      .mockReturnValueOnce(
        targetCategoryQuery({
          data: { id: CATEGORY_ID, type: "expense" },
          error: null,
        }),
      )
      .mockReturnValueOnce(
        categoryOrderQuery({
          data: [
            { id: CATEGORY_ID, sort_order: 0 },
            { id: SECOND_CATEGORY_ID, sort_order: 1 },
            { id: THIRD_CATEGORY_ID, sort_order: 2 },
          ],
          error: null,
        }),
      );

    await expect(
      repositionCategory({
        groupId: GROUP_ID,
        categoryId: CATEGORY_ID,
        position: 2,
      }),
    ).resolves.toBe("moved");
    expect(rpc).toHaveBeenCalledExactlyOnceWith("reorder_group_categories", {
      p_group_id: GROUP_ID,
      p_type: "expense",
      p_category_ids: [SECOND_CATEGORY_ID, THIRD_CATEGORY_ID, CATEGORY_ID],
    });
  });

  it("対象カテゴリが無ければ順序取得とRPCを行わない", async () => {
    const { from, rpc } = setupSupabase();
    from.mockReturnValueOnce(targetCategoryQuery({ data: null, error: null }));

    await expect(
      repositionCategory({
        groupId: GROUP_ID,
        categoryId: CATEGORY_ID,
        position: 0,
      }),
    ).resolves.toBe("not_found");
    expect(from).toHaveBeenCalledTimes(1);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("同じ位置への移動では並び替えRPCを行わない", async () => {
    const { from, rpc } = setupSupabase();
    from
      .mockReturnValueOnce(
        targetCategoryQuery({
          data: { id: CATEGORY_ID, type: "expense" },
          error: null,
        }),
      )
      .mockReturnValueOnce(
        categoryOrderQuery({
          data: [
            { id: CATEGORY_ID, sort_order: 0 },
            { id: SECOND_CATEGORY_ID, sort_order: 1 },
          ],
          error: null,
        }),
      );

    await expect(
      repositionCategory({
        groupId: GROUP_ID,
        categoryId: CATEGORY_ID,
        position: 0,
      }),
    ).resolves.toBe("unchanged");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("対象カテゴリのquery失敗をUNKNOWNとして返す", async () => {
    const { from } = setupSupabase();
    from.mockReturnValueOnce(
      targetCategoryQuery({ data: null, error: { code: "unexpected" } }),
    );

    await expect(
      repositionCategory({
        groupId: GROUP_ID,
        categoryId: CATEGORY_ID,
        position: 0,
      }),
    ).rejects.toEqual(new CategoryCommandError("UNKNOWN"));
  });
});
