import type { CategorySummary } from "@purosur/contracts";
import { type Option, type Options, sortedItems, textOrder } from "@purosur/ui";

export type CategoryNode = { id: string; name: string; parentId: string | null };

const PATH_SEPARATOR = " › ";

export function categoryPathText(names: readonly string[]): string {
  return names.join(PATH_SEPARATOR);
}

export function categoryPathLabels<T extends CategoryNode>(
  categories: readonly T[],
): Map<string, string> {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const labels = new Map<string, string>();

  function labelFor(id: string, ancestors: ReadonlySet<string>): string {
    const cached = labels.get(id);
    if (cached !== undefined) {
      return cached;
    }
    const category = byId.get(id);
    if (!category) {
      return "";
    }
    // The cloud's own move rules reject a cycle before it can be saved, but stopping here instead
    // of recursing forever keeps a corrupt payload from hanging the tab.
    const label =
      category.parentId && !ancestors.has(category.parentId)
        ? `${labelFor(category.parentId, new Set(ancestors).add(id))}${PATH_SEPARATOR}${category.name}`
        : category.name;
    labels.set(id, label);
    return label;
  }

  for (const category of categories) {
    labelFor(category.id, new Set());
  }
  return labels;
}

export function categoryMessage({ categoryId }: { categoryId: string | null }): string {
  return categoryId ? "Revisá la categoría." : "Elegí una categoría.";
}

export const categoryNameOrder = textOrder((category: CategoryNode) => category.name);

export function categoryParentId(category: CategoryNode): string | null {
  return category.parentId;
}

export function categoriesInTreeOrder<T extends CategoryNode>(categories: readonly T[]): T[] {
  return sortedItems(categories, {
    order: categoryNameOrder,
    direction: "ascending",
    id: (category) => category.id,
    parentId: categoryParentId,
  });
}

export function leafCategories<T extends CategoryNode>(categories: readonly T[]): T[] {
  const parentIds = new Set(
    categories.flatMap((category) => (category.parentId ? [category.parentId] : [])),
  );
  return categories.filter((category) => !parentIds.has(category.id));
}

export function selfAndDescendantIds<T extends CategoryNode>(
  categories: readonly T[],
  categoryId: string,
): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const category of categories) {
    if (category.parentId) {
      const siblings = childrenByParent.get(category.parentId) ?? [];
      siblings.push(category.id);
      childrenByParent.set(category.parentId, siblings);
    }
  }
  const ids = new Set<string>();
  const queue = [categoryId];
  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined || ids.has(id)) {
      continue;
    }
    ids.add(id);
    queue.push(...(childrenByParent.get(id) ?? []));
  }
  return ids;
}

// Full paths disambiguate leaves that share a name under different parents.
export function categorySelectOptions(
  categories: CategorySummary[],
): Options<Option<string>> | undefined {
  const leafIds = new Set(leafCategories(categories).map((category) => category.id));
  if (leafIds.size === 0) {
    return undefined;
  }
  const labels = categoryPathLabels(categories);
  const leaves = categoriesInTreeOrder(categories).filter((category) => leafIds.has(category.id));
  const [first, ...rest] = leaves.map((category) => ({
    value: category.id,
    label: labels.get(category.id) ?? category.name,
  }));
  if (!first) {
    throw new Error("no category to offer: leaves.length > 0 was already checked");
  }
  return [first, ...rest];
}

export function withCreatedCategory<T extends CategoryNode>(
  categories: readonly T[],
  created: T | null,
): readonly T[] {
  return created && !categories.some((category) => category.id === created.id)
    ? [...categories, created]
    : categories;
}
