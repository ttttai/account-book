export type E2eUser = Readonly<{
  userId: string;
  email: string;
  displayName: string;
}>;

// tests/e2e/seed/seed-e2e-users.sqlが投入する架空アカウント。
// 値を変更する場合はseed SQLと`scripts/e2e-stack.sh`の許可リストも合わせる。
export const E2E_USER_A: E2eUser = {
  userId: "e2e00000-0000-4000-8000-00000000000a",
  email: "e2e-a@example.test",
  displayName: "E2E利用者A",
};

export const E2E_USER_B: E2eUser = {
  userId: "e2e00000-0000-4000-8000-00000000000b",
  email: "e2e-b@example.test",
  displayName: "E2E利用者B",
};
