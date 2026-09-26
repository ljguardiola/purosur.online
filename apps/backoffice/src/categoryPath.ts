export type CategoryNode = { id: string; name: string; parentId: string | null };

const PATH_SEPARATOR = " › ";

/**
 * Every category's full path label ("Almacén › Untables"), from its top-level ancestor down to
 * itself, keyed by id. Computed once for the whole list rather than per category: an ancestor's
 * label is shared by every one of its descendants.
 */
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
    // A cycle never reaches the client (the cloud's own move rules reject one before it can be
    // saved), but stopping here instead of recursing forever keeps a corrupt payload from hanging
    // the tab.
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

function collator(a: string, b: string): number {
  return a.localeCompare(b, "es");
}

/**
 * Every category sorted by its own full path label rather than its bare name. A descendant's
 * label always carries its parent's label as a leading prefix, so sorting on the label alone
 * already groups each parent with its descendants right after it — the same tree order the
 * Categorías screen draws (design.pen node ieofw), with no separate tree-walk needed.
 */
export function sortedByPathLabel<T extends CategoryNode>(
  categories: readonly T[],
  labels: ReadonlyMap<string, string>,
  direction: "ascending" | "descending" = "ascending",
): T[] {
  const sorted = [...categories].sort((a, b) =>
    collator(labels.get(a.id) ?? a.name, labels.get(b.id) ?? b.name),
  );
  return direction === "ascending" ? sorted : sorted.reverse();
}

/** A category with no subcategories of its own — the only kind a product can be assigned to. */
export function leafCategories<T extends CategoryNode>(categories: readonly T[]): T[] {
  const parentIds = new Set(
    categories.flatMap((category) => (category.parentId ? [category.parentId] : [])),
  );
  return categories.filter((category) => !parentIds.has(category.id));
}

/**
 * A category's own id together with every one of its descendants', for excluding an invalid move
 * target (a category can't become its own parent, or one of its descendants').
 */
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
