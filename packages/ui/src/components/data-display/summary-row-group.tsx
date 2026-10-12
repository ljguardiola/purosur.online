import {
  StackedSummaryRow,
  type StackedSummaryRowProps,
  SummaryRow,
  type SummaryRowProps,
} from "./summary-row";

type VerticalSummaryRowGroupProps = {
  rows: readonly [SummaryRowProps, ...SummaryRowProps[]];
  variant?: "divided" | "filled" | "plain" | undefined;
  orientation?: "vertical" | undefined;
};

type HorizontalSummaryRowGroupProps = {
  rows: readonly [StackedSummaryRowProps, ...StackedSummaryRowProps[]];
  variant: "filled";
  orientation: "horizontal";
};

export type SummaryRowGroupProps = VerticalSummaryRowGroupProps | HorizontalSummaryRowGroupProps;

const groupClassName = {
  divided: "flex flex-col gap-2 border-t border-b border-border py-4",
  filled: "flex flex-col gap-1.5 rounded-lg bg-surface-subtle px-4 py-3",
  plain: "flex flex-col gap-1",
};

const horizontalGroupClassName =
  "flex flex-row items-center gap-6 rounded-lg bg-surface-subtle px-4 py-3";

export function SummaryRowGroup(props: SummaryRowGroupProps) {
  if (props.orientation === "horizontal") {
    return (
      <div className={horizontalGroupClassName}>
        {props.rows.map((row) => (
          <StackedSummaryRow key={row.label} {...row} />
        ))}
      </div>
    );
  }
  return (
    <div className={groupClassName[props.variant ?? "divided"]}>
      {props.rows.map((row) => (
        <SummaryRow key={row.label} {...row} />
      ))}
    </div>
  );
}
