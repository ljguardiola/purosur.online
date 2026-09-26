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
  // Forbidding (not just omitting) defaultDirection closes a real TypeScript loophole: a
  // `sortable` value typed as plain `boolean` (not the literal `true`) would otherwise satisfy
  // this branch too, since a non-literal discriminant is checked leniently against a union with
  // no other property to disqualify it. A required-but-forbidden property does disqualify it,
  // since it can never be assignable to `never`.
  defaultDirection?: never;
};

type TableDataColumn<T> = TableSortableDataColumn<T> | TableUnsortableDataColumn<T>;

// Returning undefined for a specific item renders no button in that row's slot (not a disabled
// one): an invisible, non-focusable placeholder fills that slot instead of collapsing it, so any
// other action in the same column still lands in the same horizontal position on every row.
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

// Resolves to plain string when C is a widely annotated TableColumn<T>[] with no literal info
// retained, since any of its columns could then be the sortable one.
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

// "initial" placeholder rows render right away but stay invisible for a 300ms CSS reveal delay
// (defined in tokens.css), so a fast load never flashes them; "updating" keeps the current rows
// and runs a thin bar over the header instead.
export type TableLoadingState = false | "initial" | "updating";

type TableCommonProps<T> = {
  "aria-label": string;
  rows: readonly TableRow<T>[];
  loading?: TableLoadingState;
  empty?: TableEmptyStateProps;
  footer?: ReactNode;
};

// A columns tuple that includes a sortable column requires both sort and onSortChange, typed to
// exactly that tuple's own sortable keys; a tuple with none forbids both — a sortable header's
// button would otherwise have no handler to call.
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

// The 12px gap between cells is each cell's own 6px of padding meeting its neighbor's; the first
// and last cell additionally own the row's 16px left/right edge padding, since <tr> itself can't
// carry padding under table layout.
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
  return {
    width: `${ACTIONS_CONTENT_WIDTH_PX[column.actions.length] + leftPadding + rightPadding}px`,
  };
}

// A muted row's ink-secondary applies to every cell at once, so a column's own render() should
// leave its text color unset to inherit it.
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

// A real border would add its own width to a row whose height is otherwise content-driven (h-14
// is a floor, not a ceiling), pushing a two-line row 1px past its exact 64px target; an inset
// shadow doesn't. The selected row's left-edge accent is combined into the same box-shadow, since
// only one ever applies. The last row skips its own bottom divider, since sitting flush against
// the container's own 1px border (the same "line" color) would otherwise read as one 2px band.
//
// Every branch below is its own complete, literal class string, since Tailwind's scanner only
// generates CSS for class names it finds written out in source, never one assembled at runtime.
function rowBoxShadowClassName(state: TableRowState | undefined, isLast: boolean): string {
  if (isLast) {
    return state === "selected" ? "shadow-[inset_4px_0_0_0_var(--color-brand-blue-ui)]" : "";
  }
  return state === "selected"
    ? "shadow-[inset_0_-1px_0_0_var(--color-line),inset_4px_0_0_0_var(--color-brand-blue-ui)]"
    : "shadow-[inset_0_-1px_0_0_var(--color-line)]";
}

function oppositeDirection(direction: TableSortDirection): TableSortDirection {
  return direction === "ascending" ? "descending" : "ascending";
}

const sortIconClassName = "size-3 shrink-0";

// Fills the whole header cell (its horizontal padding lives on the button, not the <th>) so the
// entire header area activates sorting, not just the text. Hovers to surface-sand rather than the
// package's usual surface-bone, since this button already sits on the header row's own bone
// background. Its focus ring is inset (negative outline-offset) since the button's box is flush
// with the container's clipped, rounded edge and an outward ring would need room past it.
// relative + z-20, scoped to focus-visible only: the "updating" loading bar is positioned above
// all in-flow content regardless of DOM order, and would otherwise cover the ring's top edge
// while the button stays unpositioned (and so under the bar) outside focus-visible.
const headerButtonClassName =
  "flex h-full w-full items-center gap-1 outline-none data-[hovered]:bg-surface-sand " +
  "data-[focus-visible]:relative data-[focus-visible]:z-20 " +
  "data-[focus-visible]:outline-[3px] data-[focus-visible]:outline-solid " +
  "data-[focus-visible]:outline-offset-[-3px] data-[focus-visible]:outline-brand-blue-strong";

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
  const colorClassName = isSorted ? "text-ink" : "text-ink-secondary";
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
  const iconColorClassName = tone === "blank" ? "text-brand-blue-strong" : "text-ink-secondary";

  return (
    <div className="flex flex-col items-center gap-3 p-8 text-center">
      <span
        aria-hidden="true"
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
      {detail && <p className="max-w-[32.5rem] text-base text-ink-secondary">{detail}</p>}
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}

