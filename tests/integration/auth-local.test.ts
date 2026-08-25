import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

const shouldRun = process.env.RUN_LOCAL_INTEGRATION === "1";
const supabaseUrl =
  process.env.SUPABASE_INTERNAL_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function createTestClient() {
  if (!supabaseUrl || !publishableKey) {
    throw new Error("ローカルSupabaseの接続情報がありません。");
  }

  return createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

describe.runIf(shouldRun)("ローカルAuth・グループRLS", () => {
  it("プロフィールとグループを作成し、別ユーザーから読み書きできない", async () => {
    const testRunId = crypto.randomUUID();
    const firstClient = createTestClient();
    const secondClient = createTestClient();

    const firstSignup = await firstClient.auth.signUp({
      email: `first-${testRunId}@example.test`,
      password: "local-test-password-1",
      options: { data: { display_name: "利用者A" } },
    });
    expect(firstSignup.error).toBeNull();
    expect(firstSignup.data.session).not.toBeNull();
    const firstUserId = firstSignup.data.user?.id;
    expect(firstUserId).toBeTruthy();

    const firstProfile = await firstClient
      .from("profiles")
      .select("user_id, display_name")
      .eq("user_id", firstUserId as string)
      .single();
    expect(firstProfile.error).toBeNull();
    expect(firstProfile.data?.display_name).toBe("利用者A");

    const secondSignup = await secondClient.auth.signUp({
      email: `second-${testRunId}@example.test`,
      password: "local-test-password-2",
      options: { data: { display_name: "利用者B" } },
    });
    expect(secondSignup.error).toBeNull();
    expect(secondSignup.data.session).not.toBeNull();

    const crossUserRead = await secondClient
      .from("profiles")
      .select("user_id")
      .eq("user_id", firstUserId as string);
    expect(crossUserRead.error).toBeNull();
    expect(crossUserRead.data).toEqual([]);

    const crossUserUpdate = await secondClient
      .from("profiles")
      .update({ display_name: "変更されてはいけない" })
      .eq("user_id", firstUserId as string)
      .select("user_id");
    expect(crossUserUpdate.error).toBeNull();
    expect(crossUserUpdate.data).toEqual([]);

    const unchangedProfile = await firstClient
      .from("profiles")
      .select("display_name")
      .eq("user_id", firstUserId as string)
      .single();
    expect(unchangedProfile.data?.display_name).toBe("利用者A");

    const createdGroup = await firstClient.rpc("create_group", {
      p_name: "テスト家計",
      p_week_starts_on: 0,
      p_default_allocation: "equal",
    });
    expect(createdGroup.error).toBeNull();
    expect(createdGroup.data).toEqual(expect.any(String));
    const groupId = createdGroup.data as string;

    const ownerMembership = await firstClient
      .from("group_members")
      .select("role, status")
      .eq("group_id", groupId);
    expect(ownerMembership.error).toBeNull();
    expect(ownerMembership.data).toEqual([{ role: "owner", status: "active" }]);

    const initialCategories = await firstClient
      .from("categories")
      .select("type, name, sort_order")
      .eq("group_id", groupId)
      .order("type")
      .order("sort_order");
    expect(initialCategories.error).toBeNull();
    expect(initialCategories.data).toHaveLength(10);
    expect(
      initialCategories.data
        ?.filter((category) => category.type === "expense")
        .map((category) => category.name),
    ).toEqual(["食費", "日用品", "住居", "光熱費", "交通", "娯楽", "その他"]);
    expect(
      initialCategories.data
        ?.filter((category) => category.type === "income")
        .map((category) => category.name),
    ).toEqual(["給与", "臨時収入", "その他"]);

    for (const table of ["groups", "group_members", "categories"] as const) {
      const crossGroupRead = await secondClient
        .from(table)
        .select("*")
        .eq(table === "groups" ? "id" : "group_id", groupId);
      expect(crossGroupRead.error).toBeNull();
      expect(crossGroupRead.data).toEqual([]);
    }
  });
});
