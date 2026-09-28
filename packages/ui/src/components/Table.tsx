import { ChevronDown, ChevronsUpDown, ChevronUp } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { Button as AriaButton } from "react-aria-components";
import type { ButtonIcon } from "./Button";
import { IconButton } from "./IconButton";

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

type TableSortableDataColumn<T> = TableColumnCommon<T> & {
  sortable: true;
  defaultDirection: TableSortDirection;
};

type TableUnsortableDataColumn<T> = TableColumnCommon<T> & {
  sortable?: false;
  // A plain `boolean` (non-literal) `sortable` value satisfies this branch under lenient
  // discriminant checking; forbidding defaultDirection (never, not just optional) disqualifies it,
  // since a required-but-forbidden property can never be assignable to `never`.
  defaultDirection?: never;
};

type TableDataColumn<T> = TableSortableDataColumn<T> | TableUnsortableDataColumn<T>;

// Returning undefined renders an invisible placeholder in that slot, not a disabled button, so
// the other action in the same column keeps its horizontal position on every row.
export type TableAction<T> = (item: T) =>
  | {
      icon: ButtonIcon;
      "aria-label": string;
      onPress: () => void;
    }
  | undefined;

type TableActionsColumn<T> = {
  key: string;
  kind: "actions";
  srLabel: string;
  actions: readonly [TableAction<T>] | readonly [TableAction<T>, TableAction<T>];
};

export type TableColumn<T> = TableDataColumn<T> | TableActionsColumn<T>;

// Resolves to plain string when C is a widened TableColumn<T>[] with no literal info retained.
export type TableSortableColumnKey<T, C extends readonly TableColumn<T>[]> = Extract<
  C[number],
  { sortable: true }
>["key"];

type TableHasSortableColumn<T, C extends readonly TableColumn<T>[]> = [
  TableSortableColumnKey<T, C>,
] extends [never]
  ? false
  : true;

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

export type TableEmptyStateTone = "blank" | "filtered";

export type TableEmptyStateProps = {
  icon: ButtonIcon;
  title: string;
  detail?: string;
  tone: TableEmptyStateTone;
  actions?: ReactNode;
};

// "initial" placeholder rows render right away but stay invisible for a 300ms CSS reveal delay,
// so a fast load never flashes them; "updating" keeps the current rows and runs a thin bar over
// the header instead.
export type TableLoadingState = false | "initial" | "updating";

type TableCommonProps<T> = {
  "aria-label": string;
  rows: readonly TableRow<T>[];
  loading?: TableLoadingState;
  empty?: TableEmptyStateProps;
  footer?: ReactNode;
};

// A tuple with no sortable column forbids sort/onSortChange too, so a sortable header's button
// can never be left without a handler to call.
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

function alignClassName(align: TableColumnAlign | undefined): string {
  return align === "end" ? "text-right" : "text-left";
}

// 60px for one 38px IconButton, 104px for two with an 8px gap between them.
const ACTIONS_CONTENT_WIDTH_PX: Record<1 | 2, number> = {
  1: 60,
  2: 104,
};

const CELL_EDGE_PADDING_PX = 16;
const CELL_INNER_PADDING_PX = 6;

// <tr> can't carry padding under table layout, so the row's own edge padding lives on the first
// and last cell instead.
function cellHorizontalPaddingClassName(isFirst: boolean, isLast: boolean): string {
  return [isFirst ? "pl-4" : "pl-1.5", isLast ? "pr-4" : "pr-1.5"].join(" ");
}

// table-fixed reads a column's width only from its header cell, whose padding shares the same
// border-box as the declared width, so it has to be added on top of the content width here.
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
  return {
    width: `${ACTIONS_CONTENT_WIDTH_PX[column.actions.length] + leftPadding + rightPadding}px`,
  };
}

// A muted row's subtle text applies to every cell at once, so a column's own render() should
// leave its text color unset to inherit it.
function rowStateClassName(state: TableRowState | undefined): string {
  switch (state) {
    case "selected":
      return "bg-action-subtle";
    case "warning":
      return "bg-warning-subtle";
    case "error":
      return "bg-error-subtle";
    case "muted":
      return "bg-surface text-text-subtle";
    default:
      return "bg-surface";
  }
}

