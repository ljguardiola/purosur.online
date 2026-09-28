import type { ReactNode } from "react";
import type { Icon } from "../../shared/icon";

export type TableColumnAlign = "start" | "end";
export type TableRowState = "selected" | "warning" | "error" | "muted";
export type TableSortDirection = "ascending" | "descending";
export type TableSort<K extends string = string> = { column: K; direction: TableSortDirection };

type TableColumnCommon<T> = {
  key: string;
  kind?: "data";
  title: string;
  align?: TableColumnAlign;
  render: (item: T) => ReactNode;
};

export type TableSortableDataColumn<T> = TableColumnCommon<T> & {
  sortable: true;
  defaultDirection: TableSortDirection;
};

type TableUnsortableDataColumn<T> = TableColumnCommon<T> & {
  sortable?: false;
  // A plain `boolean` (non-literal) `sortable` value satisfies this branch under lenient
  // discriminant checking; forbidding defaultDirection (never, not just optional) disqualifies it,
  // since a required-but-forbidden property can never be assignable to `never`.
  defaultDirection?: never;
};

type TableDataColumn<T> = TableSortableDataColumn<T> | TableUnsortableDataColumn<T>;

// Returning undefined renders an invisible placeholder in that slot, not a disabled button, so
// the other action in the same column keeps its horizontal position on every row.
export type TableAction<T> = (item: T) =>
  | {
      icon: Icon;
      "aria-label": string;
      onPress: () => void;
    }
  | undefined;

type TableActionsColumn<T> = {
  key: string;
  kind: "actions";
  srLabel: string;
  actions: readonly [TableAction<T>] | readonly [TableAction<T>, TableAction<T>];
};

export type TableColumn<T> = TableDataColumn<T> | TableActionsColumn<T>;

// Resolves to plain string when C is a widened TableColumn<T>[] with no literal info retained.
export type TableSortableColumnKey<T, C extends readonly TableColumn<T>[]> = Extract<
  C[number],
  { sortable: true }
>["key"];

type TableHasSortableColumn<T, C extends readonly TableColumn<T>[]> = [
  TableSortableColumnKey<T, C>,
] extends [never]
  ? false
  : true;

export type TableRow<T> = {
  id: string;
  item: T;
  state?: TableRowState;
};

export type TableEmptyStateTone = "blank" | "filtered";

export type TableEmptyStateProps = {
  icon: Icon;
  title: string;
  detail?: string;
  tone: TableEmptyStateTone;
  actions?: ReactNode;
};

// "initial" placeholder rows render right away but stay invisible for a 300ms CSS reveal delay,
// so a fast load never flashes them; "updating" keeps the current rows and runs a thin bar over
// the header instead.
export type TableLoadingState = false | "initial" | "updating";

export type TableCommonProps<T> = {
  "aria-label": string;
  rows: readonly TableRow<T>[];
  loading?: TableLoadingState;
  empty?: TableEmptyStateProps;
  footer?: ReactNode;
};

// A tuple with no sortable column forbids sort/onSortChange too, so a sortable header's button
// can never be left without a handler to call.
type TableSortProps<T, C extends readonly TableColumn<T>[]> =
  TableHasSortableColumn<T, C> extends true
    ? {
        sort: TableSort<TableSortableColumnKey<T, C>>;
        onSortChange: (sort: TableSort<TableSortableColumnKey<T, C>>) => void;
      }
    : { sort?: never; onSortChange?: never };

export type TableProps<
  T,
  C extends readonly [TableColumn<T>, ...TableColumn<T>[]] = readonly [
    TableColumn<T>,
    ...TableColumn<T>[],
  ],
> = TableCommonProps<T> & { columns: C } & TableSortProps<T, C>;
