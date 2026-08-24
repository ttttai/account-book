import { z } from "zod";

const displayNameSchema = z
  .string()
  .trim()
  .min(1, "表示名を入力してください。")
  .max(50, "表示名は50文字以内で入力してください。");

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("メールアドレスの形式を確認してください。");

const passwordSchema = z
  .string()
  .min(10, "パスワードは10文字以上で入力してください。")
  .max(72, "パスワードは72文字以内で入力してください。");

function requireMatchingPasswords<
  T extends { password: string; passwordConfirmation: string },
>(value: T, context: z.RefinementCtx) {
  if (value.password !== value.passwordConfirmation) {
    context.addIssue({
      code: "custom",
      path: ["passwordConfirmation"],
      message: "確認用パスワードが一致しません。",
    });
  }
}

export const signUpSchema = z
  .object({
    displayName: displayNameSchema,
    email: emailSchema,
    password: passwordSchema,
    passwordConfirmation: passwordSchema,
  })
  .superRefine(requireMatchingPasswords);

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "パスワードを入力してください。").max(72),
});

export const passwordResetRequestSchema = z.object({ email: emailSchema });

export const updatePasswordSchema = z
  .object({
    password: passwordSchema,
    passwordConfirmation: passwordSchema,
  })
  .superRefine(requireMatchingPasswords);

export const updateProfileSchema = z.object({ displayName: displayNameSchema });

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
