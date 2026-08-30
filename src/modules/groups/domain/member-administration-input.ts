import { z } from "zod";

export const changeMemberRoleSchema = z.object({
  groupId: z.uuid(),
  membershipId: z.uuid(),
  role: z.enum(["owner", "admin", "member"]),
});

export const removeMemberSchema = z.object({
  groupId: z.uuid(),
  membershipId: z.uuid(),
});

export type ChangeMemberRoleInput = z.infer<typeof changeMemberRoleSchema>;
export type RemoveMemberInput = z.infer<typeof removeMemberSchema>;
