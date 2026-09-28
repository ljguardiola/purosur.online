import type { ReactElement } from "react";
import { TableCell } from "./table-cell";
import { TableEmptyState } from "./table-empty-state";
import { TableHeaderRow } from "./table-header-row";
import { TablePlaceholderRows } from "./table-placeholder-rows";
import { rowBoxShadowClassName, rowStateClassName } from "./table-styles";
import type {
  TableColumn,
  TableCommonProps,
  TableLoadingState,
  TableProps,
  TableSort,
} from "./table-types";
import { TableUpdatingBar } from "./table-updating-bar";

type TableDisplayMode = "placeholders" | "empty" | "rows";

function tableDisplayMode(
  loading: TableLoadingState,
  rowCount: number,
  hasEmptyState: boolean,
): TableDisplayMode {
  if (loading === "initial") {
    return "placeholders";
  }
  if (loading === "updating") {
    return "rows";
  }
  return rowCount === 0 && hasEmptyState ? "empty" : "rows";
}

// TableProps<T, C>'s sort/onSortChange requirement is a conditional type over generic C, which
// TypeScript can't pattern-match inside this function's own body, hence the looser signature below.
export function Table<T, const C extends readonly [TableColumn<T>, ...TableColumn<T>[]]>(
  props: TableProps<T, C>,
): ReactElement;
export function Table<T>({
  "aria-label": ariaLabel,
  columns,
  rows,
  sort,
  onSortChange,
  loading = false,
  empty,
  footer,
}: TableCommonProps<T> & {
  columns: readonly [TableColumn<T>, ...TableColumn<T>[]];
  sort?: TableSort;
  onSortChange?: (sort: TableSort) => void;
}): ReactElement {
  const displayMode = tableDisplayMode(loading, rows.length, empty !== undefined);
  const showEmptyState = displayMode === "empty";
  const showingPlaceholders = displayMode === "placeholders";

  return (
    <>
      <div className="relative isolate overflow-clip rounded-lg border border-border bg-surface">
        {loading === "updating" && <TableUpdatingBar />}
        {showEmptyState && empty ? (
          <section aria-label={ariaLabel}>
            <TableEmptyState {...empty} />
          </section>
        ) : (
          // table/thead/tbody/tr/th/td keep their native CSS display: overriding it away from
          // table-shaped drops these tags' implicit ARIA roles in some engines.
          <table
            aria-label={ariaLabel}
            aria-busy={loading ? true : undefined}
            className="w-full table-fixed"
          >
            <thead>
              <TableHeaderRow columns={columns} sort={sort} onSortChange={onSortChange} />
            </thead>
            <tbody aria-hidden={showingPlaceholders ? true : undefined}>
              {showingPlaceholders ? (
                <TablePlaceholderRows columns={columns} />
              ) : (
                rows.map(({ id, item, state }, rowIndex) => (
                  <tr
                    key={id}
                    className={[
                      rowBoxShadowClassName(state, rowIndex === rows.length - 1),
                      rowStateClassName(state),
                    ].join(" ")}
                  >
                    {columns.map((column, index) => (
                      <TableCell
                        key={column.key}
                        column={column}
                        item={item}
                        isFirst={index === 0}
                        isLast={index === columns.length - 1}
                      />
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
      {!showingPlaceholders && footer}
    </>
  );
}
