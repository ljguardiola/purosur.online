import type { ReactNode } from "react";

export type TableCellTextProps = {
  children: ReactNode;
  description?: ReactNode;
  tone?: "subtle" | "error" | undefined;
  strong?: boolean;
  monospace?: boolean;
  size?: "body" | "detail";
  descriptionTone?: "error" | undefined;
};

const TEXT_TONE_CLASS_NAME = { subtle: "text-text-subtle", error: "text-error-strong" } as const;

const TEXT_SIZE_CLASS_NAME = { body: "text-body", detail: "text-detail" } as const;

// The fixed line heights and gap land a two-line row exactly at 64px; the cell's own height floor
// only matters for the single-line case, which would otherwise land under it.
//
// A falsy-but-real value like 0 or "" is still content to show: `description && ...` would instead
// print a stray, unwrapped "0" (0 is itself falsy), so only undefined/null/boolean count as "no
// description" — matching the common `description={item.sku !== undefined && item.sku}` pattern, which
// passes exactly `false` when there's no sku.
export function TableCellText({
  children,
  description,
  tone,
  strong = false,
  monospace = false,
  size = "body",
  descriptionTone,
}: TableCellTextProps) {
  const hasDescription =
    description !== undefined && description !== null && typeof description !== "boolean";
  return (
    <div className="flex flex-col gap-1">
      <span
        className={[
          TEXT_SIZE_CLASS_NAME[size],
          tone === undefined ? "" : TEXT_TONE_CLASS_NAME[tone],
          strong ? "font-bold" : "",
          monospace ? "font-mono" : "",
        ].join(" ")}
      >
        {children}
      </span>
      {hasDescription ? (
        <span
          className={[
            "text-detail",
            descriptionTone === "error" ? "font-bold text-error-strong" : "text-text-subtle",
          ].join(" ")}
        >
          {description}
        </span>
      ) : null}
    </div>
  );
}
