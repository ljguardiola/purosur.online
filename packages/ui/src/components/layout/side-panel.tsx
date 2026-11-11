import { type ReactNode, useId } from "react";
import { useKeyboardScrollableRegion } from "../shared/keyboard-scrollable-region";

export type SidePanelProps = {
  children: ReactNode;
  label: string;
  footer?: ReactNode | undefined;
  header?: ReactNode | undefined;
  width?: "panel" | "fill" | undefined;
};

export function SidePanel({ children, label, footer, header, width = "panel" }: SidePanelProps) {
  const panelId = useId();
  const { observeOverflow, regionProps, focusClassName } = useKeyboardScrollableRegion(panelId);

  return (
    <aside
      id={panelId}
      aria-label={label}
      className={`flex h-full flex-col bg-surface ${width === "panel" ? "w-100 shrink-0 border-l border-border" : "min-h-0 w-full"}`}
    >
      {header === undefined ? null : <div className="shrink-0">{header}</div>}
      <div
        ref={observeOverflow}
        {...regionProps}
        className={`relative flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pt-6 ${footer === undefined ? "pb-6" : "pb-4"} ${focusClassName}`}
      >
        {children}
      </div>
      {footer === undefined ? null : (
        <div className="flex shrink-0 flex-col gap-4 px-6 pb-6">{footer}</div>
      )}
    </aside>
  );
}
