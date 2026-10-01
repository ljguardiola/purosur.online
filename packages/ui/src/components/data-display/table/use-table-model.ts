import { functionalUpdate, type Row, type RowData, useTable } from "@tanstack/react-table";
import { itemTree } from "../../../ordering/item-tree";
import { tableModelFeatures } from "./table-features";
import type {
  TableColumn,
  TableColumns,
  TableModel,
  TableSort,
  TableSortableColumnId,
} from "./table-types";

type TableModelSearch<T> = { text: string; in: (item: T) => readonly string[] };

type TableModelCommonOptions<T extends RowData> = {
  items: readonly T[];
  id: (item: T) => string;
  search?: TableModelSearch<T>;
  filter?: (item: T) => boolean;
  parentId?: (item: T) => string | null;
};

type TableModelSortOptions<C extends readonly { id: string; enableSorting: boolean }[]> = [
  TableSortableColumnId<C>,
] extends [never]
  ? { sort?: never; onSortChange?: never }
  : {
      sort: TableSort<TableSortableColumnId<C>>;
      onSortChange: (sort: TableSort<TableSortableColumnId<C>>) => void;
    };

export type TableModelOptions<
  T extends RowData,
  C extends TableColumns<T>,
> = TableModelCommonOptions<T> & {
  columns: C;
} & TableModelSortOptions<C>;

type RowFilter<T> = {
  search: { query: string; in: (item: T) => readonly string[] } | undefined;
  filter: ((item: T) => boolean) | undefined;
};

function rowFilterOf<T>(
  search: TableModelSearch<T> | undefined,
  filter: ((item: T) => boolean) | undefined,
): RowFilter<T> | undefined {
  const query = search?.text.trim().toLowerCase() ?? "";
  if (query === "" && filter === undefined) {
    return undefined;
  }
  return {
    search: search === undefined || query === "" ? undefined : { query, in: search.in },
    filter,
  };
}

function passesRowFilter<T extends RowData>(
  row: Row<typeof tableModelFeatures, T>,
  _columnId: string,
  { search, filter }: RowFilter<T>,
): boolean {
  const item = row.original;
  const matchesSearch =
    search === undefined ||
    search.in(item).some((text) => text.toLowerCase().includes(search.query));
  return matchesSearch && (filter === undefined || filter(item));
}

export function useTableModel<T extends RowData, const C extends TableColumns<T>>(
  options: TableModelOptions<T, C>,
): TableModel<T>;
export function useTableModel<T extends RowData>({
  items,
  id,
  columns,
  search,
  filter,
  parentId,
  sort,
  onSortChange,
}: TableModelCommonOptions<T> & {
  columns: readonly TableColumn<T>[];
  sort?: TableSort;
  onSortChange?: (sort: TableSort) => void;
}): TableModel<T> {
  const tree = parentId === undefined ? undefined : itemTree(items, id, parentId);
  const sorting =
    sort === undefined ? [] : [{ id: sort.column, desc: sort.direction === "descending" }];
  const searchColumnId = columns.find((column) => column.meta?.actionCount === undefined)?.id;

  return useTable({
    features: tableModelFeatures,
    columns,
    data: tree === undefined ? items : tree.roots,
    getRowId: id,
    ...(tree === undefined ? {} : { getSubRows: tree.childrenOf, filterFromLeafRows: true }),
    globalFilterFn: passesRowFilter,
    getColumnCanGlobalFilter: (column) => column.id === searchColumnId,
    enableSortingRemoval: false,
    enableMultiSort: false,
    onSortingChange: (updater) => {
      const next = functionalUpdate(updater, sorting)[0];
      if (next !== undefined) {
        onSortChange?.({ column: next.id, direction: next.desc ? "descending" : "ascending" });
      }
    },
    state: { sorting, globalFilter: rowFilterOf(search, filter), expanded: true },
  });
}
