import type { ReactNode } from "react";

import { GroupNavigation } from "@/modules/groups/presentation";
import { GroupDataRefresher } from "@/modules/sync/presentation";

type GroupLayoutProps = Readonly<{
  children: ReactNode;
  params: Promise<{ groupId: string }>;
}>;

export default async function GroupLayout({
  children,
  params,
}: GroupLayoutProps) {
  const { groupId } = await params;

  return (
    <div className="group-route-layout">
      <div className="group-route-content">{children}</div>
      <GroupNavigation groupId={groupId} />
      <GroupDataRefresher groupId={groupId} />
    </div>
  );
}
