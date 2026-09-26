import { SummaryRow, type SummaryRowProps } from "./SummaryRow";

// `rows` is a non-empty tuple, so a group with nothing to frame cannot be written — the two
// border lines only frame rows, never a standalone rule.
export type SummaryRowGroupProps = {
  rows: readonly [SummaryRowProps, ...SummaryRowProps[]];
};

const groupClassName = "flex flex-col gap-2 border-t border-b border-line py-4";

export function SummaryRowGroup({ rows }: SummaryRowGroupProps) {
  return (
    <div className={groupClassName}>
      {rows.map((row) => (
        <SummaryRow key={row.label} {...row} />
      ))}
    </div>
  );
}
