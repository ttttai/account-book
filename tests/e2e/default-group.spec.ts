import { createGroup } from "./support/app-actions";
import { expect, test } from "./support/fixtures";

// E2E-011 起動時に開くグループの設定・直行・解除（GRP-012）
test("E2E-011 起動時に開くグループを設定すると/appが直行し、解除で一覧へ戻る", async ({
  memberPage,
}) => {
  // 所属2件以上を保証し、GRP-011の直行ではなくGRP-012の直行だけを検証する
  const groupId = await createGroup(memberPage, "E2E 起動時に開く");
  await createGroup(memberPage, "E2E 起動時に開く（別）");

  try {
    await memberPage.goto(`/groups/${groupId}/settings`);
    await memberPage
      .getByRole("button", { name: "このグループを起動時に開く" })
      .click();
    await expect(memberPage.getByRole("status")).toContainText(
      "起動時に開くように設定しました",
    );
    // 結果に合わせて操作が解除へ切り替わる (AC-GRP-012-1)
    await expect(
      memberPage.getByRole("button", { name: "解除する" }),
    ).toBeVisible();

    // 所属が2件以上でも一覧を経由せず直行する (AC-GRP-012-3)
    await memberPage.goto("/app");
    await expect(memberPage).toHaveURL(new RegExp(`/groups/${groupId}(\\?|$)`));

    // 明示的な一覧では該当行にだけ表示を付ける (AC-GRP-012-5)
    await memberPage.goto("/app?view=groups");
    const badge = memberPage.getByText("起動時に開く", { exact: true });
    await expect(badge).toHaveCount(1);
    await expect(badge.locator("xpath=ancestor::a")).toHaveAttribute(
      "href",
      `/groups/${groupId}`,
    );
  } finally {
    // 共有アカウントのため、他シナリオの一覧前提を崩さないよう必ず解除する
    await memberPage.goto(`/groups/${groupId}/settings`);
    await memberPage.getByRole("button", { name: "解除する" }).click();
    await expect(memberPage.getByRole("status")).toContainText(
      "設定を解除しました",
    );
  }

  // 解除後は所属件数の判定へ戻り、2件以上なので一覧を表示する (AC-GRP-012-4)
  await memberPage.goto("/app");
  await expect(memberPage).toHaveURL(/\/app(?:\?|$)/);
  await expect(
    memberPage.getByRole("heading", { name: "家計グループ" }),
  ).toBeVisible();
});
