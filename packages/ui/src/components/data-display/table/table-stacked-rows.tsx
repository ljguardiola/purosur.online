import type { RowData } from "@tanstack/react-table";
import { Fragment, type MouseEvent, type ReactNode } from "react";
import { columnActionCount, columnTitle, renderCell } from "./table-column";
import {
  pressableRowClassName,
  rowBoxShadowClassName,
  rowStateClassName,
  startsInsideInteractiveElement,
} from "./table-styles";
import type { TableModel, TableRowState, TableVariant } from "./table-types";

function rowPressHandlers<T>(
  onRowPress: ((item: T) => void) | undefined,
  rowsDisabled: boolean,
  item: T,
) {
  if (onRowPress === undefined || rowsDisabled) {
    return {};
  }
  return {
    onClick: (event: MouseEvent<HTMLElement>) => {
      if (!startsInsideInteractiveElement(event.target, event.currentTarget)) {
        onRowPress(item);
      }
    },
  };
}

export function TableStackedRows<T extends RowData>({
  table,
  "aria-label": ariaLabel,
  variant,
  rowState,
  rowDetail,
  onRowPress,
  rowsDisabled,
}: {
  table: TableModel<T>;
  "aria-label": string;
  variant: TableVariant;
  rowState: ((item: T) => TableRowState | undefined) | undefined;
  rowDetail: ((item: T) => ReactNode) | undefined;
  onRowPress: ((item: T) => void) | undefined;
  rowsDisabled: boolean;
}) {
  const rows = table.getRowModel().rows;
  return (
    <ul aria-label={ariaLabel} className={rowsDisabled ? "opacity-disabled" : ""}>
      {rows.map((row, rowIndex) => {
        const state = rowState?.(row.original);
        const detail = rowDetail?.(row.original);
        const hasDetail = detail !== undefined && detail !== null;
        const last = rowIndex === rows.length - 1;
        const [title, ...others] = row.getAllCells();
        const actions = others.filter((cell) => columnActionCount(cell.column) !== undefined);
        const pairs = others.filter((cell) => columnActionCount(cell.column) === undefined);
        return (
          <li
            key={row.id}
            className={[
              rowBoxShadowClassName(state, last && !hasDetail),
              rowStateClassName(state, variant),
              ...(onRowPress === undefined || rowsDisabled ? [] : [pressableRowClassName(state)]),
              variant === "nested" ? "px-0" : "px-4",
              "py-3",
            ].join(" ")}
            aria-disabled={rowsDisabled ? true : undefined}
            aria-current={
              onRowPress !== undefined && !rowsDisabled && state === "selected" ? "true" : undefined
            }
            {...rowPressHandlers(onRowPress, rowsDisabled, row.original)}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1 break-words">
                {title === undefined ? null : renderCell(title)}
              </div>
              {actions.length === 0 ? null : (
                <div className="flex shrink-0 items-center gap-2">
                  {actions.map((cell) => (
                    <Fragment key={cell.id}>{renderCell(cell)}</Fragment>
                  ))}
                </div>
              )}
            </div>
            {pairs.length === 0 ? null : (
              <dl className="mt-2 flex flex-col gap-1">
                {pairs.map((cell) => (
                  <div key={cell.id} className="flex items-baseline justify-between gap-4">
                    <dt className="text-detail text-text-subtle">{columnTitle(cell.column)}</dt>
                    <dd className="min-w-0 text-right">{renderCell(cell)}</dd>
                  </div>
                ))}
              </dl>
            )}
            {hasDetail ? <div className="mt-3">{detail}</div> : null}
          </li>
        );
      })}
    </ul>
  );
}
