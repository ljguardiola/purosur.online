import { ChevronDown, ChevronsUpDown, ChevronUp } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { useEffect, useState } from "react";
import { Button as AriaButton } from "react-aria-components";

export type TableColumnAlign = "start" | "end";
export type TableRowState = "selected" | "warning" | "error" | "muted";
export type TableSortDirection = "ascending" | "descending";
export type TableSort = { column: string; direction: TableSortDirection };

type TableColumnCommon<T> = {
  key: string;
  kind?: "data";
  title: string;
  align?: TableColumnAlign;
  render: (item: T) => ReactNode;
};

// A sortable column has no other source for its first direction, so activating it the first
// time would have nothing to sort by without this.
type TableSortableDataColumn<T> = TableColumnCommon<T> & {
  sortable: true;
  defaultDirection: TableSortDirection;
};

type TableUnsortableDataColumn<T> = TableColumnCommon<T> & {
  sortable?: false;
};

type TableDataColumn<T> = TableSortableDataColumn<T> | TableUnsortableDataColumn<T>;

// The actions column's header has no visible title, so assistive technology needs srLabel
// instead, and its width can't be inferred from the rendered buttons.
type TableActionsColumn<T> = {
  key: string;
  kind: "actions";
  srLabel: string;
  count: 1 | 2;
  render: (item: T) => ReactNode;
};

export type TableColumn<T> = TableDataColumn<T> | TableActionsColumn<T>;

export type TableRow<T> = {
  id: string;
  item: T;
  state?: TableRowState;
};

// Only changes the icon's color: "blank" (nothing yet) is blue strong, "filtered" (nothing
// matches) is secondary text.
export type TableEmptyStateTone = "blank" | "filtered";

export type TableEmptyStateProps = {
  icon: ReactElement<{ className?: string }>;
  title: string;
  detail: string;
  tone: TableEmptyStateTone;
  actions?: ReactNode;
};

// "initial" placeholder rows wait out PLACEHOLDER_DELAY_MS first, so a fast load never flashes
// them; "updating" keeps the current rows and runs a thin bar over the header instead.
export type TableLoadingState = false | "initial" | "updating";

export type TableProps<T> = {
  "aria-label": string;
  columns: readonly [TableColumn<T>, ...TableColumn<T>[]];
  rows: readonly TableRow<T>[];
  sort?: TableSort;
  onSortChange?: (sort: TableSort) => void;
  loading?: TableLoadingState;
  empty?: TableEmptyStateProps;
};

const PLACEHOLDER_DELAY_MS = 300;
const PLACEHOLDER_ROW_IDS = [
  "placeholder-1",
  "placeholder-2",
  "placeholder-3",
  "placeholder-4",
  "placeholder-5",
];
// Cycled per column so every placeholder bar gets a varied width without shifting on re-render.
const PLACEHOLDER_WIDTHS_PERCENT = [72, 48, 64, 56, 80, 40];

// A flex row per <tr>, not CSS table layout: an auto table layout grows a column past its
// declared width to fit its widest cell (e.g. a row's own action buttons), which would break a
// fixed-width actions column. The table/tr/th/td tags stay for their implicit roles, which
// Chromium exposes regardless of CSS display.
const columnWidthClassName: Record<1 | 2, string> = {
  1: "w-[3.75rem]",
  2: "w-[6.5rem]",
};

function alignClassName(align: TableColumnAlign | undefined): string {
  return align === "end" ? "text-right" : "text-left";
}

function columnSizeClassName<T>(column: TableColumn<T>): string {
  return column.kind === "actions"
    ? `${columnWidthClassName[column.count]} shrink-0`
    : "min-w-0 flex-1";
}

// A muted row's ink-secondary applies to every cell at once: a cell's own content should leave
// its text color unset so it inherits this.
function rowStateClassName(state: TableRowState | undefined): string {
  switch (state) {
    case "selected":
      return "bg-brand-blue-message-bg";
    case "warning":
      return "bg-status-warning-message-bg";
    case "error":
      return "bg-status-error-message-bg";
    case "muted":
      return "bg-surface-white text-ink-secondary";
    default:
      return "bg-surface-white";
  }
}

