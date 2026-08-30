export type CategorySummary = Readonly<{
  id: string;
  name: string;
}>;

type CategoryRowLike = Readonly<{
  id: string;
  name: string;
  sort_order: number;
}>;

export function toCategorySummaries(
  rows: readonly CategoryRowLike[],
): readonly CategorySummary[] {
  return [...rows]
    .sort((left, right) => left.sort_order - right.sort_order)
    .map((row) => ({ id: row.id, name: row.name }));
}
