import { z } from "zod";

const invitationTokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/, "招待リンクが正しくありません。");

export const createInvitationSchema = z.object({
  groupId: z.uuid(),
  role: z.enum(["admin", "member"]),
});

export const acceptInvitationSchema = z.object({
  token: invitationTokenSchema,
});

export const revokeInvitationSchema = z.object({
  groupId: z.uuid(),
  invitationId: z.uuid(),
});

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
export type RevokeInvitationInput = z.infer<typeof revokeInvitationSchema>;
