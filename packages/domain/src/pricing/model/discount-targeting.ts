import type { DiscountTarget, DiscountTargetKind } from "./discount-target.js";

export interface CategoryLink {
  id: string;
  parentId: string | null;
}

export interface ProductTagLink {
  tagId: string;
  active: boolean;
}

export interface TargetedProduct {
  id: string;
  categoryId: string;
  tags: readonly ProductTagLink[];
}

export function discountsTargeting<TDiscount extends { target: DiscountTarget }>(
  discounts: readonly TDiscount[],
  product: TargetedProduct,
  categories: readonly CategoryLink[],
): TDiscount[] {
  const targetedIds: Record<DiscountTargetKind, ReadonlySet<string>> = {
    PRODUCT: new Set([product.id]),
    CATEGORY: categoryAndAncestors(product.categoryId, categories),
    TAG: new Set(product.tags.filter((tag) => tag.active).map((tag) => tag.tagId)),
  };
  return discounts.filter(({ target }) => targetedIds[target.kind].has(target.id));
}

function categoryAndAncestors(
  categoryId: string,
  categories: readonly CategoryLink[],
): Set<string> {
  const parentOf = new Map(categories.map((category) => [category.id, category.parentId]));
  const found = new Set<string>();
  let current: string | null | undefined = categoryId;
  while (current != null && !found.has(current)) {
    found.add(current);
    current = parentOf.get(current);
  }
  return found;
}
