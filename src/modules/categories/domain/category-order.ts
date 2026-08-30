export type RepositionCategoryOrderResult =
  | Readonly<{ kind: "moved"; categoryIds: readonly string[] }>
  | Readonly<{ kind: "unchanged" }>
  | Readonly<{ kind: "not_found" }>;

// 対象カテゴリを並びから取り除き、指定位置へ挿入した新しい並びを返す
export function buildRepositionedCategoryIds(
  orderedCategoryIds: readonly string[],
  targetCategoryId: string,
  destinationIndex: number,
): RepositionCategoryOrderResult {
  const index = orderedCategoryIds.indexOf(targetCategoryId);
  if (index < 0) return { kind: "not_found" };
  if (
    !Number.isInteger(destinationIndex) ||
    destinationIndex < 0 ||
    destinationIndex >= orderedCategoryIds.length
  ) {
    return { kind: "not_found" };
  }
  if (destinationIndex === index) return { kind: "unchanged" };

  const categoryIds = orderedCategoryIds.filter(
    (id) => id !== targetCategoryId,
  );
  categoryIds.splice(destinationIndex, 0, targetCategoryId);
  return { kind: "moved", categoryIds };
}
