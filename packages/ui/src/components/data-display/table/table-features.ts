import {
  columnFilteringFeature,
  createExpandedRowModel,
  createFilteredRowModel,
  createSortedRowModel,
  globalFilteringFeature,
  metaHelper,
  rowExpandingFeature,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
} from "@tanstack/react-table";
import { createClampedPaginatedRowModel } from "./table-paging";
import type { TableColumnMeta } from "./table-types";

export const tableModelFeatures = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  rowExpandingFeature,
  rowPaginationFeature,
  rowSortingFeature,
  expandedRowModel: createExpandedRowModel(),
  filteredRowModel: createFilteredRowModel(),
  paginatedRowModel: createClampedPaginatedRowModel(),
  sortedRowModel: createSortedRowModel(),
  columnMeta: metaHelper<TableColumnMeta>(),
});
