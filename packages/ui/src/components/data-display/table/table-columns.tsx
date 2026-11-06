import type { RowData } from "@tanstack/react-table";
import type { ReactNode } from "react";
import type { ItemOrder } from "../../../ordering/item-ordering";
import { TableActionButtons } from "./table-actions";
import type {
  TableActions,
  TableActionsBesideMenu,
  TableColumn,
  TableColumnAlign,
  TableRowMenu,
  TableSortDirection,
} from "./table-types";

type DataColumnOptions<T, Id extends string> = {
  id: Id;
  header: string;
  align?: TableColumnAlign;
  width?: number;
  render: (item: T) => ReactNode;
};

type DataColumnSort<T> = {
  order: ItemOrder<T>;
  firstDirection: TableSortDirection;
};

export function dataColumn<T extends RowData, const Id extends string>(
  options: DataColumnOptions<T, Id> & { sort: DataColumnSort<T> },
): TableColumn<T, Id, true>;
export function dataColumn<T extends RowData, const Id extends string>(
  options: DataColumnOptions<T, Id> & { sort?: never },
): TableColumn<T, Id, false>;
export function dataColumn<T extends RowData, const Id extends string>({
  id,
  header,
  align,
  width,
  render,
  sort,
}: DataColumnOptions<T, Id> & { sort?: DataColumnSort<T> }): TableColumn<T, Id> {
  return {
    id,
    header,
    accessorFn: (item) => item,
    cell: ({ row }) => render(row.original),
    meta: {
      ...(align === undefined ? {} : { align }),
      ...(width === undefined ? {} : { width }),
    },
    enableSorting: sort !== undefined,
    ...(sort === undefined
      ? {}
      : {
          sortFn: (a, b) => sort.order(a.original, b.original),
          sortDescFirst: sort.firstDirection === "descending",
        }),
  };
}

export function groupColumn<T extends RowData, const Id extends string>({
  id,
  header,
  columns,
}: {
  id: Id;
  header: string;
  columns: readonly [TableColumn<T>, ...TableColumn<T>[]];
}): TableColumn<T, Id, false> {
  return { id, header, columns: [...columns], enableSorting: false };
}

const ACTION_COUNT_WITH_MENU = { 0: 1, 1: 2, 2: 3, 3: 4 } as const;

type ActionsColumnOptions<T, Id extends string> = {
  id: Id;
  header: string;
} & (
  | { actions: TableActions<T>; menu?: undefined }
  | { actions: TableActionsBesideMenu<T>; menu: TableRowMenu<T> }
);

export function actionsColumn<T extends RowData, const Id extends string>(
  options: ActionsColumnOptions<T, Id>,
): TableColumn<T, Id, false> {
  const { id, header, actions, menu } = options;
  return {
    id,
    header,
    enableSorting: false,
    cell: ({ row }) => <TableActionButtons actions={actions} menu={menu} item={row.original} />,
    meta: {
      actionCount:
        options.menu === undefined
          ? options.actions.length
          : ACTION_COUNT_WITH_MENU[options.actions.length],
    },
  };
}
