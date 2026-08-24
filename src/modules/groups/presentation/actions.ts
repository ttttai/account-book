"use server";

import { redirect } from "next/navigation";

import { createGroup } from "../application/create-group";
import { createGroupSchema } from "../domain/group-input";
import type { GroupActionState } from "./action-state";

function value(formData: FormData, name: string): string {
  const field = formData.get(name);
  return typeof field === "string" ? field : "";
}

export async function createGroupAction(
  _previousState: GroupActionState,
  formData: FormData,
): Promise<GroupActionState> {
  const result = createGroupSchema.safeParse({
    name: value(formData, "name"),
    weekStartsOn: value(formData, "weekStartsOn"),
    defaultAllocation: value(formData, "defaultAllocation"),
  });

  if (!result.success) {
    return {
      status: "error",
      message: "入力内容を確認してください。",
      fieldErrors: result.error.flatten().fieldErrors,
    };
  }

  let groupId: string;
  try {
    groupId = await createGroup(result.data);
  } catch {
    return {
      status: "error",
      message: "グループを作成できませんでした。時間をおいてお試しください。",
    };
  }

  redirect(`/groups/${groupId}`);
}
