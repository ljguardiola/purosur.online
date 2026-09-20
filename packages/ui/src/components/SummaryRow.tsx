export type SummaryRowProps = {
  label: string;
  value: string;
  strong?: boolean;
  saving?: boolean;
};

type SummaryRowForm = "regular" | "strong";

const rowClassName = "flex items-baseline gap-4";

// `min-w-0` lets the label give up room a wide value needs, and `break-words` keeps the text it
// still has to paint inside the box that is left, instead of over the value.
const labelBaseClassName = "min-w-0 break-words";

const labelTypeClassName: Record<SummaryRowForm, string> = {
  regular: "text-base font-normal",
  strong: "text-lg font-bold",
};

// Growing from a zero basis makes the value take the room the label does not need, instead of
// both of them shrinking in proportion, which squeezed the label below its own longest word.
const valueBaseClassName = "flex-1 text-right";

const valueTypeClassName: Record<SummaryRowForm, string> = {
  regular: "text-base font-semibold",
  strong: "text-lg font-bold",
};

const textColorClassName: Record<SummaryRowForm, string> = {
  regular: "text-ink-secondary",
  strong: "text-ink",
};

const savingColorClassName = "text-brand-green-ui";

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
