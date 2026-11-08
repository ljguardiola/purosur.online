import type { ReactNode } from "react";

export type TableCellTextProps = {
  children: ReactNode;
  description?: ReactNode;
  tone?: "subtle" | "error" | "success" | "warning" | undefined;
  strong?: boolean;
  size?: "body" | "detail";
  descriptionTone?: DescriptionTone | undefined;
  secondDescription?: ReactNode;
  secondDescriptionTone?: DescriptionTone | undefined;
};

type DescriptionTone = "error" | "warning";

const TEXT_TONE_CLASS_NAME = {
  subtle: "text-text-subtle",
  error: "text-error-strong",
  success: "text-success-strong",
  warning: "text-warning-strong",
} as const;

const DESCRIPTION_TONE_CLASS_NAME = {
  error: "font-bold text-error-strong",
  warning: "font-bold text-warning-strong",
} as const;

function isShown(description: ReactNode): boolean {
  return description !== undefined && description !== null && typeof description !== "boolean";
}

function DescriptionLine({
  children,
  tone,
}: {
  children: ReactNode;
  tone: DescriptionTone | undefined;
}) {
  return (
    <span
      className={[
        "text-detail",
        tone === undefined ? "text-text-subtle" : DESCRIPTION_TONE_CLASS_NAME[tone],
      ].join(" ")}
    >
      {children}
    </span>
  );
}

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
  size = "body",
  descriptionTone,
  secondDescription,
  secondDescriptionTone,
}: TableCellTextProps) {
  return (
    <div className="flex flex-col gap-1">
      <span
        className={[
          TEXT_SIZE_CLASS_NAME[size],
          tone === undefined ? "" : TEXT_TONE_CLASS_NAME[tone],
          strong ? "font-bold" : "",
        ].join(" ")}
      >
        {children}
      </span>
      {isShown(description) ? (
        <DescriptionLine tone={descriptionTone}>{description}</DescriptionLine>
      ) : null}
      {isShown(secondDescription) ? (
        <DescriptionLine tone={secondDescriptionTone}>{secondDescription}</DescriptionLine>
      ) : null}
    </div>
  );
}
