import type { ColumnDef, ReactTable, RowData } from "@tanstack/react-table";
import type { ReactNode } from "react";
import type { EmptyStateProps } from "../../feedback/empty-state";
import type { LoadFailureProps } from "../../feedback/load-failure";
import type { Icon } from "../../shared/icon";
import type { tableModelFeatures } from "./table-features";

export type TableColumnAlign = "start" | "end";
export type TableRowState = "selected" | "warning" | "error" | "muted";
export type TableSortDirection = "ascending" | "descending";
export type TableSort<K extends string = string> = { column: K; direction: TableSortDirection };

export type TableColumnMeta = {
  align?: TableColumnAlign;
  actionCount?: 1 | 2;
};

type TableModelFeatures = typeof tableModelFeatures;

export type TableColumn<
  T extends RowData,
  Id extends string = string,
  Sortable extends boolean = boolean,
> = ColumnDef<TableModelFeatures, T> & { id: Id; enableSorting: Sortable };

export type TableColumns<T extends RowData> = readonly [TableColumn<T>, ...TableColumn<T>[]];

export type TableModel<T extends RowData> = ReactTable<TableModelFeatures, T>;

// A column whose enableSorting is a plain boolean still counts, so a widely annotated columns
// array falls on the safe side: the sort is required and names any id.
export type TableSortableColumnId<C extends readonly { id: string; enableSorting: boolean }[]> =
  C[number] extends infer Column
    ? Column extends { enableSorting: false }
      ? never
      : Column extends { id: infer Id extends string }
        ? Id
        : never
    : never;

// Returning undefined renders an invisible placeholder in that slot, not a disabled button, so
// the other action in the same column keeps its horizontal position on every row.
export type TableAction<T> = (item: T) =>
  | {
      icon: Icon;
      "aria-label": string;
      onPress: () => void;
    }
  | undefined;

export type TableActions<T> = readonly [TableAction<T>] | readonly [TableAction<T>, TableAction<T>];

// "initial" placeholder rows render right away but stay invisible for a 300ms CSS reveal delay,
// so a fast load never flashes them; "updating" keeps the current rows and runs a thin bar over
// the header instead.
export type TableLoadingState = false | "initial" | "updating";

type TableLoadProps =
  | { loading?: TableLoadingState; failure?: never }
  | { loading?: false; failure: LoadFailureProps };

export type TableProps<T extends RowData> = {
  table: TableModel<T>;
  "aria-label": string;
  rowState?: (item: T) => TableRowState | undefined;
  empty?: EmptyStateProps;
  footer?: ReactNode;
} & TableLoadProps;
