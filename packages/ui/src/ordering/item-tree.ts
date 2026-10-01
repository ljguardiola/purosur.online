export type ItemTree<T> = {
  roots: T[];
  childrenOf: (item: T) => readonly T[];
};

export function itemTree<T>(
  items: readonly T[],
  id: (item: T) => string,
  parentId: (item: T) => string | null,
): ItemTree<T> {
  const ids = new Set(items.map(id));
  const roots: T[] = [];
  const childrenByParent = new Map<string, T[]>();
  for (const item of items) {
    const parent = parentId(item);
    if (parent === null || !ids.has(parent)) {
      roots.push(item);
    } else {
      const siblings = childrenByParent.get(parent);
      if (siblings === undefined) {
        childrenByParent.set(parent, [item]);
      } else {
        siblings.push(item);
      }
    }
  }

  const placedChildren = new Map<string, T[]>();
  const placed = new Set<string>();
  function place(item: T): void {
    placed.add(id(item));
    const children = (childrenByParent.get(id(item)) ?? []).filter(
      (child) => !placed.has(id(child)),
    );
    placedChildren.set(id(item), children);
    for (const child of children) {
      place(child);
    }
  }

  for (const root of roots) {
    place(root);
  }
  for (const item of items) {
    if (!placed.has(id(item))) {
      roots.push(item);
      place(item);
    }
  }

  return { roots, childrenOf: (item) => placedChildren.get(id(item)) ?? [] };
}
