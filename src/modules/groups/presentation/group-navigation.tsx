"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavigationItemId = "home" | "history" | "input" | "settings";

type NavigationItem = Readonly<{
  id: NavigationItemId;
  label: string;
  href: string;
  activePaths: readonly string[];
}>;

function NavigationIcon({ id }: Readonly<{ id: NavigationItemId }>) {
  if (id === "home") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M3 10.8 12 3l9 7.8v9.7a.5.5 0 0 1-.5.5H15v-6H9v6H3.5a.5.5 0 0 1-.5-.5z" />
      </svg>
    );
  }
  if (id === "history") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" />
      </svg>
    );
  }
  if (id === "input") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M12 5v14M5 12h14" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM19 12l2-1.2-2-3.5-2.1.8a7.6 7.6 0 0 0-1.4-.8L15.2 5h-4l-.3 2.3c-.5.2-1 .5-1.4.8l-2.1-.8-2 3.5 2 1.2v1.6l-2 1.2 2 3.5 2.1-.8c.4.3.9.6 1.4.8l.3 2.3h4l.3-2.3c.5-.2 1-.5 1.4-.8l2.1.8 2-3.5-2-1.2z" />
    </svg>
  );
}

function isPathActive(pathname: string, item: NavigationItem): boolean {
  if (item.id === "home") return pathname === item.href;
  return item.activePaths.some(
    (activePath) =>
      pathname === activePath || pathname.startsWith(`${activePath}/`),
  );
}

export function GroupNavigation({ groupId }: Readonly<{ groupId: string }>) {
  const pathname = usePathname();
  const groupBase = `/groups/${encodeURIComponent(groupId)}`;
  const items: readonly NavigationItem[] = [
    {
      id: "home",
      label: "ホーム",
      href: groupBase,
      activePaths: [groupBase],
    },
    {
      id: "history",
      label: "履歴",
      href: `${groupBase}/history`,
      activePaths: [`${groupBase}/history`],
    },
    {
      id: "input",
      label: "＋入力",
      href: `${groupBase}/transactions/new`,
      activePaths: [`${groupBase}/transactions`],
    },
    {
      id: "settings",
      label: "設定",
      href: `${groupBase}/settings`,
      activePaths: [
        `${groupBase}/settings`,
        `${groupBase}/members`,
        `${groupBase}/categories`,
      ],
    },
  ];

  return (
    <nav className="group-navigation" aria-label="グループ内ナビゲーション">
      {items.map((item) => {
        const isActive = isPathActive(pathname, item);
        const className = [
          "group-navigation-link",
          item.id === "input" ? "group-navigation-input" : "",
          isActive ? "is-active" : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <Link
            key={item.id}
            className={className}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
          >
            <NavigationIcon id={item.id} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
