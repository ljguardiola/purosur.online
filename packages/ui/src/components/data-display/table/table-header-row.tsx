import { headerColumnWidthStyle } from "./table-actions";
import { SortableColumnHeader } from "./table-sort-header";
import { alignClassName, cellHorizontalPaddingClassName } from "./table-styles";
import type { TableColumn, TableSort } from "./table-types";

export function TableHeaderRow<T>({
  columns,
  sort,
  onSortChange,
}: {
  columns: readonly TableColumn<T>[];
  sort: TableSort | undefined;
  onSortChange: ((sort: TableSort) => void) | undefined;
}) {
  return (
    <tr className="h-control-xl bg-surface-subtle">
      {columns.map((column, index) => {
        const isActions = column.kind === "actions";
        const isSortable = !isActions && column.sortable === true && onSortChange !== undefined;
        const isSorted = isSortable && sort?.column === column.key;
        const isFirst = index === 0;
        const isLast = index === columns.length - 1;
        return (
          <th
            key={column.key}
            scope="col"
            aria-sort={isSortable ? (isSorted ? sort?.direction : "none") : undefined}
            style={headerColumnWidthStyle(column, isFirst, isLast)}
            className={[
              // A cell's explicit height is a floor, not a cap, so h-full on a sortable
              // header's button always has an actual, resolved height to track.
              "h-control-xl break-words align-middle",
              // A sortable header's hit area needs the cell's full box, so its padding
              // lives on the button instead.
              isSortable ? "" : cellHorizontalPaddingClassName(isFirst, isLast),
              "text-caption font-bold uppercase",
              alignClassName(isActions ? "start" : column.align),
            ].join(" ")}
          >
            {isActions ? (
              <span className="sr-only">{column.srLabel}</span>
            ) : isSortable ? (
              <SortableColumnHeader
                column={column}
                sort={sort}
                onSortChange={onSortChange}
                isFirst={isFirst}
                isLast={isLast}
              />
            ) : (
              <span className="text-text-subtle">{column.title}</span>
            )}
          </th>
        );
      })}
    </tr>
  );
}
