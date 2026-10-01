import type { RowData } from "@tanstack/react-table";
import type { ReactNode } from "react";
import type { ItemOrder } from "../../../ordering/item-ordering";
import { TableActionButtons } from "./table-actions";
import type {
  TableActions,
  TableColumn,
  TableColumnAlign,
  TableSortDirection,
} from "./table-types";

type DataColumnOptions<T, Id extends string> = {
  id: Id;
  header: string;
  align?: TableColumnAlign;
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
  render,
  sort,
}: DataColumnOptions<T, Id> & { sort?: DataColumnSort<T> }): TableColumn<T, Id> {
  return {
    id,
    header,
    accessorFn: (item) => item,
    cell: ({ row }) => render(row.original),
    meta: align === undefined ? {} : { align },
    enableSorting: sort !== undefined,
    ...(sort === undefined
      ? {}
      : {
          sortFn: (a, b) => sort.order(a.original, b.original),
          sortDescFirst: sort.firstDirection === "descending",
        }),
  };
}

export function actionsColumn<T extends RowData, const Id extends string>({
  id,
  header,
  actions,
}: {
  id: Id;
  header: string;
  actions: TableActions<T>;
}): TableColumn<T, Id, false> {
  return {
    id,
    header,
    enableSorting: false,
    cell: ({ row }) => <TableActionButtons actions={actions} item={row.original} />,
    meta: { actionCount: actions.length },
  };
}
