import { ChevronDown, ChevronsUpDown, ChevronUp } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { Button as AriaButton } from "react-aria-components";
import type { ButtonIcon } from "./Button";

export type TableColumnAlign = "start" | "end";
export type TableRowState = "selected" | "warning" | "error" | "muted";
export type TableSortDirection = "ascending" | "descending";
export type TableSort<K extends string = string> = { column: K; direction: TableSortDirection };

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

// The literal key of every sortable column in a specific columns tuple C, and never when none of
// C's columns are sortable. A C inferred from a plain, widely annotated TableColumn<T>[] (no
// literal info retained) resolves this to plain string, since any of its columns could be the
// sortable one.
export type TableSortableColumnKey<T, C extends readonly TableColumn<T>[]> = Extract<
  C[number],
  { sortable: true }
>["key"];

type TableHasSortableColumn<T, C extends readonly TableColumn<T>[]> = [
  TableSortableColumnKey<T, C>,
] extends [never]
  ? false
  : true;

// The one thing a caller can show in place of the header and rows, resolved from loading and
// rows/empty together instead of two separate booleans, so the three states stay mutually
// exclusive by construction. Precedence, in order:
// - "initial" always wins: we don't yet know whether the eventual result is empty, so showing
//   the empty state here (even if the caller passed one) would claim something we can't know yet.
// - "updating" always keeps showing the current rows, however many there are (including zero),
//   under the top loading bar: that's the whole difference from "initial", which discards
//   everything for placeholders instead of keeping what was already on screen.
// - Only the steady, non-loading state can ever show the empty state, and only when there are
//   zero rows and the caller opted into one by passing `empty`; zero rows with no `empty` prop
//   renders a plain, message-less empty table body instead.
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

export type TableRow<T> = {
  id: string;
  item: T;
  state?: TableRowState;
};

// Only changes the icon's color: "blank" (nothing yet) is blue strong, "filtered" (nothing
// matches) is secondary text.
export type TableEmptyStateTone = "blank" | "filtered";

export type TableEmptyStateProps = {
  icon: ButtonIcon;
  title: string;
  detail: string;
  tone: TableEmptyStateTone;
  actions?: ReactNode;
};

// "initial" placeholder rows render right away but stay invisible for a 300ms CSS reveal delay
// (see SkeletonRow below), so a fast load never flashes them; "updating" keeps the current rows
// and runs a thin bar over the header instead.
export type TableLoadingState = false | "initial" | "updating";

type TableCommonProps<T> = {
  "aria-label": string;
  rows: readonly TableRow<T>[];
  loading?: TableLoadingState;
  empty?: TableEmptyStateProps;
  // Where a caller renders its own row count and Pagination, below the table. Held back during
  // the first load, alongside the placeholder rows it would otherwise sit under.
  footer?: ReactNode;
};

// A sortable column's header button is useless without a handler wired to it (see
// SortableColumnHeader below): a columns tuple that includes one requires both sort and
// onSortChange, typed to exactly that tuple's own sortable keys; a tuple that includes none
// forbids both.
type TableSortProps<T, C extends readonly TableColumn<T>[]> =
  TableHasSortableColumn<T, C> extends true
    ? {
        sort: TableSort<TableSortableColumnKey<T, C>>;
        onSortChange: (sort: TableSort<TableSortableColumnKey<T, C>>) => void;
      }
    : { sort?: never; onSortChange?: never };

export type TableProps<
  T,
  C extends readonly [TableColumn<T>, ...TableColumn<T>[]] = readonly [
    TableColumn<T>,
    ...TableColumn<T>[],
  ],
> = TableCommonProps<T> & { columns: C } & TableSortProps<T, C>;

const PLACEHOLDER_ROW_IDS = [
  "placeholder-1",
  "placeholder-2",
  "placeholder-3",
  "placeholder-4",
  "placeholder-5",
];
// Cycled per column so every placeholder bar gets a varied width without shifting on re-render.
const PLACEHOLDER_WIDTHS_PERCENT = [72, 48, 64, 56, 80, 40];

// table/thead/tbody/tr/th/td keep their native CSS display: overriding it away from
// table-shaped drops these tags' implicit ARIA roles in some engines.
function alignClassName(align: TableColumnAlign | undefined): string {
  return align === "end" ? "text-right" : "text-left";
}

// The actions column's own content width: 60px for one 38px IconButton, 104px for two with an
// 8px gap between them.
const ACTIONS_CONTENT_WIDTH_PX: Record<1 | 2, number> = {
  1: 60,
  2: 104,
};

