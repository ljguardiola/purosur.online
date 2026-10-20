import type { ReactNode } from "react";
import { type Tone, toneClassName } from "../shared/tone";

type SummaryRowTone = Extract<Tone, "error" | "info">;

export type SummaryRowProps = {
  label: string;
  value: ReactNode;
} & ({ strong?: boolean; detail?: false } | { strong?: false; detail: true; saving?: false }) &
  ({ saving?: boolean; tone?: undefined } | { saving?: false; tone: SummaryRowTone });

type SummaryRowForm = "regular" | "strong" | "detail";

const rowClassName = "flex items-baseline gap-4";

// min-w-0 overrides flex's default min-width:auto so the label can shrink and break-words wrap.
const labelBaseClassName = "min-w-0 break-words";

const labelTypeClassName: Record<SummaryRowForm, string> = {
  regular: "text-body",
  strong: "text-subheading",
  detail: "text-detail",
};

// flex-1's zero basis gives the value only the room the label doesn't need, instead of both
// shrinking proportionally and squeezing the label below its longest word.
const valueBaseClassName = "flex-1 text-right";

const valueTypeClassName: Record<SummaryRowForm, string> = {
  regular: "text-body font-semibold",
  strong: "text-subheading",
  detail: "text-body",
};

const textColorClassName: Record<SummaryRowForm, string> = {
  regular: "text-text-subtle",
  strong: "text-text",
  detail: "text-text-subtle",
};

const savingColorClassName = "text-success";

const toneTypeClassName: Record<SummaryRowTone, Record<SummaryRowForm, string>> = {
  error: {
    regular: "text-body font-bold",
    strong: "text-subheading",
    detail: "text-body font-bold",
  },
  info: { regular: "text-heading", strong: "text-heading", detail: "text-heading" },
};

function valueColorClassName(form: SummaryRowForm, saving: boolean, tone?: SummaryRowTone) {
  if (tone !== undefined) {
    return toneClassName[tone].strongText;
  }
  return saving ? savingColorClassName : textColorClassName[form];
}

function summaryRowForm(strong: boolean, detail: boolean): SummaryRowForm {
  if (detail) {
    return "detail";
  }
  return strong ? "strong" : "regular";
}

export function SummaryRow({
  label,
  value,
  strong = false,
  detail = false,
  saving = false,
  tone,
}: SummaryRowProps) {
  const form = summaryRowForm(strong, detail);
  const labelClassName = [
    labelBaseClassName,
    labelTypeClassName[form],
    textColorClassName[form],
  ].join(" ");
  const valueClassName = [
    valueBaseClassName,
    tone === undefined ? valueTypeClassName[form] : toneTypeClassName[tone][form],
    valueColorClassName(form, saving, tone),
  ].join(" ");

  return (
    <div className={rowClassName}>
      <span className={labelClassName}>{label}</span>
      <span className={valueClassName}>{value}</span>
    </div>
  );
}

export type StackedSummaryRowProps = {
  label: string;
  value: string;
} & ({ subtle?: boolean; tone?: undefined } | { subtle?: false; tone: Extract<Tone, "error"> });

export function StackedSummaryRow({ label, value, subtle = false, tone }: StackedSummaryRowProps) {
  const valueColorClassName =
    tone === undefined
      ? subtle
        ? "text-text-subtle"
        : "text-text"
      : toneClassName[tone].strongText;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-detail text-text-subtle">{label}</span>
      <span className={`text-subheading ${valueColorClassName}`}>{value}</span>
    </div>
  );
}
