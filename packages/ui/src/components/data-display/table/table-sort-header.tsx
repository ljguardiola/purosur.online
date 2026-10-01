import { ChevronDown, ChevronsUpDown, ChevronUp } from "lucide-react";
import { Button as AriaButton } from "react-aria-components";
import { cellHorizontalPaddingClassName } from "./table-styles";
import type { TableColumnAlign, TableSortDirection } from "./table-types";

const sortIconClassName = "size-icon-2xs shrink-0";

// The focus ring is inset (negative outline-offset) since the button's box is flush with the
// container's clipped, rounded edge, leaving no room for an outward ring. relative + z-focused, scoped
// to focus-visible only, since the "updating" bar is positioned above all in-flow content and
// would otherwise paint over the ring. uppercase repeats the <th>'s own, since the browser's
// default button styles reset text-transform instead of inheriting it.
const headerButtonClassName =
  "flex h-full w-full items-center gap-1 uppercase outline-none data-hovered:bg-surface-soft " +
  "data-focus-visible:relative data-focus-visible:z-focused " +
  "data-focus-visible:focus-ring-inset";

export function SortableColumnHeader({
  title,
  align,
  direction,
  onPress,
  first,
  last,
}: {
  title: string;
  align: TableColumnAlign;
  direction: TableSortDirection | undefined;
  onPress: () => void;
  first: boolean;
  last: boolean;
}) {
  const colorClassName = direction === undefined ? "text-text-subtle" : "text-text";
  const Icon =
    direction === "ascending"
      ? ChevronUp
      : direction === "descending"
        ? ChevronDown
        : ChevronsUpDown;

  return (
    <AriaButton
      onPress={onPress}
      className={[
        headerButtonClassName,
        cellHorizontalPaddingClassName(first, last),
        align === "end" ? "justify-end" : "justify-start",
      ].join(" ")}
    >
      {/* min-w-0 overrides a flex item's default min-width of its own unwrapped content width,
          which would otherwise keep a long title from using the <th>'s own break-words. */}
      <span className={["min-w-0", colorClassName].join(" ")}>{title}</span>
      <Icon aria-hidden="true" className={[sortIconClassName, colorClassName].join(" ")} />
    </AriaButton>
  );
}