const CELL_EDGE_PADDING_PX = 16;
const CELL_INNER_PADDING_PX = 6;

// The 12px gap between cells is each cell's own 6px of padding meeting its neighbor's; the first
// and last cell in a row additionally own the row's 16px left/right edge padding, since <tr>
// itself can't carry padding under table layout.
function cellHorizontalPaddingClassName(isFirst: boolean, isLast: boolean): string {
  return [isFirst ? "pl-4" : "pl-1.5", isLast ? "pr-4" : "pr-1.5"].join(" ");
}

// table-fixed reads a column's width only from its header cell, and that cell's own horizontal
// padding shares the same border-box as the declared width, so the actions column's width has to
// add that padding on top of its own content width or its buttons get squeezed to fit.
function headerColumnWidthStyle<T>(
  column: TableColumn<T>,
  isFirst: boolean,
  isLast: boolean,
): { width: string } | undefined {
  if (column.kind !== "actions") {
    return undefined;
  }
  const leftPadding = isFirst ? CELL_EDGE_PADDING_PX : CELL_INNER_PADDING_PX;
  const rightPadding = isLast ? CELL_EDGE_PADDING_PX : CELL_INNER_PADDING_PX;
  return { width: `${ACTIONS_CONTENT_WIDTH_PX[column.count] + leftPadding + rightPadding}px` };
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

// A real border adds its own width to a row whose height is otherwise content-driven (h-14 on
// each cell acts as a floor, not a ceiling), pushing a two-line row 1px past its exact 64px
// target; an inset shadow doesn't. The selected row's own left-edge accent is combined into the
// same box-shadow, since only one applies.
function rowBoxShadowClassName(state: TableRowState | undefined): string {
  return state === "selected"
    ? "shadow-[inset_0_-1px_0_0_var(--color-line),inset_4px_0_0_0_var(--color-brand-blue-ui)]"
    : "shadow-[inset_0_-1px_0_0_var(--color-line)]";
}

function oppositeDirection(direction: TableSortDirection): TableSortDirection {
  return direction === "ascending" ? "descending" : "ascending";
}

const sortIconClassName = "size-3 shrink-0";

// Fills its whole header cell (the cell's own horizontal padding lives inside the button, not
// the <th>, so the button's own box reaches every edge of the cell) so the entire header area
// activates sorting, not just the text.
const headerButtonClassName =
  "flex h-full w-full items-center gap-1 outline-none " +
  "data-[focus-visible]:outline-[3px] data-[focus-visible]:outline-solid " +
  "data-[focus-visible]:outline-offset-3 data-[focus-visible]:outline-brand-blue-strong";

function SortableColumnHeader<T>({
  column,
  sort,
  onSortChange,
  isFirst,
  isLast,
}: {
  column: TableSortableDataColumn<T>;
  sort: TableSort | undefined;
  onSortChange: ((sort: TableSort) => void) | undefined;
  isFirst: boolean;
  isLast: boolean;
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
        cellHorizontalPaddingClassName(isFirst, isLast),
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
// a whole instead (see Table below). It renders as soon as loading starts and stays invisible
// (opacity 0) for the reveal animation's own 300ms delay, defined in tokens.css; there is no
// timer or effect involved, so nothing here needs to wait or clean anything up.
function SkeletonRow<T>({ columns }: { columns: readonly TableColumn<T>[] }) {
  return (
    <tr
      className={[
        "h-14 shadow-[inset_0_-1px_0_0_var(--color-line)]",
        "animate-table-placeholder-reveal",
      ].join(" ")}
    >
      {columns.map((column, index) => {
        const isActions = column.kind === "actions";
        const align = isActions ? "start" : column.align;
        const widthPercent = PLACEHOLDER_WIDTHS_PERCENT[index % PLACEHOLDER_WIDTHS_PERCENT.length];
        const isFirst = index === 0;
        const isLast = index === columns.length - 1;

        return (
          <td
            key={column.key}
            className={[
              "align-middle",
              cellHorizontalPaddingClassName(isFirst, isLast),
              alignClassName(align),
            ].join(" ")}
          >
            {isActions ? (
              <div className="flex flex-row items-center justify-end gap-2">
                <div className="size-[2.375rem] shrink-0 rounded-lg bg-surface-sand" />
                {column.count === 2 && (
                  <div className="size-[2.375rem] shrink-0 rounded-lg bg-surface-sand" />
                )}
              </div>
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
// exactly at 64px (the cell's own h-14 floor plus its 8px vertical padding), the same way a single line
// lands at 56px. Only a missing detail (undefined or null) omits the line: a falsy-but-real
// value like 0 or an empty string is content the caller chose to show, and `detail && ...` would
// print a stray, unwrapped "0" for it instead (0 is itself falsy).
export function TableCellText({ children, detail }: TableCellTextProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-base leading-[24px]">{children}</span>
      {detail !== undefined && detail !== null && (
        <span className="text-sm leading-[20px] text-ink-secondary">{detail}</span>
      )}
    </div>
  );
}

function TableCell<T>({
  column,
  item,
  isFirst,
  isLast,
}: {
  column: TableColumn<T>;
  item: T;
  isFirst: boolean;
  isLast: boolean;
}) {
  const isActions = column.kind === "actions";
  const align = isActions ? "start" : column.align;

  return (
    <td
      className={[
        "h-14 break-words align-middle py-2",
        cellHorizontalPaddingClassName(isFirst, isLast),
        alignClassName(align),
        align === "end" ? "tabular-nums" : "",
      ].join(" ")}
    >
      <div
        // Two fully separate class strings: an actions and a text cell never share a layout.
        className={
          isActions
            ? "flex flex-row items-center justify-end gap-2"
            : [
                "flex flex-col justify-center gap-0.5",
                align === "end" ? "items-end" : "items-start",
              ].join(" ")
        }
      >
        {column.render(item)}
      </div>
    </td>
  );
}

// TableProps<T, C>'s sort/onSortChange requirement is a conditional type over the still-generic
// C, which TypeScript can't pattern-match inside this function's own body, hence the second,
// looser signature actually implemented below.
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
      {/* "clip" (not "hidden") + overflow-clip-margin: a sortable header's own button reaches
          this exact edge, so its focus ring needs 6px of room (its own offset + width) past the
          rounded corner that clips everything else; "hidden" clips flush and ignores the margin. */}
      <div className="relative overflow-clip rounded-lg border border-line bg-surface-white [overflow-clip-margin:6px]">
        {loading === "updating" && (
          <div
            aria-hidden="true"
            // Purely visual, on top of the header's own top edge: without this, it would also
            // physically catch pointer events there before they reach the header underneath.
            className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[3px] overflow-hidden bg-brand-blue-message-bg"
          >
            <div className="h-full w-1/3 animate-table-loading-bar bg-brand-blue-ui motion-reduce:animate-none" />
          </div>
        )}
        {showEmptyState && empty ? (
          <section aria-label={ariaLabel}>
            <TableEmptyState {...empty} />
          </section>
        ) : (
          <table
            aria-label={ariaLabel}
            aria-busy={loading ? true : undefined}
            className="w-full table-fixed"
          >
            <thead>
              <tr className="h-11 bg-surface-bone">
                {columns.map((column, index) => {
                  const isActions = column.kind === "actions";
                  const isSortable = !isActions && column.sortable === true;
                  const isSorted = isSortable && sort?.column === column.key;
                  const isFirst = index === 0;
                  const isLast = index === columns.length - 1;
                  return (
                    <th
                      key={column.key}
                      scope="col"
                      aria-sort={isSortable ? (isSorted ? sort?.direction : "none") : undefined}
                      style={headerColumnWidthStyle(column, isFirst, isLast)}
                      className={[
                        // The explicit height (not just the <tr>'s) gives the sortable header
                        // button's own h-full something definite to resolve 100% against.
                        "h-11 align-middle",
                        // A sortable header's own hit area needs to reach the cell's full box, so
                        // its padding lives on the button instead (see SortableColumnHeader).
                        isSortable ? "" : cellHorizontalPaddingClassName(isFirst, isLast),
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
                          isFirst={isFirst}
                          isLast={isLast}
                        />
                      ) : (
                        <span className="text-ink-secondary">{column.title}</span>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody aria-hidden={showingPlaceholders ? true : undefined}>
              {showingPlaceholders
                ? PLACEHOLDER_ROW_IDS.map((id) => <SkeletonRow key={id} columns={columns} />)
                : rows.map(({ id, item, state }) => (
                    <tr
                      key={id}
                      className={[rowBoxShadowClassName(state), rowStateClassName(state)].join(" ")}
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
                  ))}
            </tbody>
          </table>
        )}
      </div>
      {!showingPlaceholders && footer}
    </>
  );
}
