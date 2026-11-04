import { type ReactNode, useId } from "react";
import { useKeyboardScrollableRegion } from "../shared/keyboard-scrollable-region";

export type SidePanelProps = {
  children: ReactNode;
  label: string;
  footer?: ReactNode | undefined;
};

export function SidePanel({ children, label, footer }: SidePanelProps) {
  const panelId = useId();
  const scrollingBody = useKeyboardScrollableRegion(panelId);

  return (
    <aside
      id={panelId}
      aria-label={label}
      className="flex h-full w-98 shrink-0 flex-col border-l border-border bg-surface"
    >
      <div
        ref={scrollingBody.observeOverflow}
        {...scrollingBody.regionProps}
        className={`relative flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-8 pt-8 ${footer === undefined ? "pb-8" : "pb-4"} ${scrollingBody.focusClassName}`}
      >
        {children}
      </div>
      {footer === undefined ? null : (
        <div className="flex shrink-0 flex-col gap-4 px-8 pb-8">{footer}</div>
      )}
    </aside>
  );
}
