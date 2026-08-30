"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import styles from "./groups.module.css";

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
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
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
      label: "入力",
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
    <nav
      className={styles["group-navigation"]}
      aria-label="グループ内ナビゲーション"
    >
      {items.map((item) => {
        const isActive = isPathActive(pathname, item);
        const className = [
          styles["group-navigation-link"],
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
