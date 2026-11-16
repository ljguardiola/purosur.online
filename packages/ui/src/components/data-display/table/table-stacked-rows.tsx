import type { RowData } from "@tanstack/react-table";
import { Lock } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { columnActionCount, columnTitle, renderCell } from "./table-column";
import { rowBoxShadowClassName, rowStateClassName } from "./table-styles";
import type { TableLock, TableModel, TableRowState, TableVariant } from "./table-types";

export function TableStackedLock({
  locked,
  variant,
}: {
  locked: TableLock;
  variant: TableVariant;
}) {
  return (
    <div
      className={[
        "flex h-control-sm items-center text-text-subtle",
        variant === "nested" ? "px-0" : "px-4",
      ].join(" ")}
    >
      <Lock role="img" aria-label={locked.label} className="size-icon-md" />
    </div>
  );
}

export function TableStackedRows<T extends RowData>({
  table,
  "aria-label": ariaLabel,
  variant,
  rowState,
  rowDetail,
  rowsDisabled,
  busy,
}: {
  table: TableModel<T>;
  "aria-label": string;
  variant: TableVariant;
  rowState: ((item: T) => TableRowState | undefined) | undefined;
  rowDetail: ((item: T) => ReactNode) | undefined;
  rowsDisabled: boolean;
  busy: boolean;
}) {
  const rows = table.getRowModel().rows;
  return (
    <ul
      aria-label={ariaLabel}
      aria-busy={busy ? true : undefined}
      className={rowsDisabled ? "opacity-disabled" : ""}
    >
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
              variant === "nested" ? "px-0" : "px-4",
              "py-3",
            ].join(" ")}
            aria-disabled={rowsDisabled ? true : undefined}
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
