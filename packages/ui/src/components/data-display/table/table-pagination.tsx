import type { RowData } from "@tanstack/react-table";
import { Pagination } from "../../navigation/pagination";
import { clampedPageIndex } from "./table-paging";
import type { TableModel } from "./table-types";

export type TablePaginationProps<T extends RowData> = { table: TableModel<T>; label: string };

export function TablePagination<T extends RowData>({ table, label }: TablePaginationProps<T>) {
  return (
    <Pagination
      page={clampedPageIndex(table.state.pagination.pageIndex, table.getRowCount()) + 1}
      pageCount={Math.max(table.getPageCount(), 1)}
      onPageChange={(page) => table.setPageIndex(page - 1)}
      label={label}
    />
  );
}
