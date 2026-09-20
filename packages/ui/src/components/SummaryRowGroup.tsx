import { Children, type ReactNode } from "react";

export type SummaryRowGroupProps = {
  // Required, so leaving the rows out doesn't compile. The type stops there: a `rows.map(...)`
  // call site is an array TypeScript cannot prove non-empty, so an empty group is ruled out when
  // it renders instead.
  children: Exclude<ReactNode, null | undefined | boolean>;
};

const groupClassName = "flex flex-col gap-2 border-t border-b border-line py-4";

export function SummaryRowGroup({ children }: SummaryRowGroupProps) {
  // The two lines only frame the rows, they are never a standalone rule, so a group with nothing
  // to hold draws nothing. Children.toArray drops null, undefined and booleans but keeps an empty
  // string, which is just as much nothing to frame.
  const rows = Children.toArray(children).filter((row) => row !== "");
  if (rows.length === 0) {
    return null;
  }

  return <div className={groupClassName}>{children}</div>;
}
