export type MoveDirection = "up" | "down";

export type MoveCategoryOrderResult =
  | Readonly<{ kind: "moved"; categoryIds: readonly string[] }>
  | Readonly<{ kind: "at_edge" }>
  | Readonly<{ kind: "not_found" }>;

export function buildMovedCategoryIds(
  orderedCategoryIds: readonly string[],
  targetCategoryId: string,
  direction: MoveDirection,
): MoveCategoryOrderResult {
  const index = orderedCategoryIds.indexOf(targetCategoryId);
  if (index < 0) return { kind: "not_found" };

  const neighborIndex = direction === "up" ? index - 1 : index + 1;
  if (neighborIndex < 0 || neighborIndex >= orderedCategoryIds.length) {
    return { kind: "at_edge" };
  }

  const categoryIds = [...orderedCategoryIds];
  categoryIds[index] = orderedCategoryIds[neighborIndex];
  categoryIds[neighborIndex] = orderedCategoryIds[index];
  return { kind: "moved", categoryIds };
}

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
