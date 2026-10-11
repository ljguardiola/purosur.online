import type { RowData } from "@tanstack/react-table";
import { Fragment, type ReactElement } from "react";
import { EmptyState } from "../../feedback/empty-state";
import { LoadFailure } from "../../feedback/load-failure";
import { TableCell } from "./table-cell";
import { TableHeaderRow } from "./table-header-row";
import { TablePlaceholderRows } from "./table-placeholder-rows";
import { rowBoxShadowClassName, rowStateClassName, tableContainerClassName } from "./table-styles";
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
  loading = false,
  failure,
  empty,
  footer,
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

  return (
    <>
      <div className={tableContainerClassName(variant)}>
        {loading === "updating" && <TableUpdatingBar />}
        {/* table/thead/tbody/tr/th/td keep their native CSS display: overriding it away from
            table-shaped drops these tags' implicit ARIA roles in some engines. */}
        <table
          aria-label={ariaLabel}
          aria-busy={loading ? true : undefined}
          className="w-full table-fixed"
        >
          <thead>
            <TableHeaderRow table={table} variant={variant} />
          </thead>
          <tbody aria-hidden={showingPlaceholders ? true : undefined}>
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
                      ].join(" ")}
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
      </div>
      {displayMode !== "placeholders" && displayMode !== "failure" && footer}
    </>
  );
}
