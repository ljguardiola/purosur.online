import type { RowData } from "@tanstack/react-table";
import { headerColumnWidthStyle } from "./table-actions";
import { columnActionCount, columnAlign, columnTitle } from "./table-column";
import { SortableColumnHeader } from "./table-sort-header";
import { alignClassName, cellHorizontalPaddingClassName } from "./table-styles";
import type { TableModel, TableSortDirection } from "./table-types";

const SORT_DIRECTIONS = { asc: "ascending", desc: "descending" } as const;

export function TableHeaderRow<T extends RowData>({ table }: { table: TableModel<T> }) {
  const headers = table.getLeafHeaders();
  return (
    <tr className="h-control-xl bg-surface-subtle">
      {headers.map(({ id, column }, index) => {
        const actionCount = columnActionCount(column);
        const sortable = column.getCanSort();
        const sorted = column.getIsSorted();
        const direction: TableSortDirection | undefined = sorted
          ? SORT_DIRECTIONS[sorted]
          : undefined;
        const first = index === 0;
        const last = index === headers.length - 1;
        return (
          <th
            key={id}
            scope="col"
            aria-sort={sortable ? (direction ?? "none") : undefined}
            style={headerColumnWidthStyle(actionCount, first, last)}
            className={[
              // A cell's explicit height is a floor, not a cap, so h-full on a sortable
              // header's button always has an actual, resolved height to track.
              "h-control-xl break-words align-middle",
              // A sortable header's hit area needs the cell's full box, so its padding
              // lives on the button instead.
              sortable ? "" : cellHorizontalPaddingClassName(first, last),
              "text-caption font-bold uppercase",
              alignClassName(actionCount === undefined ? columnAlign(column) : "start"),
            ].join(" ")}
          >
            {actionCount !== undefined ? (
              <span className="sr-only">{columnTitle(column)}</span>
            ) : sortable ? (
              <SortableColumnHeader
                title={columnTitle(column)}
                align={columnAlign(column)}
                direction={direction}
                onPress={() => column.toggleSorting()}
                first={first}
                last={last}
              />
            ) : (
              <span className="text-text-subtle">{columnTitle(column)}</span>
            )}
          </th>
        );
      })}
    </tr>
  );
}
