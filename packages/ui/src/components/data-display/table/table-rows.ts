import type { TableRow, TableSort, TableSortDirection } from "./table-types";

export type TableItemOrder<T> = (a: T, b: T) => number;

export type TableItemsSort<T> = {
  order: TableItemOrder<T>;
  direction: TableSortDirection;
} & ({ id?: never; parentId?: never } | { id: (item: T) => string; parentId: TableItemParent<T> });

type TableItemParent<T> = (item: T) => string | null;

export type TableRowsOptions<T, K extends string> = {
  items: readonly T[];
  id: (item: T) => string;
  search?: { text: string; in: (item: T) => readonly string[] };
  filter?: (item: T) => boolean;
  sort?: {
    by: TableSort<K>;
    orders: Record<K, TableItemOrder<T>>;
    parentId?: TableItemParent<T>;
  };
  page?: { number: number; size: number };
};

export type TableRows<T> = {
  rows: TableRow<T>[];
  matchCount: number;
  page: number;
  pageCount: number;
};

export function textOrder<T>(text: (item: T) => string): TableItemOrder<T> {
  const collator = new Intl.Collator("es-AR");
  return (a, b) => collator.compare(text(a), text(b));
}

function inTreeOrder<T>(
  items: readonly T[],
  order: TableItemOrder<T>,
  id: (item: T) => string,
  parentId: TableItemParent<T>,
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

export function sortedItems<T>(items: readonly T[], sort: TableItemsSort<T>): T[] {
  const order: TableItemOrder<T> =
    sort.direction === "ascending" ? sort.order : (a, b) => sort.order(b, a);
  if (sort.id === undefined) {
    return [...items].sort(order);
  }
  return inTreeOrder(items, order, sort.id, sort.parentId);
}

function searchMatcher<T>(search: TableRowsOptions<T, string>["search"]): (item: T) => boolean {
  const query = search?.text.trim().toLowerCase() ?? "";
  if (search === undefined || query === "") {
    return () => true;
  }
  return (item) => search.in(item).some((text) => text.toLowerCase().includes(query));
}

function wholeAtLeastOne(value: number): number {
  return Math.max(Math.trunc(value) || 1, 1);
}

export function tableRows<T, K extends string = never>({
  items,
  id,
  search,
  filter = () => true,
  sort,
  page,
}: TableRowsOptions<T, K>): TableRows<T> {
  const ordered =
    sort === undefined
      ? items
      : sortedItems(items, {
          order: sort.orders[sort.by.column],
          direction: sort.by.direction,
          ...(sort.parentId === undefined ? {} : { id, parentId: sort.parentId }),
        });
  const matchesSearch = searchMatcher(search);
  const matches = ordered.filter((item) => matchesSearch(item) && filter(item));

  const pageSize = page === undefined ? Math.max(matches.length, 1) : wholeAtLeastOne(page.size);
  const pageCount = Math.max(Math.ceil(matches.length / pageSize), 1);
  const pageNumber = Math.min(wholeAtLeastOne(page?.number ?? 1), pageCount);
  const shown = matches.slice((pageNumber - 1) * pageSize, pageNumber * pageSize);

  return {
    rows: shown.map((item) => ({ id: id(item), item })),
    matchCount: matches.length,
    page: pageNumber,
    pageCount,
  };
}
