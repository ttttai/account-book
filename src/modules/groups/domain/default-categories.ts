export type DefaultCategory = Readonly<{
  type: "expense" | "income";
  name: string;
  color: string;
  icon: string;
  sortOrder: number;
}>;

// グループ作成時に自動投入する初期カテゴリ一覧
export const DEFAULT_CATEGORIES = [
  {
    type: "expense",
    name: "食費",
    color: "food",
    icon: "utensils",
    sortOrder: 0,
  },
  {
    type: "expense",
    name: "日用品",
    color: "daily",
    icon: "basket",
    sortOrder: 1,
  },
  { type: "expense", name: "住居", color: "home", icon: "house", sortOrder: 2 },
  {
    type: "expense",
    name: "光熱費",
    color: "utilities",
    icon: "bolt",
    sortOrder: 3,
  },
  {
    type: "expense",
    name: "交通",
    color: "transport",
    icon: "train",
    sortOrder: 4,
  },
  {
    type: "expense",
    name: "娯楽",
    color: "leisure",
    icon: "ticket",
    sortOrder: 5,
  },
  {
    type: "expense",
    name: "その他",
    color: "other",
    icon: "ellipsis",
    sortOrder: 6,
  },
  {
    type: "income",
    name: "給与",
    color: "salary",
    icon: "wallet",
    sortOrder: 0,
  },
  {
    type: "income",
    name: "臨時収入",
    color: "extra",
    icon: "sparkles",
    sortOrder: 1,
  },
  {
    type: "income",
    name: "その他",
    color: "other",
    icon: "ellipsis",
    sortOrder: 2,
  },
] as const satisfies readonly DefaultCategory[];
