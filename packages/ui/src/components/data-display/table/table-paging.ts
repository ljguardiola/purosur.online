import {
  type Atoms_All,
  type RowData,
  type Table,
  type TableFeatures,
  tableMemo,
} from "@tanstack/react-table";

export const PAGE_SIZE = 25;

function lastPageIndexOf(rowCount: number): number {
  return Math.max(Math.ceil(rowCount / PAGE_SIZE) - 1, 0);
}

export function clampedPageIndex(pageIndex: number, rowCount: number): number {
  return Math.min(Math.max(pageIndex, 0), lastPageIndexOf(rowCount));
}

function requestedPageIndex<TFeatures extends TableFeatures, T extends RowData>(
  table: Table<TFeatures, T>,
): number {
  return (table.atoms as Atoms_All).pagination?.get()?.pageIndex ?? 0;
}

// TanStack slices at the requested page; this one slices at the page that exists, so a page past
// the last never yields an empty page.
export function createClampedPaginatedRowModel<
  TFeatures extends TableFeatures,
  T extends RowData = RowData,
>() {
  return (table: Table<TFeatures, T>) =>
    tableMemo({
      feature: "rowPaginationFeature",
      table,
      fnName: "table.getPaginatedRowModel",
      memoDeps: () => [table.getPrePaginatedRowModel(), requestedPageIndex(table)],
      fn: () => {
        const { rows, rowsById } = table.getPrePaginatedRowModel();
        const pageIndex = clampedPageIndex(requestedPageIndex(table), rows.length);
        const pageRows = rows.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE);
        return { rows: pageRows, flatRows: pageRows, rowsById };
      },
    });
}
