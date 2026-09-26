export type CategoryNode = { id: string; name: string; parentId: string | null };

const PATH_SEPARATOR = " › ";

/** Every category's full path label ("Almacén › Untables"), keyed by id. */
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

function collator(a: string, b: string): number {
  return a.localeCompare(b, "es");
}

/**
 * Every category in parent-before-descendants order, siblings sorted by name (descending reverses
 * only the sibling order). An orphaned parent is treated as top-level; a cycle is still emitted.
 */
export function categoriesInTreeOrder<T extends CategoryNode>(
  categories: readonly T[],
  direction: "ascending" | "descending" = "ascending",
): T[] {
  const ids = new Set(categories.map((category) => category.id));
  const sign = direction === "ascending" ? 1 : -1;
  const byName = (a: T, b: T) => sign * collator(a.name, b.name);

  const roots: T[] = [];
  const childrenByParent = new Map<string, T[]>();
  for (const category of categories) {
    if (category.parentId && ids.has(category.parentId)) {
      const siblings = childrenByParent.get(category.parentId) ?? [];
      siblings.push(category);
      childrenByParent.set(category.parentId, siblings);
    } else {
      roots.push(category);
    }
  }

  const ordered: T[] = [];
  const visited = new Set<string>();
  function walk(category: T): void {
    if (visited.has(category.id)) {
      return;
    }
    visited.add(category.id);
    ordered.push(category);
    for (const child of [...(childrenByParent.get(category.id) ?? [])].sort(byName)) {
      walk(child);
    }
  }

  for (const root of roots.sort(byName)) {
    walk(root);
  }
  for (const unreached of [...categories].sort(byName)) {
    walk(unreached);
  }
  return ordered;
}

/** A category with no subcategories of its own — the only kind a product can be assigned to. */
export function leafCategories<T extends CategoryNode>(categories: readonly T[]): T[] {
  const parentIds = new Set(
    categories.flatMap((category) => (category.parentId ? [category.parentId] : [])),
  );
  return categories.filter((category) => !parentIds.has(category.id));
}

/** A category's own id plus every descendant's, since neither is a valid move target for it. */
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
