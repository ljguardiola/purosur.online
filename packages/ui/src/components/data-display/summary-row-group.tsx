import { SummaryRow, type SummaryRowProps } from "./summary-row";

export type SummaryRowGroupProps = {
  rows: readonly [SummaryRowProps, ...SummaryRowProps[]];
  variant?: "divided" | "filled" | undefined;
};

const groupClassName = {
  divided: "flex flex-col gap-2 border-t border-b border-border py-4",
  filled: "flex flex-col gap-1.5 rounded-lg bg-surface-subtle px-4 py-3",
};

export function SummaryRowGroup({ rows, variant = "divided" }: SummaryRowGroupProps) {
  return (
    <div className={groupClassName[variant]}>
      {rows.map((row) => (
        <SummaryRow key={row.label} {...row} />
      ))}
    </div>
  );
}
