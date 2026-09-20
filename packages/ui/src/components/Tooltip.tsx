import type { ReactElement, ReactNode } from "react";
import {
  OverlayArrow as AriaOverlayArrow,
  Tooltip as AriaTooltip,
  TooltipTrigger as AriaTooltipTrigger,
} from "react-aria-components";

// A tooltip always explains something, so the explanation is a required prop rather than an
// optional one a caller could leave out and render an empty box. `children` is the element it
// explains, not the explanation itself (unlike Toggle.tsx's `children`): react-aria's
// TooltipTrigger needs exactly one focusable/hoverable node to attach hover, focus and
// aria-describedby to, so it is typed as a single ReactElement rather than
// Exclude<ReactNode, null | undefined | boolean> — passing text, a fragment, or more than one
// element leaves TooltipTrigger without that one node, and this way that fails to compile
// instead of failing at runtime.
export type TooltipProps = {
  description: Exclude<ReactNode, null | undefined | boolean>;
  children: ReactElement;
};

const tooltipClassName =
  "z-50 max-w-75 rounded-md bg-ink p-3 text-sm text-surface-white leading-[1.35] " +
  "shadow-[0_6px_16px_var(--color-ink-shadow)]";

// A 10px square rotated 45deg renders as the 14x14 diamond the design draws; OverlayArrow's own
// wrapper element only positions this square at whichever edge react-aria's flip logic settles
// on, it paints nothing itself. `block` is required, not decorative: a bare <span> defaults to
// display:inline, which ignores an explicit width/height entirely, collapsing both this element
// and (since OverlayArrow's own wrapper shrink-to-fits around it) its parent to 0x0.
const arrowSquareClassName = "block size-[10px] rotate-45 bg-ink";

// Chosen deliberately over react-aria's own 1500ms default, which this overrides. Tooltip.test.tsx
// pins the value from both sides, so changing it here without changing that test turns it red.
const HOVER_DELAY_MS = 300;

export function Tooltip({ description, children }: TooltipProps) {
  return (
    <AriaTooltipTrigger delay={HOVER_DELAY_MS}>
      {children}
      <AriaTooltip placement="bottom" offset={8} className={tooltipClassName}>
        <AriaOverlayArrow>
          <span aria-hidden="true" className={arrowSquareClassName} />
        </AriaOverlayArrow>
        {description}
      </AriaTooltip>
    </AriaTooltipTrigger>
  );
}
