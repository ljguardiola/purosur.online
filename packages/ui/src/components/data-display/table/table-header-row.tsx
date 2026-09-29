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
        const actionsColumn = column.kind === "actions";
        const sortable = !actionsColumn && column.sortable === true && onSortChange !== undefined;
        const sorted = sortable && sort?.column === column.key;
        const first = index === 0;
        const last = index === columns.length - 1;
        return (
          <th
            key={column.key}
            scope="col"
            aria-sort={sortable ? (sorted ? sort?.direction : "none") : undefined}
            style={headerColumnWidthStyle(column, first, last)}
            className={[
              // A cell's explicit height is a floor, not a cap, so h-full on a sortable
              // header's button always has an actual, resolved height to track.
              "h-control-xl break-words align-middle",
              // A sortable header's hit area needs the cell's full box, so its padding
              // lives on the button instead.
              sortable ? "" : cellHorizontalPaddingClassName(first, last),
              "text-caption font-bold uppercase",
              alignClassName(actionsColumn ? "start" : column.align),
            ].join(" ")}
          >
            {actionsColumn ? (
              <span className="sr-only">{column.header}</span>
            ) : sortable ? (
              <SortableColumnHeader
                column={column}
                sort={sort}
                onSortChange={onSortChange}
                first={first}
                last={last}
              />
            ) : (
              <span className="text-text-subtle">{column.header}</span>
            )}
          </th>
        );
      })}
    </tr>
  );
}