// An inset shadow, not a real border, so it never adds width to a row whose height is otherwise
// content-driven. The last row skips its own bottom divider, since it would otherwise sit flush
// against the container's own same-color border and read as one thicker band.
//
// Every branch is its own complete, literal class string: Tailwind's scanner only generates CSS
// for names it finds written out in source, never one assembled at runtime.
function rowBoxShadowClassName(state: TableRowState | undefined, isLast: boolean): string {
  if (isLast) {
    return state === "selected" ? "inset-shadow-marker" : "";
  }
  return state === "selected" ? "inset-shadow-divider-marker" : "inset-shadow-divider";
}

function oppositeDirection(direction: TableSortDirection): TableSortDirection {
  return direction === "ascending" ? "descending" : "ascending";
}

const sortIconClassName = "size-icon-2xs shrink-0";

// The focus ring is inset (negative outline-offset) since the button's box is flush with the
// container's clipped, rounded edge, leaving no room for an outward ring. relative + z-focused, scoped
// to focus-visible only, since the "updating" bar is positioned above all in-flow content and
// would otherwise paint over the ring.
const headerButtonClassName =
  "flex h-full w-full items-center gap-1 outline-none data-hovered:bg-surface-soft " +
  "data-focus-visible:relative data-focus-visible:z-focused " +
  "data-focus-visible:focus-ring-inset";

