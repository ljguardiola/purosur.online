import { type ReactNode, useId } from "react";
import { useKeyboardScrollableRegion } from "../shared/keyboard-scrollable-region";

export type SidePanelProps = {
  children: ReactNode;
  label: string;
  footer?: ReactNode | undefined;
  header?: ReactNode | undefined;
  width?: "panel" | "wide" | "fill" | undefined;
};

const REGULAR_INSET = { body: "px-8 pt-8", end: "pb-8", footer: "px-8 pb-8" } as const;

const WIDTHS = {
  panel: { box: "w-98 shrink-0 border-l border-border", inset: REGULAR_INSET },
  wide: {
    box: "w-100 shrink-0 border-l border-border",
    inset: { body: "px-6 pt-6", end: "pb-6", footer: "px-6 pb-6" },
  },
  fill: { box: "min-h-0 w-full", inset: REGULAR_INSET },
} as const;

export function SidePanel({ children, label, footer, header, width = "panel" }: SidePanelProps) {
  const panelId = useId();
  const { observeOverflow, regionProps, focusClassName } = useKeyboardScrollableRegion(panelId);
  const { box, inset } = WIDTHS[width];

  return (
    <aside
      id={panelId}
      aria-label={label}
      className={`flex h-full flex-col bg-surface ${box}`}
    >
      {header === undefined ? null : <div className="shrink-0">{header}</div>}
      <div
        ref={observeOverflow}
        {...regionProps}
        className={`relative flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto ${inset.body} ${footer === undefined ? inset.end : "pb-4"} ${focusClassName}`}
      >
        {children}
      </div>
      {footer === undefined ? null : (
        <div className={`flex shrink-0 flex-col gap-4 ${inset.footer}`}>{footer}</div>
      )}
    </aside>
  );
}
