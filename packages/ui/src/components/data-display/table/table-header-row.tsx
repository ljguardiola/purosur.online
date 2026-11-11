import type { RowData } from "@tanstack/react-table";
import { Lock } from "lucide-react";
import { actionsContentWidth, headerColumnWidthStyle } from "./table-actions";
import { columnActionCount, columnAlign, columnTitle, type TableColumnOf } from "./table-column";
import { SortableColumnHeader } from "./table-sort-header";
import { alignClassName, cellHorizontalPaddingClassName } from "./table-styles";
import type { TableLock, TableModel, TableSortDirection, TableVariant } from "./table-types";

const SORT_DIRECTIONS = { asc: "ascending", desc: "descending" } as const;

function TableGroupHeaderRow<T extends RowData>({
  table,
  depth,
  variant,
}: {
  table: TableModel<T>;
  depth: number;
  variant: TableVariant;
}) {
  const headers = table.getHeaderGroups()[depth]?.headers ?? [];
  return (
    <tr className={variant === "nested" ? "h-control-sm" : "h-control-lg bg-surface-subtle"}>
      {headers.map((header) =>
        header.isPlaceholder ? (
          <td key={header.id} colSpan={header.colSpan} />
        ) : (
          <th
            key={header.id}
            colSpan={header.colSpan}
            scope="colgroup"
            className="border-border border-b px-1.5 text-center align-middle font-bold text-caption text-text-subtle uppercase"
          >
            {columnTitle(header.column)}
          </th>
        ),
      )}
    </tr>
  );
}

function leafColumnWidthStyle<T extends RowData>(
  column: TableColumnOf<T>,
  first: boolean,
  last: boolean,
  variant: TableVariant,
) {
  const actionCount = columnActionCount(column);
  return headerColumnWidthStyle(
    actionCount === undefined ? column.columnDef.meta?.width : actionsContentWidth(actionCount),
    first,
    last,
    variant,
  );
}

export function TableColumnWidths<T extends RowData>({
  table,
  variant,
}: {
  table: TableModel<T>;
  variant: TableVariant;
}) {
  const columns = table.getAllLeafColumns();
  return (
    <colgroup>
      {columns.map((column, index) => (
        <col
          key={column.id}
          style={leafColumnWidthStyle(column, index === 0, index === columns.length - 1, variant)}
        />
      ))}
    </colgroup>
  );
}

export function TableHeaderRows<T extends RowData>({
  table,
  variant,
  locked,
}: {
  table: TableModel<T>;
  variant: TableVariant;
  locked?: TableLock;
}) {
  const groupDepths = table.getHeaderGroups().slice(0, -1);
  return (
    <>
      {groupDepths.map((group) => (
        <TableGroupHeaderRow key={group.id} table={table} depth={group.depth} variant={variant} />
      ))}
      <TableHeaderRow
        table={table}
        variant={variant}
        {...(locked === undefined ? {} : { locked })}
      />
    </>
  );
}

function TableHeaderRow<T extends RowData>({
  table,
  variant,
  locked,
}: {
  table: TableModel<T>;
  variant: TableVariant;
  locked?: TableLock;
}) {
  const headers = table.getHeaderGroups().at(-1)?.headers ?? [];
  return (
    <tr className={variant === "nested" ? "h-control-sm" : "h-control-xl bg-surface-subtle"}>
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
            style={leafColumnWidthStyle(column, first, last, variant)}
            className={[
              // A cell's explicit height is a floor, not a cap, so h-full on a sortable
              // header's button always has an actual, resolved height to track.
              variant === "nested" ? "h-control-sm" : "h-control-xl",
              "break-words align-middle",
              // A sortable header's hit area needs the cell's full box, so its padding
              // lives on the button instead.
              sortable ? "" : cellHorizontalPaddingClassName(first, last, variant),
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
            ) : first && locked !== undefined ? (
              <span className="flex items-center gap-4">
                <span className="flex size-control-sm shrink-0 items-center justify-center text-text-subtle">
                  <Lock role="img" aria-label={locked.label} className="size-icon-md" />
                </span>
                <span className="text-text-subtle">{columnTitle(column)}</span>
              </span>
            ) : (
              <span className="text-text-subtle">{columnTitle(column)}</span>
            )}
          </th>
        );
      })}
    </tr>
  );
}