function SortableColumnHeader<T>({
  column,
  sort,
  onSortChange,
  isFirst,
  isLast,
}: {
  column: TableSortableDataColumn<T>;
  sort: TableSort | undefined;
  onSortChange: (sort: TableSort) => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const isSorted = sort?.column === column.key;
  const direction = isSorted ? sort.direction : undefined;
  const colorClassName = isSorted ? "text-text" : "text-text-subtle";
  const Icon =
    direction === "ascending"
      ? ChevronUp
      : direction === "descending"
        ? ChevronDown
        : ChevronsUpDown;

  function handlePress() {
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
      {/* min-w-0 overrides a flex item's default min-width of its own unwrapped content width,
          which would otherwise keep a long title from using the <th>'s own break-words. */}
      <span className={["min-w-0", colorClassName].join(" ")}>{column.title}</span>
      <Icon aria-hidden="true" className={[sortIconClassName, colorClassName].join(" ")} />
    </AriaButton>
  );
}

function TableEmptyState({ icon, title, detail, tone, actions }: TableEmptyStateProps) {
  const iconColorClassName = tone === "blank" ? "text-text-accent" : "text-text-subtle";

  return (
    <div className="flex flex-col items-center gap-3 p-8 text-center">
      <span
        aria-hidden="true"
        className={[
          "flex size-22 shrink-0 items-center justify-center rounded-full bg-surface-subtle",
          iconColorClassName,
        ].join(" ")}
      >
        <span className="inline-flex size-icon-4xl shrink-0 *:size-full">{icon}</span>
      </span>
      <p className="max-w-130 text-title text-text-accent">{title}</p>
      {detail && <p className="max-w-130 text-body text-text-subtle">{detail}</p>}
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}

function SkeletonRow<T>({
  columns,
  isLastRow,
}: {
  columns: readonly TableColumn<T>[];
  isLastRow: boolean;
}) {
  return (
    <tr
      className={[
        "h-control-4xl",
        rowBoxShadowClassName(undefined, isLastRow),
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
                <div className="size-control-md shrink-0 rounded-lg bg-surface-soft" />
                {column.actions.length === 2 && (
                  <div className="size-control-md shrink-0 rounded-lg bg-surface-soft" />
                )}
              </div>
            ) : (
              <div
                className={["flex", align === "end" ? "justify-end" : "justify-start"].join(" ")}
              >
                <div
                  className="h-3 rounded-md bg-surface-soft"
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

// The fixed line heights and gap land a two-line row exactly at 64px; the cell's own height floor
// only matters for the single-line case, which would otherwise land under it.
//
// A falsy-but-real value like 0 or "" is still content to show: `detail && ...` would instead
// print a stray, unwrapped "0" (0 is itself falsy), so only undefined/null/boolean count as "no
// detail" — matching the common `detail={item.sku !== undefined && item.sku}` pattern, which
// passes exactly `false` when there's no sku.
export function TableCellText({ children, detail }: TableCellTextProps) {
  const hasDetail = detail !== undefined && detail !== null && typeof detail !== "boolean";
  return (
    <div className="flex flex-col gap-1">
      <span className="text-body">{children}</span>
      {hasDetail && <span className="text-detail text-text-subtle">{detail}</span>}
    </div>
  );
}

// No key: never in a `.map()`, so React tracks it by JSX position, updating this same button in
// place when its label changes instead of remounting a new one.
function TableActionButton<T>({ action, item }: { action: TableAction<T>; item: T }) {
  const descriptor = action(item);
  if (!descriptor) {
    // Matches the visible action button's own footprint, so the other action doesn't shift.
    return <span aria-hidden="true" className="size-control-md shrink-0" />;
  }
  const { icon, "aria-label": ariaLabel, onPress } = descriptor;
  return <IconButton icon={icon} aria-label={ariaLabel} onPress={onPress} />;
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
        "h-control-4xl break-words align-middle py-2",
        cellHorizontalPaddingClassName(isFirst, isLast),
        alignClassName(align),
        align === "end" ? "tabular-nums" : "",
      ].join(" ")}
    >
      <div
        className={
          isActions
            ? "flex flex-row items-center justify-end gap-2"
            : ["flex flex-col justify-center", align === "end" ? "items-end" : "items-start"].join(
                " ",
              )
        }
      >
        {isActions ? (
          <>
            <TableActionButton action={column.actions[0]} item={item} />
            {column.actions[1] && <TableActionButton action={column.actions[1]} item={item} />}
          </>
        ) : (
          // items-start/-end opts out of flex stretch, so an unbreakable run's unclamped preferred
          // width can exceed the column; max-w-full caps it there so it wraps instead of overflowing.
          <div className="flex flex-col gap-1 max-w-full">{column.render(item)}</div>
        )}
      </div>
    </td>
  );
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
        {loading === "updating" && (
          <div
            aria-hidden="true"
            // Without pointer-events-none, this purely visual bar would also physically catch
            // pointer events meant for the header underneath it.
            className="pointer-events-none absolute inset-x-0 top-0 z-raised h-0.75 overflow-hidden bg-data-subtle"
          >
            <div className="h-full w-1/3 animate-table-loading-bar bg-data motion-reduce:animate-none" />
          </div>
        )}
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
              <tr className="h-control-xl bg-surface-subtle">
                {columns.map((column, index) => {
                  const isActions = column.kind === "actions";
                  const isSortable =
                    !isActions && column.sortable === true && onSortChange !== undefined;
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
                        // A cell's explicit height is a floor, not a cap, so h-full on a sortable
                        // header's button always has an actual, resolved height to track.
                        "h-control-xl break-words align-middle",
                        // A sortable header's hit area needs the cell's full box, so its padding
                        // lives on the button instead.
                        isSortable ? "" : cellHorizontalPaddingClassName(isFirst, isLast),
                        "text-caption font-bold uppercase",
                        alignClassName(isActions ? "start" : column.align),
                      ].join(" ")}
                    >
                      {isActions ? (
                        <span className="sr-only">{column.srLabel}</span>
                      ) : isSortable ? (
                        <SortableColumnHeader
                          column={column}
                          sort={sort}
                          onSortChange={onSortChange}
                          isFirst={isFirst}
                          isLast={isLast}
                        />
                      ) : (
                        <span className="text-text-subtle">{column.title}</span>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody aria-hidden={showingPlaceholders ? true : undefined}>
              {showingPlaceholders
                ? PLACEHOLDER_ROW_IDS.map((id, index) => (
                    <SkeletonRow
                      key={id}
                      columns={columns}
                      isLastRow={index === PLACEHOLDER_ROW_IDS.length - 1}
                    />
                  ))
                : rows.map(({ id, item, state }, rowIndex) => (
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
                  ))}
            </tbody>
          </table>
        )}
      </div>
      {!showingPlaceholders && footer}
    </>
  );
}
