import {
  acceptInvitation,
  createGroup,
  createInvitationLink,
} from "./support/app-actions";
import { E2E_USER_A, E2E_USER_B } from "./support/e2e-users";
import { expect, test } from "./support/fixtures";

const EXPENSE_CATEGORY_ORDER = [
  "食費",
  "日用品",
  "住居",
  "光熱費",
  "交通",
  "娯楽",
  "その他",
] as const;

// E2E-002 グループ作成と初期カテゴリ（GRP-001、GRP-009、CAT-001）
test("E2E-002 グループを作成すると初期カテゴリが仕様順で使える", async ({
  memberPage,
}) => {
  const groupId = await createGroup(memberPage, "E2E 初期カテゴリ確認");

  await expect(
    memberPage.getByRole("heading", { name: /年\d+月$/ }),
  ).toBeVisible();

  await memberPage.goto(`/groups/${groupId}/transactions/new`);
  const expandToggle = memberPage.getByRole("button", { name: "すべて" });
  if (await expandToggle.isVisible()) await expandToggle.click();

  const categoryNames = await memberPage
    .locator(".category-option-name")
    .allInnerTexts();
  expect(categoryNames).toEqual([...EXPENSE_CATEGORY_ORDER]);
});

// E2E-003 招待リンクの作成と別ユーザーの参加（GRP-004、GRP-005）
test("E2E-003 招待リンクから別ユーザーがアクティブメンバーになる", async ({
  memberPage,
  openUserPage,
}) => {
  const groupId = await createGroup(memberPage, "E2E 招待確認");
  const shareUrl = await createInvitationLink(memberPage, groupId, "メンバー");

  const invitedPage = await openUserPage(E2E_USER_B);
  await acceptInvitation(invitedPage, shareUrl);

  await expect(invitedPage).toHaveURL(new RegExp(`/groups/${groupId}`));
  await expect(invitedPage.getByText("E2E 招待確認").first()).toBeVisible();

  await memberPage.goto(`/groups/${groupId}/members`);
  await expect(memberPage.getByText(E2E_USER_B.displayName)).toBeVisible();
  await expect(
    memberPage.getByText(E2E_USER_A.displayName, { exact: false }).first(),
  ).toBeVisible();
});
