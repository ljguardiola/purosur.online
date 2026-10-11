import type { TableColumnAlign, TableRowState, TableVariant } from "./table-types";

export function alignClassName(align: TableColumnAlign | undefined): string {
  return align === "end" ? "text-right" : "text-left";
}

// <tr> can't carry padding under table layout, so the row's own edge padding lives on the first
// and last cell instead.
export function cellHorizontalPaddingClassName(
  first: boolean,
  last: boolean,
  variant: TableVariant = "framed",
): string {
  const edge = variant === "nested" ? ["pl-0", "pr-0"] : ["pl-4", "pr-4"];
  return [first ? edge[0] : "pl-1.5", last ? edge[1] : "pr-1.5"].join(" ");
}

// A muted row's subtle text applies to every cell at once, so a column's own render() should
// leave its text color unset to inherit it.
export function rowStateClassName(
  state: TableRowState | undefined,
  variant: TableVariant = "framed",
): string {
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
      return variant === "nested" ? "" : "bg-surface";
  }
}

export function tableContainerClassName(variant: TableVariant): string {
  return variant === "nested"
    ? "relative isolate overflow-clip"
    : "relative isolate overflow-clip rounded-lg border border-border bg-surface";
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