// A real border adds its own width to a row whose height is otherwise content-driven (min-h-14),
// pushing a two-line row 1px past its exact 64px target; an inset shadow doesn't. The selected
// row's own left-edge accent is combined into the same box-shadow, since only one applies.
function rowBoxShadowClassName(state: TableRowState | undefined): string {
  return state === "selected"
    ? "shadow-[inset_0_-1px_0_0_var(--color-line),inset_4px_0_0_0_var(--color-brand-blue-ui)]"
    : "shadow-[inset_0_-1px_0_0_var(--color-line)]";
}

function oppositeDirection(direction: TableSortDirection): TableSortDirection {
  return direction === "ascending" ? "descending" : "ascending";
}

const sortIconClassName = "size-3 shrink-0";

// Fills its whole header cell so the entire header area activates sorting, not just the text.
const headerButtonClassName =
  "flex w-full items-center gap-1 outline-none " +
  "data-[focus-visible]:outline-[3px] data-[focus-visible]:outline-solid " +
  "data-[focus-visible]:outline-offset-3 data-[focus-visible]:outline-brand-blue-strong";

function SortableColumnHeader<T>({
  column,
  sort,
  onSortChange,
}: {
  column: TableSortableDataColumn<T>;
  sort: TableSort | undefined;
  onSortChange: ((sort: TableSort) => void) | undefined;
}) {
  const isSorted = sort?.column === column.key;
  const direction = isSorted ? sort.direction : undefined;
  const colorClassName = isSorted ? "text-ink" : "text-ink-secondary";
  const Icon =
    direction === "ascending"
      ? ChevronUp
      : direction === "descending"
        ? ChevronDown
        : ChevronsUpDown;

  function handlePress() {
    if (!onSortChange) {
      return;
    }
    onSortChange({
      column: column.key,
      direction: isSorted ? oppositeDirection(sort.direction) : column.defaultDirection,
    });
  }

  return (
    <AriaButton
      onPress={handlePress}
      className={[
        headerButtonClassName,
        column.align === "end" ? "justify-end" : "justify-start",
      ].join(" ")}
    >
      <span className={colorClassName}>{column.title}</span>
      <Icon aria-hidden="true" className={[sortIconClassName, colorClassName].join(" ")} />
    </AriaButton>
  );
}

function TableEmptyState({ icon, title, detail, tone, actions }: TableEmptyStateProps) {
  const iconColorClassName = tone === "blank" ? "text-brand-blue-strong" : "text-ink-secondary";

  return (
    <div className="flex flex-col items-center gap-3 p-8 text-center">
      <span
        className={[
          "flex size-[5.5rem] shrink-0 items-center justify-center rounded-full bg-surface-bone",
          iconColorClassName,
        ].join(" ")}
      >
        <span className="inline-flex size-[2.375rem] shrink-0 [&>svg]:h-full [&>svg]:w-full">
          {icon}
        </span>
      </span>
      <p className="max-w-[32.5rem] text-2xl font-bold text-brand-blue-strong">{title}</p>
      <p className="max-w-[32.5rem] text-base text-ink-secondary">{detail}</p>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}

// Mirrors a real row's own column widths so the placeholder bars line up under the real header.
// It carries no aria-hidden of its own; the tbody that holds every placeholder row is hidden as
// a whole instead (see Table below).
function SkeletonRow<T>({ columns }: { columns: readonly TableColumn<T>[] }) {
  return (
    <tr className="flex h-14 items-center gap-3 px-4 shadow-[inset_0_-1px_0_0_var(--color-line)]">
      {columns.map((column, index) => {
        const isActions = column.kind === "actions";
        const align = isActions ? "start" : column.align;
        const widthPercent = PLACEHOLDER_WIDTHS_PERCENT[index % PLACEHOLDER_WIDTHS_PERCENT.length];

        return (
          <td
            key={column.key}
            className={[columnSizeClassName(column), alignClassName(align)].join(" ")}
          >
            {isActions ? (
              <div className="ml-auto size-[2.375rem] rounded-lg bg-surface-sand" />
            ) : (
              <div
                className={["flex", align === "end" ? "justify-end" : "justify-start"].join(" ")}
              >
                <div
                  className="h-3 rounded-md bg-surface-sand"
                  style={{ width: `${widthPercent}%` }}
                />
              </div>
            )}
          </td>
        );
      })}
    </tr>
  );
}

export type TableCellTextProps = {
  children: ReactNode;
  detail?: ReactNode;
};

// The 24px/20px line heights and 4px gap are fixed so a row with a detail line always lands
// exactly at 64px (min-h-14 plus the row's own 8px vertical padding), the same way a single line
// lands at 56px.
export function TableCellText({ children, detail }: TableCellTextProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-base leading-[24px]">{children}</span>
      {detail && <span className="text-sm leading-[20px] text-ink-secondary">{detail}</span>}
    </div>
  );
}

