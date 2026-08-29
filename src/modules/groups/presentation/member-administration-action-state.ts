export type MemberAdministrationActionState = Readonly<{
  status: "idle" | "error" | "success";
  message?: string;
}>;

export const INITIAL_MEMBER_ADMINISTRATION_STATE: MemberAdministrationActionState =
  {
    status: "idle",
  };
