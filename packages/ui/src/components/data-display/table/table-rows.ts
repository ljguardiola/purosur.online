import { type ItemOrder, sortedItems } from "../../../ordering/item-ordering";
import type { TableRow, TableSort } from "./table-types";

type TableItemParent<T> = (item: T) => string | null;

export type TableRowsOptions<T, K extends string> = {
  items: readonly T[];
  id: (item: T) => string;
  search?: { text: string; in: (item: T) => readonly string[] };
  filter?: (item: T) => boolean;
  sort?: {
    by: TableSort<K>;
    orders: Record<K, ItemOrder<T>>;
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
