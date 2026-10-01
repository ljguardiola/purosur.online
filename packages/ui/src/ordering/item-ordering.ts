import { itemTree } from "./item-tree";

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
  const tree = itemTree(items, id, parentId);
  const ordered: T[] = [];
  function walk(item: T): void {
    ordered.push(item);
    for (const child of [...tree.childrenOf(item)].sort(order)) {
      walk(child);
    }
  }
  for (const root of [...tree.roots].sort(order)) {
    walk(root);
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
