export type SummaryRowProps = {
  label: string;
  value: string;
  strong?: boolean;
  saving?: boolean;
};

type SummaryRowForm = "regular" | "strong";

const rowClassName = "flex items-baseline justify-between gap-4";

const labelBaseClassName = "min-w-0";

const labelTypeClassName: Record<SummaryRowForm, string> = {
  regular: "text-base font-normal",
  strong: "text-lg font-bold",
};

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
