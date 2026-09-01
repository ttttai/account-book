import { test as base, type BrowserContext, type Page } from "@playwright/test";

import { getE2eEnvironment } from "./e2e-environment";
import { E2E_USER_A, type E2eUser } from "./e2e-users";
import { signIn } from "./session";

type E2eFixtures = {
  /** E2E利用者Aとしてsessionを注入済みのpage */
  memberPage: Page;
  /** 別ユーザーのbrowser contextを開く（招待の受け渡しなど2人操作用） */
  openUserPage: (user: E2eUser) => Promise<Page>;
};

// session cookieを注入したpageを提供するPlaywright fixture
export const test = base.extend<E2eFixtures>({
  memberPage: async ({ context, page }, use) => {
    await signIn(context, E2E_USER_A, getE2eEnvironment());
    await use(page);
  },
  openUserPage: async ({ browser }, use) => {
    const contexts: BrowserContext[] = [];

    await use(async (user) => {
      const context = await browser.newContext();
      contexts.push(context);
      await signIn(context, user, getE2eEnvironment());
      return context.newPage();
    });

    for (const context of contexts) await context.close();
  },
});

export { expect } from "@playwright/test";
