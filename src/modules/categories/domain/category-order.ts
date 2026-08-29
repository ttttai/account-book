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
