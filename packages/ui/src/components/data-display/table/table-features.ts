import {
  columnFilteringFeature,
  createExpandedRowModel,
  createFilteredRowModel,
  createSortedRowModel,
  globalFilteringFeature,
  metaHelper,
  rowExpandingFeature,
  rowSortingFeature,
  tableFeatures,
} from "@tanstack/react-table";
import type { TableColumnMeta } from "./table-types";

export const tableModelFeatures = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  rowExpandingFeature,
  rowSortingFeature,
  expandedRowModel: createExpandedRowModel(),
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  columnMeta: metaHelper<TableColumnMeta>(),
});
