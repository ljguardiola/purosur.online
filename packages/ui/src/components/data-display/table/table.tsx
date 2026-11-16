import type { RowData } from "@tanstack/react-table";
import { type ComponentProps, Fragment, type ReactElement, useId } from "react";
import { EmptyState } from "../../feedback/empty-state";
import {
  type CenteredLoadFailureProps,
  LoadFailure,
  type LoadFailureProps,
} from "../../feedback/load-failure";
import { LoadingPlaceholder } from "../../feedback/loading-placeholder";
import { useKeyboardScrollableRegion } from "../../shared/keyboard-scrollable-region";
import { KeyLegend } from "../key-legend";
import { TableCell } from "./table-cell";
import { TableColumnWidths, TableHeaderRows, tableMinWidthPx } from "./table-header-row";
import { TablePlaceholderRows } from "./table-placeholder-rows";
import { TableStackedRows } from "./table-stacked-rows";
import {
  pressableRowClassName,
  rowBoxShadowClassName,
  rowStateClassName,
  startsInsideInteractiveElement,
  tableContainerClassName,
} from "./table-styles";
import type { TableLoadingState, TableProps } from "./table-types";
import { TableUpdatingBar } from "./table-updating-bar";
import { useObservedWidth } from "./use-observed-width";

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

function StackedContent<T extends RowData>({
  displayMode,
  empty,
  failure,
  ...rows
}: {
  displayMode: TableDisplayMode;
  empty: TableProps<T>["empty"];
  failure: LoadFailureProps | CenteredLoadFailureProps | undefined;
} & ComponentProps<typeof TableStackedRows<T>>) {
  switch (displayMode) {
    case "failure":
      return failure === undefined ? null : (
        <div className="p-4">
          <LoadFailure {...failure} />
        </div>
      );
    case "empty":
      return empty === undefined ? null : <EmptyState {...empty} />;
    case "placeholders":
      return (
        <div className={rows.variant === "nested" ? "py-3" : "p-4"}>
          <LoadingPlaceholder variant="list" items={3} />
        </div>
      );
    case "rows":
      return <TableStackedRows {...rows} />;
  }
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
  legendAside,
  fill = false,
  emptyKeepsHeaders = false,
  failureKeepsHeaders = false,
  locked,
  inactive = false,
  fixedColumns = false,
  stackWhenNarrow = false,
}: TableProps<T>): ReactElement {
  const tableId = useId();
  const { observeOverflow, regionProps, focusClassName } = useKeyboardScrollableRegion(tableId);
  const { width: containerWidth, observeWidth } = useObservedWidth();
  const rows = table.getRowModel().rows;
  const columns = table.getAllLeafColumns();
  const displayMode = tableDisplayMode(
    loading,
    failure !== undefined,
    rows.length,
    empty !== undefined,
  );
  const fixedLayout = fill || fixedColumns;
  const stacked =
    stackWhenNarrow &&
    !fixedLayout &&
    containerWidth !== undefined &&
    containerWidth < tableMinWidthPx(table, variant);
  const rowsDisabled = locked !== undefined || inactive;
  const emptyBelowHeaders = fill && emptyKeepsHeaders && displayMode === "empty";
  const failureBelowHeaders = fill && failureKeepsHeaders && displayMode === "failure";
  const showEmptyState = displayMode === "empty" && !emptyBelowHeaders;
  const showingPlaceholders = displayMode === "placeholders";
  const showsLegendAside =
    legendAside !== undefined && displayMode !== "placeholders" && displayMode !== "failure";
  const messageOnly =
    fill && ((displayMode === "failure" && !failureBelowHeaders) || showEmptyState);

  const tableElement = (
    <>
      {/* table/thead/tbody/tr/th/td keep their native CSS display: overriding it away from
            table-shaped drops these tags' implicit ARIA roles in some engines. */}
      <table
        id={tableId}
        aria-label={ariaLabel}
        aria-busy={loading ? true : undefined}
        className={fixedLayout ? "w-full table-fixed" : "w-full table-auto"}
        style={fixedLayout ? undefined : { minWidth: `${tableMinWidthPx(table, variant)}px` }}
      >
        <TableColumnWidths table={table} variant={variant} />
        <thead>
          <TableHeaderRows
            table={table}
            variant={variant}
            fixedLayout={fixedLayout}
            {...(locked === undefined ? {} : { locked })}
          />
        </thead>
        <tbody
          aria-hidden={showingPlaceholders ? true : undefined}
          className={rowsDisabled ? "opacity-disabled" : ""}
        >
          {showingPlaceholders && <TablePlaceholderRows columns={columns} />}
          {failure !== undefined && !failureBelowHeaders && (
            <tr>
              <td colSpan={columns.length} className="h-70 align-top">
                <div className={fixedColumns ? "p-4" : "sticky left-0 w-scroll-region p-4"}>
                  <LoadFailure {...failure} />
                </div>
              </td>
            </tr>
          )}
          {showEmptyState && empty !== undefined && (
            <tr>
              <td colSpan={columns.length} className="h-70 align-middle">
                <div className={fixedColumns ? undefined : "sticky left-0 w-scroll-region"}>
                  <EmptyState {...empty} />
                </div>
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
                      ...(onRowPress === undefined || rowsDisabled
                        ? []
                        : [pressableRowClassName(state)]),
                    ].join(" ")}
                    aria-disabled={rowsDisabled ? true : undefined}
                    aria-current={
                      onRowPress !== undefined && !rowsDisabled && state === "selected"
                        ? "true"
                        : undefined
                    }
                    onClick={
                      onRowPress === undefined || rowsDisabled
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
                        fixedLayout={fixedLayout}
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
      <div
        ref={stackWhenNarrow ? observeWidth : undefined}
        className={tableContainerClassName(variant, fill)}
      >
        {loading === "updating" && <TableUpdatingBar />}
        {stacked ? (
          <StackedContent
            displayMode={displayMode}
            table={table}
            aria-label={ariaLabel}
            variant={variant}
            rowState={rowState}
            rowDetail={rowDetail}
            rowsDisabled={rowsDisabled}
            empty={empty}
            failure={failure}
          />
        ) : emptyBelowHeaders && empty !== undefined ? (
          <>
            {tableElement}
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto">
              <EmptyState {...empty} />
            </div>
          </>
        ) : failureBelowHeaders && failure !== undefined ? (
          <>
            {tableElement}
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto">
              <LoadFailure {...failure} />
            </div>
          </>
        ) : (
          (messageElement ??
          (fill ? (
            <div className="min-h-0 flex-1 overflow-y-auto">{tableElement}</div>
          ) : fixedColumns ? (
            tableElement
          ) : (
            <div
              ref={observeOverflow}
              {...regionProps}
              className={`@container overflow-x-auto ${focusClassName}`}
            >
              {tableElement}
            </div>
          )))
        )}
        {legend === undefined || locked !== undefined ? null : (
          <div
            className={
              showsLegendAside
                ? "flex shrink-0 items-center justify-between gap-4 border-t border-border bg-surface-subtle px-4 py-3"
                : "shrink-0 border-t border-border bg-surface-subtle px-4 py-3"
            }
          >
            <KeyLegend items={legend} />
            {showsLegendAside ? legendAside : null}
          </div>
        )}
      </div>
      {displayMode !== "placeholders" && displayMode !== "failure" && footer}
    </>
  );
}
