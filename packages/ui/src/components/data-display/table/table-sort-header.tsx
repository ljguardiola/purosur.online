import { ChevronDown, ChevronsUpDown, ChevronUp } from "lucide-react";
import { Button as AriaButton } from "react-aria-components";
import { cellHorizontalPaddingClassName } from "./table-styles";
import type { TableSort, TableSortableDataColumn, TableSortDirection } from "./table-types";

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

export function SortableColumnHeader<T>({
  column,
  sort,
  onSortChange,
  first,
  last,
}: {
  column: TableSortableDataColumn<T>;
  sort: TableSort | undefined;
  onSortChange: (sort: TableSort) => void;
  first: boolean;
  last: boolean;
}) {
  const sorted = sort?.column === column.key;
  const direction = sorted ? sort.direction : undefined;
  const colorClassName = sorted ? "text-text" : "text-text-subtle";
  const Icon =
    direction === "ascending"
      ? ChevronUp
      : direction === "descending"
        ? ChevronDown
        : ChevronsUpDown;

  function handlePress() {
    onSortChange({
      column: column.key,
      direction: sorted ? oppositeDirection(sort.direction) : column.defaultDirection,
    });
  }

  return (
    <AriaButton
      onPress={handlePress}
      className={[
        headerButtonClassName,
        cellHorizontalPaddingClassName(first, last),
        column.align === "end" ? "justify-end" : "justify-start",
      ].join(" ")}
    >
      {/* min-w-0 overrides a flex item's default min-width of its own unwrapped content width,
          which would otherwise keep a long title from using the <th>'s own break-words. */}
      <span className={["min-w-0", colorClassName].join(" ")}>{column.header}</span>
      <Icon aria-hidden="true" className={[sortIconClassName, colorClassName].join(" ")} />
    </AriaButton>
  );
}
