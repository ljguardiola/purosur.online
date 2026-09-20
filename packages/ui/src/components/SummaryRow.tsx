export type SummaryRowProps = {
  label: string;
  value: string;
  // A total is drawn in the strong form: both label and value move to 18px bold, in ink instead
  // of secondary text.
  strong?: boolean;
  // Independent of the strong form: a saving colors only the value in green UI, never the label.
  saving?: boolean;
};

const rowClassName = "flex items-baseline justify-between gap-4";

const labelClassName: Record<"regular" | "strong", string> = {
  regular: "min-w-0 text-base font-normal text-ink-secondary",
  strong: "min-w-0 text-lg font-bold text-ink",
};

function valueClassName(strong: boolean, saving: boolean): string {
  const sizeAndWeight = strong ? "text-lg font-bold" : "text-base font-semibold";
  let color = strong ? "text-ink" : "text-ink-secondary";
  if (saving) {
    color = "text-brand-green-ui";
  }
  return `shrink-0 ${sizeAndWeight} ${color}`;
}

export function SummaryRow({ label, value, strong = false, saving = false }: SummaryRowProps) {
  return (
    <div className={rowClassName}>
      <span className={labelClassName[strong ? "strong" : "regular"]}>{label}</span>
      <span className={valueClassName(strong, saving)}>{value}</span>
    </div>
  );
}
