import type { ReactNode } from "react";

export type TableCellTextProps = {
  children: ReactNode;
  description?: ReactNode;
};

// The fixed line heights and gap land a two-line row exactly at 64px; the cell's own height floor
// only matters for the single-line case, which would otherwise land under it.
//
// A falsy-but-real value like 0 or "" is still content to show: `description && ...` would instead
// print a stray, unwrapped "0" (0 is itself falsy), so only undefined/null/boolean count as "no
// description" — matching the common `description={item.sku !== undefined && item.sku}` pattern, which
// passes exactly `false` when there's no sku.
export function TableCellText({ children, description }: TableCellTextProps) {
  const hasDescription =
    description !== undefined && description !== null && typeof description !== "boolean";
  return (
    <div className="flex flex-col gap-1">
      <span className="text-body">{children}</span>
      {hasDescription ? <span className="text-detail text-text-subtle">{description}</span> : null}
    </div>
  );
}