function TableCell<T>({ column, item }: { column: TableColumn<T>; item: T }) {
  const isActions = column.kind === "actions";
  const align = isActions ? "start" : column.align;

  return (
    <td
      className={[
        "min-w-0 px-0",
        columnSizeClassName(column),
        alignClassName(align),
        align === "end" ? "tabular-nums" : "",
      ].join(" ")}
    >
      <div
        className={[
          "flex flex-col justify-center gap-0.5",
          align === "end" ? "items-end" : "items-start",
          isActions ? "flex-row items-center justify-end gap-2" : "",
        ].join(" ")}
      >
        {column.render(item)}
      </div>
    </td>
  );
}

export function Table<T>({
  "aria-label": ariaLabel,
  columns,
  rows,
  sort,
  onSortChange,
  loading = false,
  empty,
}: TableProps<T>) {
  const [showPlaceholders, setShowPlaceholders] = useState(false);

  useEffect(() => {
    if (loading !== "initial") {
      setShowPlaceholders(false);
      return;
    }
    const timer = setTimeout(() => setShowPlaceholders(true), PLACEHOLDER_DELAY_MS);
    return () => clearTimeout(timer);
  }, [loading]);

  const showEmptyState = !loading && rows.length === 0 && empty !== undefined;
  const showingPlaceholders = loading === "initial" && showPlaceholders;

  return (
    <div className="relative overflow-hidden rounded-lg border border-line bg-surface-white">
      {loading === "updating" && (
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 z-10 h-[3px] overflow-hidden bg-brand-blue-message-bg"
        >
          <div className="h-full w-1/3 bg-brand-blue-ui" />
        </div>
      )}
      {showEmptyState ? (
        <TableEmptyState {...empty} />
      ) : (
        <table
          aria-label={ariaLabel}
          aria-busy={loading ? true : undefined}
          className="block w-full"
        >
          <thead className="block">
            <tr className="flex h-11 items-center gap-3 bg-surface-bone px-4">
              {columns.map((column) => {
                const isActions = column.kind === "actions";
                const isSortable = !isActions && column.sortable === true;
                const isSorted = isSortable && sort?.column === column.key;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={isSortable ? (isSorted ? sort?.direction : "none") : undefined}
                    className={[
                      columnSizeClassName(column),
                      "text-xs font-bold uppercase",
                      alignClassName(isActions ? "start" : column.align),
                    ].join(" ")}
                  >
                    {isActions ? (
                      <span className="sr-only">{column.srLabel}</span>
                    ) : column.sortable === true ? (
                      <SortableColumnHeader
                        column={column}
                        sort={sort}
                        onSortChange={onSortChange}
                      />
                    ) : (
                      <span className="text-ink-secondary">{column.title}</span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="block" aria-hidden={showingPlaceholders ? true : undefined}>
            {loading === "initial"
              ? showPlaceholders &&
                PLACEHOLDER_ROW_IDS.map((id) => <SkeletonRow key={id} columns={columns} />)
              : rows.map(({ id, item, state }) => (
                  <tr
                    key={id}
                    className={[
                      "flex min-h-14 items-center gap-3 px-4 py-2",
                      rowBoxShadowClassName(state),
                      rowStateClassName(state),
                    ].join(" ")}
                  >
                    {columns.map((column) => (
                      <TableCell key={column.key} column={column} item={item} />
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
