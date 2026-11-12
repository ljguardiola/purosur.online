import type { RowData } from "@tanstack/react-table";
import { Fragment, type ReactElement } from "react";
import { EmptyState } from "../../feedback/empty-state";
import { LoadFailure } from "../../feedback/load-failure";
import { KeyLegend } from "../key-legend";
import { TableCell } from "./table-cell";
import { TableColumnWidths, TableHeaderRows } from "./table-header-row";
import { TablePlaceholderRows } from "./table-placeholder-rows";
import {
  pressableRowClassName,
  rowBoxShadowClassName,
  rowStateClassName,
  startsInsideInteractiveElement,
  tableContainerClassName,
} from "./table-styles";
import type { TableLoadingState, TableProps } from "./table-types";
import { TableUpdatingBar } from "./table-updating-bar";

type TableDisplayMode = "placeholders" | "failure" | "empty" | "rows";

function tableDisplayMode(
  loading: TableLoadingState,
  failed: boolean,
  rowCount: number,
  hasEmptyState: boolean,
): TableDisplayMode {
  if (failed) {
    return "failure";
  }
  if (loading === "initial") {
    return "placeholders";
  }
  if (loading === "updating") {
    return "rows";
  }
  return rowCount === 0 && hasEmptyState ? "empty" : "rows";
}

export function Table<T extends RowData>({
  table,
  "aria-label": ariaLabel,
  variant = "framed",
  rowState,
  rowDetail,
  onRowPress,
  loading = false,
  failure,
  empty,
  footer,
  legend,
  fill = false,
  locked,
}: TableProps<T>): ReactElement {
  const rows = table.getRowModel().rows;
  const columns = table.getAllLeafColumns();
  const displayMode = tableDisplayMode(
    loading,
    failure !== undefined,
    rows.length,
    empty !== undefined,
  );
  const showEmptyState = displayMode === "empty";
  const showingPlaceholders = displayMode === "placeholders";
  const messageOnly = fill && (displayMode === "failure" || displayMode === "empty");

  const tableElement = (
    <>
      {/* table/thead/tbody/tr/th/td keep their native CSS display: overriding it away from
            table-shaped drops these tags' implicit ARIA roles in some engines. */}
      <table
        aria-label={ariaLabel}
        aria-busy={loading ? true : undefined}
        className="w-full table-fixed"
      >
        <TableColumnWidths table={table} variant={variant} />
        <thead>
          <TableHeaderRows
            table={table}
            variant={variant}
            {...(locked === undefined ? {} : { locked })}
          />
        </thead>
        <tbody
          aria-hidden={showingPlaceholders ? true : undefined}
          className={locked === undefined ? "" : "opacity-disabled"}
        >
          {showingPlaceholders && <TablePlaceholderRows columns={columns} />}
          {failure !== undefined && (
            <tr>
              <td colSpan={columns.length} className="h-70 p-4 align-top">
                <LoadFailure {...failure} />
              </td>
            </tr>
          )}
          {showEmptyState && empty !== undefined && (
            <tr>
              <td colSpan={columns.length} className="h-70 align-middle">
                <EmptyState {...empty} />
              </td>
            </tr>
          )}
          {displayMode === "rows" &&
            rows.map((row, rowIndex) => {
              const state = rowState?.(row.original);
              const detail = rowDetail?.(row.original);
              const hasDetail = detail !== undefined && detail !== null;
              const last = rowIndex === rows.length - 1;
              return (
                <Fragment key={row.id}>
                  <tr
                    className={[
                      rowBoxShadowClassName(state, last && !hasDetail),
                      rowStateClassName(state, variant),
                      ...(onRowPress === undefined || locked !== undefined
                        ? []
                        : [pressableRowClassName(state)]),
                    ].join(" ")}
                    aria-disabled={locked === undefined ? undefined : true}
                    aria-current={
                      onRowPress !== undefined && locked === undefined && state === "selected"
                        ? "true"
                        : undefined
                    }
                    onClick={
                      onRowPress === undefined || locked !== undefined
                        ? undefined
                        : (event) => {
                            if (
                              !startsInsideInteractiveElement(event.target, event.currentTarget)
                            ) {
                              onRowPress(row.original);
                            }
                          }
                    }
                  >
                    {row.getAllCells().map((cell, index, cells) => (
                      <TableCell
                        key={cell.id}
                        cell={cell}
                        first={index === 0}
                        last={index === cells.length - 1}
                        variant={variant}
                      />
                    ))}
                  </tr>
                  {hasDetail ? (
                    <tr>
                      <td
                        colSpan={columns.length}
                        className={[
                          "bg-surface-subtle px-4 pt-3 pb-4",
                          rowBoxShadowClassName(undefined, last),
                        ].join(" ")}
                      >
                        {detail}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
        </tbody>
      </table>
    </>
  );

  const messageElement = messageOnly ? (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto">
      {failure !== undefined ? (
        <LoadFailure {...failure} />
      ) : empty !== undefined ? (
        <EmptyState {...empty} />
      ) : null}
    </div>
  ) : null;

  return (
    <>
      <div className={tableContainerClassName(variant, fill)}>
        {loading === "updating" && <TableUpdatingBar />}
        {messageElement ??
          (fill ? (
            <div className="min-h-0 flex-1 overflow-y-auto">{tableElement}</div>
          ) : (
            tableElement
          ))}
        {legend === undefined || locked !== undefined ? null : (
          <div className="shrink-0 border-t border-border bg-surface-subtle px-4 py-3">
            <KeyLegend items={legend} />
          </div>
        )}
      </div>
      {displayMode !== "placeholders" && displayMode !== "failure" && footer}
    </>
  );
}
