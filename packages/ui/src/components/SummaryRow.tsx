export type SummaryRowProps = {
  label: string;
  value: string;
  strong?: boolean;
  saving?: boolean;
};

type SummaryRowForm = "regular" | "strong";

const rowClassName = "flex items-baseline gap-4";

// min-w-0 overrides flex's default min-width:auto so the label can shrink and break-words wrap.
const labelBaseClassName = "min-w-0 break-words";

const labelTypeClassName: Record<SummaryRowForm, string> = {
  regular: "text-body font-normal",
  strong: "text-subheading font-bold",
};

// flex-1's zero basis gives the value only the room the label doesn't need, instead of both
// shrinking proportionally and squeezing the label below its longest word.
const valueBaseClassName = "flex-1 text-right";

const valueTypeClassName: Record<SummaryRowForm, string> = {
  regular: "text-body font-semibold",
  strong: "text-subheading font-bold",
};

const textColorClassName: Record<SummaryRowForm, string> = {
  regular: "text-text-subtle",
  strong: "text-text",
};

const savingColorClassName = "text-success";

export function SummaryRow({ label, value, strong = false, saving = false }: SummaryRowProps) {
  const form: SummaryRowForm = strong ? "strong" : "regular";
  const labelClassName = [
    labelBaseClassName,
    labelTypeClassName[form],
    textColorClassName[form],
  ].join(" ");
  const valueClassName = [
    valueBaseClassName,
    valueTypeClassName[form],
    saving ? savingColorClassName : textColorClassName[form],
  ].join(" ");

  return (
    <div className={rowClassName}>
      <span className={labelClassName}>{label}</span>
      <span className={valueClassName}>{value}</span>
    </div>
  );
}
