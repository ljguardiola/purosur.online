import type { TableColumnAlign, TableRowState } from "./table-types";

export function alignClassName(align: TableColumnAlign | undefined): string {
  return align === "end" ? "text-right" : "text-left";
}

// <tr> can't carry padding under table layout, so the row's own edge padding lives on the first
// and last cell instead.
export function cellHorizontalPaddingClassName(first: boolean, last: boolean): string {
  return [first ? "pl-4" : "pl-1.5", last ? "pr-4" : "pr-1.5"].join(" ");
}

// A muted row's subtle text applies to every cell at once, so a column's own render() should
// leave its text color unset to inherit it.
export function rowStateClassName(state: TableRowState | undefined): string {
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
export function rowBoxShadowClassName(state: TableRowState | undefined, last: boolean): string {
  if (last) {
    return state === "selected" ? "inset-shadow-marker" : "";
  }
  return state === "selected" ? "inset-shadow-divider-marker" : "inset-shadow-divider";
}
