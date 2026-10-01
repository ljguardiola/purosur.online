export type ItemOrder<T> = (a: T, b: T) => number;

export type ItemsSort<T> = {
  order: ItemOrder<T>;
  direction: "ascending" | "descending";
} & ({ id?: never; parentId?: never } | { id: (item: T) => string; parentId: ItemParent<T> });

type ItemParent<T> = (item: T) => string | null;

export function textOrder<T>(text: (item: T) => string): ItemOrder<T> {
  const collator = new Intl.Collator("es-AR");
  return (a, b) => collator.compare(text(a), text(b));
}

function inTreeOrder<T>(
  items: readonly T[],
  order: ItemOrder<T>,
  id: (item: T) => string,
  parentId: ItemParent<T>,
): T[] {
  const ids = new Set(items.map(id));
  const roots: T[] = [];
  const childrenByParent = new Map<string, T[]>();
  for (const item of items) {
    const parent = parentId(item);
    const siblings = parent === null ? undefined : childrenByParent.get(parent);
    if (siblings !== undefined) {
      siblings.push(item);
    } else if (parent !== null && ids.has(parent)) {
      childrenByParent.set(parent, [item]);
    } else {
      roots.push(item);
    }
  }

  const ordered: T[] = [];
  const visited = new Set<string>();
  function walk(item: T): void {
    if (visited.has(id(item))) {
      return;
    }
    visited.add(id(item));
    ordered.push(item);
    for (const child of (childrenByParent.get(id(item)) ?? []).sort(order)) {
      walk(child);
    }
  }

  for (const root of roots.sort(order)) {
    walk(root);
  }
  const itemsInCycles = items.filter((item) => !visited.has(id(item)));
  for (const item of itemsInCycles.sort(order)) {
    walk(item);
  }
  return ordered;
}

export function sortedItems<T>(items: readonly T[], sort: ItemsSort<T>): T[] {
  const order: ItemOrder<T> =
    sort.direction === "ascending" ? sort.order : (a, b) => sort.order(b, a);
  if (sort.id === undefined) {
    return [...items].sort(order);
  }
  return inTreeOrder(items, order, sort.id, sort.parentId);
}