// It carries no aria-hidden of its own; the tbody holding every placeholder row is hidden as a
// whole instead (see Table below). There is no timer or effect involved in the 300ms reveal
// delay (defined in tokens.css) — it renders as soon as loading starts and stays invisible for
// that CSS-driven duration — so nothing here needs to wait or clean anything up.
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
        "h-14",
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
                <div className="size-[2.375rem] shrink-0 rounded-lg bg-surface-sand" />
                {column.actions.length === 2 && (
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
// exactly at 64px (24 main + 4 gap + 20 detail + 8 + 8 cell padding); the cell's own h-14 floor
// only matters for the single-line case, where 24 + 8 + 8 = 40px would otherwise land under it.
//
// A falsy-but-real value like 0 or an empty string is content the caller chose to show (`detail
// && ...` would print a stray, unwrapped "0" for it, since 0 is itself falsy), so only undefined,
// null and boolean count as "no detail" — the common `detail={item.sku !== undefined && item.sku}`
// pattern passes exactly `false` when there's no sku, and without this it would grow the row for
// an empty, invisible second line.
export function TableCellText({ children, detail }: TableCellTextProps) {
  const hasDetail = detail !== undefined && detail !== null && typeof detail !== "boolean";
  return (
    <div className="flex flex-col gap-1">
      <span className="text-base leading-[24px]">{children}</span>
      {hasDetail && <span className="text-sm leading-[20px] text-ink-secondary">{detail}</span>}
    </div>
  );
}

// Keyed by nothing at all, since it's never in a `.map()` over `column.actions`: its position in
// the JSX is what React tracks, so a label that changes with the item's own state updates this
// same button in place instead of unmounting and remounting a new one.
function TableActionButton<T>({ action, item }: { action: TableAction<T>; item: T }) {
  const descriptor = action(item);
  if (!descriptor) {
    // Same footprint as IconButton's own 38x38px box, so this row's other action doesn't shift
    // into the space a visible action would have taken here.
    return <span aria-hidden="true" className="size-[2.375rem] shrink-0" />;
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
        "h-14 break-words align-middle py-2",
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
          // items-start/items-end opts this flex item out of stretch, so its cross size is its own
          // unclamped preferred width — wider than the column for an unbreakable run. max-w-full
          // caps it at the column's available width so it wraps instead of overflowing.
          <div className="flex flex-col gap-1 max-w-full">{column.render(item)}</div>
        )}
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
      {/* overflow-clip-margin doesn't exist in WebKit (it parses to nothing there, same as its
          0px initial value everywhere else), so nothing here depends on it. isolate: without its
          own stacking context, this container's z-index:auto wouldn't contain the focused
          header's z-20 or the updating bar's z-10 — both would resolve against the page's root
          stacking context instead, letting a focused header (or the bar) paint over unrelated
          page chrome. isolate keeps that comparison local to this table. */}
      <div className="relative isolate overflow-clip rounded-lg border border-line bg-surface-white">
        {loading === "updating" && (
          <div
            aria-hidden="true"
            // Without pointer-events-none, this purely visual bar would also physically catch
            // pointer events meant for the header underneath it.
            className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[3px] overflow-hidden bg-brand-blue-message-bg"
          >
            <div className="h-full w-1/3 animate-table-loading-bar bg-brand-blue-ui motion-reduce:animate-none" />
          </div>
        )}
        {showEmptyState && empty ? (
          // Swaps out whatever was focused inside the table and leaves the browser's own
          // removal-triggered blur to document.body as is, on purpose: only the caller knows what
          // caused this switch and whether there's a sensible place to send focus instead.
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
              <tr className="h-11 bg-surface-bone">
                {columns.map((column, index) => {
                  const isActions = column.kind === "actions";
                  // The exported overload requires onSortChange whenever a column is genuinely
                  // sortable, but the looser implementation signature can't express that
                  // conditional and keeps it optional regardless — this check is what narrows it
                  // down to the non-optional prop SortableColumnHeader actually takes.
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
                        // A table cell's own explicit height is a floor, not a cap, so this only
                        // sets the single-line row's height to 44px; a sortable header's own
                        // h-full then always has an actual, resolved cell height to track.
                        "h-11 break-words align-middle",
                        // A sortable header's own hit area needs to reach the cell's full box, so
                        // its padding lives on the button instead (see SortableColumnHeader).
                        isSortable ? "" : cellHorizontalPaddingClassName(isFirst, isLast),
                        "text-xs font-bold uppercase",
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
                        <span className="text-ink-secondary">{column.title}</span>
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
