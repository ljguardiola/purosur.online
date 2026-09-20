import type { ReactNode } from "react";

export type SummaryRowGroupProps = {
  children: ReactNode;
};

// The 1px line above and below the group is the only divider a summary row ever gets: no
// individual SummaryRow draws one, so a row sitting between two others in the group stays
// undivided. The 8px gap between rows (gap-2) is drawn identically in every one of design.pen's
// 42 "Detalle" group instances, not an arbitrary spacing choice.
const groupClassName = "flex flex-col gap-2 border-t border-b border-line py-4";

export function SummaryRowGroup({ children }: SummaryRowGroupProps) {
  return <div className={groupClassName}>{children}</div>;
}
