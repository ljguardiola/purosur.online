import type { ReactElement, ReactNode } from "react";
import {
  Tooltip as AriaTooltip,
  TooltipTrigger as AriaTooltipTrigger,
} from "react-aria-components";

// `children` is the element the tooltip explains, not the explanation itself (unlike Toggle.tsx's
// `children`): react-aria's TooltipTrigger passes hover, focus and aria-describedby down to one
// focusable node through context. `ReactElement` rejects plain text and an array of elements, but
// it cannot reject a fragment or a non-focusable element such as a bare <span>: every JSX
// expression is typed `ReactElement<any, any>`, which is assignable to any narrower ReactElement,
// so those two compile here and render a tooltip that never opens.
export type TooltipProps = {
  description: Exclude<ReactNode, null | undefined | boolean>;
  children: ReactElement;
};

const tooltipClassName =
  "max-w-75 rounded-md bg-ink p-3 text-sm text-surface-white leading-[1.35] " +
  "shadow-[0_6px_16px_var(--color-ink-shadow)]";

// The air left between the element and the box that explains it.
const ELEMENT_GAP_PX = 8;

// Overrides react-aria's own 1500ms default.
const HOVER_DELAY_MS = 300;

// Overrides react-stately's own 500ms default, which otherwise keeps the tooltip on screen for
// half a second after the pointer has already left the element it explains.
const CLOSE_DELAY_MS = 0;

export function Tooltip({ description, children }: TooltipProps) {
  return (
    <AriaTooltipTrigger delay={HOVER_DELAY_MS} closeDelay={CLOSE_DELAY_MS}>
      {children}
      <AriaTooltip placement="bottom" offset={ELEMENT_GAP_PX} className={tooltipClassName}>
        {description}
      </AriaTooltip>
    </AriaTooltipTrigger>
  );
}
