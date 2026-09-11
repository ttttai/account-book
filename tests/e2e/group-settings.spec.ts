import {
  acceptInvitation,
  createGroup,
  createInvitationLink,
} from "./support/app-actions";
import { E2E_USER_B } from "./support/e2e-users";
import { expect, test } from "./support/fixtures";

// E2E-013 グループ設定の変更と読み取り専用表示（GRP-013）
test("E2E-013 owner がグループ名と週の開始を変更すると見出しが更新され、member には読み取り専用で表示される", async ({
  memberPage,
  openUserPage,
}) => {
  const groupId = await createGroup(memberPage, "E2E 設定変更前");

  await memberPage.goto(`/groups/${groupId}/settings`);
  const form = memberPage.getByRole("form", { name: "グループ設定" });
  await form.getByLabel("グループ名").fill("E2E 設定変更後");
  await form.getByText("月曜日", { exact: true }).click();
  await expect(form.getByRole("radio", { name: "月曜日" })).toBeChecked();
  await form.getByRole("button", { name: "保存する" }).click();

  // 他画面へ遷移せず、同じ画面に結果と更新後の見出しを表示する (AC-GRP-013-1, AC-GRP-013-6)
  await expect(memberPage.getByRole("status")).toContainText("保存しました");
  await expect(memberPage).toHaveURL(new RegExp(`/groups/${groupId}/settings`));
  await expect(memberPage.locator(".settings-header .eyebrow")).toHaveText(
    "E2E 設定変更後",
  );

  // 再読み込み後も変更後の値が初期値になり、通貨・タイムゾーンは固定表示のまま (AC-GRP-013-2)
  await memberPage.reload();
  await expect(form.getByLabel("グループ名")).toHaveValue("E2E 設定変更後");
  await expect(form.getByRole("radio", { name: "月曜日" })).toBeChecked();
  await expect(form.getByText("JPY", { exact: true })).toBeVisible();
  await expect(form.getByText("Asia/Tokyo", { exact: true })).toBeVisible();
  await expect(form.getByRole("textbox")).toHaveCount(1);

  // memberとして参加した利用者Bには読み取り専用で表示し、保存操作を出さない (AC-GRP-013-1)
  const shareUrl = await createInvitationLink(memberPage, groupId, "メンバー");
  const invitedPage = await openUserPage(E2E_USER_B);
  await acceptInvitation(invitedPage, shareUrl);

  await invitedPage.goto(`/groups/${groupId}/settings`);
  await expect(invitedPage.locator(".settings-header .eyebrow")).toHaveText(
    "E2E 設定変更後",
  );
  const summary = invitedPage.locator(".settings-summary");
  await expect(summary.getByText("E2E 設定変更後")).toBeVisible();
  await expect(summary.getByText("月曜日")).toBeVisible();
  await expect(
    invitedPage.getByRole("button", { name: "保存する" }),
  ).toHaveCount(0);
  await expect(invitedPage.getByLabel("グループ名")).toHaveCount(0);
});
