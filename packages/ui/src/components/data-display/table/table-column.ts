import type { Cell, Column, RowData } from "@tanstack/react-table";
import type { ReactNode } from "react";
import type { tableModelFeatures } from "./table-features";
import type { TableColumnAlign } from "./table-types";

type TableColumnOf<T extends RowData> = Column<typeof tableModelFeatures, T, unknown>;
type TableCellOf<T extends RowData> = Cell<typeof tableModelFeatures, T, unknown>;

export function columnTitle<T extends RowData>(column: TableColumnOf<T>): string {
  const { header } = column.columnDef;
  return typeof header === "string" ? header : column.id;
}

export function columnAlign<T extends RowData>(column: TableColumnOf<T>): TableColumnAlign {
  return column.columnDef.meta?.align ?? "start";
}

export function columnActionCount<T extends RowData>(column: TableColumnOf<T>): 1 | 2 | undefined {
  return column.columnDef.meta?.actionCount;
}

// Called as a plain function, not through flexRender: flexRender mounts it as a component, so a
// column rebuilt on every render would remount its cells and drop the focus inside them.
export function renderCell<T extends RowData>(cell: TableCellOf<T>): ReactNode {
  const { cell: content } = cell.column.columnDef;
  return typeof content === "function" ? content(cell.getContext()) : content;
}
