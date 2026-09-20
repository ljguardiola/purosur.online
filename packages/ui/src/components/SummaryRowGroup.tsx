import { SummaryRow, type SummaryRowProps } from "./SummaryRow";

// See OptionCardGroup.tsx's OptionCardGroupProps: `rows` is a non-empty tuple, so a group with
// nothing to frame cannot be written. The two lines only frame the rows and are never a
// standalone rule, and there is no empty group left for them to draw around.
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
