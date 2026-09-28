import { SummaryRow, type SummaryRowProps } from "./SummaryRow";

export type SummaryRowGroupProps = {
  rows: readonly [SummaryRowProps, ...SummaryRowProps[]];
};

const groupClassName = "flex flex-col gap-2 border-t border-b border-border py-4";

export function SummaryRowGroup({ rows }: SummaryRowGroupProps) {
  return (
    <div className={groupClassName}>
      {rows.map((row) => (
        <SummaryRow key={row.label} {...row} />
      ))}
    </div>
  );
}
