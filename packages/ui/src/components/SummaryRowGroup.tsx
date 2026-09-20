import type { ReactNode } from "react";

export type SummaryRowGroupProps = {
  // Required, so a group with nothing to hold doesn't compile: the two lines it draws only frame
  // the rows, they are never a standalone rule.
  children: Exclude<ReactNode, null | undefined | boolean>;
};

const groupClassName = "flex flex-col gap-2 border-t border-b border-line py-4";

export function SummaryRowGroup({ children }: SummaryRowGroupProps) {
  return <div className={groupClassName}>{children}</div>;
}
